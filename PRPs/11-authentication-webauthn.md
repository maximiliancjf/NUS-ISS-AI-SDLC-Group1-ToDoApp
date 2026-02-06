# PRP-11: Authentication (WebAuthn/Passkeys)

## Feature Overview

Implement passwordless authentication using WebAuthn (Web Authentication API) with biometric authenticators (fingerprint, Face ID) or security keys. Users register passkeys once, then log in instantly without passwords. Sessions managed via JWT tokens stored as HTTP-only cookies. Middleware protects authenticated routes.

## User Stories

### User Persona: Alex - Security-Conscious User

**Story 1: Passwordless Registration**
> As Alex, I want to register using my fingerprint or Face ID so that I don't have to remember yet another password.

**Story 2: Quick Biometric Login**
> As Alex, I want to log in with my fingerprint in under 2 seconds so that access is fast and secure.

**Story 3: Multi-Device Support**
> As Alex, I want to register multiple authenticators (phone + laptop) so that I can access my todos from any device.

**Story 4: Automatic Session Management**
> As Alex, I want my session to persist for 7 days so that I don't have to re-authenticate constantly, but still maintain security.

**Story 5: Secure Logout**
> As Alex, I want to log out and have my session immediately invalidated so that no one else can access my todos on shared devices.

## User Flow

### Registration Flow
1. User visits `/register`
2. Enters username (e.g., "alex@example.com")
3. Clicks "Register"
4. Browser prompts: "Create a passkey for Todo App?"
5. User authenticates with biometric (fingerprint/Face ID)
6. Passkey created and stored in device
7. Backend creates user account + authenticator record
8. Session token issued
9. User redirected to `/` (main page)

### Login Flow
1. User visits `/login`
2. Enters username (e.g., "alex@example.com")
3. Clicks "Login"
4. Browser prompts: "Sign in with passkey?"
5. User authenticates with biometric
6. Backend verifies signature
7. Session token issued (7-day expiry)
8. User redirected to `/`

### Session Validation
1. User navigates to `/` (protected route)
2. Middleware checks for session token cookie
3. Token validated (signature + expiry)
4. If valid: allow access
5. If invalid/expired: redirect to `/login`

### Logout Flow
1. User clicks "Logout" button
2. Frontend calls `POST /api/auth/logout`
3. Backend clears session cookie
4. User redirected to `/login`

## Technical Requirements

### Database Schema

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- WebAuthn Authenticators table
CREATE TABLE IF NOT EXISTS authenticators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  credential_id TEXT UNIQUE NOT NULL,  -- Base64url encoded
  credential_public_key BLOB NOT NULL,  -- COSE encoded
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,  -- JSON array: ["internal", "usb"]
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);
CREATE INDEX IF NOT EXISTS idx_authenticators_credential_id ON authenticators(credential_id);
```

### Environment Variables

```bash
# .env.local
RP_NAME="Todo App"  # Relying Party name
RP_ID="localhost"   # Domain (use actual domain in production: "example.com")
ORIGIN="http://localhost:3000"  # Full origin URL
JWT_SECRET="your-secure-random-secret-min-32-chars"
```

### Dependencies

```json
// package.json
{
  "dependencies": {
    "@simplewebauthn/server": "^10.0.0",
    "@simplewebauthn/browser": "^10.0.0",
    "jose": "^5.2.0"  // For JWT signing/verification
  }
}
```

### Session Management (lib/auth.ts)

```typescript
// lib/auth.ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

export interface SessionData {
  userId: number;
  username: string;
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

  (await cookies()).set('session', token, {
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
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie) return null;

  try {
    const { payload } = await jwtVerify(sessionCookie.value, JWT_SECRET);
    return payload as SessionData;
  } catch (error) {
    return null;
  }
}

/**
 * Delete session cookie
 */
export async function deleteSession(): Promise<void> {
  (await cookies()).delete('session');
}

/**
 * Get or create user by username
 */
export function getUserByUsername(username: string) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
}

export function createUser(username: string): number {
  const result = db.prepare('INSERT INTO users (username) VALUES (?)').run(username);
  return result.lastInsertRowid as number;
}
```

### Registration Options Endpoint

```typescript
// app/api/auth/register-options/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getUserByUsername, createUser } from '@/lib/auth';

