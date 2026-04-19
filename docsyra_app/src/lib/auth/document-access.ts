import { createLucia, readSessionIdFromRequest } from "@/lib/auth/lucia";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { getCollaborator, getDocumentById, logDocumentActivity, type DocumentAccessRole } from "@/lib/db/queries";
import type { DbEnv } from "@/lib/db/client";

export type DocumentAccessResult = {
  env: DbEnv;
  user: { id: string } | null;
  doc: {
    id: string;
    owner_id: string | null;
    title: string | null;
    content: string | null;
    visibility: "private" | "public";
    github_repo: string | null;
    github_branch: string | null;
    github_path: string | null;
    last_github_sha: string | null;
    last_synced_at: number | null;
    created_at: number;
    updated_at: number;
  };
  role: DocumentAccessRole | "public";
  userId: string | null;
  accessRole: DocumentAccessRole | "public";
  document: DocumentAccessResult["doc"];
};

export function canEditDocument(role: DocumentAccessRole | "public"): boolean {
  return role === "owner" || role === "editor";
}

async function resolveEnv(): Promise<DbEnv> {
  return getRequestContext().env as DbEnv;
}

async function resolveUser(request: Request, env: DbEnv): Promise<{ id: string } | null> {
  const sessionId = readSessionIdFromRequest(request, env);
  if (!sessionId) {
    return null;
  }

  const lucia = createLucia(env);
  const result = await lucia.validateSession(sessionId);
  if (!result.session || !result.user) {
    return null;
  }

  return { id: result.user.id };
}

export async function requireDocumentAccess(
  request: Request,
  documentId: string,
  options: { requireEditor?: boolean; allowPublic?: boolean } = {},
  env?: DbEnv,
): Promise<DocumentAccessResult | Response> {
  const resolvedEnv = env ?? (await resolveEnv());
  const user = await resolveUser(request, resolvedEnv);
  const doc = await getDocumentById(documentId, resolvedEnv);

  if (!doc) {
    return Response.json({ success: false, error: "Document not found" }, { status: 404 });
  }

  const ownerId = doc.owner_id;
  if (user?.id && ownerId === user.id) {
    return {
      env: resolvedEnv,
      user,
      doc,
      role: "owner",
      userId: user.id,
      accessRole: "owner",
      document: doc,
    };
  }

  if (user?.id) {
    const collaborator = await getCollaborator(documentId, user.id, resolvedEnv);
    if (collaborator) {
      const role = collaborator.role;
      if (options.requireEditor && !canEditDocument(role)) {
        return Response.json({ success: false, error: "Editor access required" }, { status: 403 });
      }

      return {
        env: resolvedEnv,
        user,
        doc,
        role,
        userId: user.id,
        accessRole: role,
        document: doc,
      };
    }
  }

  if (doc.visibility === "public" && options.allowPublic !== false) {
    // 🔴 CRITICAL: Block public write attempts explicitly
    if (options.requireEditor) {
      return Response.json(
        { success: false, error: "Public documents cannot be edited" },
        { status: 403 },
      );
    }

    // ✅ Audit log public access for security
    await logDocumentActivity(documentId, user?.id ?? null, "public_access", resolvedEnv).catch(
      (error) => console.error("[audit] Failed to log public access", error),
    );

    return {
      env: resolvedEnv,
      user,
      doc,
      role: "viewer",
      userId: user?.id ?? null,
      accessRole: "public",
      document: doc,
    };
  }

  if (!user) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
}
