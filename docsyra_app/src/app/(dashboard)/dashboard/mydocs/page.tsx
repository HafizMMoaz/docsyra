"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export default function MyDocsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="mx-auto max-w-5xl space-y-9">
      <div className="reveal flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-6">
        <div>
          <p className="eyebrow">The catalogue</p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">My Docs</h1>
          <p className="mt-2 text-sm text-ink-faint">
            Every document you own or can access, with collaborators and last update time.
          </p>
        </div>
        {stats ? (
          <div className="text-right">
            <p className="font-display text-3xl font-semibold text-ink">{stats.totalDocuments}</p>
            <p className="eyebrow text-[0.6rem]">{stats.collaborators} collaborators</p>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-sm border-l-2 border-signal-danger bg-clay-wash/60 px-3 py-2 text-sm text-signal-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-sm border border-rule-strong bg-paper-card p-12 text-center">
          <p className="font-display text-base italic text-ink-faint">Pulling the catalogue…</p>
        </div>
      ) : null}

      {!loading && documents.length > 0 ? (
        <div className="grid gap-4 reveal" style={{ animationDelay: "80ms" }}>
          {documents.map((document, index) => (
            <button
              key={document.id}
              type="button"
              onClick={() => router.push(`/editor/${document.id}`)}
              className="group rounded-sm border border-rule-strong bg-paper-card p-5 text-left transition hover:border-ink"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <span className="font-display text-lg text-ink-ghost">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-display truncate text-lg font-semibold text-ink group-hover:text-clay">
                        {document.title || "Untitled"}
                      </h2>
                      <span
                        className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          document.visibility === "public"
                            ? "bg-pine-wash text-pine"
                            : "bg-paper-sunk text-ink-faint"
                        }`}
                      >
                        {document.visibility === "public" ? "Public" : "Private"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-faint">
                      Last updated {formatRelativeTime(document.updated_at)} · {formatTimestamp(document.updated_at)}
                    </p>
                  </div>
                </div>
                <span className="text-ink-ghost transition-transform group-hover:translate-x-0.5 group-hover:text-clay" aria-hidden>
                  Open →
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-4">
                {document.collaborators.length > 0 ? (
                  document.collaborators.map((collaborator) => (
                    <span
                      key={collaborator.id}
                      className="inline-flex items-center gap-2 rounded-sm border border-rule bg-paper-raised px-2.5 py-1 text-xs text-ink-soft"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-pine" />
                      {collaborator.name || collaborator.email || "Unknown user"}
                      <span className="text-ink-ghost">· {collaborator.role}</span>
                    </span>
                  ))
                ) : (
                  <span className="rounded-sm border border-dashed border-rule-strong px-2.5 py-1 text-xs text-ink-faint">
                    No collaborators yet
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {!loading && documents.length === 0 ? (
        <div className="reveal rounded-sm border border-dashed border-rule-strong bg-paper-card p-12 text-center">
          <p className="font-display text-xl font-semibold text-ink">The catalogue is empty</p>
          <p className="mt-2 text-sm text-ink-faint">
            Create a new document from the dashboard to get started.
          </p>
        </div>
      ) : null}
    </section>
  );
}