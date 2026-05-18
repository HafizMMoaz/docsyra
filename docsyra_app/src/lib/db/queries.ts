import type { DatabaseSession, DatabaseUser } from "lucia";
import { decryptSecret, encryptSecret } from "../auth/two-factor";
import { getDB, type DbEnv } from "./client";
import { AI_PROVIDER_IDS, type AIProviderId, type AIUserSettings, type AISkill, type AISkillInput } from "../ai/types";

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
  provider_user_id?: string;
  email: string | null;
  avatar_url: string | null;
  access_token?: string | null;
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

type DbPasskeyChallengeRecord = {
  id: string;
  user_id: string | null;
  challenge: string;
  expires_at: number;
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
  owner_id: string | null;
  title: string | null;
  content: string | null;
  visibility: string | null;
  github_repo?: string | null;
  github_branch?: string | null;
  github_path?: string | null;
  last_github_sha?: string | null;
  last_synced_at?: number | null;
  created_at: number;
  updated_at: number;
};

type DbDocumentVersionRecord = {
  id: string;
  document_id: string;
  content: string;
  title: string | null;
  type: string | null;
  label: string | null;
  created_at: number;
  created_by: string | null;
  version_number: number | null;
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

type DbDocumentInvitationRecord = {
  id: string;
  document_id: string;
  invitee_email: string;
  invitee_user_id: string | null;
  invited_by_user_id: string;
  role: string;
  accepted_at: number | null;
  created_at: number;
  updated_at: number;
};

type DbCommentThreadRecord = {
  id: string;
  document_id: string;
  created_by: string;
  selection_from: number;
  selection_to: number;
  selection_text: string | null;
  selection_context_before: string | null;
  selection_context_after: string | null;
  resolved: number;
  created_at: number;
};

type DbCommentRecord = {
  id: string;
  thread_id: string;
  user_id: string;
  content: string;
  created_at: number;
  user_name?: string | null;
  user_email?: string | null;
};

type DbNotificationRecord = {
  id: string;
  user_id: string;
  actor_user_id: string;
  document_id: string;
  thread_id: string | null;
  comment_id: string | null;
  type: string;
  mention_token: string | null;
  message: string;
  read_at: number | null;
  created_at: number;
  actor_name?: string | null;
  actor_email?: string | null;
  document_title?: string | null;
};

type DbAISettingsRecord = {
  user_id: string;
  ai_provider: string;
  anthropic_api_key: string | null;
  anthropic_model: string | null;
  openai_api_key: string | null;
  openai_model: string | null;
  groq_api_key: string | null;
  groq_model: string | null;
  gemini_api_key: string | null;
  gemini_model: string | null;
};

type DbAISkillRecord = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  instructions: string;
  enabled: number;
  created_at: number;
  updated_at: number;
};

export type CollaboratorRole = "viewer" | "editor";
export type DocumentAccessRole = "owner" | CollaboratorRole;
export type DocumentVisibility = "private" | "public";
export type DocumentActivityAction = "view" | "open" | "edit" | "join" | "public_access" | "transfer_ownership" | "invite_sent" | "collaborator_added" | "collaborator_removed" | "role_updated";
export type CommentMessage = {
  id: string;
  threadId: string;
  userId: string;
  content: string;
  createdAt: number;
  userName: string | null;
  userEmail: string | null;
};

export type CommentThread = {
  id: string;
  documentId: string;
  createdBy: string;
  selectionFrom: number;
  selectionTo: number;
  selectionText: string | null;
  selectionContextBefore: string | null;
  selectionContextAfter: string | null;
  resolved: boolean;
  createdAt: number;
  comments: CommentMessage[];
};

export type NotificationType = "comment" | "mention";

export type NotificationItem = {
  id: string;
  userId: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  documentId: string;
  documentTitle: string | null;
  threadId: string | null;
  commentId: string | null;
  type: NotificationType;
  mentionToken: string | null;
  message: string;
  readAt: number | null;
  createdAt: number;
};

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
      email_verified: row.email_verified === 1,
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
      email_verified: false,
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

  const secret = row.two_factor_secret;

  return {
    enabled: row.two_factor_enabled === 1,
    secret,
  };
}