const RP_NAME = process.env.RP_NAME!;
const RP_ID = process.env.RP_ID!;

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Check if user exists
    let user = getUserByUsername(username);
    if (user) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: username,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',  // Prefer platform authenticators (Touch ID, Face ID)
      },
    });

    // Store challenge in session for verification (temporary storage)
    // In production, use Redis or similar for challenge storage
    // For simplicity, we'll return it and client will echo it back
    return NextResponse.json({
      options,
      username,
    });
  } catch (error) {
    console.error('Registration options error:', error);
    return NextResponse.json({ error: 'Failed to generate options' }, { status: 500 });
  }
}
```

### Registration Verification Endpoint

```typescript
// app/api/auth/register-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { createUser, createSession } from '@/lib/auth';
import { db } from '@/lib/db';

const RP_ID = process.env.RP_ID!;
const ORIGIN = process.env.ORIGIN!;

export async function POST(request: NextRequest) {
  try {
    const { username, response, challenge } = await request.json();

    // Verify registration response
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    // Create user
    const userId = createUser(username);

    // Store authenticator
    const credentialIdBase64 = isoBase64URL.fromBuffer(credentialID);
    db.prepare(`
      INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter)
      VALUES (?, ?, ?, ?)
    `).run(
      userId,
      credentialIdBase64,
      Buffer.from(credentialPublicKey),
      counter ?? 0  // CRITICAL: Use ?? 0 to handle undefined
    );

    // Create session
    await createSession(userId, username);

    return NextResponse.json({
      success: true,
      message: 'Registration successful',
    });
  } catch (error) {
    console.error('Registration verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
```

### Login Options Endpoint

```typescript
// app/api/auth/login-options/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getUserByUsername } from '@/lib/auth';
import { db } from '@/lib/db';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

const RP_ID = process.env.RP_ID!;

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const user = getUserByUsername(username);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user's authenticators
    const authenticators = db.prepare(`
      SELECT credential_id FROM authenticators WHERE user_id = ?
    `).all(user.id) as { credential_id: string }[];

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: authenticators.map(auth => ({
        id: isoBase64URL.toBuffer(auth.credential_id),
        type: 'public-key',
        transports: ['internal', 'usb', 'nfc', 'ble'],
      })),
      userVerification: 'preferred',
    });

    return NextResponse.json({
      options,
      username,
    });
  } catch (error) {
    console.error('Login options error:', error);
    return NextResponse.json({ error: 'Failed to generate options' }, { status: 500 });
  }
}
```

### Login Verification Endpoint

```typescript
// app/api/auth/login-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { getUserByUsername, createSession } from '@/lib/auth';
import { db } from '@/lib/db';

const RP_ID = process.env.RP_ID!;
const ORIGIN = process.env.ORIGIN!;

