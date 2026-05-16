"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getSession } from "@/lib/auth/session-client";
import { parseCreationOptionsFromJSON, type CreationOptionsJSON } from "@/lib/auth/passkey-client";
import { getCsrfToken } from "@/lib/security/csrf-client";
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

function csrfHeaders(): Record<string, string> {
  return {
    "x-csrf-token": getCsrfToken(),
  };
}

type Provider = "google" | "github";

type SocialAccount = {
  provider: Provider;
  connected: boolean;
  email: string | null;
  avatar_url: string | null;
};

type PasskeyItem = {
  id: string;
  credentialIdSuffix: string;
  createdAt: number;
};

type PublicKeyCredentialWithJSON = PublicKeyCredential & {
  toJSON?: () => unknown;
};

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [settingUpTwoFactor, setSettingUpTwoFactor] = useState(false);
  const [verifyingTwoFactor, setVerifyingTwoFactor] = useState(false);
  const [disablingTwoFactor, setDisablingTwoFactor] = useState(false);
  const [twoFactorSecret, setTwoFactorSecret] = useState<string | null>(null);
  const [twoFactorQrCodeUrl, setTwoFactorQrCodeUrl] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([
    { provider: "google", connected: false, email: null, avatar_url: null },
    { provider: "github", connected: false, email: null, avatar_url: null },
  ]);
  const [accountActionLoading, setAccountActionLoading] = useState<Record<Provider, boolean>>({
    google: false,
    github: false,
  });
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [creatingPasskey, setCreatingPasskey] = useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingVerificationEmail, setSendingVerificationEmail] = useState(false);

  const [name, setName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profession, setProfession] = useState("");
  const [professionOther, setProfessionOther] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryOther, setIndustryOther] = useState("");
  const [country, setCountry] = useState("");

  useEffect(() => {
    const message = error ?? success;

    if (!message) {
      return;
    }

    setToast({
      message,
      tone: error ? "error" : "success",
    });

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [error, success]);

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
      setEmailVerified(Boolean(currentUser.email_verified));
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

      const twoFactorResponse = await fetch("/api/auth/2fa/setup", {
        method: "GET",
        cache: "no-store",
      });

      if (twoFactorResponse.ok) {
        const twoFactorData = (await twoFactorResponse.json()) as { twoFactorEnabled?: boolean };
        setTwoFactorEnabled(Boolean(twoFactorData.twoFactorEnabled));
      }

      const passkeyResponse = await fetch("/api/auth/passkey/list", {
        method: "GET",
        cache: "no-store",
      });

      if (passkeyResponse.ok) {
        const passkeyData = (await passkeyResponse.json()) as { passkeys?: PasskeyItem[] };
        setPasskeys(Array.isArray(passkeyData.passkeys) ? passkeyData.passkeys : []);
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
      const response = await fetch("/api/user/deactivate", {
        method: "POST",
        headers: csrfHeaders(),
      });
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
      const response = await fetch("/api/user/delete", {
        method: "POST",
        headers: csrfHeaders(),
      });
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
          ...csrfHeaders(),
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

  async function handleSendVerificationEmail() {
    if (emailVerified) {
      setSuccess("Your email is already verified");
      return;
    }

    setSendingVerificationEmail(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: csrfHeaders(),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        alreadyVerified?: boolean;
      };

      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to send verification email");
        return;
      }

      if (data.alreadyVerified) {
        setEmailVerified(true);
        setSuccess("Your email is already verified");
        return;
      }

      setSuccess("Verification email sent. Please check your inbox.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSendingVerificationEmail(false);
    }
  }

  async function handleStartTwoFactorSetup() {
    setSettingUpTwoFactor(true);
    setError(null);
    setSuccess(null);
    setBackupCodes([]);

    try {
      const response = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: csrfHeaders(),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        secret?: string;
        qrCodeUrl?: string;
      };

      if (!response.ok || !data.success || !data.secret || !data.qrCodeUrl) {
        setError(data.error ?? "Failed to start 2FA setup");
        return;
      }

      setTwoFactorSecret(data.secret);
      setTwoFactorQrCodeUrl(data.qrCodeUrl);
      setSuccess("Scan the QR code and enter your authenticator code to confirm.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSettingUpTwoFactor(false);
    }
  }

  async function handleVerifyTwoFactorSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^\d{6}$/.test(twoFactorCode.trim())) {
      setError("Enter a valid 6-digit authenticator code");
      return;
    }

    setVerifyingTwoFactor(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ code: twoFactorCode.trim() }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        backupCodes?: string[];
      };

      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to verify 2FA setup");
        return;
      }

      setTwoFactorEnabled(true);
      setBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
      setTwoFactorSecret(null);
      setTwoFactorQrCodeUrl(null);
      setTwoFactorCode("");
      setSuccess("2FA enabled. Save your backup codes now.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setVerifyingTwoFactor(false);
    }
  }

  async function handleDisableTwoFactor() {
    if (!/^\d{6}$/.test(twoFactorCode.trim())) {
      setError("Enter a valid 6-digit authenticator code to disable 2FA");
      return;
    }

    setDisablingTwoFactor(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ code: twoFactorCode.trim() }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to disable 2FA");
        return;
      }

      setTwoFactorEnabled(false);
      setTwoFactorSecret(null);
      setTwoFactorQrCodeUrl(null);
      setBackupCodes([]);
      setTwoFactorCode("");
      setSuccess("2FA disabled");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDisablingTwoFactor(false);
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
          ...csrfHeaders(),
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

  async function refreshPasskeys() {
    const response = await fetch("/api/auth/passkey/list", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { passkeys?: PasskeyItem[] };
    setPasskeys(Array.isArray(data.passkeys) ? data.passkeys : []);
  }

  async function handleAddPasskey() {
    if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) {
      setError("Passkeys are not supported in this browser");
      return;
    }

    setCreatingPasskey(true);
    setError(null);
    setSuccess(null);

    try {
      const optionsResponse = await fetch("/api/auth/passkey/register", {
        method: "POST",
        headers: csrfHeaders(),
      });

      const optionsData = (await optionsResponse.json()) as {
        success?: boolean;
        error?: string;
        options?: CreationOptionsJSON;
      };

      if (!optionsResponse.ok || !optionsData.success || !optionsData.options) {
        setError(optionsData.error ?? "Failed to start passkey registration");
        return;
      }

      const credential = (await navigator.credentials.create({
        publicKey: parseCreationOptionsFromJSON(optionsData.options),
      })) as PublicKeyCredentialWithJSON | null;

      if (!credential || typeof credential.toJSON !== "function") {
        setError("Passkey creation was cancelled");
        return;
      }

      const verifyResponse = await fetch("/api/auth/passkey/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ response: credential.toJSON() }),
      });

      const verifyData = (await verifyResponse.json()) as { success?: boolean; error?: string };
      if (!verifyResponse.ok || !verifyData.success) {
        setError(verifyData.error ?? "Failed to verify passkey");
        return;
      }

      await refreshPasskeys();
      setSuccess("Passkey added");
    } catch {
      setError("Unable to add passkey");
    } finally {
      setCreatingPasskey(false);
    }
  }

  async function handleRemovePasskey(passkeyId: string) {
    setRemovingPasskeyId(passkeyId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/auth/passkey/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ passkeyId }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to remove passkey");
        return;
      }

      await refreshPasskeys();
      setSuccess("Passkey removed");
    } catch {
      setError("Unable to remove passkey");
    } finally {
      setRemovingPasskeyId(null);
    }
  }

  if (loading) {
    return (
      <p className="font-display text-base italic text-ink-faint">Loading profile…</p>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-7">
      {toast ? (
        <div className="fixed right-4 top-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-sm border border-rule-strong bg-paper-card px-4 py-3 shadow-[0_24px_56px_-20px_rgba(33,28,22,0.5)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="eyebrow"
                style={{ color: toast.tone === "error" ? "var(--signal-danger)" : "var(--signal-ok)" }}
              >
                {toast.tone === "error" ? "Something went wrong" : "Saved"}
              </p>
              <p className="mt-1 text-sm text-ink-soft">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="rounded-sm px-2 py-1 text-xs font-medium text-ink-faint transition hover:bg-paper-sunk hover:text-ink"
              aria-label="Dismiss notification"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <div className="reveal border-b-2 border-ink pb-6">
        <p className="eyebrow">Account & preferences</p>
        <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-2 text-sm text-ink-faint">Manage your profile and account actions.</p>
      </div>

      <div className="reveal rounded-sm border border-rule-strong bg-paper-card p-6" style={{ animationDelay: "60ms" }}>
        <div className="mb-5 flex items-center gap-3 border-b border-rule pb-5">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name ? `${user.name} avatar` : "User avatar"}
              className="h-12 w-12 rounded-sm border border-rule object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-ink text-base font-semibold text-paper">
              {user?.name?.trim()?.charAt(0).toUpperCase() ?? "U"}
            </div>
          )}
          <div>
            <p className="font-display text-lg font-semibold text-ink">{user?.name || "Unnamed user"}</p>
            <p className="text-sm text-ink-faint">{user?.email || "No email"}</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleProfileUpdate}>
          <div>
            <label htmlFor="name" className="eyebrow mb-1.5 block">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
              disabled={saving}
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
              className="w-full rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
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
                className="mt-2 w-full rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                disabled={saving}
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
              className="w-full rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
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
                className="mt-2 w-full rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                disabled={saving}
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
              className="w-full rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
              disabled={saving}
            />
            <datalist id="country-options">
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-clay disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>

      <div className="reveal rounded-sm border border-rule-strong bg-paper-card p-6">
        <h2 className="font-display text-xl font-semibold text-ink">Password</h2>
        <p className="mt-1 text-sm text-ink-faint">
          Set or update your password for email login. Works for both social and email accounts.
        </p>

        <form className="mt-4 space-y-4" onSubmit={handlePasswordUpdate}>
          <div>
            <label htmlFor="new-password" className="eyebrow mb-1.5 block">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
              disabled={updatingPassword}
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="eyebrow mb-1.5 block">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Retype your password"
              className="w-full rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
              disabled={updatingPassword}
            />
          </div>

          <button
            type="submit"
            disabled={updatingPassword}
            className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-clay disabled:opacity-60"
          >
            {updatingPassword ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>

      <div className="reveal rounded-sm border border-rule-strong bg-paper-card p-6">
        <h2 className="font-display text-xl font-semibold text-ink">Email Verification</h2>
        <p className="mt-1 text-sm text-ink-faint">
          Verify your email to unlock collaboration and public sharing actions.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-rule bg-paper-raised px-4 py-3">
          <p className="text-sm font-medium" style={{ color: emailVerified ? "var(--signal-ok)" : "var(--signal-warn)" }}>
            {emailVerified ? "Email verified" : "Email not verified"}
          </p>
          <button
            type="button"
            onClick={handleSendVerificationEmail}
            disabled={sendingVerificationEmail || emailVerified}
            className="rounded-sm border border-rule-strong bg-paper-card px-3.5 py-2.5 text-sm font-medium text-ink-soft transition hover:border-ink hover:text-ink disabled:opacity-60"
          >
            {emailVerified
              ? "Verified"
              : sendingVerificationEmail
                ? "Sending..."
                : "Send verification email"}
          </button>
        </div>
      </div>

      <div className="reveal rounded-sm border border-rule-strong bg-paper-card p-6">
        <h2 className="font-display text-xl font-semibold text-ink">Two-Factor Authentication</h2>
        <p className="mt-1 text-sm text-ink-faint">Protect your account with an authenticator app and backup codes.</p>

        <div className="mt-4 space-y-4">
          {!twoFactorEnabled && !twoFactorSecret ? (
            <button
              type="button"
              onClick={handleStartTwoFactorSetup}
              disabled={settingUpTwoFactor}
              className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-clay disabled:opacity-60"
            >
              {settingUpTwoFactor ? "Preparing..." : "Enable 2FA"}
            </button>
          ) : null}

          {twoFactorSecret && twoFactorQrCodeUrl ? (
            <div className="rounded-sm border border-rule bg-paper-raised p-4">
              <p className="text-sm text-ink-soft">Scan this QR code with your authenticator app, then confirm with a 6-digit code.</p>
              <p className="mt-2 rounded-sm border-l-2 border-signal-warn bg-clay-wash/50 px-3 py-2 text-xs font-medium text-signal-warn">
                Save your backup codes after enabling 2FA. You will not be able to see them again.
              </p>
              <img src={twoFactorQrCodeUrl} alt="2FA QR code" className="mt-3 h-44 w-44 rounded-sm border border-rule bg-paper-card p-2" />
              <p className="mt-2 break-all font-mono text-xs text-ink-faint">Secret: {twoFactorSecret}</p>

              <form className="mt-3 space-y-2" onSubmit={handleVerifyTwoFactorSetup}>
                <input
                  type="text"
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="w-full rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                  disabled={verifyingTwoFactor}
                />
                <button
                  type="submit"
                  disabled={verifyingTwoFactor}
                  className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-clay disabled:opacity-60"
                >
                  {verifyingTwoFactor ? "Verifying..." : "Confirm & Enable"}
                </button>
              </form>
            </div>
          ) : null}

          {twoFactorEnabled ? (
            <div className="rounded-sm border border-pine/30 bg-pine-wash/60 p-4">
              <p className="text-sm font-semibold text-pine">2FA is enabled</p>
              <p className="mt-1 text-sm text-ink-soft">Enter a current authenticator code to disable 2FA.</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  className="w-52 rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-clay"
                  disabled={disablingTwoFactor}
                />
                <button
                  type="button"
                  onClick={handleDisableTwoFactor}
                  disabled={disablingTwoFactor}
                  className="rounded-sm border border-clay/40 bg-clay-wash px-4 py-2.5 text-sm font-medium text-clay transition hover:bg-clay hover:text-paper disabled:opacity-60"
                >
                  {disablingTwoFactor ? "Disabling..." : "Disable 2FA"}
                </button>
              </div>
            </div>
          ) : null}

          {backupCodes.length > 0 ? (
            <div className="rounded-sm border border-rule bg-paper-raised p-4">
              <p className="font-display text-base font-semibold text-ink">Backup codes (shown once)</p>
              <p className="mt-1 text-xs text-ink-faint">Store these in a safe place. You will not be able to view them again. Each code can be used once.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {backupCodes.map((code) => (
                  <code key={code} className="rounded-sm bg-paper-sunk px-2 py-1.5 font-mono text-xs text-ink">{code}</code>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="reveal rounded-sm border border-rule-strong bg-paper-card p-6">
        <h2 className="font-display text-xl font-semibold text-ink">Connected Accounts</h2>
        <p className="mt-1 text-sm text-ink-faint">Connect your social providers</p>

        <div className="mt-4 space-y-3">
          {socialAccounts.map((account) => (
            <div
              key={account.provider}
              className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-rule bg-paper-raised px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {account.connected && account.avatar_url ? (
                  <img
                    src={account.avatar_url}
                    alt={`${getProviderLabel(account.provider)} account avatar`}
                    className="h-10 w-10 rounded-sm border border-rule object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-ink text-xs font-semibold text-paper">
                    {getProviderInitial(account.provider)}
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold text-ink">{getProviderLabel(account.provider)}</p>
                  <p className="text-sm text-ink-faint">
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
                  className="rounded-sm border border-clay/40 bg-clay-wash px-3.5 py-2 text-sm font-medium text-clay transition hover:bg-clay hover:text-paper disabled:opacity-60"
                >
                  {accountActionLoading[account.provider] ? "Disconnecting..." : "Disconnect"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect(account.provider)}
                  disabled={accountActionLoading[account.provider]}
                  className="rounded-sm border border-rule-strong bg-paper-card px-3.5 py-2.5 text-sm font-medium text-ink-soft transition hover:border-ink hover:text-ink"
                >
                  {accountActionLoading[account.provider] ? "Connecting..." : "Connect"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="reveal rounded-sm border border-rule-strong bg-paper-card p-6">
        <h2 className="font-display text-xl font-semibold text-ink">Passkeys</h2>
        <p className="mt-1 text-sm text-ink-faint">Use passkeys for secure passwordless login.</p>

        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={handleAddPasskey}
            disabled={creatingPasskey}
            className="rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-clay disabled:opacity-60"
          >
            {creatingPasskey ? "Adding..." : "Add Passkey"}
          </button>

          {passkeys.length === 0 ? (
            <p className="text-sm text-ink-faint">No passkeys registered yet.</p>
          ) : (
            <div className="space-y-2">
              {passkeys.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-sm border border-rule bg-paper-raised px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">Passkey ending in <span className="font-mono">{entry.credentialIdSuffix}</span></p>
                    <p className="text-xs text-ink-faint">
                      Added {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePasskey(entry.id)}
                    disabled={removingPasskeyId === entry.id}
                    className="rounded-sm border border-clay/40 bg-clay-wash px-3 py-1.5 text-xs font-medium text-clay transition hover:bg-clay hover:text-paper disabled:opacity-60"
                  >
                    {removingPasskeyId === entry.id ? "Removing..." : "Remove"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="reveal rounded-sm border border-signal-danger/30 bg-clay-wash/40 p-6">
        <h2 className="font-display text-xl font-semibold text-signal-danger">Danger Zone</h2>
        <p className="mt-1 text-sm text-ink-soft">Deactivate or permanently delete your account.</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={deactivating || deleting}
            className="rounded-sm border border-signal-danger/40 bg-paper-card px-5 py-2.5 text-sm font-medium text-signal-danger transition hover:bg-signal-danger hover:text-paper disabled:opacity-60"
          >
            {deactivating ? "Deactivating..." : "Deactivate Account"}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || deactivating}
            className="rounded-sm bg-signal-danger px-5 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete Account"}
          </button>
        </div>
      </div>
    </section>
  );
}
