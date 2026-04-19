import { getGitHubIdentityForUser } from "@/lib/db/queries";
import type { DbEnv } from "@/lib/db/client";

export type GitHubPullErrorCode =
  | "github_not_connected"
  | "invalid_repo"
  | "invalid_path"
  | "repo_not_found"
  | "file_missing"
  | "permission_denied"
  | "github_request_failed"
  | "invalid_file_payload";

export class GitHubPullError extends Error {
  code: GitHubPullErrorCode;
  status: number;

  constructor(code: GitHubPullErrorCode, message: string, status: number) {
    super(message);
    this.name = "GitHubPullError";
    this.code = code;
    this.status = status;
  }
}

type PullDocumentFromGitHubInput = {
  userId: string | null;
  repo: string;
  branch: string;
  path: string;
  env?: DbEnv;
};

type GitHubRemoteFileMetaInput = {
  userId: string | null;
  repo: string;
  branch: string;
  path: string;
  env?: DbEnv;
};

type GitHubContentsFileResponse = {
  type?: string;
  content?: string;
  encoding?: string;
  sha?: string;
};

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");

  if (!owner || !name) {
    throw new GitHubPullError("invalid_repo", "Invalid GitHub repository format. Use owner/repo.", 400);
  }

  return { owner, name };
}

function decodeBase64Utf8(value: string): string {
  const normalized = value.replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Docsyra",
  };
}

async function ensureRepoAccessible(owner: string, repo: string, token: string): Promise<void> {
  const repoUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const response = await fetch(repoUrl, {
    method: "GET",
    headers: githubHeaders(token),
  });

  if (response.status === 404) {
    throw new GitHubPullError("repo_not_found", "Repository not found", 404);
  }

  if (response.status === 401 || response.status === 403) {
    throw new GitHubPullError("permission_denied", "Permission denied for repository", 403);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new GitHubPullError(
      "github_request_failed",
      `GitHub repo request failed (${response.status}): ${text.slice(0, 300)}`,
      502,
    );
  }
}

export async function pullDocumentFromGitHub(
  input: PullDocumentFromGitHubInput,
): Promise<{ content: string; sha: string | null }> {
  if (!input.userId) {
    throw new GitHubPullError("github_not_connected", "GitHub account not connected", 400);
  }

  const identity = await getGitHubIdentityForUser(input.userId, input.env);
  if (!identity?.access_token) {
    throw new GitHubPullError("github_not_connected", "GitHub account not connected", 400);
  }

  const { owner, name } = parseRepo(input.repo.trim());
  const branch = input.branch.trim() || "main";
  const path = input.path.trim().replace(/^\/+/, "");

  if (!path) {
    throw new GitHubPullError("invalid_path", "GitHub path is required", 400);
  }

  await ensureRepoAccessible(owner, name, identity.access_token);

  const contentsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(contentsUrl, {
    method: "GET",
    headers: githubHeaders(identity.access_token),
  });

  if (response.status === 404) {
    throw new GitHubPullError("file_missing", "File not found in repository", 404);
  }

  if (response.status === 401 || response.status === 403) {
    throw new GitHubPullError("permission_denied", "Permission denied while reading file", 403);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new GitHubPullError(
      "github_request_failed",
      `GitHub contents request failed (${response.status}): ${text.slice(0, 300)}`,
      502,
    );
  }

  const payload = (await response.json()) as GitHubContentsFileResponse | GitHubContentsFileResponse[];

  if (Array.isArray(payload)) {
    throw new GitHubPullError("invalid_file_payload", "Path points to a directory, not a file", 400);
  }

  if (payload.type !== "file" || typeof payload.content !== "string") {
    throw new GitHubPullError("invalid_file_payload", "Invalid file payload from GitHub", 502);
  }

  if ((payload.encoding ?? "").toLowerCase() !== "base64") {
    throw new GitHubPullError("invalid_file_payload", "Unsupported GitHub file encoding", 502);
  }

  const decodedContent = decodeBase64Utf8(payload.content);

  return {
    content: decodedContent,
    sha: typeof payload.sha === "string" ? payload.sha : null,
  };
}

export async function getGitHubRemoteFileMeta(
  input: GitHubRemoteFileMetaInput,
): Promise<{ sha: string | null }> {
  if (!input.userId) {
    throw new GitHubPullError("github_not_connected", "GitHub account not connected", 400);
  }

  const identity = await getGitHubIdentityForUser(input.userId, input.env);
  if (!identity?.access_token) {
    throw new GitHubPullError("github_not_connected", "GitHub account not connected", 400);
  }

  const { owner, name } = parseRepo(input.repo.trim());
  const branch = input.branch.trim() || "main";
  const path = input.path.trim().replace(/^\/+/, "");

  if (!path) {
    throw new GitHubPullError("invalid_path", "GitHub path is required", 400);
  }

  await ensureRepoAccessible(owner, name, identity.access_token);

  const contentsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(contentsUrl, {
    method: "GET",
    headers: githubHeaders(identity.access_token),
  });

  if (response.status === 404) {
    throw new GitHubPullError("file_missing", "File not found in repository", 404);
  }

  if (response.status === 401 || response.status === 403) {
    throw new GitHubPullError("permission_denied", "Permission denied while reading file", 403);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new GitHubPullError(
      "github_request_failed",
      `GitHub contents request failed (${response.status}): ${text.slice(0, 300)}`,
      502,
    );
  }

  const payload = (await response.json()) as GitHubContentsFileResponse | GitHubContentsFileResponse[];

  if (Array.isArray(payload)) {
    throw new GitHubPullError("invalid_file_payload", "Path points to a directory, not a file", 400);
  }

  return {
    sha: typeof payload.sha === "string" ? payload.sha : null,
  };
}
