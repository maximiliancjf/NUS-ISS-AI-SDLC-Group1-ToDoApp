import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { getUserByUsername, getAuthenticatorByCredentialId, updateAuthenticatorCounter, createSession } from '@/lib/auth';
import { loginChallenges } from '@/lib/challenges';

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

    const expectedChallenge = loginChallenges.get(username);
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 400 });
    }

    const credentialId = Buffer.from(response.id, 'base64url').toString('base64url');
    const authenticator = getAuthenticatorByCredentialId(credentialId);
    
    if (!authenticator) {
      return NextResponse.json({ error: 'Authenticator not found' }, { status: 404 });
    }

    const verification = await verifyAuthenticationResponse({
      response: response as AuthenticationResponseJSON,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: authenticator.credential_id,
        credentialPublicKey: new Uint8Array(authenticator.credential_public_key),
        counter: authenticator.counter,
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    // Update counter
    updateAuthenticatorCounter(authenticator.credential_id, verification.authenticationInfo.newCounter);

    // Clear challenge
    loginChallenges.delete(username);

    // Create session
    await createSession(user.id, user.username);

    return NextResponse.json({ verified: true, message: 'Login successful' });
  } catch (error) {
    console.error('Error verifying authentication:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
