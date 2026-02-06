import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcrypt';
import db from './db';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key-min-32-characters-long-please-change-this');
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

export interface SessionData {
  userId: number;
  username: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: Buffer;
  counter: number;
  transports: string | null;
  created_at: string;
}

/**
 * Create session token and set cookie
 */
export async function createSession(userId: number, username: string): Promise<void> {
  const token = await new SignJWT({ userId, username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  });
}

/**
 * Get current session from cookie
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session');
  if (!sessionCookie) return null;

  try {
    const { payload } = await jwtVerify(sessionCookie.value, JWT_SECRET);
    if (typeof payload.userId === 'number' && typeof payload.username === 'string') {
      return { userId: payload.userId, username: payload.username };
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Delete session cookie
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}

/**
 * Get user by username
 */
export function getUserByUsername(username: string) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
}

/**
 * Create user with password
 */
export async function createUser(username: string, password: string): Promise<number> {
  const passwordHash = await bcrypt.hash(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  return result.lastInsertRowid as number;
}

/**
 * Verify user password
 */
export async function verifyPassword(username: string, password: string): Promise<boolean> {
  const user = getUserByUsername(username) as any;
  if (!user || !user.password_hash) return false;
  return await bcrypt.compare(password, user.password_hash);
}

/**
 * Save authenticator
 */
export function saveAuthenticator(
  userId: number,
  credentialId: string,
  publicKey: Buffer,
  counter: number,
  transports?: string[]
): void {
  const transportsJson = transports ? JSON.stringify(transports) : null;
  db.prepare(`
    INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter, transports)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, credentialId, publicKey, counter, transportsJson);
}

/**
 * Get authenticators for user
 */
export function getAuthenticatorsByUserId(userId: number): Authenticator[] {
  return db.prepare('SELECT * FROM authenticators WHERE user_id = ?').all(userId) as Authenticator[];
}

/**
 * Get authenticator by credential ID
 */
export function getAuthenticatorByCredentialId(credentialId: string): Authenticator | undefined {
  return db.prepare('SELECT * FROM authenticators WHERE credential_id = ?').get(credentialId) as Authenticator | undefined;
}

/**
 * Update authenticator counter
 */
export function updateAuthenticatorCounter(credentialId: string, counter: number): void {
  db.prepare('UPDATE authenticators SET counter = ? WHERE credential_id = ?').run(counter, credentialId);
}
