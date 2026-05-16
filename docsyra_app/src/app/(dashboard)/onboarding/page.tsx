"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getSession } from "@/lib/auth/session-client";
import { getCsrfToken } from "@/lib/security/csrf-client";
import { COUNTRY_OPTIONS, INDUSTRY_OPTIONS, PROFESSION_OPTIONS } from "@/lib/profile-options";

function isOptionValue(value: string, options: readonly string[]): boolean {
  return options.includes(value);
}

function resolveSelectableValue(selected: string, otherValue: string): string {
  if (selected === "Other") {
    return otherValue.trim();
  }

  return selected.trim();
}

function csrfHeaders(): Record<string, string> {
  return {
    "x-csrf-token": getCsrfToken(),
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const [loadingSession, setLoadingSession] = useState(true);
  const [name, setName] = useState("");
  const [profession, setProfession] = useState("");
  const [professionOther, setProfessionOther] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryOther, setIndustryOther] = useState("");
  const [country, setCountry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const user = await getSession();

      if (!mounted) {
        return;
      }

      if (!user) {
        router.replace("/login");
        return;
      }

      if (user.status === "active") {
        router.replace("/dashboard");
        return;
      }

      setName(user.name ?? "");
      const initialProfession = user.profession ?? "";
      const initialIndustry = user.industry ?? "";

      if (isOptionValue(initialProfession, PROFESSION_OPTIONS)) {
        setProfession(initialProfession);
      } else if (initialProfession) {
        setProfession("Other");
        setProfessionOther(initialProfession);
      }

      if (isOptionValue(initialIndustry, INDUSTRY_OPTIONS)) {
        setIndustry(initialIndustry);
      } else if (initialIndustry) {
        setIndustry("Other");
        setIndustryOther(initialIndustry);
      }

      setCountry(user.country ?? "");
      setLoadingSession(false);
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const resolvedProfession = resolveSelectableValue(profession, professionOther);
    const resolvedIndustry = resolveSelectableValue(industry, industryOther);

    if (profession === "Other" && !resolvedProfession) {
      setError("Please enter your profession");
      return;
    }

    if (industry === "Other" && !resolvedIndustry) {
      setError("Please enter your industry");
      return;
    }

    if (country && !isOptionValue(country, COUNTRY_OPTIONS)) {
      setError("Please select a valid country from the list");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          name,
          profession: resolvedProfession || null,
          industry: resolvedIndustry || null,
          country,
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to complete onboarding");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-sm text-ink-faint">
        <span className="eyebrow">Checking session</span>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="reveal w-full max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="font-display text-xl font-bold tracking-tight text-ink">Docsyra</span>
          <span className="h-3.5 w-px bg-rule-strong" />
          <span className="eyebrow text-ink-ghost">First-run setup</span>
        </div>

        <div className="overflow-hidden rounded-md border border-rule bg-paper">
          <div className="border-b border-rule px-7 py-6">
            <p className="eyebrow text-clay">Step 01 / 01</p>
            <h1 className="font-display mt-2 text-2xl font-bold tracking-tight text-ink">
              Complete your profile
            </h1>
            <p className="mt-1.5 text-sm text-ink-faint">
              A few details so we can personalize your workspace.
            </p>
          </div>

          <form className="space-y-5 px-7 py-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="eyebrow mb-1.5 block">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-sm border border-rule-strong bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-clay"
                required
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="profession" className="eyebrow mb-1.5 block">
                Profession
              </label>
              <input
                id="profession"
                type="text"
                value={profession}
                onChange={(event) => setProfession(event.target.value)}
                list="profession-options"
                placeholder="Search or select profession"
                className="w-full rounded-sm border border-rule-strong bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                disabled={submitting}
              />
              <datalist id="profession-options">
                {PROFESSION_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              {profession === "Other" ? (
                <input
                  type="text"
                  value={professionOther}
                  onChange={(event) => setProfessionOther(event.target.value)}
                  placeholder="Type your profession"
                  className="mt-2 w-full rounded-sm border border-rule-strong bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                  disabled={submitting}
                />
              ) : null}
            </div>

            <div>
              <label htmlFor="industry" className="eyebrow mb-1.5 block">
                Industry
              </label>
              <input
                id="industry"
                type="text"
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                list="industry-options"
                placeholder="Search or select industry"
                className="w-full rounded-sm border border-rule-strong bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                disabled={submitting}
              />
              <datalist id="industry-options">
                {INDUSTRY_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              {industry === "Other" ? (
                <input
                  type="text"
                  value={industryOther}
                  onChange={(event) => setIndustryOther(event.target.value)}
                  placeholder="Type your industry"
                  className="mt-2 w-full rounded-sm border border-rule-strong bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                  disabled={submitting}
                />
              ) : null}
            </div>

            <div>
              <label htmlFor="country" className="eyebrow mb-1.5 block">
                Country
              </label>
              <input
                id="country"
                type="text"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                list="country-options"
                placeholder="Search and select country"
                className="w-full rounded-sm border border-rule-strong bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                disabled={submitting}
              />
              <datalist id="country-options">
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>

            {error ? (
              <p className="rounded-sm border border-signal-danger/30 bg-paper-sunk px-3 py-2 text-sm text-signal-danger">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="group flex w-full items-center justify-center gap-2 rounded-sm bg-ink px-4 py-3 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Continue to workspace"}
              <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
                →
              </span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
