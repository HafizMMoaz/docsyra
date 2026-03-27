import { createLucia } from "@/lib/auth";
import { readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getEnv } from "@/lib/cloudflare/route-context";
import { getDocumentById, getUserAccess, type DocumentAccessRole } from "@/lib/db/queries";

type RouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>;
};

export type DocumentAccessResult = {
  env: ReturnType<typeof getEnv>;
  userId: string | null;
  accessRole: DocumentAccessRole | "public";
  document: {
    id: string;
    user_id: string;
    title: string | null;
    content: string | null;
    visibility: "private" | "public";
    created_at: number;
    updated_at: number;
  };
};

export function canEditDocument(role: DocumentAccessRole | "public"): boolean {
  return role === "owner" || role === "editor";
}

async function resolveOptionalUser(
  request: Request,
  context: RouteContext,
): Promise<{ env: ReturnType<typeof getEnv>; userId: string | null }> {
  const env = getEnv(context);
  const lucia = createLucia(env);
  const sessionId = readSessionIdFromRequest(request, env);

  if (!sessionId) {
    return { env, userId: null };
  }

  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user) {
    return { env, userId: null };
  }

  return { env, userId: result.user.id };
}

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
  const auth = await resolveOptionalUser(request, context);

  const document = await getDocumentById(documentId, auth.env);
  if (!document) {
    return Response.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  if (auth.userId) {
    const accessRole = await getUserAccess(documentId, auth.userId, auth.env);
    if (accessRole) {
      if (options?.requireEditor && !canEditDocument(accessRole)) {
        return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
      }

      return {
        env: auth.env,
        userId: auth.userId,
        accessRole,
        document,
      };
    }
  }

  if (options?.allowPublic && document.visibility === "public") {
    if (options.requireEditor) {
      return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    return {
      env: auth.env,
      userId: auth.userId,
      accessRole: "public",
      document,
    };
  }

  if (!auth.userId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
}
