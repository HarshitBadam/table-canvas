import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env.js';

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export async function verifyGoogleToken(idToken: string): Promise<GoogleUserInfo> {
  const clientId = config.googleClientId;
  if (!clientId) {
    throw new Error(
      'Google Sign-In is not configured: GOOGLE_CLIENT_ID environment variable is missing',
    );
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Google token verification failed: empty payload');
  }

  if (!payload.sub || !payload.email) {
    throw new Error('Google token verification failed: missing required claims (sub, email)');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    avatarUrl: payload.picture,
  };
}
