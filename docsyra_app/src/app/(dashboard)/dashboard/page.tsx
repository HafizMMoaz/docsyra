"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
        return;
      }

      router.push(`/editor/${data.id}`);
    } catch {
      setError("Failed to create document");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Usage, recent activity, and your latest documents.</p>
        </div>
        <button
          type="button"
          onClick={handleCreateDocument}
          disabled={creating}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          {creating ? "Creating..." : "New Document"}
        </button>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {loading ? (
        <div className="rounded-2xl border border-black/10 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Loading dashboard data...</p>
        </div>
      ) : null}

      {!loading && stats ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {[
            { label: "Documents", value: stats.totalDocuments },
            { label: "Owned", value: stats.ownedDocuments },
            { label: "Shared", value: stats.sharedDocuments },
            { label: "Active 7d", value: stats.activeDocuments },
            { label: "Collaborators", value: stats.collaborators },
            { label: "Recent logs", value: stats.recentActivityCount },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && recentActivity.length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
              <p className="mt-1 text-sm text-slate-500">Latest views, edits, opens, and joins across your documents.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {recentActivity.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border border-black/5 px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.document_title || "Untitled"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.action.toUpperCase()} by {item.name || item.email || "Unknown user"}
                  </p>
                </div>
                <p className="text-xs text-slate-500">{formatRelativeTime(item.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && documents.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/5 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Recent documents</h2>
            <p className="mt-1 text-sm text-slate-500">Open the latest work or jump into a shared doc.</p>
          </div>
          <ul className="divide-y divide-black/5">
            {documents.map((document) => (
              <li key={document.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/editor/${document.id}`)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{document.title || "Untitled"}</p>
                    <p className="mt-1 text-xs text-slate-500">Last updated {formatRelativeTime(document.updated_at)}</p>
                  </div>
                  <p className="shrink-0 text-xs text-slate-500">{formatTimestamp(document.updated_at)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No documents yet</p>
          <p className="mt-1 text-sm text-slate-500">Create a new document to start writing.</p>
        </div>
      ) : null}
    </section>
  );
}
