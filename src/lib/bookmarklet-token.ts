import { createHmac } from 'crypto';

const DEFAULT_TTL_SECONDS = 600;
const DEV_SECRET = 'yj-huoke-bookmarklet-dev-secret';

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is required in production');
  }

  return DEV_SECRET;
}

function sign(userId: string, expTimestamp: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${userId}:${expTimestamp}`)
    .digest('hex');
}

export function generateBookmarkletToken(
  userId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const expTimestamp = Date.now() + ttlSeconds * 1000;
  const signature = sign(userId, expTimestamp, getSecret());
  return `${userId}:${expTimestamp}:${signature}`;
}

export function verifyBookmarkletToken(
  token: string
): { userId: string } | null {
  const parts = token.split(':');
  if (parts.length !== 3) return null;

  const [userId, expTimestampStr, signature] = parts;
  const expTimestamp = Number(expTimestampStr);
  if (!userId || !expTimestampStr || !signature || Number.isNaN(expTimestamp)) {
    return null;
  }

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const expectedSignature = sign(userId, expTimestamp, secret);
  const signatureValid =
    signature.length === expectedSignature.length &&
    timingSafeEqual(signature, expectedSignature);

  if (!signatureValid || expTimestamp <= Date.now()) {
    return null;
  }

  return { userId };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
