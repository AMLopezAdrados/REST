import { google } from 'googleapis';
import { getUserById, updateUserTokens } from '@/lib/storage/queries';

export function createOAuthClient(refreshToken: string, accessToken?: string | null, expiry?: number | null) {
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
  );
  oauth.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken ?? undefined,
    expiry_date: expiry ?? undefined,
  });
  return oauth;
}

export async function getGmailForUser(userId: string) {
  const user = getUserById(userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  const oauth = createOAuthClient(user.refresh_token, user.access_token, user.token_expiry);

  oauth.on('tokens', (tokens) => {
    if (tokens.access_token && tokens.expiry_date) {
      updateUserTokens(userId, tokens.access_token, tokens.expiry_date);
    }
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth });
  return { gmail, oauth };
}
