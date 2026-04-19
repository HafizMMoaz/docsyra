import { requireDocumentAccess } from "@/lib/docs/access";
import { getGitHubRemoteFileMeta, GitHubPullError } from "@/lib/github/pull-document";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type SyncStatus = "synced" | "diverged" | "unknown";

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

  const repo = access.document.github_repo?.trim() ?? "";
  const branch = access.document.github_branch?.trim() || "main";
  const path = access.document.github_path?.trim() ?? "";
  const storedSha = access.document.last_github_sha;

  if (!repo || !path) {
    return Response.json(
      {
        success: true,
        status: "unknown" satisfies SyncStatus,
        reason: "not_configured",
      },
      { status: 200 },
    );
  }

  try {
    const remote = await getGitHubRemoteFileMeta({
      userId: access.userId,
      repo,
      branch,
      path,
      env: access.env,
    });

    let status: SyncStatus = "unknown";
    if (storedSha && remote.sha) {
      status = storedSha === remote.sha ? "synced" : "diverged";
    }

    return Response.json(
      {
        success: true,
        status,
        storedSha: storedSha ?? null,
        remoteSha: remote.sha ?? null,
        lastSyncedAt: access.document.last_synced_at ?? null,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof GitHubPullError) {
      return Response.json(
        {
          success: true,
          status: "unknown" satisfies SyncStatus,
          reason: error.code,
          lastSyncedAt: access.document.last_synced_at ?? null,
        },
        { status: 200 },
      );
    }

    console.error("[github-status] Failed to resolve GitHub sync status", {
      documentId: id,
      repo,
      branch,
      path,
      error,
    });

    return Response.json(
      {
        success: true,
        status: "unknown" satisfies SyncStatus,
        reason: "status_unavailable",
        lastSyncedAt: access.document.last_synced_at ?? null,
      },
      { status: 200 },
    );
  }
}
