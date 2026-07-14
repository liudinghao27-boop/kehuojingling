import { randomUUID } from 'crypto';
import { QrLoginSession } from './types';

const sessions = new Map<string, QrLoginSession>();

export function createSession(
  userId: string,
  platform: string
): QrLoginSession {
  const sessionId = randomUUID();
  const session: QrLoginSession = {
    sessionId,
    userId,
    platform,
    status: 'pending',
    createdAt: Date.now(),
  };

  sessions.set(sessionId, session);
  console.log(`[QrLogin] Created session ${sessionId} for user ${userId}`);
  return session;
}

export function getSession(sessionId: string): QrLoginSession | undefined {
  return sessions.get(sessionId);
}

export function updateSession(
  sessionId: string,
  updates: Partial<QrLoginSession>
): void {
  const session = sessions.get(sessionId);
  if (!session) {
    console.warn(`[QrLogin] updateSession called for unknown session ${sessionId}`);
    return;
  }

  Object.assign(session, updates);
}

export function removeSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export async function cleanupSession(session: QrLoginSession): Promise<void> {
  if (session.timeout) {
    clearTimeout(session.timeout);
    session.timeout = undefined;
  }

  if (session.browser) {
    try {
      await session.browser.close();
    } catch (error) {
      console.error(
        `[QrLogin] Failed to close browser for session ${session.sessionId}:`,
        error
      );
    }
    session.browser = undefined;
    session.page = undefined;
  }

  sessions.delete(session.sessionId);
  console.log(`[QrLogin] Cleaned up session ${session.sessionId}`);
}

export function scheduleCleanup(
  sessionId: string,
  ms: number = 300_000
): void {
  const session = sessions.get(sessionId);
  if (!session) {
    console.warn(
      `[QrLogin] scheduleCleanup called for unknown session ${sessionId}`
    );
    return;
  }

  if (session.timeout) {
    clearTimeout(session.timeout);
  }

  session.timeout = setTimeout(async () => {
    const current = sessions.get(sessionId);
    if (!current) return;

    if (current.status !== 'success') {
      current.status = 'expired';
      console.log(`[QrLogin] Session ${sessionId} expired`);
    }

    await cleanupSession(current);
  }, ms);
}

export function getSessions(): ReadonlyMap<string, QrLoginSession> {
  return sessions;
}
