import { requireDocumentAccess } from "@/lib/docs/access";
import { rejectCsrf } from "@/lib/security/csrf";
import { diffLines } from "diff";
import { createDocumentVersion, logDocumentActivity, updateDocument, updateDocumentGitHubSyncState } from "@/lib/db/queries";
import { getGitHubRemoteFileMeta, GitHubPullError, pullDocumentFromGitHub } from "@/lib/github/pull-document";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

function mapPullError(error: unknown): Response {
  if (error instanceof GitHubPullError) {
    return Response.json(
      {
        success: false,
        error: error.message,
        code: error.code,
      },
      { status: error.status },
    );
  }

  return Response.json({ success: false, error: "Failed to pull from GitHub" }, { status: 502 });
}

export async function POST(
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
    { requireEditor: true },
  );

  if (access instanceof Response) {
    return access;
  }

  const repo = access.document.github_repo?.trim() ?? "";
  const branch = access.document.github_branch?.trim() || "main";
  const path = access.document.github_path?.trim() ?? "";
  const isPreview = new URL(request.url).searchParams.get("preview") === "1";

  if (!repo || !path) {
    return Response.json(
      {
        success: false,
        error: "GitHub repository mapping is not configured for this document",
      },
      { status: 400 },
    );
  }

  try {
    const remoteMeta = await getGitHubRemoteFileMeta({
      userId: access.userId,
      repo,
      branch,
      path,
      env: access.env,
    });

    const storedSha = access.document.last_github_sha;
    const remoteSha = remoteMeta.sha;
    const hasConflict = Boolean(storedSha && remoteSha && storedSha !== remoteSha);

    if (hasConflict && !isPreview) {
      return Response.json(
        {
          success: false,
          error: "GitHub content diverged. Preview changes before pulling.",
          code: "github_conflict",
          conflict: {
            storedSha,
            remoteSha,
          },
        },
        { status: 409 },
      );
    }

    const pulled = await pullDocumentFromGitHub({
      userId: access.userId,
      repo,
      branch,
      path,
      env: access.env,
    });

    if (isPreview) {
      const previewDiff = diffLines(access.document.content ?? "", pulled.content).map((change) => ({
        added: Boolean(change.added),
        removed: Boolean(change.removed),
        value: change.value,
      }));

      return Response.json(
        {
          success: true,
          mode: "preview",
          status: hasConflict ? "diverged" : "synced",
          conflict: hasConflict,
          current: {
            sha: storedSha ?? null,
            content: access.document.content ?? "",
          },
          remote: {
            sha: pulled.sha,
            content: pulled.content,
          },
          diff: previewDiff,
        },
        { status: 200 },
      );
    }

    await updateDocument(
      id,
      {
        content: pulled.content,
      },
      access.env,
    );

    await updateDocumentGitHubSyncState(
      id,
      {
        lastGitHubSha: pulled.sha,
        lastSyncedAt: Date.now(),
      },
      access.env,
    );

    await createDocumentVersion(
      {
        documentId: id,
        title: access.document.title,
        content: pulled.content,
        userId: access.userId,
      },
      access.env,
    );

    await logDocumentActivity(id, access.userId, "edit", access.env);

    return Response.json(
      {
        success: true,
        pulled: {
          repo,
          branch,
          path,
          sha: pulled.sha,
        },
        document: {
          title: access.document.title,
          content: pulled.content,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[github-pull] Failed to pull document content", {
      documentId: id,
      repo,
      branch,
      path,
      error,
    });

    return mapPullError(error);
  }
}
