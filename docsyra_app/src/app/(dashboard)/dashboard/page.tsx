"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getCsrfToken } from "@/lib/security/csrf-client";

type OverviewDocument = {
  id: string;
  title: string | null;
  updated_at: number;
};

type DashboardStats = {
  totalDocuments: number;
  ownedDocuments: number;
  sharedDocuments: number;
  activeDocuments: number;
  collaborators: number;
  recentActivityCount: number;
};

type DashboardActivity = {
  id: string;
  document_id: string;
  document_title: string | null;
  user_id: string | null;
  email: string | null;
  name: string | null;
  action: "view" | "open" | "edit" | "join";
  created_at: number;
};

function csrfHeaders(): Record<string, string> {
  return {
    "x-csrf-token": getCsrfToken(),
  };
}

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

export default function DashboardPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<OverviewDocument[]>([]);
  const [recentActivity, setRecentActivity] = useState<DashboardActivity[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  // Hard re-entry guard — survives across renders, unlike the `creating` state
  // which only gates the button after React has re-rendered it.
  const creatingRef = useRef(false);
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

          setError("Failed to load dashboard data");
          setLoading(false);
          return;
        }

        const data = (await response.json()) as {
          success?: boolean;
          documents?: OverviewDocument[];
          recentActivity?: DashboardActivity[];
          stats?: DashboardStats;
        };

        if (!mounted) {
          return;
        }

        setDocuments(Array.isArray(data.documents) ? data.documents : []);
        setRecentActivity(Array.isArray(data.recentActivity) ? data.recentActivity : []);
        setStats(data.stats ?? null);
      } catch {
        if (mounted) {
          setError("Failed to load dashboard data");
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
    // Block concurrent creates: a slow first-time navigation to /editor/[id]
    // would otherwise let repeated clicks each create a new document.
    if (creatingRef.current) {
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/docs/create", {
        method: "POST",
        headers: {
          ...csrfHeaders(),
        },
      });

      const data = (await response.json()) as { success?: boolean; id?: string; error?: string };

      if (!response.ok || !data.success || !data.id) {
        setError(data.error ?? "Failed to create document");
        creatingRef.current = false;
        setCreating(false);
        return;
      }

      // Success — navigate, and deliberately keep `creating` true so the
      // button stays disabled until this page unmounts. Resetting it here
      // would re-enable the button during a slow route transition.
      router.push(`/editor/${data.id}`);
    } catch {
      setError("Failed to create document");
      creatingRef.current = false;
      setCreating(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-10">
      <div className="reveal flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div>
          <p className="eyebrow text-ink-ghost">Workspace overview</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-1.5 text-sm text-ink-faint">Usage, recent activity, and your latest documents.</p>
        </div>
        <button
          type="button"
          onClick={handleCreateDocument}
          disabled={creating}
          className="inline-flex items-center gap-1.5 rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60"
        >
          <span aria-hidden>+</span>
          {creating ? "Creating…" : "New document"}
        </button>
      </div>

      {error ? (
        <p className="rounded-sm border border-signal-danger/30 bg-paper-sunk px-3 py-2 text-sm text-signal-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-md border border-rule bg-paper p-12 text-center">
          <p className="text-sm text-ink-faint">Gathering your documents…</p>
        </div>
      ) : null}

      {!loading && stats ? (
        <div
          className="reveal grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-3 xl:grid-cols-6"
          style={{ animationDelay: "80ms" }}
        >
          {[
            { label: "Documents", value: stats.totalDocuments },
            { label: "Owned", value: stats.ownedDocuments },
            { label: "Shared", value: stats.sharedDocuments },
            { label: "Active 7d", value: stats.activeDocuments },
            { label: "Collaborators", value: stats.collaborators },
            { label: "Recent logs", value: stats.recentActivityCount },
          ].map((item) => (
            <div key={item.label} className="bg-paper px-4 py-5">
              <p className="eyebrow text-[0.6rem] text-ink-ghost">{item.label}</p>
              <p className="font-display mt-2 text-2xl font-bold tabular-nums text-ink">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && recentActivity.length > 0 ? (
        <div className="reveal" style={{ animationDelay: "140ms" }}>
          <div className="mb-3 flex items-baseline gap-3">
            <h2 className="font-display text-base font-bold tracking-tight text-ink">Recent activity</h2>
            <span className="h-px flex-1 bg-rule" />
            <span className="eyebrow text-[0.6rem] text-ink-ghost">Views · Edits · Joins</span>
          </div>

          <div className="overflow-hidden rounded-md border border-rule">
            {recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 border-b border-rule bg-paper px-4 py-3 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <span className="w-12 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    {item.action}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">{item.document_title || "Untitled"}</p>
                    <p className="text-xs text-ink-faint">
                      by {item.name || item.email || "Unknown user"}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 font-mono text-xs text-ink-ghost">{formatRelativeTime(item.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && documents.length > 0 ? (
        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <div className="mb-3 flex items-baseline gap-3">
            <h2 className="font-display text-base font-bold tracking-tight text-ink">Recent documents</h2>
            <span className="h-px flex-1 bg-rule" />
            <span className="eyebrow text-[0.6rem] text-ink-ghost">Latest work</span>
          </div>
          <ul className="overflow-hidden rounded-md border border-rule">
            {documents.map((document, index) => (
              <li key={document.id} className="border-b border-rule last:border-b-0">
                <button
                  type="button"
                  onClick={() => router.push(`/editor/${document.id}`)}
                  className="group flex w-full items-center gap-4 bg-paper px-4 py-3 text-left transition hover:bg-paper-sunk"
                >
                  <span className="w-6 shrink-0 font-mono text-xs text-ink-ghost">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink group-hover:text-clay">
                      {document.title || "Untitled"}
                    </p>
                    <p className="text-xs text-ink-faint">
                      Last updated {formatRelativeTime(document.updated_at)}
                    </p>
                  </div>
                  <p className="hidden shrink-0 font-mono text-xs text-ink-ghost sm:block">
                    {formatTimestamp(document.updated_at)}
                  </p>
                  <span className="text-ink-ghost transition group-hover:translate-x-0.5 group-hover:text-clay" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && documents.length === 0 ? (
        <div className="reveal rounded-md border border-dashed border-rule-strong bg-paper p-12 text-center">
          <p className="font-display text-lg font-bold tracking-tight text-ink">A blank page awaits</p>
          <p className="mt-1.5 text-sm text-ink-faint">Create a new document to start writing.</p>
          <button
            type="button"
            onClick={handleCreateDocument}
            disabled={creating}
            className="mt-5 inline-flex items-center gap-1.5 rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60"
          >
            <span aria-hidden>+</span>
            {creating ? "Creating…" : "New document"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
