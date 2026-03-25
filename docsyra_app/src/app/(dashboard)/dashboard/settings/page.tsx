"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getSession } from "@/lib/auth/session-client";
import type { User } from "@/types";
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

type Provider = "google" | "github";

type SocialAccount = {
  provider: Provider;
  connected: boolean;
  email: string | null;
  avatar_url: string | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([
    { provider: "google", connected: false, email: null, avatar_url: null },
    { provider: "github", connected: false, email: null, avatar_url: null },
  ]);
  const [accountActionLoading, setAccountActionLoading] = useState<Record<Provider, boolean>>({
    google: false,
    github: false,
  });

  const [name, setName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profession, setProfession] = useState("");
  const [professionOther, setProfessionOther] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryOther, setIndustryOther] = useState("");
  const [country, setCountry] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      const currentUser = await getSession();

      if (!mounted) {
        return;
      }

      if (!currentUser) {
        router.replace("/login");
        return;
      }

      if (currentUser.status !== "active") {
        router.replace("/onboarding");
        return;
      }

      setUser(currentUser);
      setName(currentUser.name ?? "");
      const initialProfession = currentUser.profession ?? "";
      const initialIndustry = currentUser.industry ?? "";

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

      setCountry(currentUser.country ?? "");

      const identitiesResponse = await fetch("/api/user/identities", {
        method: "GET",
        cache: "no-store",
      });

      if (identitiesResponse.ok) {
        const identitiesData = (await identitiesResponse.json()) as {
          accounts?: SocialAccount[];
        };

        if (Array.isArray(identitiesData.accounts)) {
          setSocialAccounts(identitiesData.accounts);
        }
      }

      setLoading(false);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleProfileUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
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
        setError(data.error ?? "Failed to update profile");
        return;
      }

      setSuccess("Profile updated");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    setDeactivating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/deactivate", { method: "POST" });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to deactivate account");
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeactivating(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm("Delete account permanently? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/delete", { method: "POST" });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to delete account");
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setUpdatingPassword(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newPassword }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to update password");
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setUpdatingPassword(false);
    }
  }

  function handleConnect(provider: Provider) {
    window.location.href = `/api/auth/${provider}`;
  }

  async function handleDisconnect(provider: Provider) {
    setAccountActionLoading((prev) => ({ ...prev, [provider]: true }));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/identities/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        setError(data.error ?? `Failed to disconnect ${getProviderLabel(provider)}`);
        return;
      }

      setSocialAccounts((prev) =>
        prev.map((account) =>
          account.provider === provider
            ? { ...account, connected: false, email: null, avatar_url: null }
            : account,
        ),
      );
      setSuccess(`${getProviderLabel(provider)} disconnected`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAccountActionLoading((prev) => ({ ...prev, [provider]: false }));
    }
  }

  function getProviderLabel(provider: Provider): string {
    return provider === "google" ? "Google" : "GitHub";
  }

  function getProviderInitial(provider: Provider): string {
    return provider === "google" ? "G" : "GH";
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading profile...</p>;
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your profile and account actions.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-3">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name ? `${user.name} avatar` : "User avatar"}
              className="h-12 w-12 rounded-full border border-slate-200 object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
              {user?.name?.trim()?.charAt(0).toUpperCase() ?? "U"}
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-slate-900">{user?.name || "Unnamed user"}</p>
            <p className="text-sm text-slate-500">{user?.email || "No email"}</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleProfileUpdate}>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="profession" className="mb-1 block text-sm font-medium text-slate-700">
              Profession
            </label>
            <input
              id="profession"
              type="text"
              value={profession}
              onChange={(event) => setProfession(event.target.value)}
              list="profession-options"
              placeholder="Search or select profession"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              disabled={saving}
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
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                disabled={saving}
              />
            ) : null}
          </div>

          <div>
            <label htmlFor="industry" className="mb-1 block text-sm font-medium text-slate-700">
              Industry
            </label>
            <input
              id="industry"
              type="text"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              list="industry-options"
              placeholder="Search or select industry"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              disabled={saving}
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
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                disabled={saving}
              />
            ) : null}
          </div>

          <div>
            <label htmlFor="country" className="mb-1 block text-sm font-medium text-slate-700">
              Country
            </label>
            <input
              id="country"
              type="text"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              list="country-options"
              placeholder="Search and select country"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              disabled={saving}
            />
            <datalist id="country-options">
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Password</h2>
        <p className="mt-1 text-sm text-slate-500">
          Set or update your password for email login. Works for both social and email accounts.
        </p>

        <form className="mt-4 space-y-4" onSubmit={handlePasswordUpdate}>
          <div>
            <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-slate-700">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              disabled={updatingPassword}
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-slate-700">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Retype your password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              disabled={updatingPassword}
            />
          </div>

          <button
            type="submit"
            disabled={updatingPassword}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {updatingPassword ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Connected Accounts</h2>
        <p className="mt-1 text-sm text-slate-500">Connect your social providers</p>

        <div className="mt-4 space-y-3">
          {socialAccounts.map((account) => (
            <div
              key={account.provider}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {account.connected && account.avatar_url ? (
                  <img
                    src={account.avatar_url}
                    alt={`${getProviderLabel(account.provider)} account avatar`}
                    className="h-10 w-10 rounded-full border border-slate-200 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600">
                    {getProviderInitial(account.provider)}
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium text-slate-900">{getProviderLabel(account.provider)}</p>
                  <p className="text-sm text-slate-500">
                    {account.connected
                      ? account.email || "Connected"
                      : "Not connected"}
                  </p>
                </div>
              </div>

              {account.connected ? (
                <button
                  type="button"
                  onClick={() => handleDisconnect(account.provider)}
                  disabled={accountActionLoading[account.provider]}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                >
                  {accountActionLoading[account.provider] ? "Disconnecting..." : "Disconnect"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect(account.provider)}
                  disabled={accountActionLoading[account.provider]}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  {accountActionLoading[account.provider] ? "Connecting..." : "Connect"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
        <p className="mt-1 text-sm text-red-700">Deactivate or permanently delete your account.</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={deactivating || deleting}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
          >
            {deactivating ? "Deactivating..." : "Deactivate Account"}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || deactivating}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete Account"}
          </button>
        </div>
      </div>
    </section>
  );
}
