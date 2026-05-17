"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getSession } from "@/lib/auth/session-client";
import { getCsrfToken } from "@/lib/security/csrf-client";
import { AI_PROVIDER_IDS, type AIProviderId } from "@/lib/ai/types";

type ProviderFormState = {
  apiKey: string;
  model: string;
  keyConfigured: boolean;
};

type AISettingsResponse = {
  success?: boolean;
  error?: string;
  provider?: AIProviderId;
  providers?: Record<AIProviderId, { keyConfigured: boolean; model: string | null }>;
};

const PROVIDER_META: Record<AIProviderId, { label: string; description: string }> = {
  anthropic: { label: "Anthropic", description: "Claude family models" },
  openai: { label: "OpenAI", description: "GPT models" },
  groq: { label: "Groq", description: "Fast hosted inference" },
  gemini: { label: "Gemini", description: "Google Gemini models" },
};

function csrfHeaders(): Record<string, string> {
  return {
    "x-csrf-token": getCsrfToken(),
  };
}

function fieldClassName(extraClassName = ""): string {
  return [
    "w-full rounded-sm border border-rule-strong bg-paper px-3 py-2 text-sm leading-5 text-ink outline-none transition",
    "focus:border-clay focus:outline-none focus:ring-0 focus:shadow-none",
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");
}

function selectClassName(extraClassName = ""): string {
  return [
    "w-full appearance-none rounded-sm border border-rule-strong bg-paper px-3 py-2 pr-10 text-sm leading-5 text-ink outline-none transition",
    "focus:border-clay focus:outline-none focus:ring-0 focus:shadow-none",
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");
}

function SelectChevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-4 w-4"
    >
      <path d="m5 7 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function createInitialProviderState(): Record<AIProviderId, ProviderFormState> {
  return {
    anthropic: { apiKey: "", model: "", keyConfigured: false },
    openai: { apiKey: "", model: "", keyConfigured: false },
    groq: { apiKey: "", model: "", keyConfigured: false },
    gemini: { apiKey: "", model: "", keyConfigured: false },
  };
}

function providerSaveLabel(provider: AIProviderId, configured: boolean): string {
  return configured ? `Set up ${PROVIDER_META[provider].label}` : `Set up ${PROVIDER_META[provider].label}`;
}

export default function AISettingsPage() {
  const router = useRouter();
  const [loadingSession, setLoadingSession] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<AIProviderId>("anthropic");
  const [providerSettings, setProviderSettings] = useState<Record<AIProviderId, ProviderFormState>>(createInitialProviderState);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const session = await getSession();

      if (!mounted) {
        return;
      }

      if (!session) {
        router.replace("/login");
        return;
      }

      if (session.status !== "active") {
        router.replace("/onboarding");
        return;
      }

      setLoadingSession(false);
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (loadingSession) {
      return;
    }

    let mounted = true;

    async function loadSettings() {
      setLoadingSettings(true);

      try {
        const response = await fetch("/api/user/ai-settings", {
          method: "GET",
          cache: "no-store",
        });

        const data = (await response.json()) as AISettingsResponse;

        if (!mounted) {
          return;
        }

        if (!response.ok || !data.success || !data.providers) {
          setError(data.error ?? "Failed to load AI settings");
          return;
        }

        setProvider(data.provider ?? "anthropic");
        setProviderSettings(() => {
          const next = createInitialProviderState();

          for (const providerId of AI_PROVIDER_IDS) {
            const item = data.providers?.[providerId];
            next[providerId] = {
              apiKey: "",
              model: item?.model ?? "",
              keyConfigured: Boolean(item?.keyConfigured),
            };
          }

          return next;
        });
      } catch {
        if (mounted) {
          setError("Failed to load AI settings");
        }
      } finally {
        if (mounted) {
          setLoadingSettings(false);
        }
      }
    }

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, [loadingSession]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/ai-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          provider,
          anthropicApiKey: providerSettings.anthropic.apiKey,
          anthropicModel: providerSettings.anthropic.model,
          openaiApiKey: providerSettings.openai.apiKey,
          openaiModel: providerSettings.openai.model,
          groqApiKey: providerSettings.groq.apiKey,
          groqModel: providerSettings.groq.model,
          geminiApiKey: providerSettings.gemini.apiKey,
          geminiModel: providerSettings.gemini.model,
        }),
      });

      const data = (await response.json()) as AISettingsResponse;
      if (!response.ok || !data.success || !data.providers) {
        setError(data.error ?? "Failed to save AI settings");
        return;
      }

      setProvider(data.provider ?? provider);
      setProviderSettings(() => {
        const next = createInitialProviderState();

        for (const providerId of AI_PROVIDER_IDS) {
          const item = data.providers?.[providerId];
          next[providerId] = {
            apiKey: "",
            model: item?.model ?? providerSettings[providerId].model,
            keyConfigured: Boolean(item?.keyConfigured),
          };
        }

        return next;
      });

      setSuccess("AI settings saved");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingSession || loadingSettings) {
    return <p className="text-sm text-ink-faint">Loading AI settings…</p>;
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="reveal border-b border-rule pb-6">
        <p className="eyebrow text-ink-ghost">Personal AI configuration</p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-ink">AI Settings</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-faint">
          Set up AI with your own provider keys per account. Keys are encrypted at rest and only used on the server.
        </p>
      </div>

      {error ? <p className="rounded-sm border border-signal-danger/30 bg-paper-sunk px-3 py-2 text-sm text-signal-danger">{error}</p> : null}
      {success ? <p className="rounded-sm border border-pine/30 bg-paper-sunk px-3 py-2 text-sm text-pine">{success}</p> : null}

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="reveal rounded-md border border-rule bg-paper" style={{ animationDelay: "60ms" }}>
          <div className="border-b border-rule px-6 py-5">
            <h2 className="font-display text-base font-bold tracking-tight text-ink">Default provider</h2>
              <p className="mt-0.5 text-sm text-ink-faint">
              This provider will be used first when your account AI requests run.
            </p>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="relative max-w-sm">
              <select value={provider} onChange={(event) => setProvider(event.target.value as AIProviderId)} className={selectClassName()} disabled={saving}>
                {AI_PROVIDER_IDS.map((providerId) => (
                  <option key={providerId} value={providerId}>
                    {PROVIDER_META[providerId].label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-ghost">
                <SelectChevron />
              </span>
            </div>
            <p className="text-sm text-ink-faint">
              The selected provider is paired with the key you save for that provider.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {AI_PROVIDER_IDS.map((providerId) => {
            const state = providerSettings[providerId];

            return (
              <section key={providerId} className="reveal rounded-md border border-rule bg-paper" style={{ animationDelay: `${90 + AI_PROVIDER_IDS.indexOf(providerId) * 40}ms` }}>
                <div className="border-b border-rule px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base font-bold tracking-tight text-ink">{PROVIDER_META[providerId].label}</h3>
                      <p className="mt-0.5 text-sm text-ink-faint">{PROVIDER_META[providerId].description}</p>
                    </div>
                    <span className={`rounded-sm border px-2 py-1 text-[11px] font-medium ${state.keyConfigured ? "border-pine/30 bg-paper text-pine" : "border-rule-strong bg-paper text-ink-faint"}`}>
                      {providerSaveLabel(providerId, state.keyConfigured)}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 px-5 py-4">
                  <div>
                    <label htmlFor={`${providerId}-api-key`} className="eyebrow mb-1.5 block">
                      API key
                    </label>
                    <input
                      id={`${providerId}-api-key`}
                      type="password"
                      value={state.apiKey}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          [providerId]: {
                            ...current[providerId],
                            apiKey: event.target.value,
                          },
                        }))
                      }
                      placeholder={state.keyConfigured ? "Leave blank to keep saved key" : "Enter your API key"}
                      autoComplete="off"
                      spellCheck={false}
                      className={fieldClassName()}
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label htmlFor={`${providerId}-model`} className="eyebrow mb-1.5 block">
                      Model
                    </label>
                    <input
                      id={`${providerId}-model`}
                      type="text"
                      value={state.model}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          [providerId]: {
                            ...current[providerId],
                            model: event.target.value,
                          },
                        }))
                      }
                      placeholder="Optional model override"
                      className={fieldClassName()}
                      disabled={saving}
                    />
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <div className="reveal rounded-md border border-rule bg-paper px-5 py-4" style={{ animationDelay: "240ms" }}>
          <p className="text-sm text-ink-faint">
            Leave API key fields blank to keep the saved key. Update a field to replace it.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow text-ink-ghost">Set up AI before using document generation</p>
            <button type="submit" disabled={saving} className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60">
              {saving ? "Saving..." : "Save AI settings"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}