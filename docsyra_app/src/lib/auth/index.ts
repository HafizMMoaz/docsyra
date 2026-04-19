import { type DbEnv } from "../db/client";
import {
  acceptPendingDocumentInvitationsForUser,
  createUser,
  getUserById,
  updateSessionClientMetadata,
} from "../db/queries";
import { clearSessionCookie, setSessionCookie } from "./cookies";
import { createLucia, readSessionIdFromRequest } from "./lucia";
import { getSessionClientMetadata } from "./session-metadata";
import { maybeAlertSuspiciousSession } from "./session-risk";
import type { CreateSessionResult, DestroySessionResult, SessionResult } from "../../types";

export type { CreateSessionResult, DestroySessionResult, Session, SessionResult, User } from "../../types";
export { createLucia } from "./lucia";
export { createUser, clearSessionCookie, setSessionCookie };

export async function createSession(userId: string, env?: DbEnv, request?: Request): Promise<CreateSessionResult> {
  const auth = createLucia(env);
  let userRecord = await getUserById(userId, env);

  if (!userRecord) {
    userRecord = await createUser(userId, null, null, null, "incomplete", null, null, null, env);
  }

  await acceptPendingDocumentInvitationsForUser(userId, userRecord.attributes.email, env);

  const session = await auth.createSession(userId, {});

  if (request) {
    const metadata = getSessionClientMetadata(request);
    await updateSessionClientMetadata(session.id, metadata, env);
    await maybeAlertSuspiciousSession({
      userId,
      userEmail: userRecord.attributes.email,
      sessionId: session.id,
      metadata,
      env,
    });
  }

  const sessionCookie = auth.createSessionCookie(session.id).serialize();

  return {
    user: {
      id: userRecord.id,
      email: userRecord.attributes.email,
      email_verified: userRecord.attributes.email_verified,
      name: userRecord.attributes.name,
      avatar_url: userRecord.attributes.avatar_url,
      status: userRecord.attributes.status as "incomplete" | "active" | "inactive" | null,
      profession: userRecord.attributes.profession,
      industry: userRecord.attributes.industry,
      country: userRecord.attributes.country,
    },
    session: {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      fresh: session.fresh,
    },
    setCookie: sessionCookie,
  };
}

export async function validateSession(request: Request, env?: DbEnv): Promise<SessionResult> {
  const auth = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);
  if (!sessionId) {
    return {
      user: null,
      session: null,
      setCookie: null,
    };
  }

  const result = await auth.validateSession(sessionId);

  if (!result.session || !result.user) {
    return {
      user: null,
      session: null,
      setCookie: auth.createBlankSessionCookie().serialize(),
    };
  }

  const refreshCookie = result.session.fresh ? auth.createSessionCookie(result.session.id).serialize() : null;

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      email_verified: result.user.email_verified,
      name: result.user.name,
      avatar_url: result.user.avatar_url,
      status: result.user.status as "incomplete" | "active" | "inactive" | null,
      profession: result.user.profession,
      industry: result.user.industry,
      country: result.user.country,
    },
    session: {
      id: result.session.id,
      userId: result.session.userId,
      expiresAt: result.session.expiresAt,
      fresh: result.session.fresh,
    },
    setCookie: refreshCookie,
  };
}

export async function destroySession(request: Request, env?: DbEnv): Promise<DestroySessionResult> {
  const auth = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (sessionId) {
    await auth.invalidateSession(sessionId);
  }

  return {
    setCookie: auth.createBlankSessionCookie().serialize(),
  };
}
