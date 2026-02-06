import { NextRequest, NextResponse } from 'next/server';
import { createUser, getUserByUsername, createSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    // Check password requirements
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = getUserByUsername(username);
    if (existingUser) {
      return NextResponse.json({ error: 'Username already taken. Please choose another or login.' }, { status: 409 });
    }

    // Create new user with hashed password
    const userId = await createUser(username, password);
    const user = { id: userId, username };

    // Create session
    await createSession(user.id, user.username);

    return NextResponse.json({ message: 'Registration successful', user });
  } catch (error) {
    console.error('Error in dev register:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
