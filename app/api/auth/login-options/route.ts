import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getUserByUsername, getAuthenticatorsByUserId } from '@/lib/auth';
import { loginChallenges } from '@/lib/challenges';

const RP_ID = process.env.RP_ID || 'localhost';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const user = getUserByUsername(username);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const authenticators = getAuthenticatorsByUserId(user.id);
    if (authenticators.length === 0) {
      return NextResponse.json({ error: 'No authenticators found' }, { status: 404 });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: authenticators.map(auth => ({
        id: auth.credential_id,
        type: 'public-key' as const,
        transports: auth.transports ? JSON.parse(auth.transports) : undefined,
      })),
      userVerification: 'preferred',
    });

    // Store challenge
    loginChallenges.set(username, options.challenge);

    return NextResponse.json(options);
  } catch (error) {
    console.error('Error generating authentication options:', error);
    return NextResponse.json({ error: 'Failed to generate options' }, { status: 500 });
  }
}
