import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { sendPasswordResetEmail, sendVerificationEmail as sendVerifEmail } from './email.js';

// Better Auth Secret (required)
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  console.error('ERRO CRÍTICO: BETTER_AUTH_SECRET não definido nas variáveis de ambiente');
  process.exit(1);
}

// Base URL for Better Auth
const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:4000';

export const auth = betterAuth({
  // Secret key for signing tokens
  secret,

  // Base URL for callbacks
  baseURL,

  // Database adapter using Drizzle
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  // Email and password authentication
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 100,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, user.name, url);
    },
  },

  // Email verification
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerifEmail(user.email, user.name, url);
    },
  },

  // Social providers
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      // Request offline access for refresh tokens
      accessType: 'offline',
      // Always show account selection
      prompt: 'select_account',
    },
  },

  // Session configuration
  // expiresIn = 12h absolute idle cap; updateAge = sliding refresh every 1h
  session: {
    expiresIn: 43200, // 12 hours
    updateAge: 60 * 60, // Update session every 1 hour
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes cache
    },
  },

  // User configuration with additional fields
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'recepcao',
        input: false,
      },
      pousadaId: {
        type: 'number',
        required: false,
        input: false,
      },
      isOwner: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
    changeEmail: {
      enabled: true,
    },
  },

  // Advanced options
  advanced: {
    // Use secure cookies in production
    useSecureCookies: process.env.NODE_ENV === 'production',
    // Cross-site cookie settings
    crossSubDomainCookies: {
      enabled: false,
    },
  },

  // Trust host header for proper URL construction
  trustedOrigins: [
    process.env.CORS_ORIGIN || 'http://localhost:3000',
    baseURL,
  ],

  // Rate limiting
  rateLimit: {
    enabled: true,
    window: 60, // 1 minute window
    max: 100, // Max 100 requests per window
  },
});

// Export auth type for client
export type Auth = typeof auth;
