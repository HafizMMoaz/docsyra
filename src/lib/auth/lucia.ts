import { Lucia, TimeSpan, type Adapter } from "lucia";
import { type DbEnv } from "../db/client";
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  deleteUserSessions,
  getSessionAndUser,
  getUserSessions,
  updateSessionExpiration,
} from "../db/queries";

type DatabaseUserAttributes = {
  email: string | null;
  name: string | null;
};

type DocsyraAuth = Lucia<Record<never, never>, DatabaseUserAttributes>;

function createAdapter(env?: DbEnv): Adapter {
  return {
    async getSessionAndUser(sessionId) {
      const [session, user] = await getSessionAndUser(sessionId, env);

      if (!session || !user) {
        return [null, null];
      }

      if (session.expiresAt.getTime() <= Date.now()) {
        await deleteSession(sessionId, env);
        return [null, null];
      }

      return [session, user];
    },

    async getUserSessions(userId) {
      return getUserSessions(userId, env);
    },

    async setSession(session) {
      await createSession(session, env);
    },

    async updateSessionExpiration(sessionId, expiresAt) {
      await updateSessionExpiration(sessionId, expiresAt, env);
    },

    async deleteSession(sessionId) {
      await deleteSession(sessionId, env);
    },

    async deleteUserSessions(userId) {
      await deleteUserSessions(userId, env);
    },

    async deleteExpiredSessions() {
      await deleteExpiredSessions(Date.now(), env);
    },
  };
}

export function createLucia(env?: DbEnv): DocsyraAuth {
  return new Lucia<Record<never, never>, DatabaseUserAttributes>(createAdapter(env), {
    sessionExpiresIn: new TimeSpan(30, "d"),
    sessionCookie: {
      attributes: {
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
    },
    getSessionAttributes: () => ({}),
    getUserAttributes: (attributes) => ({
      email: attributes.email,
      name: attributes.name,
    }),
  });
}

export function readSessionIdFromRequest(request: Request, env?: DbEnv) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  return createLucia(env).readSessionCookie(cookieHeader);
}

declare module "lucia" {
  interface SessionCookieAttributesOptions {
    httpOnly?: boolean;
  }

  interface Register {
    Lucia: DocsyraAuth;
    DatabaseUserAttributes: {
      email: string | null;
      name: string | null;
    };
    DatabaseSessionAttributes: Record<never, never>;
  }
}
