import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { getUserByUsername, saveAuthenticator, createSession } from '@/lib/auth';
import { challenges } from '@/lib/challenges';

export async function POST(request: NextRequest) {
  try {
    const { username, response } = await request.json();

    // Get RP_ID and ORIGIN from environment or dynamically from request
    const host = request.headers.get('host') || 'localhost';
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const protocol = forwardedProto ? forwardedProto : (host.includes('localhost') ? 'http' : 'https');
    const RP_ID = process.env.RP_ID || host.split(':')[0];
    const ORIGIN = process.env.ORIGIN || `${protocol}://${host}`;

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

    // Convert credentialID to base64url string
    const credentialIdString = Buffer.from(credentialID).toString('base64url');

    // Save authenticator
    saveAuthenticator(
      user.id,
      credentialIdString,
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Error details:', { message: errorMessage, stack: errorStack });
    return NextResponse.json({ 
      error: 'Verification failed', 
      details: errorMessage 
    }, { status: 500 });
  }
}
