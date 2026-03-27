import type { DatabaseSession, DatabaseUser } from "lucia";
import { decryptTwoFactorSecret, encryptTwoFactorSecret } from "../auth/two-factor";
import { getDB, type DbEnv } from "./client";

type DbSessionRecord = {
  id: string;
  user_id: string;
  expires_at: number;
};

type DbSessionFingerprintRecord = {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
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
  email_verified: number | null;
  password_hash: string | null;
  two_factor_enabled: number | null;
  two_factor_secret: string | null;
  name: string | null;
  avatar_url: string | null;
  status: string | null;
  profession: string | null;
  industry: string | null;
  country: string | null;
};

type DbBackupCodeRecord = {
  id: string;
  user_id: string;
  code: string;
  used: number;
};

type DbPasskeyRecord = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  created_at: number;
};

type DbEmailVerificationTokenRecord = {
  id: string;
  user_id: string;
  token: string;
  expires_at: number;
};

type DbPasswordResetTokenRecord = {
  id: string;
  user_id: string;
  token: string;
  expires_at: number;
};

type DbEmailOtpCodeRecord = {
  id: string;
  email: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  created_at: number;
};

type DbAuthRateLimitRecord = {
  key: string;
  window_start: number;
  count: number;
};

type DbDocumentRecord = {
  id: string;
  user_id: string;
  title: string | null;
  content: string | null;
  visibility: string | null;
  created_at: number;
  updated_at: number;
};

type DbDocumentCollaboratorRecord = {
  id: string;
  document_id: string;
  user_id: string;
  role: string;
  created_at: number;
};

type DbDocumentCollaboratorWithUserRecord = {
  id: string;
  document_id: string;
  user_id: string;
  role: string;
  created_at: number;
  email: string | null;
  name: string | null;
};

export type CollaboratorRole = "viewer" | "editor";
export type DocumentAccessRole = "owner" | CollaboratorRole;
export type DocumentVisibility = "private" | "public";
export type DocumentActivityAction = "view" | "open" | "edit" | "join";

let warnedMissingTwoFactorKeyInDev = false;

function resolveTwoFactorKey(env?: DbEnv): string {
  const fromEnv = env?.TWO_FACTOR_SECRET_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const fromProcess = process.env.TWO_FACTOR_SECRET_KEY?.trim();
  if (fromProcess) {
    return fromProcess;
  }

  if (process.env.NODE_ENV !== "production") {
    if (!warnedMissingTwoFactorKeyInDev) {
      console.warn("[security][2fa] TWO_FACTOR_SECRET_KEY missing; using development fallback key.");
      warnedMissingTwoFactorKeyInDev = true;
    }

    return "docsyra-dev-insecure-fallback-key-change-me";
  }

  throw new Error("TWO_FACTOR_SECRET_KEY is not configured");
}

type DbDocumentActivityLogRecord = {
  id: string;
  document_id: string;
  user_id: string | null;
  action: string;
  created_at: number;
  email: string | null;
  name: string | null;
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
    .prepare("SELECT id, email, email_verified, password_hash, two_factor_enabled, two_factor_secret, name, avatar_url, status, profession, industry, country FROM users WHERE id = ? LIMIT 1")
    .bind(id)
    .first<DbUserRecord>();

  if (!row) {
    return null;
  }

  return toDatabaseUser(row);
}

export async function isUserEmailVerified(userId: string, env?: DbEnv): Promise<boolean> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT email_verified FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first<{ email_verified: number | null }>();

  return row?.email_verified === 1;
}

export async function getUserByEmail(email: string, env?: DbEnv): Promise<DatabaseUser | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, email, email_verified, password_hash, two_factor_enabled, two_factor_secret, name, avatar_url, status, profession, industry, country FROM users WHERE email = ? LIMIT 1")
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
        u.email_verified AS email_verified,
        u.two_factor_enabled AS two_factor_enabled,
        u.two_factor_secret AS two_factor_secret,
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
      email_verified: number | null;
      password_hash: string | null;
      two_factor_enabled: number | null;
      two_factor_secret: string | null;
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
    email_verified: row.email_verified,
    password_hash: row.password_hash,
    two_factor_enabled: row.two_factor_enabled,
    two_factor_secret: row.two_factor_secret,
    name: row.name,
    avatar_url: row.avatar_url,
    status: row.status,
    profession: row.profession,
    industry: row.industry,
    country: row.country,
  });

  return [session, user];
}

