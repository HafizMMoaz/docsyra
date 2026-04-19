import { canEditDocument, requireDocumentAccess } from "@/lib/docs/access";
import { rejectCsrf } from "@/lib/security/csrf";
import { createDocumentVersion, deleteDocument, logDocumentActivity, updateDocument, updateDocumentGitHubSyncState } from "@/lib/db/queries";
import { syncDocumentToGitHub } from "@/lib/github/sync-document";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type UpdateBody = {
  title?: unknown;
  content?: unknown;
  createVersion?: unknown;
};

type VersionCheckpointState = {
  lastVersionTime: number;
  lastVersionContent: string;
};

const versionCheckpointState = new Map<string, VersionCheckpointState>();

export async function GET(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const { id } = await context.params;
  const access = await requireDocumentAccess(
    request,
    context as { params: Promise<Record<string, string | string[] | undefined>> },
    id,
    { allowPublic: true },
  );
  if (access instanceof Response) {
    return access;
  }

  await logDocumentActivity(id, access.userId, "view", access.env);

  return Response.json(
    {
      success: true,
      document: access.document,
      accessRole: access.accessRole,
      canEdit: canEditDocument(access.accessRole),
    },
    { status: 200 },
  );
}

export async function PUT(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await context.params;
  const access = await requireDocumentAccess(
    request,
    context as { params: Promise<Record<string, string | string[] | undefined>> },
    id,
    { requireEditor: true },
  );
  if (access instanceof Response) {
    return access;
  }

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const content = typeof body.content === "string" ? body.content : undefined;
  const createVersion = typeof body.createVersion === "boolean" ? body.createVersion : false;

  await updateDocument(
    id,
    {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    },
    access.env,
  );

  const currentDocument = access.document;
  const nextTitle = title ?? currentDocument.title ?? "Untitled";
  const nextContent = content ?? currentDocument.content ?? "";

  const previousCheckpoint = versionCheckpointState.get(id) ?? {
    lastVersionTime: 0,
    lastVersionContent: "",
  };

  const now = Date.now();
  const MIN_INTERVAL = 60_000;
  const MIN_CHANGE = 20;
  const shouldCreate =
    now - previousCheckpoint.lastVersionTime > MIN_INTERVAL &&
    Math.abs(nextContent.length - previousCheckpoint.lastVersionContent.length) > MIN_CHANGE;

  if (currentDocument.github_repo) {
    try {
      const pushedSha = await syncDocumentToGitHub({
        userId: access.userId,
        repo: currentDocument.github_repo,
        branch: currentDocument.github_branch ?? "main",
        path: currentDocument.github_path ?? "",
        title: nextTitle,
        content: nextContent,
        env: access.env,
      });

      if (pushedSha) {
        await updateDocumentGitHubSyncState(
          id,
          {
            lastGitHubSha: pushedSha,
            lastSyncedAt: Date.now(),
          },
          access.env,
        );
      }
    } catch (error) {
      console.error("[github-sync] Failed to sync document content", {
        documentId: id,
        repo: currentDocument.github_repo,
        branch: currentDocument.github_branch ?? "main",
        path: currentDocument.github_path,
        error,
      });
    }
  }
  if (createVersion && shouldCreate) {
    await createDocumentVersion(
      {
        documentId: id,
        title: nextTitle,
        content: nextContent,
        userId: access.userId,
        type: "auto",
      },
      access.env,
    );

    versionCheckpointState.set(id, {
      lastVersionTime: now,
      lastVersionContent: nextContent,
    });
  }

  await logDocumentActivity(id, access.userId, "edit", access.env);

  return Response.json({ success: true }, { status: 200 });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const access = await requireDocumentAccess(
    request,
    context as { params: Promise<Record<string, string | string[] | undefined>> },
    id,
  );
  if (access instanceof Response) {
    return access;
  }

  if (access.accessRole !== "owner") {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  await deleteDocument(id, access.env);

  return Response.json({ success: true }, { status: 200 });
}
