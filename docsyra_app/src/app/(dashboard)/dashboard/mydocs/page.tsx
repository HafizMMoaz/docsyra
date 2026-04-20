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
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Docs</h1>
          <p className="mt-1 text-sm text-slate-500">All documents you own or can access, with collaborators and last update time.</p>
        </div>
        {stats ? (
          <p className="text-sm text-slate-500">
            {stats.totalDocuments} docs • {stats.collaborators} collaborators
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {loading ? (
        <div className="rounded-2xl border border-black/10 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Loading documents...</p>
        </div>
      ) : null}

      {!loading && documents.length > 0 ? (
        <div className="grid gap-4">
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              onClick={() => router.push(`/editor/${document.id}`)}
              className="rounded-2xl border border-black/10 bg-white p-5 text-left shadow-sm transition hover:border-black/20 hover:bg-slate-50"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-slate-900">{document.title || "Untitled"}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {document.visibility === "public" ? "Public" : "Private"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Last updated {formatRelativeTime(document.updated_at)} • {formatTimestamp(document.updated_at)}</p>
                </div>
                <p className="text-xs text-slate-500">Open</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {document.collaborators.length > 0 ? (
                  document.collaborators.map((collaborator) => (
                    <span
                      key={collaborator.id}
                      className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-slate-700"
                    >
                      <span className="h-2 w-2 rounded-full bg-sky-500" />
                      {collaborator.name || collaborator.email || "Unknown user"}
                      <span className="text-slate-400">{collaborator.role}</span>
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500">
                    No collaborators yet
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {!loading && documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No documents yet</p>
          <p className="mt-1 text-sm text-slate-500">Create a new document from the dashboard to get started.</p>
        </div>
      ) : null}
    </section>
  );
}