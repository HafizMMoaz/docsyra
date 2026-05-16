import { requireDocumentAccess } from "@/lib/docs/access";
import { getGitHubIdentityForUser, updateDocumentGitHubMapping } from "@/lib/db/queries";
import { rejectCsrf } from "@/lib/security/csrf";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type Body = {
  name?: unknown;
  private?: unknown;
  path?: unknown;
  description?: unknown;
};

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Docsyra",
  };
}

function normalizeRepoName(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim();
  if (!value || value.length > 100) {
    return null;
  }

  // GitHub repo names allow letters, digits, '.', '-', and '_'.
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    return null;
  }

  return value;
}

function normalizePath(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim().replace(/^\/+/, "");
  return value.length > 0 ? value : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
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

  if (!access.userId || access.accessRole !== "owner") {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const identity = await getGitHubIdentityForUser(access.userId, access.env);
  if (!identity) {
    return Response.json({ success: false, error: "GitHub account not connected" }, { status: 400 });
  }

  const name = normalizeRepoName(body.name);
  if (!name) {
    return Response.json(
      {
        success: false,
        error: "Invalid repository name. Use letters, numbers, dots, hyphens, or underscores.",
      },
      { status: 400 },
    );
  }

  const path = normalizePath(body.path);
  if (!path) {
    return Response.json({ success: false, error: "Path is required" }, { status: 400 });
  }

  // Default to a private repo unless the client explicitly opted into public.
  const isPrivate = body.private !== false;

  // auto_init creates an initial commit so the default branch exists — without it
  // the repo has no branches and the sync-on-save flow (verifyBranch) would fail.
  const createResponse = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      ...githubHeaders(identity.access_token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      private: isPrivate,
      auto_init: true,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim().slice(0, 350)
          : "Created from Docsyra",
    }),
  });

  if (!createResponse.ok) {
    if (createResponse.status === 422) {
      return Response.json(
        { success: false, error: "A repository with that name already exists, or the name is invalid." },
        { status: 409 },
      );
    }

    if (createResponse.status === 401 || createResponse.status === 403) {
      return Response.json(
        { success: false, error: "GitHub denied repository creation. Reconnect your GitHub account." },
        { status: 403 },
      );
    }

    return Response.json({ success: false, error: "Failed to create GitHub repository" }, { status: 502 });
  }

  const created = (await createResponse.json()) as {
    full_name?: string;
    default_branch?: string;
  };

  if (!created.full_name) {
    return Response.json({ success: false, error: "GitHub returned an unexpected response" }, { status: 502 });
  }

  const branch = created.default_branch?.trim() || "main";

  await updateDocumentGitHubMapping(
    id,
    {
      github_repo: created.full_name,
      github_branch: branch,
      github_path: path,
    },
    access.env,
  );

  return Response.json(
    {
      success: true,
      mapping: {
        github_repo: created.full_name,
        github_branch: branch,
        github_path: path,
      },
    },
    { status: 201 },
  );
}
