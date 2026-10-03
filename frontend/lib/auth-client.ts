import { createAuthClient } from "better-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

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
 * Para onde o link de confirmação de e-mail leva.
 *
 * Precisa ser URL absoluta do APP: o link é aberto na API, e um caminho
 * relativo ("/onboarding") era resolvido contra o domínio da API — 404.
 * Quem chegou por convite volta para o convite, não para o onboarding.
 */
export function urlDepoisDaConfirmacao(): string {
  if (typeof window !== 'undefined') {
    const convite = new URLSearchParams(window.location.search).get('convite');
    if (convite) return `${APP_URL}/convite/${encodeURIComponent(convite)}`;
  }
  return `${APP_URL}/onboarding`;
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string, options?: { callbackURL?: string }) {
  return authClient.signIn.email({
    email,
    password,
    // Usado pelo e-mail de confirmação reenviado quando a conta ainda não foi
    // verificada (sendOnSignIn no backend).
    callbackURL: options?.callbackURL ?? urlDepoisDaConfirmacao(),
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
    callbackURL: options?.callbackURL ?? urlDepoisDaConfirmacao(),
  });
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(options?: { callbackURL?: string; newUserCallbackURL?: string }) {
  return authClient.signIn.social({
    provider: "google",
    callbackURL: options?.callbackURL || `${APP_URL}/painel`,
    newUserCallbackURL: options?.newUserCallbackURL || `${APP_URL}/onboarding`,
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

/**
 * Request password reset email
 */
export async function requestPasswordReset(email: string) {
  return (authClient as any).forgetPassword({
    email,
    redirectTo: `${APP_URL}/reset-password`,
  });
}

/**
 * Reset password with token
 */
export async function resetPassword(newPassword: string, token: string) {
  return authClient.resetPassword({
    newPassword,
    token,
  });
}

/**
 * Change password while logged in
 */
export async function changePassword(currentPassword: string, newPassword: string) {
  return authClient.changePassword({
    currentPassword,
    newPassword,
    revokeOtherSessions: true,
  });
}

/**
 * Send email verification
 */
export async function sendEmailVerification(email: string) {
  return authClient.sendVerificationEmail({
    email,
    callbackURL: `${APP_URL}/verify-email`,
  });
}

// Export types
export type AuthSession = Awaited<ReturnType<typeof authClient.getSession>>;