export async function getUserTwoFactorSettings(
  userId: string,
  env?: DbEnv,
): Promise<{ enabled: boolean; secret: string | null } | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT two_factor_enabled, two_factor_secret FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first<{ two_factor_enabled: number | null; two_factor_secret: string | null }>();

  if (!row) {
    return null;
  }

  const secret = row.two_factor_secret
    ? await decryptTwoFactorSecret(row.two_factor_secret, resolveTwoFactorKey(env))
    : null;

  return {
    enabled: row.two_factor_enabled === 1,
    secret,
  };
}

export async function setUserTwoFactorSecret(userId: string, secret: string | null, env?: DbEnv): Promise<void> {
  const db = getDB(env);
  const encryptedSecret = secret ? await encryptTwoFactorSecret(secret, resolveTwoFactorKey(env)) : null;

  await db
    .prepare("UPDATE users SET two_factor_secret = ? WHERE id = ?")
    .bind(encryptedSecret, userId)
    .run();
}

export async function updateSessionClientMetadata(
  sessionId: string,
  metadata: { userAgent: string | null; ipAddress: string | null },
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  try {
    await db
      .prepare("UPDATE sessions SET user_agent = ?, ip_address = ? WHERE id = ?")
      .bind(metadata.userAgent, metadata.ipAddress, sessionId)
      .run();
  } catch {
    // Allow auth to continue if metadata columns are not available yet.
  }
}

export async function getRecentSessionFingerprints(
  userId: string,
  excludeSessionId: string,
  limit: number = 10,
  env?: DbEnv,
): Promise<Array<{ id: string; userAgent: string | null; ipAddress: string | null; expiresAt: number }>> {
  const db = getDB(env);

  try {
    const result = await db
      .prepare(
        "SELECT id, user_agent, ip_address, expires_at FROM sessions WHERE user_id = ? AND id != ? ORDER BY expires_at DESC LIMIT ?",
      )
      .bind(userId, excludeSessionId, limit)
      .all<DbSessionFingerprintRecord>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      expiresAt: row.expires_at,
    }));
  } catch {
    // If metadata columns are missing, skip risk analysis instead of blocking login.
    return [];
  }
}

export async function setUserTwoFactorEnabled(userId: string, enabled: boolean, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE users SET two_factor_enabled = ? WHERE id = ?")
    .bind(enabled ? 1 : 0, userId)
    .run();
}

export async function replaceBackupCodes(
  userId: string,
  hashedCodes: string[],
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM backup_codes WHERE user_id = ?")
    .bind(userId)
    .run();

  for (const hashedCode of hashedCodes) {
    await db
      .prepare("INSERT INTO backup_codes (id, user_id, code, used) VALUES (?, ?, ?, 0)")
      .bind(crypto.randomUUID(), userId, hashedCode)
      .run();
  }
}

export async function consumeBackupCode(
  userId: string,
  hashedCode: string,
  env?: DbEnv,
): Promise<boolean> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, user_id, code, used FROM backup_codes WHERE user_id = ? AND code = ? LIMIT 1")
    .bind(userId, hashedCode)
    .first<DbBackupCodeRecord>();

  if (!row || row.used === 1) {
    return false;
  }

  await db
    .prepare("UPDATE backup_codes SET used = 1 WHERE id = ?")
    .bind(row.id)
    .run();

  return true;
}

export async function deleteBackupCodesByUser(userId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM backup_codes WHERE user_id = ?")
    .bind(userId)
    .run();
}

export async function createPasskeyRecord(
  input: {
    userId: string;
    credentialId: string;
    publicKey: string;
    counter: number;
    transports: string[];
  },
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare(
      "INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.credentialId,
      input.publicKey,
      input.counter,
      JSON.stringify(input.transports),
      Date.now(),
    )
    .run();
}

