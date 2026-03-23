import type { DatabaseSession, DatabaseUser } from "lucia";
import { getDB, type DbEnv } from "./client";

type DbSessionRecord = {
  id: string;
  user_id: string;
  expires_at: number;
};

type DbUserRecord = {
  id: string;
  email: string | null;
};

function toDatabaseSession(row: DbSessionRecord): DatabaseSession {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: new Date(row.expires_at),
    attributes: {},
  };
}

function toDatabaseUser(row: DbUserRecord): DatabaseUser {
  return {
    id: row.id,
    attributes: {
      email: row.email,
      name: null,
    },
  };
}

export async function createUser(id: string, email: string | null = null, env?: DbEnv): Promise<DatabaseUser> {
  const db = getDB(env);
  const now = Date.now();

  await db
    .prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)")
    .bind(id, email, now)
    .run();

  return {
    id,
    attributes: {
      email,
      name: null,
    },
  };
}

export async function getUserById(id: string, env?: DbEnv): Promise<DatabaseUser | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, email FROM users WHERE id = ? LIMIT 1")
    .bind(id)
    .first<DbUserRecord>();

  if (!row) {
    return null;
  }

  return toDatabaseUser(row);
}

export async function getUserByEmail(email: string, env?: DbEnv): Promise<DatabaseUser | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, email FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<DbUserRecord>();

  if (!row) {
    return null;
  }

  return toDatabaseUser(row);
}

export async function createSession(session: DatabaseSession, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(session.id, session.userId, session.expiresAt.getTime())
    .run();
}

export async function getSession(sessionId: string, env?: DbEnv): Promise<DatabaseSession | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, user_id, expires_at FROM sessions WHERE id = ? LIMIT 1")
    .bind(sessionId)
    .first<DbSessionRecord>();

  if (!row) {
    return null;
  }

  return toDatabaseSession(row);
}

export async function deleteSession(sessionId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

export async function getSessionAndUser(
  sessionId: string,
  env?: DbEnv,
): Promise<[DatabaseSession | null, DatabaseUser | null]> {
  const db = getDB(env);

  const row = await db
    .prepare(
      `SELECT
        s.id AS id,
        s.user_id AS user_id,
        s.expires_at AS expires_at,
        u.id AS user_record_id,
        u.email AS email
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
      LIMIT 1`,
    )
    .bind(sessionId)
    .first<{ id: string; user_id: string; expires_at: number; user_record_id: string; email: string | null }>();

  if (!row) {
    return [null, null];
  }

  const session = toDatabaseSession({
    id: row.id,
    user_id: row.user_id,
    expires_at: row.expires_at,
  });

  const user = toDatabaseUser({
    id: row.user_record_id,
    email: row.email,
  });

  return [session, user];
}

export async function getUserSessions(userId: string, env?: DbEnv): Promise<DatabaseSession[]> {
  const db = getDB(env);

  const result = await db
    .prepare("SELECT id, user_id, expires_at FROM sessions WHERE user_id = ?")
    .bind(userId)
    .all<DbSessionRecord>();

  const rows = result.results ?? [];
  return rows.map(toDatabaseSession);
}

export async function updateSessionExpiration(sessionId: string, expiresAt: Date, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
    .bind(expiresAt.getTime(), sessionId)
    .run();
}

export async function deleteUserSessions(userId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

export async function deleteExpiredSessions(now: number = Date.now(), env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
}
