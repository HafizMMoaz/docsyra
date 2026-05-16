"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type FormEvent, type MouseEventHandler, useEffect, useState } from "react";
import { getSession } from "@/lib/auth/session-client";
import { parseRequestOptionsFromJSON, type RequestOptionsJSON } from "@/lib/auth/passkey-client";
import { getCsrfToken } from "@/lib/security/csrf-client";
import { FaGoogle, FaGithub, FaKey, FaLock, FaEnvelope } from "react-icons/fa";

type PublicKeyCredentialWithJSON = PublicKeyCredential & {
  toJSON?: () => unknown;
};

function csrfHeaders(): Record<string, string> {
  return {
    "x-csrf-token": getCsrfToken(),
  };
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [authMode, setAuthMode] = useState<"password" | "otp">("password");
  const [step, setStep] = useState<"email" | "login" | "register">("email");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function routeAfterAuth(status: string | null | undefined) {
    const nextPath = status === "active" ? "/dashboard" : "/onboarding";
    router.push(nextPath);
    router.refresh();
  }

  useEffect(() => {
    if (searchParams.get("twoFactor") === "1") {
      setTwoFactorRequired(true);
      setMessage("Enter your authenticator code or a backup code.");
    }
  }, [searchParams]);

  useEffect(() => {
    void getSession();
  }, []);

  async function handleContinueWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/email-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        exists?: boolean;
        needsPassword?: boolean;
      };

      if (!response.ok || !data.success) {
        setError(data.error ?? "Unable to continue with email");
        return;
      }

      if (data.exists && data.needsPassword) {
        setStep("login");
        return;
      }

      if (data.exists && !data.needsPassword) {
        setError("This email is linked to social login. Continue with Google or GitHub.");
        return;
      }

      setStep("register");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        requiresTwoFactor?: boolean;
        user?: { status?: string | null };
      };

      if (!response.ok || !data.success) {
        setError(data.error ?? "Login failed");
        return;
      }

      if (data.requiresTwoFactor) {
        setTwoFactorRequired(true);
        setTwoFactorCode("");
        setMessage("Enter your authenticator code or backup code to continue.");
        return;
      }

      routeAfterAuth(data.user?.status);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        requiresTwoFactor?: boolean;
        user?: { status?: string | null };
      };

      if (!response.ok || !data.success) {
        setError(data.error ?? "Sign up failed");
        return;
      }

      routeAfterAuth(data.user?.status);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await response.json()) as { success?: boolean };
      if (!response.ok || !data.success) {
        setError("Unable to send code. Please try again.");
        return;
      }

      setOtpStep("code");
      setMessage("If the email exists, a 6-digit code was sent.");
    } catch {
      setError("Unable to send code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^\d{6}$/.test(otpCode.trim())) {
      setError("Enter the 6-digit code");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ email: email.trim(), code: otpCode.trim() }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        requiresTwoFactor?: boolean;
        user?: { status?: string | null };
      };

      if (!response.ok || !data.success) {
        setError(data.error ?? "Invalid or expired code");
        return;
      }

      if (data.requiresTwoFactor) {
        setTwoFactorRequired(true);
        setTwoFactorCode("");
        setMessage("Enter your authenticator code or backup code to continue.");
        return;
      }

      routeAfterAuth(data.user?.status);
    } catch {
      setError("Unable to verify code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleValidateTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!twoFactorCode.trim()) {
      setError("Code is required");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/2fa/validate", {
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
        user?: { status?: string | null };
      };

      if (!response.ok || !data.success) {
        setError(data.error ?? "Invalid verification code");
        return;
      }

      routeAfterAuth(data.user?.status);
    } catch {
      setError("Unable to verify 2FA code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const handleGoogleClick: MouseEventHandler<HTMLButtonElement> = () => {
    window.location.href = "/api/auth/google";
  };

  const handleGithubClick: MouseEventHandler<HTMLButtonElement> = () => {
    window.location.href = "/api/auth/github";
  };

  async function handlePasskeyLogin() {
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }

    if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) {
      setError("Passkeys are not supported in this browser");
      return;
    }

    setPasskeyLoading(true);
    setError(null);
    setMessage(null);

    try {
      const optionsResponse = await fetch("/api/auth/passkey/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const optionsData = (await optionsResponse.json()) as {
        success?: boolean;
        error?: string;
        options?: RequestOptionsJSON;
      };

      if (!optionsResponse.ok || !optionsData.success || !optionsData.options) {
        setError(optionsData.error ?? "Unable to start passkey login");
        return;
      }

      const assertion = (await navigator.credentials.get({
        publicKey: parseRequestOptionsFromJSON(optionsData.options),
      })) as PublicKeyCredentialWithJSON | null;

      if (!assertion || typeof assertion.toJSON !== "function") {
        setError("Passkey login was cancelled");
        return;
      }

      const verifyResponse = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ response: assertion.toJSON() }),
      });

      const verifyData = (await verifyResponse.json()) as {
        success?: boolean;
        error?: string;
        requiresTwoFactor?: boolean;
        user?: { status?: string | null };
      };

      if (!verifyResponse.ok || !verifyData.success) {
        setError(verifyData.error ?? "Passkey verification failed");
        return;
      }

      if (verifyData.requiresTwoFactor) {
        setTwoFactorRequired(true);
        setTwoFactorCode("");
        setMessage("Enter your authenticator code or backup code to continue.");
        return;
      }

      routeAfterAuth(verifyData.user?.status);
    } catch {
      setError("Unable to complete passkey login");
    } finally {
      setPasskeyLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Editorial side panel */}
      <aside className="reveal-fade relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-paper lg:flex xl:p-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 50% 40% at 80% 10%, rgba(180,80,42,0.28), transparent 70%)",
          }}
        />
        <div className="relative flex items-baseline gap-3">
          <span className="font-display text-2xl font-semibold tracking-tight">Docsyra</span>
          <span className="h-3.5 w-px bg-paper/30" />
          <span className="eyebrow text-clay-soft">The Document Workspace</span>
        </div>

        <div className="relative">
          <p className="eyebrow text-clay-soft">Welcome back</p>
          <h2 className="font-display mt-5 text-5xl font-semibold leading-[1.06] tracking-tight xl:text-6xl">
            Pick up exactly where the ink dried.
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-paper-sunk">
            Your documents, comments, and collaborators are waiting — a calm surface
            for writing together.
          </p>
        </div>

        <div className="relative space-y-px overflow-hidden rounded-sm border border-paper/15">
          {[
            ["Live presence", "See cursors and edits as they happen"],
            ["Threaded comments", "Discuss right on the passage"],
            ["GitHub sync", "Keep prose and repo in step"],
          ].map(([title, text]) => (
            <div key={title} className="flex items-baseline gap-3 bg-paper/[0.04] px-4 py-3">
              <span className="font-display text-clay-soft">—</span>
              <div>
                <p className="text-sm font-semibold text-paper">{title}</p>
                <p className="text-xs text-paper-sunk">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Auth form */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <section className="reveal w-full max-w-md">
          <div className="mb-8 flex items-baseline gap-3 lg:hidden">
            <span className="font-display text-2xl font-semibold tracking-tight text-ink">Docsyra</span>
          </div>

          <p className="eyebrow">Account access</p>
          <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight text-ink">
            Sign in to continue
          </h1>
          <p className="mt-2 text-sm text-ink-faint">
            Use a social provider, a passkey, or your email below.
          </p>

          <div className="mt-7 space-y-2.5">
            <button
              type="button"
              onClick={handleGoogleClick}
              className="flex w-full items-center justify-center gap-2.5 rounded-sm border border-rule-strong bg-paper-card px-4 py-3 text-sm font-medium text-ink transition hover:border-ink"
            >
              <FaGoogle className="h-4 w-4" />
              Continue with Google
            </button>

            <button
              type="button"
              onClick={handleGithubClick}
              className="flex w-full items-center justify-center gap-2.5 rounded-sm border border-rule-strong bg-paper-card px-4 py-3 text-sm font-medium text-ink transition hover:border-ink"
            >
              <FaGithub className="h-4 w-4" />
              Continue with GitHub
            </button>

            <button
              type="button"
              onClick={handlePasskeyLogin}
              className="flex w-full items-center justify-center gap-2.5 rounded-sm border border-rule-strong bg-paper-card px-4 py-3 text-sm font-medium text-ink transition hover:border-ink disabled:opacity-50"
              disabled={passkeyLoading || loading || twoFactorRequired}
            >
              <FaKey className="h-4 w-4" />
              {passkeyLoading ? "Checking passkey..." : "Sign in with Passkey"}
            </button>
          </div>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-rule" />
            <span className="eyebrow">or by email</span>
            <div className="h-px flex-1 bg-rule" />
          </div>

          <div className="mb-4 flex gap-1 rounded-sm border border-rule-strong bg-paper-sunk p-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode("password");
                setOtpStep("email");
                setOtpCode("");
                setError(null);
                setMessage(null);
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-sm px-3 py-2 text-xs font-semibold transition ${authMode === "password" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-card"}`}
              disabled={loading}
            >
              <FaLock className="h-3 w-3" />
              Password
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("otp");
                setStep("email");
                setPassword("");
                setConfirmPassword("");
                setError(null);
                setMessage(null);
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-sm px-3 py-2 text-xs font-semibold transition ${authMode === "otp" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-card"}`}
              disabled={loading}
            >
              <FaEnvelope className="h-3 w-3" />
              Email OTP
            </button>
          </div>

          <form
            className="space-y-3"
            onSubmit={
              twoFactorRequired
                ? handleValidateTwoFactor
                : authMode === "otp"
                ? otpStep === "email"
                  ? handleSendOtp
                  : handleVerifyOtp
                : step === "email"
                  ? handleContinueWithEmail
                  : step === "login"
                    ? handleLogin
                    : handleRegister
            }
          >
            {!twoFactorRequired ? (
              <>
                <label htmlFor="email" className="eyebrow block">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-sm border border-rule-strong bg-paper-card px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay disabled:bg-paper-sunk disabled:text-ink-faint"
                  disabled={loading || (authMode === "password" ? step !== "email" : otpStep === "code")}
                />
              </>
            ) : null}

            {!twoFactorRequired && (authMode === "password" ? step !== "email" : otpStep !== "email") ? (
              <button
                type="button"
                onClick={() => {
                  if (authMode === "password") {
                    setStep("email");
                  } else {
                    setOtpStep("email");
                    setOtpCode("");
                  }
                  setPassword("");
                  setConfirmPassword("");
                  setError(null);
                  setMessage(null);
                }}
                className="text-xs font-medium text-clay underline underline-offset-2 hover:text-ink"
                disabled={loading}
              >
                Use a different email
              </button>
            ) : null}

            {!twoFactorRequired && authMode === "password" && (step === "login" || step === "register") ? (
              <>
                <label htmlFor="password" className="eyebrow block">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-sm border border-rule-strong bg-paper-card px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                  disabled={loading}
                />
              </>
            ) : null}

            {!twoFactorRequired && authMode === "password" && step === "register" ? (
              <>
                <label htmlFor="confirm-password" className="eyebrow block">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Retype your password"
                  className="w-full rounded-sm border border-rule-strong bg-paper-card px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                  disabled={loading}
                />
              </>
            ) : null}

            {!twoFactorRequired && authMode === "otp" && otpStep === "code" ? (
              <>
                <label htmlFor="otp-code" className="eyebrow block">
                  One-time code
                </label>
                <input
                  id="otp-code"
                  type="text"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="w-full rounded-sm border border-rule-strong bg-paper-card px-3.5 py-3 font-mono text-base tracking-[0.4em] text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                  disabled={loading}
                  inputMode="numeric"
                />
              </>
            ) : null}

            {twoFactorRequired ? (
              <>
                <label htmlFor="two-factor-code" className="eyebrow block">
                  Authenticator or backup code
                </label>
                <input
                  id="two-factor-code"
                  type="text"
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value.trim().toUpperCase())}
                  placeholder="123456 or BACKUPCODE"
                  className="w-full rounded-sm border border-rule-strong bg-paper-card px-3.5 py-3 font-mono text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay"
                  disabled={loading}
                />
              </>
            ) : null}

            {error ? (
              <p className="rounded-sm border-l-2 border-signal-danger bg-clay-wash/60 px-3 py-2 text-sm text-signal-danger">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="rounded-sm border-l-2 border-rule-strong bg-paper-sunk px-3 py-2 text-sm text-ink-soft">
                {message}
              </p>
            ) : null}
            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-2 rounded-sm bg-ink px-4 py-3.5 text-sm font-medium text-paper transition hover:bg-clay disabled:opacity-60"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : twoFactorRequired
                  ? "Verify 2FA"
                : authMode === "otp"
                  ? otpStep === "email"
                    ? "Send login code"
                    : "Verify code"
                  : step === "email"
                    ? "Continue with email"
                    : step === "login"
                      ? "Login"
                      : "Create account"}
          </button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-faint">
            By continuing you agree to keep your documents tidy.
          </p>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-paper" />}>
      <LoginPageContent />
    </Suspense>
  );
}