export async function setUserTwoFactorSecret(userId: string, secret: string | null, env?: DbEnv): Promise<void> {
  const db = getDB(env);
  const encryptedSecret = secret ? await encryptSecret(secret) : null;

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

function isAIProviderId(value: string): value is AIProviderId {
  return AI_PROVIDER_IDS.includes(value as AIProviderId);
}

async function decryptStoredValue(value: string | null): Promise<string | null> {
  if (!value) {
    return null;
  }

  return await decryptSecret(value);
}

function normalizeAIProviderId(value: string | null | undefined): AIProviderId {
  if (value && isAIProviderId(value)) {
    return value;
  }

  return "anthropic";
}

export async function getUserAISettings(userId: string, env?: DbEnv): Promise<AIUserSettings | null> {
  const db = getDB(env);

  const row = await db
    .prepare(
      `SELECT
        user_id,
        ai_provider,
        anthropic_api_key,
        anthropic_model,
        openai_api_key,
        openai_model,
        groq_api_key,
        groq_model,
        gemini_api_key,
        gemini_model
      FROM user_ai_settings
      WHERE user_id = ?
      LIMIT 1`,
    )
    .bind(userId)
    .first<DbAISettingsRecord>();

  if (!row) {
    return null;
  }

  const [anthropicApiKey, openaiApiKey, groqApiKey, geminiApiKey] = await Promise.all([
    decryptStoredValue(row.anthropic_api_key),
    decryptStoredValue(row.openai_api_key),
    decryptStoredValue(row.groq_api_key),
    decryptStoredValue(row.gemini_api_key),
  ]);

  return {
    provider: normalizeAIProviderId(row.ai_provider),
    providers: {
      anthropic: { apiKey: anthropicApiKey, model: row.anthropic_model ?? null },
      openai: { apiKey: openaiApiKey, model: row.openai_model ?? null },
      groq: { apiKey: groqApiKey, model: row.groq_model ?? null },
      gemini: { apiKey: geminiApiKey, model: row.gemini_model ?? null },
    },
  };
}

export async function upsertUserAISettings(
  userId: string,
  settings: AIUserSettings,
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);
  const now = Date.now();

  const encryptedAnthropicKey = settings.providers.anthropic.apiKey ? await encryptSecret(settings.providers.anthropic.apiKey) : null;
  const encryptedOpenAIKey = settings.providers.openai.apiKey ? await encryptSecret(settings.providers.openai.apiKey) : null;
  const encryptedGroqKey = settings.providers.groq.apiKey ? await encryptSecret(settings.providers.groq.apiKey) : null;
  const encryptedGeminiKey = settings.providers.gemini.apiKey ? await encryptSecret(settings.providers.gemini.apiKey) : null;

  await db
    .prepare(
      `INSERT INTO user_ai_settings (
        user_id,
        ai_provider,
        anthropic_api_key,
        anthropic_model,
        openai_api_key,
        openai_model,
        groq_api_key,
        groq_model,
        gemini_api_key,
        gemini_model,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        ai_provider = excluded.ai_provider,
        anthropic_api_key = excluded.anthropic_api_key,
        anthropic_model = excluded.anthropic_model,
        openai_api_key = excluded.openai_api_key,
        openai_model = excluded.openai_model,
        groq_api_key = excluded.groq_api_key,
        groq_model = excluded.groq_model,
        gemini_api_key = excluded.gemini_api_key,
        gemini_model = excluded.gemini_model,
        updated_at = excluded.updated_at`,
    )
    .bind(
      userId,
      normalizeAIProviderId(settings.provider),
      encryptedAnthropicKey,
      settings.providers.anthropic.model ?? null,
      encryptedOpenAIKey,
      settings.providers.openai.model ?? null,
      encryptedGroqKey,
      settings.providers.groq.model ?? null,
      encryptedGeminiKey,
      settings.providers.gemini.model ?? null,
      now,
      now,
    )
    .run();
}

function mapAISkill(row: DbAISkillRecord): AISkill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeAISkillInput(input: AISkillInput): {
  name: string;
  description: string | null;
  instructions: string;
  enabled: boolean;
} {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    instructions: input.instructions.trim(),
    enabled: input.enabled ?? true,
  };
}

export async function getUserAISkills(userId: string, env?: DbEnv): Promise<AISkill[]> {
  const db = getDB(env);

  const result = await db
    .prepare(
      `SELECT
        id,
        user_id,
        name,
        description,
        instructions,
        enabled,
        created_at,
        updated_at
      FROM user_ai_skills
      WHERE user_id = ?
      ORDER BY updated_at DESC, created_at DESC`,
    )
    .bind(userId)
    .all<DbAISkillRecord>();

  return (result.results ?? []).map(mapAISkill);
}

