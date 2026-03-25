import type { DatabaseSession, DatabaseUser } from "lucia";
import { getDB, type DbEnv } from "./client";

type DbSessionRecord = {
  id: string;
  user_id: string;
  expires_at: number;
};

type DbAuthIdentityRecord = {
  provider: string;
  email: string | null;
  avatar_url: string | null;
};

type DbUserRecord = {
  id: string;
  email: string | null;
  password_hash: string | null;
  name: string | null;
  avatar_url: string | null;
  status: string | null;
  profession: string | null;
  industry: string | null;
  country: string | null;
};

type DbDocumentRecord = {
  id: string;
  user_id: string;
  title: string | null;
  content: string | null;
  created_at: number;
  updated_at: number;
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
      name: row.name,
      avatar_url: row.avatar_url,
      status: row.status,
      profession: row.profession,
      industry: row.industry,
      country: row.country,
    },
  };
}

export async function createUser(
  id: string,
  email: string | null = null,
  name: string | null = null,
  avatar_url: string | null = null,
  status: string = "incomplete",
  profession: string | null = null,
  industry: string | null = null,
  country: string | null = null,
  env?: DbEnv,
  passwordHash: string | null = null,
): Promise<DatabaseUser> {
  const db = getDB(env);
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO users (id, email, password_hash, name, avatar_url, status, profession, industry, country, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, email, passwordHash, name, avatar_url, status, profession, industry, country, now)
    .run();

  return {
    id,
    attributes: {
      email,
      name,
      avatar_url,
      status,
      profession,
      industry,
      country,
    },
  };
}

export async function getUserById(id: string, env?: DbEnv): Promise<DatabaseUser | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, email, password_hash, name, avatar_url, status, profession, industry, country FROM users WHERE id = ? LIMIT 1")
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
    .prepare("SELECT id, email, password_hash, name, avatar_url, status, profession, industry, country FROM users WHERE email = ? LIMIT 1")
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
        u.email AS email,
        u.name AS name,
        u.avatar_url AS avatar_url,
        u.status AS status,
        u.profession AS profession,
        u.industry AS industry,
        u.country AS country
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
      LIMIT 1`,
    )
    .bind(sessionId)
    .first<{
      id: string;
      user_id: string;
      expires_at: number;
      user_record_id: string;
      email: string | null;
      password_hash: string | null;
      name: string | null;
      avatar_url: string | null;
      status: string | null;
      profession: string | null;
      industry: string | null;
      country: string | null;
    }>();

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
    password_hash: row.password_hash,
    name: row.name,
    avatar_url: row.avatar_url,
    status: row.status,
    profession: row.profession,
    industry: row.industry,
    country: row.country,
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

export async function updateUserProfile(
  userId: string,
  profile: {
    name?: string | null;
    avatar_url?: string | null;
    profession?: string | null;
    industry?: string | null;
    country?: string | null;
  },
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  const updates: string[] = [];
  const values: Array<string | null> = [];

  if (Object.prototype.hasOwnProperty.call(profile, "name")) {
    updates.push("name = ?");
    values.push(profile.name ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(profile, "avatar_url")) {
    updates.push("avatar_url = ?");
    values.push(profile.avatar_url ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(profile, "profession")) {
    updates.push("profession = ?");
    values.push(profile.profession ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(profile, "industry")) {
    updates.push("industry = ?");
    values.push(profile.industry ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(profile, "country")) {
    updates.push("country = ?");
    values.push(profile.country ?? null);
  }

  if (updates.length === 0) {
    return;
  }

  await db
    .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values, userId)
    .run();
}

export async function updateUserStatus(userId: string, status: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE users SET status = ? WHERE id = ?")
    .bind(status, userId)
    .run();
}

export async function deactivateUser(userId: string, env?: DbEnv): Promise<void> {
  await updateUserStatus(userId, "inactive", env);
}

export async function deleteUser(userId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM auth_identities WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}

export async function getUserAuthIdentities(
  userId: string,
  env?: DbEnv,
): Promise<Array<{ provider: string; email: string | null; avatar_url: string | null }>> {
  const db = getDB(env);

  const result = await db
    .prepare("SELECT provider, email, avatar_url FROM auth_identities WHERE user_id = ?")
    .bind(userId)
    .all<DbAuthIdentityRecord>();

  return result.results ?? [];
}

export async function disconnectUserAuthIdentity(
  userId: string,
  provider: string,
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM auth_identities WHERE user_id = ? AND provider = ?")
    .bind(userId, provider)
    .run();
}

export async function getUserPasswordHashByEmail(
  email: string,
  env?: DbEnv,
): Promise<{ id: string; password_hash: string | null } | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, password_hash FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<{ id: string; password_hash: string | null }>();

  return row ?? null;
}

export async function updateUserPassword(userId: string, passwordHash: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(passwordHash, userId)
    .run();
}

export async function createDocument(
  userId: string,
  env?: DbEnv,
): Promise<{ id: string; user_id: string; title: string; content: string; created_at: number; updated_at: number }> {
  const db = getDB(env);
  const id = crypto.randomUUID();
  const now = Date.now();
  const title = "Untitled";
  const content = "";

  await db
    .prepare(
      "INSERT INTO documents (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, userId, title, content, now, now)
    .run();

  return {
    id,
    user_id: userId,
    title,
    content,
    created_at: now,
    updated_at: now,
  };
}

export async function getDocumentsByUser(
  userId: string,
  env?: DbEnv,
): Promise<Array<{ id: string; user_id: string; title: string | null; content: string | null; created_at: number; updated_at: number }>> {
  const db = getDB(env);

  const result = await db
    .prepare("SELECT id, user_id, title, content, created_at, updated_at FROM documents WHERE user_id = ? ORDER BY updated_at DESC")
    .bind(userId)
    .all<DbDocumentRecord>();

  return result.results ?? [];
}

export async function getDocumentById(
  id: string,
  env?: DbEnv,
): Promise<{ id: string; user_id: string; title: string | null; content: string | null; created_at: number; updated_at: number } | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, user_id, title, content, created_at, updated_at FROM documents WHERE id = ? LIMIT 1")
    .bind(id)
    .first<DbDocumentRecord>();

  return row ?? null;
}

export async function updateDocument(
  id: string,
  updates: { title?: string | null; content?: string | null },
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  const columns: string[] = [];
  const values: Array<string | null | number> = [];

  if (Object.prototype.hasOwnProperty.call(updates, "title")) {
    columns.push("title = ?");
    values.push(updates.title ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "content")) {
    columns.push("content = ?");
    values.push(updates.content ?? null);
  }

  if (columns.length === 0) {
    return;
  }

  columns.push("updated_at = ?");
  values.push(Date.now());

  await db
    .prepare(`UPDATE documents SET ${columns.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();
}

export async function deleteDocument(id: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM documents WHERE id = ?")
    .bind(id)
    .run();
}
