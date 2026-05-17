"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth/session-client";
import { getCsrfToken } from "@/lib/security/csrf-client";
import type { AISkill } from "@/lib/ai/types";

type SkillResponse = {
  success?: boolean;
  error?: string;
  skills?: AISkill[];
  skill?: AISkill;
};

type SkillDraft = {
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
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

function textAreaClassName(extraClassName = ""): string {
  return fieldClassName(`min-h-[160px] resize-y ${extraClassName}`);
}

function createEmptySkill(): SkillDraft {
  return {
    name: "",
    description: "",
    instructions: "",
    enabled: true,
  };
}

function mapSkillToDraft(skill: AISkill): SkillDraft {
  return {
    name: skill.name,
    description: skill.description ?? "",
    instructions: skill.instructions,
    enabled: skill.enabled,
  };
}

export default function AISkillsPage() {
  const router = useRouter();
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingSkills, setLoadingSkills] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [skills, setSkills] = useState<AISkill[]>([]);
  const [newSkill, setNewSkill] = useState<SkillDraft>(createEmptySkill);
  const [savingSkillIds, setSavingSkillIds] = useState<Record<string, boolean>>({});
  const [deletingSkillIds, setDeletingSkillIds] = useState<Record<string, boolean>>({});
  const [skillDrafts, setSkillDrafts] = useState<Record<string, SkillDraft>>({});

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

    async function loadSkills() {
      setLoadingSkills(true);

      try {
        const response = await fetch("/api/user/ai-skills", {
          method: "GET",
          cache: "no-store",
        });

        const data = (await response.json()) as SkillResponse;

        if (!mounted) {
          return;
        }

        if (!response.ok || !data.success || !Array.isArray(data.skills)) {
          setError(data.error ?? "Failed to load AI skills");
          return;
        }

        setSkills(data.skills);
        setSkillDrafts(
          Object.fromEntries(data.skills.map((skill) => [skill.id, mapSkillToDraft(skill)])),
        );
      } catch {
        if (mounted) {
          setError("Failed to load AI skills");
        }
      } finally {
        if (mounted) {
          setLoadingSkills(false);
        }
      }
    }

    void loadSkills();

    return () => {
      mounted = false;
    };
  }, [loadingSession]);

  const activeSkillCount = useMemo(() => skills.filter((skill) => skill.enabled).length, [skills]);

  function updateDraft(skillId: string, field: keyof SkillDraft, value: string | boolean) {
    setSkillDrafts((current) => ({
      ...current,
      [skillId]: {
        ...(current[skillId] ?? createEmptySkill()),
        [field]: value,
      },
    }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/ai-skills", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify(newSkill),
      });

      const data = (await response.json()) as SkillResponse;
      if (!response.ok || !data.success || !data.skill) {
        setError(data.error ?? "Failed to create AI skill");
        return;
      }

      setSkills((current) => [data.skill!, ...current]);
      setSkillDrafts((current) => ({
        ...current,
        [data.skill!.id]: mapSkillToDraft(data.skill!),
      }));
      setNewSkill(createEmptySkill());
      setSuccess("AI skill created");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(skillId: string) {
    const draft = skillDrafts[skillId];
    if (!draft) {
      return;
    }

    setSavingSkillIds((current) => ({ ...current, [skillId]: true }));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/ai-skills", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ skillId, ...draft }),
      });

      const data = (await response.json()) as SkillResponse;
      if (!response.ok || !data.success || !data.skill) {
        setError(data.error ?? "Failed to update AI skill");
        return;
      }

      setSkills((current) => current.map((skill) => (skill.id === skillId ? data.skill! : skill)));
      setSkillDrafts((current) => ({
        ...current,
        [skillId]: mapSkillToDraft(data.skill!),
      }));
      setSuccess("AI skill saved");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSavingSkillIds((current) => ({ ...current, [skillId]: false }));
    }
  }

  async function handleDelete(skillId: string) {
    if (!window.confirm("Delete this AI skill?")) {
      return;
    }

    setDeletingSkillIds((current) => ({ ...current, [skillId]: true }));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/ai-skills", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ skillId }),
      });

      const data = (await response.json()) as SkillResponse;
      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to delete AI skill");
        return;
      }

      setSkills((current) => current.filter((skill) => skill.id !== skillId));
      setSkillDrafts((current) => {
        const next = { ...current };
        delete next[skillId];
        return next;
      });
      setSuccess("AI skill deleted");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeletingSkillIds((current) => ({ ...current, [skillId]: false }));
    }
  }

  if (loadingSession || loadingSkills) {
    return <p className="text-sm text-ink-faint">Loading AI skills…</p>;
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="reveal border-b border-rule pb-6">
        <p className="eyebrow text-ink-ghost">Personal AI setup</p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-ink">AI Skills</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-faint">
          Create reusable instructions for the AI tools in your account. Skills are stored per user and stay private to your workspace.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-sm border border-rule-strong bg-paper px-3 py-1.5 text-ink-faint">
            {skills.length} total
          </span>
          <span className="rounded-sm border border-rule-strong bg-paper px-3 py-1.5 text-ink-faint">
            {activeSkillCount} active
          </span>
          <Link href="/dashboard/ai-settings" className="rounded-sm border border-rule-strong bg-paper px-3 py-1.5 text-ink transition hover:border-clay hover:text-ink">
            AI Settings
          </Link>
        </div>
      </div>

      {error ? <p className="rounded-sm border border-signal-danger/30 bg-paper-sunk px-3 py-2 text-sm text-signal-danger">{error}</p> : null}
      {success ? <p className="rounded-sm border border-pine/30 bg-paper-sunk px-3 py-2 text-sm text-pine">{success}</p> : null}

      <form className="reveal space-y-5 rounded-md border border-rule bg-paper p-6" onSubmit={handleCreate} style={{ animationDelay: "60ms" }}>
        <div>
          <h2 className="font-display text-base font-bold tracking-tight text-ink">Create a skill</h2>
          <p className="mt-0.5 text-sm text-ink-faint">Write a reusable instruction set for future AI actions.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="new-skill-name" className="eyebrow mb-1.5 block">
              Name
            </label>
            <input
              id="new-skill-name"
              value={newSkill.name}
              onChange={(event) => setNewSkill((current) => ({ ...current, name: event.target.value }))}
              placeholder="Summarize for executives"
              className={fieldClassName()}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="new-skill-description" className="eyebrow mb-1.5 block">
              Description
            </label>
            <input
              id="new-skill-description"
              value={newSkill.description}
              onChange={(event) => setNewSkill((current) => ({ ...current, description: event.target.value }))}
              placeholder="What this skill is for"
              className={fieldClassName()}
              disabled={saving}
            />
          </div>
        </div>

        <div>
          <label htmlFor="new-skill-instructions" className="eyebrow mb-1.5 block">
            Instructions
          </label>
          <textarea
            id="new-skill-instructions"
            value={newSkill.instructions}
            onChange={(event) => setNewSkill((current) => ({ ...current, instructions: event.target.value }))}
            placeholder="Describe the exact behavior, tone, format, and output rules."
            className={textAreaClassName()}
            disabled={saving}
          />
        </div>

        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={newSkill.enabled}
            onChange={(event) => setNewSkill((current) => ({ ...current, enabled: event.target.checked }))}
            className="h-4 w-4 rounded border-rule-strong text-ink focus:ring-0"
            disabled={saving}
          />
          Enabled
        </label>

        <div className="flex items-center justify-between gap-3 border-t border-rule pt-4">
          <p className="eyebrow text-ink-ghost">Set up a skill before using it in AI workflows</p>
          <button type="submit" disabled={saving} className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60">
            {saving ? "Creating..." : "Create skill"}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        <div className="reveal flex items-center justify-between gap-3" style={{ animationDelay: "100ms" }}>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-ink">Your skills</h2>
            <p className="mt-0.5 text-sm text-ink-faint">Edit the name, instructions, or enabled state for any saved skill.</p>
          </div>
        </div>

        {skills.length === 0 ? (
          <div className="reveal rounded-md border border-dashed border-rule-strong bg-paper px-6 py-10 text-center" style={{ animationDelay: "120ms" }}>
            <p className="font-display text-base font-bold tracking-tight text-ink">No skills yet</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-ink-faint">
              Create your first AI skill above to start saving reusable instructions for writing, editing, and summarizing.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {skills.map((skill, index) => {
              const draft = skillDrafts[skill.id] ?? mapSkillToDraft(skill);

              return (
                <article key={skill.id} className="reveal rounded-md border border-rule bg-paper" style={{ animationDelay: `${120 + index * 40}ms` }}>
                  <div className="border-b border-rule px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-base font-bold tracking-tight text-ink">{skill.name}</h3>
                        {skill.description ? <p className="mt-0.5 text-sm text-ink-faint">{skill.description}</p> : null}
                      </div>
                      <span className={`rounded-sm border px-2 py-1 text-[11px] font-medium ${skill.enabled ? "border-pine/30 bg-paper text-pine" : "border-rule-strong bg-paper text-ink-faint"}`}>
                        {skill.enabled ? "Active" : "Disabled"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 px-5 py-4">
                    <div>
                      <label htmlFor={`skill-${skill.id}-name`} className="eyebrow mb-1.5 block">
                        Name
                      </label>
                      <input
                        id={`skill-${skill.id}-name`}
                        value={draft.name}
                        onChange={(event) => updateDraft(skill.id, "name", event.target.value)}
                        className={fieldClassName()}
                        disabled={Boolean(savingSkillIds[skill.id]) || Boolean(deletingSkillIds[skill.id])}
                      />
                    </div>

                    <div>
                      <label htmlFor={`skill-${skill.id}-description`} className="eyebrow mb-1.5 block">
                        Description
                      </label>
                      <input
                        id={`skill-${skill.id}-description`}
                        value={draft.description}
                        onChange={(event) => updateDraft(skill.id, "description", event.target.value)}
                        className={fieldClassName()}
                        disabled={Boolean(savingSkillIds[skill.id]) || Boolean(deletingSkillIds[skill.id])}
                      />
                    </div>

                    <div>
                      <label htmlFor={`skill-${skill.id}-instructions`} className="eyebrow mb-1.5 block">
                        Instructions
                      </label>
                      <textarea
                        id={`skill-${skill.id}-instructions`}
                        value={draft.instructions}
                        onChange={(event) => updateDraft(skill.id, "instructions", event.target.value)}
                        className={textAreaClassName("min-h-45")}
                        disabled={Boolean(savingSkillIds[skill.id]) || Boolean(deletingSkillIds[skill.id])}
                      />
                    </div>

                    <label className="flex items-center gap-3 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(event) => updateDraft(skill.id, "enabled", event.target.checked)}
                        className="h-4 w-4 rounded border-rule-strong text-ink focus:ring-0"
                        disabled={Boolean(savingSkillIds[skill.id]) || Boolean(deletingSkillIds[skill.id])}
                      />
                      Enabled
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-4">
                    <p className="text-xs text-ink-faint">
                      Updated {new Date(skill.updatedAt).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDelete(skill.id)}
                        disabled={Boolean(savingSkillIds[skill.id]) || Boolean(deletingSkillIds[skill.id])}
                        className="rounded-sm border border-signal-danger/30 px-3 py-2 text-sm font-medium text-signal-danger transition hover:border-signal-danger/50 disabled:opacity-60"
                      >
                        {deletingSkillIds[skill.id] ? "Deleting..." : "Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave(skill.id)}
                        disabled={Boolean(savingSkillIds[skill.id]) || Boolean(deletingSkillIds[skill.id])}
                        className="rounded-sm bg-ink px-3 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60"
                      >
                        {savingSkillIds[skill.id] ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}