export async function createUserAISkill(
  userId: string,
  input: AISkillInput,
  env?: DbEnv,
): Promise<AISkill> {
  const db = getDB(env);
  const now = Date.now();
  const skillId = crypto.randomUUID();
  const normalized = normalizeAISkillInput(input);

  await db
    .prepare(
      `INSERT INTO user_ai_skills (
        id,
        user_id,
        name,
        description,
        instructions,
        enabled,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      skillId,
      userId,
      normalized.name,
      normalized.description,
      normalized.instructions,
      normalized.enabled ? 1 : 0,
      now,
      now,
    )
    .run();

  return {
    id: skillId,
    name: normalized.name,
    description: normalized.description,
    instructions: normalized.instructions,
    enabled: normalized.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateUserAISkill(
  userId: string,
  skillId: string,
  input: AISkillInput,
  env?: DbEnv,
): Promise<AISkill | null> {
  const db = getDB(env);
  const now = Date.now();
  const normalized = normalizeAISkillInput(input);

  const result = await db
    .prepare(
      `UPDATE user_ai_skills
       SET name = ?, description = ?, instructions = ?, enabled = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      normalized.name,
      normalized.description,
      normalized.instructions,
      normalized.enabled ? 1 : 0,
      now,
      skillId,
      userId,
    )
    .run();

  if (!result.meta.changes) {
    return null;
  }

  return {
    id: skillId,
    name: normalized.name,
    description: normalized.description,
    instructions: normalized.instructions,
    enabled: normalized.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteUserAISkill(userId: string, skillId: string, env?: DbEnv): Promise<boolean> {
  const db = getDB(env);

  const result = await db
    .prepare("DELETE FROM user_ai_skills WHERE id = ? AND user_id = ?")
    .bind(skillId, userId)
    .run();

  return Boolean(result.meta.changes);
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

export async function deleteExpiredPasskeyChallenges(now: number = Date.now(), env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM passkey_challenges WHERE expires_at <= ?")
    .bind(now)
    .run();
}

export async function createPasskeyChallenge(
  input: {
    userId: string | null;
    challenge: string;
    expiresAt: number;
  },
  env?: DbEnv,
): Promise<{ id: string; userId: string | null; challenge: string; expiresAt: number }> {
  const db = getDB(env);

  await deleteExpiredPasskeyChallenges(Date.now(), env);

  if (input.userId) {
    await db
      .prepare("DELETE FROM passkey_challenges WHERE user_id = ?")
      .bind(input.userId)
      .run();
  } else {
    await db.prepare("DELETE FROM passkey_challenges WHERE user_id IS NULL").run();
  }

  const id = crypto.randomUUID();

  await db
    .prepare("INSERT INTO passkey_challenges (id, user_id, challenge, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, input.userId, input.challenge, input.expiresAt)
    .run();

  return {
    id,
    userId: input.userId,
    challenge: input.challenge,
    expiresAt: input.expiresAt,
  };
}

export async function getPasskeyChallengeByUserId(
  userId: string,
  env?: DbEnv,
): Promise<DbPasskeyChallengeRecord | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, user_id, challenge, expires_at FROM passkey_challenges WHERE user_id = ? ORDER BY expires_at DESC LIMIT 1")
    .bind(userId)
    .first<DbPasskeyChallengeRecord>();

  return row ?? null;
}

export async function deletePasskeyChallengeById(id: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM passkey_challenges WHERE id = ?")
    .bind(id)
    .run();
}

export async function deletePasskeyChallengesByUserId(userId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM passkey_challenges WHERE user_id = ?")
    .bind(userId)
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

export async function getGitHubIdentityForUser(
  userId: string,
  env?: DbEnv,
): Promise<{ provider_user_id: string; access_token: string } | null> {
  const db = getDB(env);

  const row = await db
    .prepare(
      "SELECT provider_user_id, access_token FROM auth_identities WHERE user_id = ? AND provider = 'github' LIMIT 1",
    )
    .bind(userId)
    .first<{ provider_user_id: string; access_token: string | null }>();

  if (!row?.access_token) {
    return null;
  }

  return {
    provider_user_id: row.provider_user_id,
    access_token: row.access_token,
  };
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
    .prepare("DELETE FROM email_verification_tokens WHERE token = ?")
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
): Promise<{ id: string; owner_id: string; title: string; content: string; visibility: DocumentVisibility; github_repo: string | null; github_branch: string | null; github_path: string | null; last_github_sha: string | null; last_synced_at: number | null; created_at: number; updated_at: number }> {
  const db = getDB(env);
  const id = crypto.randomUUID();
  const now = Date.now();
  const title = "Untitled";
  const content = "";
  const visibility: DocumentVisibility = "private";
  const githubRepo: string | null = null;
  const githubBranch: string | null = null;
  const githubPath: string | null = null;
  const lastGitHubSha: string | null = null;
  const lastSyncedAt: number | null = null;

  await db
    .prepare(
      "INSERT INTO documents (id, owner_id, title, content, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, userId, title, content, visibility, now, now)
    .run();

  return {
    id,
    owner_id: userId,
    title,
    content,
    visibility,
    github_repo: githubRepo,
    github_branch: githubBranch,
    github_path: githubPath,
    last_github_sha: lastGitHubSha,
    last_synced_at: lastSyncedAt,
    created_at: now,
    updated_at: now,
  };
}

export async function createCommentThread(
  input: {
    id?: string;
    documentId: string;
    userId: string;
    selectionFrom: number;
    selectionTo: number;
    selectionText?: string | null;
    selectionContextBefore?: string | null;
    selectionContextAfter?: string | null;
  },
  env?: DbEnv,
): Promise<{ id: string; documentId: string; createdBy: string; selectionFrom: number; selectionTo: number; selectionText: string | null; selectionContextBefore: string | null; selectionContextAfter: string | null; createdAt: number }> {
  const db = getDB(env);
  const id = input.id ?? crypto.randomUUID();
  const createdAt = Date.now();

  await db
    .prepare(
      "INSERT INTO comment_threads (id, document_id, created_by, selection_from, selection_to, selection_text, selection_context_before, selection_context_after, resolved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
    )
    .bind(
      id,
      input.documentId,
      input.userId,
      input.selectionFrom,
      input.selectionTo,
      input.selectionText ?? null,
      input.selectionContextBefore ?? null,
      input.selectionContextAfter ?? null,
      createdAt,
    )
    .run();

  return {
    id,
    documentId: input.documentId,
    createdBy: input.userId,
    selectionFrom: input.selectionFrom,
    selectionTo: input.selectionTo,
    selectionText: input.selectionText ?? null,
    selectionContextBefore: input.selectionContextBefore ?? null,
    selectionContextAfter: input.selectionContextAfter ?? null,
    createdAt,
  };
}

export async function addComment(
  input: {
    id?: string;
    threadId: string;
    userId: string;
    content: string;
  },
  env?: DbEnv,
): Promise<{ id: string; threadId: string; userId: string; content: string; createdAt: number }> {
  const db = getDB(env);
  const id = input.id ?? crypto.randomUUID();
  const createdAt = Date.now();

  await db
    .prepare("INSERT INTO comments (id, thread_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, input.threadId, input.userId, input.content, createdAt)
    .run();

  return {
    id,
    threadId: input.threadId,
    userId: input.userId,
    content: input.content,
    createdAt,
  };
}

export async function getCommentThreadById(
  threadId: string,
  env?: DbEnv,
): Promise<{ id: string; documentId: string; createdBy: string; selectionFrom: number; selectionTo: number; selectionText: string | null; selectionContextBefore: string | null; selectionContextAfter: string | null; resolved: boolean; createdAt: number } | null> {
  const db = getDB(env);

  const row = await db
    .prepare(
      "SELECT id, document_id, created_by, selection_from, selection_to, selection_text, selection_context_before, selection_context_after, resolved, created_at FROM comment_threads WHERE id = ? LIMIT 1",
    )
    .bind(threadId)
    .first<DbCommentThreadRecord>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    documentId: row.document_id,
    createdBy: row.created_by,
    selectionFrom: row.selection_from,
    selectionTo: row.selection_to,
    selectionText: row.selection_text ?? null,
    selectionContextBefore: row.selection_context_before ?? null,
    selectionContextAfter: row.selection_context_after ?? null,
    resolved: row.resolved === 1,
    createdAt: row.created_at,
  };
}

export async function getCommentsByDoc(documentId: string, env?: DbEnv): Promise<CommentThread[]> {
  const db = getDB(env);

  const threadRows = await db
    .prepare(
      "SELECT id, document_id, created_by, selection_from, selection_to, selection_text, selection_context_before, selection_context_after, resolved, created_at FROM comment_threads WHERE document_id = ? ORDER BY created_at ASC",
    )
    .bind(documentId)
    .all<DbCommentThreadRecord>();

  const threads = threadRows.results ?? [];
  if (threads.length === 0) {
    return [];
  }

  const commentRows = await db
    .prepare(
      `SELECT c.id, c.thread_id, c.user_id, c.content, c.created_at, u.name AS user_name, u.email AS user_email
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       INNER JOIN comment_threads t ON t.id = c.thread_id
       WHERE t.document_id = ?
       ORDER BY c.created_at ASC`,
    )
    .bind(documentId)
    .all<DbCommentRecord>();

  const commentsByThread = new Map<string, CommentMessage[]>();

  for (const row of commentRows.results ?? []) {
    const next: CommentMessage = {
      id: row.id,
      threadId: row.thread_id,
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
      userName: row.user_name ?? null,
      userEmail: row.user_email ?? null,
    };

    const list = commentsByThread.get(row.thread_id) ?? [];
    list.push(next);
    commentsByThread.set(row.thread_id, list);
  }

  return threads.map((thread) => ({
    id: thread.id,
    documentId: thread.document_id,
    createdBy: thread.created_by,
    selectionFrom: thread.selection_from,
    selectionTo: thread.selection_to,
    selectionText: thread.selection_text ?? null,
    selectionContextBefore: thread.selection_context_before ?? null,
    selectionContextAfter: thread.selection_context_after ?? null,
    resolved: thread.resolved === 1,
    createdAt: thread.created_at,
    comments: commentsByThread.get(thread.id) ?? [],
  }));
}

export async function setCommentThreadResolved(
  input: { threadId: string; resolved: boolean },
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE comment_threads SET resolved = ? WHERE id = ?")
    .bind(input.resolved ? 1 : 0, input.threadId)
    .run();
}

export async function createNotification(
  input: {
    id?: string;
    userId: string;
    actorUserId: string;
    documentId: string;
    threadId?: string | null;
    commentId?: string | null;
    type: NotificationType;
    mentionToken?: string | null;
    message: string;
  },
  env?: DbEnv,
): Promise<{ id: string; createdAt: number }> {
  const db = getDB(env);
  const id = input.id ?? crypto.randomUUID();
  const createdAt = Date.now();

  await db
    .prepare(
      "INSERT INTO notifications (id, user_id, actor_user_id, document_id, thread_id, comment_id, type, mention_token, message, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
    )
    .bind(
      id,
      input.userId,
      input.actorUserId,
      input.documentId,
      input.threadId ?? null,
      input.commentId ?? null,
      input.type,
      input.mentionToken ?? null,
      input.message,
      createdAt,
    )
    .run();

  return { id, createdAt };
}

export async function getNotificationsByUser(
  userId: string,
  options?: { limit?: number; unreadOnly?: boolean },
  env?: DbEnv,
): Promise<NotificationItem[]> {
  const db = getDB(env);
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 100));

  const unreadCondition = options?.unreadOnly ? "AND n.read_at IS NULL" : "";
  const result = await db
    .prepare(
      `SELECT n.id, n.user_id, n.actor_user_id, n.document_id, n.thread_id, n.comment_id, n.type, n.mention_token, n.message, n.read_at, n.created_at,
              u.name AS actor_name, u.email AS actor_email, d.title AS document_title
       FROM notifications n
       LEFT JOIN users u ON u.id = n.actor_user_id
       LEFT JOIN documents d ON d.id = n.document_id
       WHERE n.user_id = ? ${unreadCondition}
       ORDER BY n.created_at DESC
       LIMIT ?`,
    )
    .bind(userId, limit)
    .all<DbNotificationRecord>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name ?? null,
    actorEmail: row.actor_email ?? null,
    documentId: row.document_id,
    documentTitle: row.document_title ?? null,
    threadId: row.thread_id ?? null,
    commentId: row.comment_id ?? null,
    type: row.type === "mention" ? "mention" : "comment",
    mentionToken: row.mention_token ?? null,
    message: row.message,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  }));
}

