// Temporary challenge storage for WebAuthn
// In production, use Redis or a database with TTL
export const challenges = new Map<string, string>();
export const loginChallenges = new Map<string, string>();
