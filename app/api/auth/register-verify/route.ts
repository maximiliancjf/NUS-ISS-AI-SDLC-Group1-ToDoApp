import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { getUserByUsername, saveAuthenticator, createSession } from '@/lib/auth';
import { challenges } from '@/lib/challenges';

const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  try {
    const { username, response } = await request.json();

    if (!username || !response) {
      return NextResponse.json({ error: 'Username and response required' }, { status: 400 });
    }

    const user = getUserByUsername(username);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const expectedChallenge = challenges.get(username);
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 400 });
    }

    const verification = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    // Save authenticator
    saveAuthenticator(
      user.id,
      credentialID,
      Buffer.from(credentialPublicKey),
      counter,
      response.response?.transports
    );

    // Clear challenge
    challenges.delete(username);

    // Create session
    await createSession(user.id, user.username);

    return NextResponse.json({ verified: true, message: 'Registration successful' });
  } catch (error) {
    console.error('Error verifying registration:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
