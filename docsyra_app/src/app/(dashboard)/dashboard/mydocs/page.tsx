"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getCsrfToken } from "@/lib/security/csrf-client";

type Collaborator = {
  id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  role: "viewer" | "editor";
  created_at: number;
};

type DocumentItem = {
  id: string;
  owner_id: string | null;
  title: string | null;
  content: string | null;
  visibility: "private" | "public";
  created_at: number;
  updated_at: number;
  collaborators: Collaborator[];
};

type DashboardStats = {
  totalDocuments: number;
  ownedDocuments: number;
  sharedDocuments: number;
  activeDocuments: number;
  collaborators: number;
  recentActivityCount: number;
};

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString();
}

function formatRelativeTime(value: number): string {
  const diffMs = Date.now() - value;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function csrfHeaders(): Record<string, string> {
  return {
    "x-csrf-token": getCsrfToken(),
  };
}

export default function MyDocsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creatingDocumentRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function loadOverview() {
      try {
        const response = await fetch("/api/dashboard/overview", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          if (!mounted) {
            return;
          }

          setError("Failed to load documents");
          setLoading(false);
          return;
        }

        const data = (await response.json()) as {
          success?: boolean;
          documents?: DocumentItem[];
          stats?: DashboardStats;
        };

        if (!mounted) {
          return;
        }

        setDocuments(Array.isArray(data.documents) ? data.documents : []);
        setStats(data.stats ?? null);
      } catch {
        if (mounted) {
          setError("Failed to load documents");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleCreateDocument() {
    if (creatingDocumentRef.current) {
      return;
    }

    creatingDocumentRef.current = true;
    setCreatingDocument(true);
    setError(null);

    try {
      const response = await fetch("/api/docs/create", {
        method: "POST",
        headers: csrfHeaders(),
      });

      const data = (await response.json()) as { success?: boolean; id?: string; error?: string };

      if (!response.ok || !data.success || !data.id) {
        setError(data.error ?? "Failed to create document");
        creatingDocumentRef.current = false;
        setCreatingDocument(false);
        return;
      }

      router.push(`/editor/${data.id}`);
    } catch {
      setError("Failed to create document");
      creatingDocumentRef.current = false;
      setCreatingDocument(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <div className="reveal flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        
        <div>
          <p className="eyebrow text-ink-ghost">The catalogue</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-ink">My Docs</h1>
          <p className="mt-1.5 text-sm text-ink-faint">
            Every document you own or can access, with collaborators and last update time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats ? (
            <div className="text-right">
              <p className="font-display text-3xl font-bold tabular-nums text-ink">{stats.totalDocuments}</p>
              <p className="eyebrow text-[0.6rem] text-ink-ghost">{stats.collaborators} collaborators</p>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-sm border border-signal-danger/30 bg-paper-sunk px-3 py-2 text-sm text-signal-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-md border border-rule bg-paper p-12 text-center">
          <p className="text-sm text-ink-faint">Pulling the catalogue…</p>
        </div>
      ) : null}

      {!loading && documents.length > 0 ? (
        <div className="reveal overflow-hidden rounded-md border border-rule" style={{ animationDelay: "80ms" }}>
          {documents.map((document, index) => (
            <button
              key={document.id}
              type="button"
              onClick={() => router.push(`/editor/${document.id}`)}
              className="group flex w-full items-start gap-4 border-b border-rule bg-paper px-5 py-4 text-left transition last:border-b-0 hover:bg-paper-sunk"
            >
              <span className="mt-0.5 w-6 shrink-0 font-mono text-xs text-ink-ghost">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="truncate text-sm font-semibold text-ink group-hover:text-clay">
                    {document.title || "Untitled"}
                  </h2>
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      document.visibility === "public"
                        ? "border-pine/30 bg-pine-wash text-pine"
                        : "border-rule text-ink-faint"
                    }`}
                  >
                    {document.visibility === "public" ? "Public" : "Private"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-ink-faint">
                  Updated {formatRelativeTime(document.updated_at)} · {formatTimestamp(document.updated_at)}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {document.collaborators.length > 0 ? (
                    document.collaborators.map((collaborator) => (
                      <span
                        key={collaborator.id}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-rule px-2 py-0.5 text-xs text-ink-soft"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-clay" />
                        {collaborator.name || collaborator.email || "Unknown user"}
                        <span className="text-ink-ghost">· {collaborator.role}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-ink-ghost">No collaborators yet</span>
                  )}
                </div>
              </div>
              <span className="mt-0.5 shrink-0 text-ink-ghost transition group-hover:translate-x-0.5 group-hover:text-clay" aria-hidden>
                →
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {!loading && documents.length === 0 ? (
        <div className="reveal rounded-md border border-dashed border-rule-strong bg-paper p-12 text-center">
          <p className="font-display text-lg font-bold tracking-tight text-ink">The catalogue is empty</p>
          <p className="mt-1.5 text-sm text-ink-faint">
            Create a new document from the dashboard to get started.
          </p>
        </div>
      ) : null}
    </section>
  );
}