import { requireDocumentAccess } from "@/lib/docs/access";
import { getDocumentById, getGitHubIdentityForUser, updateDocumentGitHubMapping } from "@/lib/db/queries";
import { rejectCsrf } from "@/lib/security/csrf";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type Body = {
  repo?: unknown;
  branch?: unknown;
  path?: unknown;
};

type GitHubRepoItem = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
};

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Docsyra",
  };
}

function normalizeRepo(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const fromUrl = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (fromUrl) {
    return `${fromUrl[1]}/${fromUrl[2]}`;
  }

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function normalizeBranch(input: unknown): string {
  if (typeof input !== "string") {
    return "main";
  }

  const value = input.trim();
  return value.length > 0 ? value : "main";
}

function normalizePath(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim().replace(/^\/+/, "");
  if (!value) {
    return null;
  }

  return value;
}

async function fetchRepo(token: string, repo: string): Promise<{ defaultBranch: string } | null> {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo)}`.replace("%2F", "/"), {
    headers: githubHeaders(token),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { default_branch?: string };

  return {
    defaultBranch: data.default_branch ?? "main",
  };
}

async function verifyBranch(token: string, repo: string, branch: string): Promise<boolean> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(repo).replace("%2F", "/")}/branches/${encodeURIComponent(branch)}`,
    {
      headers: githubHeaders(token),
    },
  );

  return response.ok;
}

export async function GET(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
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

  const reposResponse = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    {
      headers: githubHeaders(identity.access_token),
    },
  );

  if (!reposResponse.ok) {
    return Response.json({ success: false, error: "Failed to fetch repositories from GitHub" }, { status: 502 });
  }

  const repos = (await reposResponse.json()) as GitHubRepoItem[];
  const document = await getDocumentById(id, access.env);

  return Response.json(
    {
      success: true,
      repos: repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        default_branch: repo.default_branch,
      })),
      mapping: {
        github_repo: document?.github_repo ?? null,
        github_branch: document?.github_branch ?? null,
        github_path: document?.github_path ?? null,
      },
    },
    { status: 200 },
  );
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

  const normalizedRepo = typeof body.repo === "string" ? normalizeRepo(body.repo) : null;
  if (!normalizedRepo) {
    return Response.json({ success: false, error: "Invalid repo. Use owner/repo" }, { status: 400 });
  }

  const normalizedPath = normalizePath(body.path);
  if (!normalizedPath) {
    return Response.json({ success: false, error: "Path is required" }, { status: 400 });
  }

  const repo = await fetchRepo(identity.access_token, normalizedRepo);
  if (!repo) {
    return Response.json({ success: false, error: "Repository not found or no access" }, { status: 403 });
  }

  const branch = normalizeBranch(body.branch || repo.defaultBranch);
  const hasBranchAccess = await verifyBranch(identity.access_token, normalizedRepo, branch);
  if (!hasBranchAccess) {
    return Response.json({ success: false, error: "Branch not found or no access" }, { status: 400 });
  }

  await updateDocumentGitHubMapping(
    id,
    {
      github_repo: normalizedRepo,
      github_branch: branch,
      github_path: normalizedPath,
    },
    access.env,
  );

  return Response.json(
    {
      success: true,
      mapping: {
        github_repo: normalizedRepo,
        github_branch: branch,
        github_path: normalizedPath,
      },
    },
    { status: 200 },
  );
}