export async function POST(request: NextRequest) {
  try {
    const { username, response, challenge } = await request.json();

    const user = getUserByUsername(username);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get authenticator by credential ID
    const credentialIdBase64 = isoBase64URL.fromBuffer(response.rawId);
    const authenticator = db.prepare(`
      SELECT * FROM authenticators WHERE credential_id = ?
    `).get(credentialIdBase64) as any;

    if (!authenticator || authenticator.user_id !== user.id) {
      return NextResponse.json({ error: 'Authenticator not found' }, { status: 404 });
    }

    // Verify authentication
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: isoBase64URL.toBuffer(authenticator.credential_id),
        credentialPublicKey: new Uint8Array(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0,  // CRITICAL: Handle undefined
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    // Update counter (prevents replay attacks)
    db.prepare(`
      UPDATE authenticators SET counter = ? WHERE id = ?
    `).run(verification.authenticationInfo.newCounter ?? 0, authenticator.id);

    // Create session
    await createSession(user.id, user.username);

    return NextResponse.json({
      success: true,
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
```

### Logout Endpoint

```typescript
// app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  await deleteSession();
  return NextResponse.json({ success: true });
}
```

### Middleware for Route Protection

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('session');

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(sessionCookie.value, JWT_SECRET);
    return NextResponse.next();
  } catch (error) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/', '/calendar'],  // Protect main page and calendar
};
```

## UI Components

### Registration Page

```typescript
// app/register/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsRegistering(true);

    try {
      // Get registration options
      const optionsRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Failed to get options');
      }

      const { options, username: returnedUsername } = await optionsRes.json();

      // Start WebAuthn registration
      const attResp = await startRegistration(options);

      // Verify registration
      const verifyRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: returnedUsername,
          response: attResp,
          challenge: options.challenge,
        }),
      });

      if (!verifyRes.ok) {
        throw new Error('Registration verification failed');
      }

      // Redirect to main page
      router.push('/');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-center">Register</h1>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-email@example.com"
              required
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isRegistering}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {isRegistering ? 'Creating Account...' : '🔐 Register with Passkey'}
          </button>
        </form>

        <p className="text-center mt-4 text-sm text-gray-600">
          Already have an account?{' '}
          <a href="/login" className="text-blue-600 hover:underline">
            Login
          </a>
        </p>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
          <p className="text-xs text-blue-800">
            <strong>💡 Tip:</strong> You'll be prompted to use your fingerprint, Face ID, or security key.
            No passwords needed!
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Login Page

```typescript
// app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);

    try {
      // Get authentication options
      const optionsRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Failed to get options');
      }

      const { options, username: returnedUsername } = await optionsRes.json();

      // Start WebAuthn authentication
      const authResp = await startAuthentication(options);

      // Verify authentication
      const verifyRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: returnedUsername,
          response: authResp,
          challenge: options.challenge,
        }),
      });

      if (!verifyRes.ok) {
        throw new Error('Login verification failed');
      }

      // Redirect to main page
      router.push('/');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-center">Login</h1>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-email@example.com"
              required
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoggingIn ? 'Signing In...' : '🔐 Login with Passkey'}
          </button>
        </form>

        <p className="text-center mt-4 text-sm text-gray-600">
          Don't have an account?{' '}
          <a href="/register" className="text-blue-600 hover:underline">
            Register
          </a>
        </p>
      </div>
    </div>
  );
}
```

### Logout Button Component

```typescript
// components/LogoutButton.tsx
'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
    >
      Logout
    </button>
  );
}
```

## Edge Cases

### 1. Browser Doesn't Support WebAuthn
- **Problem:** Old browser (IE 11) doesn't support WebAuthn API
- **Solution:** Show error message: "Please use a modern browser (Chrome, Firefox, Safari, Edge)"
- **Test:** Attempt registration in unsupported browser

### 2. User Cancels Biometric Prompt
- **Problem:** User clicks "Cancel" on Touch ID prompt
- **Solution:** Catch error, show friendly message: "Authentication canceled. Please try again."
- **Test:** Cancel biometric prompt, verify error handling

### 3. Device Has No Biometric Authenticator
- **Problem:** User's laptop lacks fingerprint reader or Face ID
- **Solution:** Fallback to security key or platform authenticator prompt
- **Test:** Register on device without biometrics

### 4. JWT Secret Not Set
- **Problem:** `JWT_SECRET` environment variable missing
- **Solution:** Server startup fails with clear error message
- **Test:** Start server without JWT_SECRET, verify error

### 5. Challenge Replay Attack
- **Problem:** Attacker intercepts challenge and tries to reuse it
- **Solution:** Challenges are single-use (not stored long-term; verified immediately)
- **Test:** Attempt to reuse challenge from previous registration

### 6. Counter Mismatch (Cloned Authenticator)
- **Problem:** Authenticator counter decreases (indicates cloning)
- **Solution:** Reject authentication, invalidate authenticator
- **Test:** Manually decrement counter in DB, attempt login

### 7. Session Expired Mid-Use
- **Problem:** User's 7-day session expires while using app
- **Solution:** Middleware redirects to `/login`, user re-authenticates
- **Test:** Set short expiry (1 minute), wait, verify redirect

### 8. Cross-Origin Registration
- **Problem:** User tries to register from `http://example.com` but RP_ID is `localhost`
- **Solution:** WebAuthn verification fails (origin mismatch), clear error message
- **Test:** Attempt registration with mismatched origin

## Acceptance Criteria

### Registration
- [ ] User can register with username only (no password)
- [ ] WebAuthn prompt appears after clicking "Register"
- [ ] Biometric authentication works (Touch ID, Face ID, Windows Hello)
- [ ] Authenticator record stored in database
- [ ] User automatically logged in after registration
- [ ] Error shown if username already exists

### Login
- [ ] User can log in with username + biometric
- [ ] WebAuthn prompt appears after clicking "Login"
- [ ] Session token issued with 7-day expiry
- [ ] Cookie set as HTTP-only and secure (production)
- [ ] Error shown if user doesn't exist

### Session Management
- [ ] Session persists across page reloads
- [ ] Session expires after 7 days
- [ ] Protected routes (`/`, `/calendar`) require authentication
- [ ] Unauthenticated users redirected to `/login`

### Logout
- [ ] Logout button clears session cookie
- [ ] User redirected to `/login` after logout
- [ ] Subsequent requests require re-authentication

### Security
- [ ] Credentials stored securely (COSE public key format)
- [ ] Counter updated after each authentication (prevents replay)
- [ ] JWT signed with secret key
- [ ] Cookies use `httpOnly`, `secure`, `sameSite: lax`

## Testing Requirements

### Unit Tests

**File:** `lib/auth.test.ts`

