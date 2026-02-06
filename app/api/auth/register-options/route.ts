import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getUserByUsername, createUser } from '@/lib/auth';

const RP_NAME = process.env.RP_NAME || 'Todo App';
const RP_ID = process.env.RP_ID || 'localhost';

// Store challenges temporarily (in production, use Redis or database)
const challenges = new Map<string, string>();

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Check if user already exists
    let user = getUserByUsername(username);
    let userId: number;

    if (user) {
      userId = user.id;
    } else {
      // Create new user
      userId = createUser(username);
    }

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: username,
      userID: new Uint8Array(Buffer.from(userId.toString())),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
    });

    // Store challenge temporarily
    challenges.set(username, options.challenge);

    return NextResponse.json(options);
  } catch (error) {
    console.error('Error generating registration options:', error);
    return NextResponse.json({ error: 'Failed to generate options' }, { status: 500 });
  }
}

export { challenges };
