import { getRequestContext } from "@cloudflare/next-on-pages";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    TWO_FACTOR_SECRET_KEY?: string;
    PASSKEY_RP_ID?: string;
    PASSKEY_ORIGIN?: string;
    PASSKEY_RP_NAME?: string;
  }
}

export type DbEnv = Pick<
  CloudflareEnv,
  "DB" | "TWO_FACTOR_SECRET_KEY" | "PASSKEY_RP_ID" | "PASSKEY_ORIGIN" | "PASSKEY_RP_NAME"
>;

export function getDB(env?: DbEnv): D1Database {
  if (env?.DB) {
    return env.DB;
  }

  return getRequestContext().env.DB;
}