```typescript
import { createSession, getSession } from './auth';

describe('Session Management', () => {
  test('createSession generates valid JWT', async () => {
    await createSession(1, 'test@example.com');

    const session = await getSession();
    expect(session).toBeTruthy();
    expect(session!.userId).toBe(1);
    expect(session!.username).toBe('test@example.com');
  });

  test('getSession returns null when no cookie', async () => {
    // Clear cookies
    const session = await getSession();
    expect(session).toBeNull();
  });

  test('getSession handles expired token', async () => {
    // Create token with past expiry
    // (requires mocking JWT creation with custom expiry)
    // Verify getSession returns null
  });
});
```

### E2E Tests (Playwright with Virtual Authenticator)

**File:** `tests/01-authentication.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should register new user with passkey', async ({ page, context }) => {
    // Enable virtual authenticator
    await context.addInitScript(() => {
      // Virtual authenticator automatically set up via playwright.config.ts
    });

    await page.goto('/register');

    await page.fill('input[placeholder*="email"]', 'testuser@example.com');
    await page.click('button:has-text("Register with Passkey")');

    // Virtual authenticator handles WebAuthn automatically
    // Wait for redirect to main page
    await page.waitForURL('/');

    // Verify user is logged in
    await expect(page.locator('h1:has-text("Todo App")')).toBeVisible();
  });

  test('should login existing user with passkey', async ({ page, context }) => {
    // Pre-register user
    await registerUser(page, 'loginuser@example.com');

    // Logout
    await page.click('button:has-text("Logout")');
    await page.waitForURL('/login');

    // Login
    await page.fill('input[placeholder*="email"]', 'loginuser@example.com');
    await page.click('button:has-text("Login with Passkey")');

    // Wait for redirect
    await page.waitForURL('/');
    await expect(page.locator('h1:has-text("Todo App")')).toBeVisible();
  });

  test('should prevent duplicate username registration', async ({ page }) => {
    await registerUser(page, 'duplicate@example.com');
    await page.click('button:has-text("Logout")');

    // Attempt duplicate registration
    await page.goto('/register');
    await page.fill('input[placeholder*="email"]', 'duplicate@example.com');
    await page.click('button:has-text("Register with Passkey")');

    // Verify error message
    await expect(page.locator('text=Username already exists')).toBeVisible();
  });

  test('should protect routes with middleware', async ({ page }) => {
    // Attempt to access protected route without login
    await page.goto('/');

    // Should redirect to login
    await page.waitForURL('/login');
    await expect(page.locator('h1:has-text("Login")')).toBeVisible();
  });

  test('should logout and clear session', async ({ page }) => {
    await registerUser(page, 'logoutuser@example.com');

    // Logout
    await page.click('button:has-text("Logout")');
    await page.waitForURL('/login');

    // Attempt to access protected route
    await page.goto('/');
    await page.waitForURL('/login');  // Should redirect again
  });
});

// Helper
async function registerUser(page, username) {
  await page.goto('/register');
  await page.fill('input[placeholder*="email"]', username);
  await page.click('button:has-text("Register with Passkey")');
  await page.waitForURL('/');
}
```

### Playwright Config for Virtual Authenticator

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    timezoneId: 'Asia/Singapore',
    launchOptions: {
      args: [
        '--enable-features=WebAuthenticationExtensionsEnabled',
        '--enable-blink-features=VirtualAuthenticator',
      ],
    },
  },
});
```

## Out of Scope

The following features are **NOT** included in this PRP:

- ❌ Password-based authentication (WebAuthn only)
- ❌ OAuth providers (Google, GitHub, etc.)
- ❌ Two-factor authentication (2FA)
- ❌ Password reset flow (N/A for passwordless)
- ❌ Email verification
- ❌ Account deletion
- ❌ Multi-authenticator management UI (can only register once per device)

## Success Metrics

### Adoption Metrics
- [ ] 90%+ of users successfully register with passkey
- [ ] Average registration time: < 10 seconds
- [ ] Login success rate: 98%+

### Security Metrics
- [ ] 0 session hijacking reports
- [ ] 100% of traffic uses HTTPS in production
- [ ] Counter updates correctly (no replay attacks detected)

### User Experience Metrics
- [ ] Average login time: < 3 seconds
- [ ] Session duration: 7 days (minimal re-authentication)
- [ ] User satisfaction with passwordless flow: 85%+

### Performance Metrics
- [ ] Registration verification: < 500ms
- [ ] Login verification: < 500ms
- [ ] Middleware session check: < 50ms

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** None (foundation infrastructure)  
**Dependents:** All features (authentication required for all routes)