export async function getPasskeysByUserId(
  userId: string,
  env?: DbEnv,
): Promise<Array<{ id: string; credentialId: string; counter: number; transports: string[]; createdAt: number }>> {
  const db = getDB(env);

  const result = await db
    .prepare("SELECT id, user_id, credential_id, public_key, counter, transports, created_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId)
    .all<DbPasskeyRecord>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    credentialId: row.credential_id,
    counter: row.counter,
    transports: row.transports ? (JSON.parse(row.transports) as string[]) : [],
    createdAt: row.created_at,
  }));
}

export async function getPasskeyByCredentialId(
  credentialId: string,
  env?: DbEnv,
): Promise<{
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  createdAt: number;
} | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, user_id, credential_id, public_key, counter, transports, created_at FROM passkeys WHERE credential_id = ? LIMIT 1")
    .bind(credentialId)
    .first<DbPasskeyRecord>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: row.transports ? (JSON.parse(row.transports) as string[]) : [],
    createdAt: row.created_at,
  };
}

export async function updatePasskeyCounter(passkeyId: string, counter: number, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE passkeys SET counter = ? WHERE id = ?")
    .bind(counter, passkeyId)
    .run();
}

export async function deletePasskeyById(passkeyId: string, userId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM passkeys WHERE id = ? AND user_id = ?")
    .bind(passkeyId, userId)
    .run();
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
): Promise<{ id: string; password_hash: string | null; email_verified: number | null } | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, password_hash, email_verified FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<{ id: string; password_hash: string | null; email_verified: number | null }>();

  return row ?? null;
}

export async function updateUserPassword(userId: string, passwordHash: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(passwordHash, userId)
    .run();
}

export async function updateUserEmailVerified(userId: string, verified: boolean, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE users SET email_verified = ? WHERE id = ?")
    .bind(verified ? 1 : 0, userId)
    .run();
}

export async function createEmailVerificationToken(
  userId: string,
  token: string,
  expiresAt: number,
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("INSERT INTO email_verification_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, token, expiresAt)
    .run();
}

export async function getEmailVerificationToken(
  token: string,
  env?: DbEnv,
): Promise<DbEmailVerificationTokenRecord | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, user_id, token, expires_at FROM email_verification_tokens WHERE token = ? LIMIT 1")
    .bind(token)
    .first<DbEmailVerificationTokenRecord>();

  return row ?? null;
}

export async function deleteEmailVerificationToken(id: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM email_verification_tokens WHERE id = ?")
    .bind(id)
    .run();
}

export async function deleteEmailVerificationTokenByToken(token: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM email_verification_tokens WHERE token = ? LIMIT 1")
    .bind(token)
    .run();
}

export async function deleteEmailVerificationTokensByUser(userId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM email_verification_tokens WHERE user_id = ?")
    .bind(userId)
    .run();
}

export async function createPasswordResetToken(
  userId: string,
  token: string,
  expiresAt: number,
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, token, expiresAt)
    .run();
}

export async function getPasswordResetToken(
  token: string,
  env?: DbEnv,
): Promise<DbPasswordResetTokenRecord | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, user_id, token, expires_at FROM password_reset_tokens WHERE token = ? LIMIT 1")
    .bind(token)
    .first<DbPasswordResetTokenRecord>();

  return row ?? null;
}

export async function deletePasswordResetToken(id: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM password_reset_tokens WHERE id = ?")
    .bind(id)
    .run();
}

export async function deletePasswordResetTokenByToken(token: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM password_reset_tokens WHERE token = ? LIMIT 1")
    .bind(token)
    .run();
}

export async function deletePasswordResetTokensByUser(userId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM password_reset_tokens WHERE user_id = ?")
    .bind(userId)
    .run();
}

export async function createEmailOtpCode(
  email: string,
  codeHash: string,
  expiresAt: number,
  createdAt: number,
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("INSERT INTO email_otp_codes (id, email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)")
    .bind(crypto.randomUUID(), email, codeHash, expiresAt, createdAt)
    .run();
}

