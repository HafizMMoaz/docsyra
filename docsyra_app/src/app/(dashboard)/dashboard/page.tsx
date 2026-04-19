"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCsrfToken } from "@/lib/security/csrf-client";

type DocumentSummary = {
  id: string;
  title: string | null;
  updated_at: number;
};

function csrfHeaders(): Record<string, string> {
  return {
    "x-csrf-token": getCsrfToken(),
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDocuments() {
      try {
        const response = await fetch("/api/docs/list", {
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
          documents?: DocumentSummary[];
        };

        if (!mounted) {
          return;
        }

        setDocuments(Array.isArray(data.documents) ? data.documents : []);
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

    void loadDocuments();

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

  function formatTimestamp(value: number): string {
    return new Date(value).toLocaleString();
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Your Documents</h1>
        <button
          type="button"
          onClick={handleCreateDocument}
          disabled={creating}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          {creating ? "Creating..." : "New Document"}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">Loading documents...</p>
        </div>
      ) : null}

      {!loading && documents.length > 0 ? (
        <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-200">
            {documents.map((document) => (
              <li key={document.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/editor/${document.id}`)}
                  className="w-full px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-900">{document.title || "Untitled"}</p>
                  <p className="mt-1 text-xs text-slate-500">Last updated: {formatTimestamp(document.updated_at)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && documents.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No documents yet</p>
          <p className="mt-1 text-sm text-slate-500">Create a new document to start writing.</p>
        </div>
      ) : null}
    </section>
  );
}
