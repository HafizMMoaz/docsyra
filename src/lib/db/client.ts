import { getRequestContext } from "@cloudflare/next-on-pages";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

export type DbEnv = Pick<CloudflareEnv, "DB">;

export function getDB(env?: DbEnv): D1Database {
  if (env?.DB) {
    return env.DB;
  }

  return getRequestContext().env.DB;
}