export async function getLatestEmailOtpCodeByEmail(
  email: string,
  env?: DbEnv,
): Promise<DbEmailOtpCodeRecord | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, email, code_hash, expires_at, attempts, created_at FROM email_otp_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1")
    .bind(email)
    .first<DbEmailOtpCodeRecord>();

  return row ?? null;
}

export async function incrementEmailOtpAttempts(id: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE email_otp_codes SET attempts = attempts + 1 WHERE id = ?")
    .bind(id)
    .run();
}

export async function deleteEmailOtpCodeById(id: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM email_otp_codes WHERE id = ?")
    .bind(id)
    .run();
}

export async function deleteEmailOtpCodesByEmail(email: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM email_otp_codes WHERE email = ?")
    .bind(email)
    .run();
}

export async function checkAndIncrementRateLimit(
  key: string,
  windowMs: number,
  limit: number,
  env?: DbEnv,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const db = getDB(env);
  const now = Date.now();

  const row = await db
    .prepare("SELECT key, window_start, count FROM auth_rate_limits WHERE key = ? LIMIT 1")
    .bind(key)
    .first<DbAuthRateLimitRecord>();

  if (!row || now - row.window_start >= windowMs) {
    await db
      .prepare("INSERT INTO auth_rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = excluded.count")
      .bind(key, now)
      .run();

    return { allowed: true, retryAfterMs: 0 };
  }

  if (row.count >= limit) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, windowMs - (now - row.window_start)),
    };
  }

  await db
    .prepare("UPDATE auth_rate_limits SET count = count + 1 WHERE key = ?")
    .bind(key)
    .run();

  return { allowed: true, retryAfterMs: 0 };
}

export async function createDocument(
  userId: string,
  env?: DbEnv,
): Promise<{ id: string; user_id: string; title: string; content: string; visibility: DocumentVisibility; created_at: number; updated_at: number }> {
  const db = getDB(env);
  const id = crypto.randomUUID();
  const now = Date.now();
  const title = "Untitled";
  const content = "";
  const visibility: DocumentVisibility = "private";

  await db
    .prepare(
      "INSERT INTO documents (id, user_id, title, content, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, userId, title, content, visibility, now, now)
    .run();

  return {
    id,
    user_id: userId,
    title,
    content,
    visibility,
    created_at: now,
    updated_at: now,
  };
}

export async function getDocumentsByUser(
  userId: string,
  env?: DbEnv,
): Promise<Array<{ id: string; user_id: string; title: string | null; content: string | null; visibility: DocumentVisibility; created_at: number; updated_at: number }>> {
  const db = getDB(env);

  const result = await db
    .prepare("SELECT id, user_id, title, content, visibility, created_at, updated_at FROM documents WHERE user_id = ? ORDER BY updated_at DESC")
    .bind(userId)
    .all<DbDocumentRecord>();

  return (result.results ?? []).map((row) => ({
    ...row,
    visibility: row.visibility === "public" ? "public" : "private",
  }));
}

export async function getAccessibleDocumentsByUser(
  userId: string,
  env?: DbEnv,
): Promise<Array<{ id: string; user_id: string; title: string | null; content: string | null; visibility: DocumentVisibility; created_at: number; updated_at: number }>> {
  const db = getDB(env);

  const result = await db
    .prepare(
      `SELECT DISTINCT d.id, d.user_id, d.title, d.content, d.visibility, d.created_at, d.updated_at
      FROM documents d
      LEFT JOIN document_collaborators dc ON dc.document_id = d.id
      WHERE d.user_id = ? OR dc.user_id = ?
      ORDER BY d.updated_at DESC`,
    )
    .bind(userId, userId)
    .all<DbDocumentRecord>();

  return (result.results ?? []).map((row) => ({
    ...row,
    visibility: row.visibility === "public" ? "public" : "private",
  }));
}

export async function getDocumentById(
  id: string,
  env?: DbEnv,
): Promise<{ id: string; user_id: string; title: string | null; content: string | null; visibility: DocumentVisibility; created_at: number; updated_at: number } | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, user_id, title, content, visibility, created_at, updated_at FROM documents WHERE id = ? LIMIT 1")
    .bind(id)
    .first<DbDocumentRecord>();

  if (!row) {
    return null;
  }

  return {
    ...row,
    visibility: row.visibility === "public" ? "public" : "private",
  };
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
    .prepare("DELETE FROM document_collaborators WHERE document_id = ?")
    .bind(id)
    .run();

  await db
    .prepare("DELETE FROM documents WHERE id = ?")
    .bind(id)
    .run();
}

