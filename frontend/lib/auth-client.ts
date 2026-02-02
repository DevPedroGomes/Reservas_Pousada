import { createAuthClient } from "better-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Better Auth client for React/Next.js
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  // Ensure credentials are included for cookie-based auth
  fetchOptions: {
    credentials: 'include',
  },
});

// Export individual methods for convenience
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string, options?: { callbackURL?: string }) {
  return authClient.signIn.email({
    email,
    password,
    callbackURL: options?.callbackURL,
  });
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email: string, password: string, name: string, options?: { callbackURL?: string }) {
  return authClient.signUp.email({
    email,
    password,
    name,
    callbackURL: options?.callbackURL,
  });
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(options?: { callbackURL?: string; newUserCallbackURL?: string }) {
  return authClient.signIn.social({
    provider: "google",
    callbackURL: options?.callbackURL || "/",
    newUserCallbackURL: options?.newUserCallbackURL || "/onboarding",
  });
}

/**
 * Sign out the current user
 */
export async function handleSignOut() {
  return authClient.signOut();
}

/**
 * Get current session (non-reactive)
 */
export async function getCurrentSession() {
  const session = await authClient.getSession();
  return session;
}

// Export types
export type AuthSession = Awaited<ReturnType<typeof authClient.getSession>>;
