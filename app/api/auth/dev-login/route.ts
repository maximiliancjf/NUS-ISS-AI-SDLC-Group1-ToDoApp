import { NextRequest, NextResponse } from 'next/server';
import { createUser, getUserByUsername, createSession, verifyPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    // Check if user exists - only allow login for registered users
    const user = getUserByUsername(username);
    if (!user) {
      return NextResponse.json({ error: 'User not found. Please register first.' }, { status: 404 });
    }

    // Verify password
    const isValid = await verifyPassword(username, password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Create session
    await createSession(user.id, user.username);

    return NextResponse.json({ message: 'Login successful', user });
  } catch (error) {
    console.error('Error in dev login:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