export async function addCollaborator(
  documentId: string,
  userId: string,
  role: CollaboratorRole,
  env?: DbEnv,
): Promise<{ id: string; document_id: string; user_id: string; role: CollaboratorRole; created_at: number }> {
  const db = getDB(env);
  const id = crypto.randomUUID();
  const createdAt = Date.now();

  await db
    .prepare(
      "INSERT INTO document_collaborators (id, document_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, documentId, userId, role, createdAt)
    .run();

  return {
    id,
    document_id: documentId,
    user_id: userId,
    role,
    created_at: createdAt,
  };
}

export async function getCollaborators(
  documentId: string,
  env?: DbEnv,
): Promise<Array<{ id: string; user_id: string; email: string | null; name: string | null; role: CollaboratorRole; created_at: number }>> {
  const db = getDB(env);

  const result = await db
    .prepare(
      `SELECT dc.id, dc.document_id, dc.user_id, dc.role, dc.created_at, u.email, u.name
      FROM document_collaborators dc
      INNER JOIN users u ON u.id = dc.user_id
      WHERE dc.document_id = ?
      ORDER BY dc.created_at DESC`,
    )
    .bind(documentId)
    .all<DbDocumentCollaboratorWithUserRecord>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role === "editor" ? "editor" : "viewer",
    created_at: row.created_at,
  }));
}

export async function removeCollaborator(documentId: string, userId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM document_collaborators WHERE document_id = ? AND user_id = ?")
    .bind(documentId, userId)
    .run();
}

export async function updateDocumentVisibility(
  documentId: string,
  visibility: DocumentVisibility,
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE documents SET visibility = ?, updated_at = ? WHERE id = ?")
    .bind(visibility, Date.now(), documentId)
    .run();
}

export async function logDocumentActivity(
  documentId: string,
  userId: string | null,
  action: DocumentActivityAction,
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("INSERT INTO document_activity_logs (id, document_id, user_id, action, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), documentId, userId, action, Date.now())
    .run();
}

export async function getDocumentLogs(
  documentId: string,
  env?: DbEnv,
): Promise<Array<{ id: string; user_id: string | null; action: DocumentActivityAction; created_at: number; email: string | null; name: string | null }>> {
  const db = getDB(env);

  const result = await db
    .prepare(
      `SELECT l.id, l.document_id, l.user_id, l.action, l.created_at, u.email, u.name
      FROM document_activity_logs l
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.document_id = ?
      ORDER BY l.created_at DESC`,
    )
    .bind(documentId)
    .all<DbDocumentActivityLogRecord>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    action: row.action === "edit" || row.action === "join" || row.action === "open" ? row.action : "view",
    created_at: row.created_at,
    email: row.email,
    name: row.name,
  }));
}

export async function getUserAccess(
  documentId: string,
  userId: string,
  env?: DbEnv,
): Promise<DocumentAccessRole | null> {
  const document = await getDocumentById(documentId, env);
  if (!document) {
    return null;
  }

  if (document.user_id === userId) {
    return "owner";
  }

  const db = getDB(env);
  const row = await db
    .prepare("SELECT id, document_id, user_id, role, created_at FROM document_collaborators WHERE document_id = ? AND user_id = ? LIMIT 1")
    .bind(documentId, userId)
    .first<DbDocumentCollaboratorRecord>();

  if (!row) {
    return null;
  }

  return row.role === "editor" ? "editor" : "viewer";
}
