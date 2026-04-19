import { getGitHubIdentityForUser } from "@/lib/db/queries";
import type { DbEnv } from "@/lib/db/client";

type SyncDocumentToGitHubInput = {
  userId: string | null;
  repo: string;
  branch: string;
  path: string;
  title: string;
  content: string;
  env?: DbEnv;
};

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");

  if (!owner || !name) {
    throw new Error("Invalid GitHub repository format");
  }

  return { owner, name };
}

async function getExistingFileSha(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string,
): Promise<string | null> {
  const contentsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(contentsUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Docsyra",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub GET contents failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as { sha?: string };
  return typeof data.sha === "string" ? data.sha : null;
}

export async function syncDocumentToGitHub(input: SyncDocumentToGitHubInput): Promise<string | null> {
  if (!input.userId) {
    return null;
  }

  const identity = await getGitHubIdentityForUser(input.userId, input.env);
  if (!identity?.access_token) {
    return null;
  }

  const { owner, name } = parseRepo(input.repo.trim());
  const normalizedBranch = input.branch.trim() || "main";
  const normalizedPath = input.path.trim().replace(/^\/+/, "");

  if (!normalizedPath) {
    return null;
  }

  const sha = await getExistingFileSha(owner, name, normalizedBranch, normalizedPath, identity.access_token);
  const putUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodePath(normalizedPath)}`;

  const body: {
    message: string;
    content: string;
    branch: string;
    sha?: string;
  } = {
    message: `Update document: ${input.title || "Untitled"}`,
    content: toBase64Utf8(input.content),
    branch: normalizedBranch,
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(putUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${identity.access_token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "Docsyra",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub PUT contents failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as { content?: { sha?: string } };
  return typeof data.content?.sha === "string" ? data.content.sha : sha;
}