export async function getUnreadNotificationCount(userId: string, env?: DbEnv): Promise<number> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .bind(userId)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function markNotificationRead(userId: string, notificationId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?")
    .bind(Date.now(), notificationId, userId)
    .run();
}

export async function markAllNotificationsRead(userId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL")
    .bind(Date.now(), userId)
    .run();
}

export async function getDocumentsByUser(
  userId: string,
  env?: DbEnv,
): Promise<Array<{ id: string; owner_id: string | null; title: string | null; content: string | null; visibility: DocumentVisibility; created_at: number; updated_at: number }>> {
  const db = getDB(env);

  const result = await db
    .prepare("SELECT id, owner_id, title, content, visibility, created_at, updated_at FROM documents WHERE owner_id = ? ORDER BY updated_at DESC")
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
): Promise<Array<{ id: string; owner_id: string | null; title: string | null; content: string | null; visibility: DocumentVisibility; created_at: number; updated_at: number }>> {
  const db = getDB(env);

  const result = await db
    .prepare(
      `SELECT DISTINCT d.id, d.owner_id, d.title, d.content, d.visibility, d.created_at, d.updated_at
      FROM documents d
      LEFT JOIN document_collaborators dc ON dc.document_id = d.id
      WHERE d.owner_id = ? OR dc.user_id = ?
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
): Promise<{ id: string; owner_id: string | null; title: string | null; content: string | null; visibility: DocumentVisibility; github_repo: string | null; github_branch: string | null; github_path: string | null; last_github_sha: string | null; last_synced_at: number | null; created_at: number; updated_at: number } | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, owner_id, title, content, visibility, github_repo, github_branch, github_path, last_github_sha, last_synced_at, created_at, updated_at FROM documents WHERE id = ? LIMIT 1")
    .bind(id)
    .first<DbDocumentRecord>();

  if (!row) {
    return null;
  }

  return {
    ...row,
    visibility: row.visibility === "public" ? "public" : "private",
    github_repo: row.github_repo ?? null,
    github_branch: row.github_branch ?? null,
    github_path: row.github_path ?? null,
    last_github_sha: row.last_github_sha ?? null,
    last_synced_at: row.last_synced_at ?? null,
  };
}

export async function updateDocumentGitHubMapping(
  id: string,
  mapping: {
    github_repo: string | null;
    github_branch: string | null;
    github_path: string | null;
  },
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE documents SET github_repo = ?, github_branch = ?, github_path = ?, last_github_sha = NULL, last_synced_at = NULL, updated_at = ? WHERE id = ?")
    .bind(mapping.github_repo, mapping.github_branch, mapping.github_path, Date.now(), id)
    .run();
}

export async function updateDocumentGitHubSyncState(
  id: string,
  input: {
    lastGitHubSha: string | null;
    lastSyncedAt: number | null;
  },
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("UPDATE documents SET last_github_sha = ?, last_synced_at = ?, updated_at = ? WHERE id = ?")
    .bind(input.lastGitHubSha, input.lastSyncedAt, Date.now(), id)
    .run();
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

export async function getLastVersion(
  documentId: string,
  env?: DbEnv,
): Promise<{ id: string; documentId: string; content: string; title: string | null; type: string | null; label: string | null; createdAt: number; createdBy: string | null; versionNumber: number } | null> {
  const db = getDB(env);

  const result = await db
    .prepare(
      "SELECT id, document_id, content, title, type, label, created_at, created_by, version_number FROM document_versions WHERE document_id = ? ORDER BY version_number DESC LIMIT 1",
    )
    .bind(documentId)
    .first<DbDocumentVersionRecord>();

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    documentId: result.document_id,
    content: result.content,
    title: result.title,
    type: result.type,
    label: result.label,
    createdAt: result.created_at,
    createdBy: result.created_by,
    versionNumber: result.version_number ?? 0,
  };
}

export async function createDocumentVersion(
  input: {
    documentId: string;
    content: string;
    title?: string | null;
    userId?: string | null;
    type?: "auto" | "manual" | "restore";
    label?: string | null;
  },
  env?: DbEnv,
): Promise<{ id: string; documentId: string; content: string; title: string | null; type: string | null; label: string | null; createdAt: number; createdBy: string | null; versionNumber: number } | null> {
  const db = getDB(env);
  const createdAt = Date.now();
  const versionType = input.type ?? "auto";
  const versionLabel = input.label ?? null;

  // Content-based deduplication: skip if last version has identical content
  const lastVersion = await getLastVersion(input.documentId, env);
  if (lastVersion && lastVersion.content === input.content) {
    return null; // Skip duplicate version
  }

  const versionRow = await db
    .prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number FROM document_versions WHERE document_id = ?")
    .bind(input.documentId)
    .first<{ version_number: number }>();

  const versionNumber = versionRow?.version_number ?? 1;
  const id = crypto.randomUUID();

  await db
    .prepare(
      "INSERT INTO document_versions (id, document_id, content, title, type, label, created_at, created_by, version_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, input.documentId, input.content, input.title ?? null, versionType, versionLabel, createdAt, input.userId ?? null, versionNumber)
    .run();

  return {
    id,
    documentId: input.documentId,
    content: input.content,
    title: input.title ?? null,
    type: versionType,
    label: versionLabel,
    createdAt,
    createdBy: input.userId ?? null,
    versionNumber,
  };
}

export async function getDocumentVersions(
  documentId: string,
  env?: DbEnv,
): Promise<Array<{ id: string; documentId: string; content: string; title: string | null; type: string | null; label: string | null; createdAt: number; createdBy: string | null; versionNumber: number }>> {
  const db = getDB(env);

  const result = await db
    .prepare(
      "SELECT id, document_id, content, title, type, label, created_at, created_by, version_number FROM document_versions WHERE document_id = ? ORDER BY version_number DESC, created_at DESC",
    )
    .bind(documentId)
    .all<DbDocumentVersionRecord>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    title: row.title,
    type: row.type,
    label: row.label,
    createdAt: row.created_at,
    createdBy: row.created_by,
    versionNumber: row.version_number ?? 0,
  }));
}

export async function getVersionById(
  versionId: string,
  env?: DbEnv,
): Promise<{ id: string; documentId: string; content: string; title: string | null; type: string | null; label: string | null; createdAt: number; createdBy: string | null; versionNumber: number } | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, document_id, content, title, type, label, created_at, created_by, version_number FROM document_versions WHERE id = ? LIMIT 1")
    .bind(versionId)
    .first<DbDocumentVersionRecord>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    title: row.title,
    type: row.type,
    label: row.label,
    createdAt: row.created_at,
    createdBy: row.created_by,
    versionNumber: row.version_number ?? 0,
  };
}

export async function deleteDocument(id: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM comments WHERE thread_id IN (SELECT id FROM comment_threads WHERE document_id = ?)")
    .bind(id)
    .run();

  await db
    .prepare("DELETE FROM comment_threads WHERE document_id = ?")
    .bind(id)
    .run();

  await db
    .prepare("DELETE FROM document_versions WHERE document_id = ?")
    .bind(id)
    .run();

  await db
    .prepare("DELETE FROM document_invitations WHERE document_id = ?")
    .bind(id)
    .run();

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

export async function upsertDocumentInvitation(
  input: {
    documentId: string;
    inviteeEmail: string;
    invitedByUserId: string;
    role: CollaboratorRole;
    inviteeUserId?: string | null;
    acceptedAt?: number | null;
  },
  env?: DbEnv,
): Promise<{
  id: string;
  document_id: string;
  invitee_email: string;
  invitee_user_id: string | null;
  invited_by_user_id: string;
  role: CollaboratorRole;
  accepted_at: number | null;
  created_at: number;
  updated_at: number;
}> {
  const db = getDB(env);
  const now = Date.now();
  const inviteeEmail = input.inviteeEmail.trim().toLowerCase();

  const existing = await db
    .prepare(
      "SELECT id, document_id, invitee_email, invitee_user_id, invited_by_user_id, role, accepted_at, created_at, updated_at FROM document_invitations WHERE document_id = ? AND invitee_email = ? LIMIT 1",
    )
    .bind(input.documentId, inviteeEmail)
    .first<DbDocumentInvitationRecord>();

  if (existing) {
    const acceptedAt = Object.prototype.hasOwnProperty.call(input, "acceptedAt")
      ? (input.acceptedAt ?? null)
      : existing.accepted_at;
    const inviteeUserId = Object.prototype.hasOwnProperty.call(input, "inviteeUserId")
      ? (input.inviteeUserId ?? null)
      : existing.invitee_user_id;

    await db
      .prepare(
        "UPDATE document_invitations SET invitee_user_id = ?, invited_by_user_id = ?, role = ?, accepted_at = ?, updated_at = ? WHERE id = ?",
      )
      .bind(
        inviteeUserId,
        input.invitedByUserId,
        input.role,
        acceptedAt,
        now,
        existing.id,
      )
      .run();

    return {
      id: existing.id,
      document_id: existing.document_id,
      invitee_email: existing.invitee_email,
      invitee_user_id: inviteeUserId,
      invited_by_user_id: input.invitedByUserId,
      role: input.role,
      accepted_at: acceptedAt,
      created_at: existing.created_at,
      updated_at: now,
    };
  }

  const id = crypto.randomUUID();
  const acceptedAt = input.acceptedAt ?? null;
  const inviteeUserId = input.inviteeUserId ?? null;

  await db
    .prepare(
      "INSERT INTO document_invitations (id, document_id, invitee_email, invitee_user_id, invited_by_user_id, role, accepted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      input.documentId,
      inviteeEmail,
      inviteeUserId,
      input.invitedByUserId,
      input.role,
      acceptedAt,
      now,
      now,
    )
    .run();

  return {
    id,
    document_id: input.documentId,
    invitee_email: inviteeEmail,
    invitee_user_id: inviteeUserId,
    invited_by_user_id: input.invitedByUserId,
    role: input.role,
    accepted_at: acceptedAt,
    created_at: now,
    updated_at: now,
  };
}

export async function acceptPendingDocumentInvitationsForUser(
  userId: string,
  email: string | null,
  env?: DbEnv,
): Promise<number> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return 0;
  }

  const db = getDB(env);
  const pending = await db
    .prepare(
      "SELECT id, document_id, invitee_email, invitee_user_id, invited_by_user_id, role, accepted_at, created_at, updated_at FROM document_invitations WHERE invitee_email = ? AND accepted_at IS NULL ORDER BY created_at ASC",
    )
    .bind(normalizedEmail)
    .all<DbDocumentInvitationRecord>();

  const rows = pending.results ?? [];
  if (rows.length === 0) {
    return 0;
  }

  const acceptedAt = Date.now();

  for (const invitation of rows) {
    const document = await getDocumentById(invitation.document_id, env);
    if (!document) {
      continue;
    }

    const existingAccess = await getUserAccess(invitation.document_id, userId, env);

    if (!existingAccess) {
      await addCollaborator(
        invitation.document_id,
        userId,
        invitation.role === "editor" ? "editor" : "viewer",
        env,
      );
    }

    await db
      .prepare(
        "UPDATE document_invitations SET invitee_user_id = ?, accepted_at = ?, updated_at = ? WHERE id = ?",
      )
      .bind(userId, acceptedAt, Date.now(), invitation.id)
      .run();
  }

  return rows.length;
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

export async function getCollaborator(
  documentId: string,
  userId: string,
  env?: DbEnv,
): Promise<{ id: string; document_id: string; user_id: string; role: CollaboratorRole; created_at: number } | null> {
  const db = getDB(env);

  const row = await db
    .prepare("SELECT id, document_id, user_id, role, created_at FROM document_collaborators WHERE document_id = ? AND user_id = ? LIMIT 1")
    .bind(documentId, userId)
    .first<DbDocumentCollaboratorRecord>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    document_id: row.document_id,
    user_id: row.user_id,
    role: row.role === "editor" ? "editor" : "viewer",
    created_at: row.created_at,
  };
}

export async function removeCollaborator(documentId: string, userId: string, env?: DbEnv): Promise<void> {
  const db = getDB(env);

  await db
    .prepare("DELETE FROM document_collaborators WHERE document_id = ? AND user_id = ?")
    .bind(documentId, userId)
    .run();
}

export async function updateCollaboratorRole(
  documentId: string,
  userId: string,
  newRole: CollaboratorRole,
  env?: DbEnv,
): Promise<{ id: string; document_id: string; user_id: string; role: CollaboratorRole; created_at: number } | null> {
  const db = getDB(env);

  const existing = await getCollaborator(documentId, userId, env);
  if (!existing) {
    return null;
  }

  await db
    .prepare("UPDATE document_collaborators SET role = ? WHERE document_id = ? AND user_id = ?")
    .bind(newRole, documentId, userId)
    .run();

  return {
    id: existing.id,
    document_id: existing.document_id,
    user_id: existing.user_id,
    role: newRole,
    created_at: existing.created_at,
  };
}

export async function transferDocumentOwnership(
  documentId: string,
  newOwnerId: string,
  env?: DbEnv,
): Promise<void> {
  const db = getDB(env);

  // Check if new owner is a collaborator and remove them from collaborators
  await db
    .prepare("DELETE FROM document_collaborators WHERE document_id = ? AND user_id = ?")
    .bind(documentId, newOwnerId)
    .run();

  // Update owner
  await db
    .prepare("UPDATE documents SET owner_id = ?, updated_at = ? WHERE id = ?")
    .bind(newOwnerId, Date.now(), documentId)
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

  if (document.owner_id === userId) {
    return "owner";
  }

  const collaborator = await getCollaborator(documentId, userId, env);

  if (!collaborator) {
    return null;
  }

  return collaborator.role === "editor" ? "editor" : "viewer";
}
