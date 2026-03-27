import { type DbEnv } from "../db/client";
import { createLucia } from "./lucia";

export function setSessionCookie(headers: Headers, sessionId: string, env?: DbEnv): void {
  const lucia = createLucia(env);
  const sessionCookie = lucia.createSessionCookie(sessionId);
  headers.append("Set-Cookie", sessionCookie.serialize());
}

export function clearSessionCookie(headers: Headers, env?: DbEnv): void {
  const lucia = createLucia(env);
  const blankCookie = lucia.createBlankSessionCookie();
  headers.append("Set-Cookie", blankCookie.serialize());
}
          