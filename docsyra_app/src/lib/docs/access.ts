import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getEnv } from "@/lib/cloudflare/route-context";
import {
  canEditDocument,
  requireDocumentAccess as requireDocumentAccessCore,
  type DocumentAccessResult,
} from "@/lib/auth/document-access";

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
  env?: unknown;
};

export { canEditDocument, type DocumentAccessResult };

export async function requireAuthenticatedUser(
  request: Request,
  context: RouteContext,
): Promise<{ env: ReturnType<typeof getEnv>; userId: string } | Response> {
  const env = getEnv(context);
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (!sessionId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return { env, userId: result.user.id };
}

export async function requireDocumentAccess(
  request: Request,
  context: RouteContext,
  documentId: string,
  options?: { requireEditor?: boolean; allowPublic?: boolean },
): Promise<DocumentAccessResult | Response> {
  return requireDocumentAccessCore(request, documentId, options, getEnv(context));
}
