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
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center justify-center">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">
            Welcome to Docsyra
          </h1>
          <p className="mt-1 text-center text-sm text-slate-500">Sign in to continue</p>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleGoogleClick}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <FaGoogle className="h-4 w-4" />
              Continue with Google
            </button>

            <button
              type="button"
              onClick={handleGithubClick}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <FaGithub className="h-4 w-4" />
              Continue with GitHub
            </button>

            <button
              type="button"
              onClick={handlePasskeyLogin}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              disabled={passkeyLoading || loading || twoFactorRequired}
            >
              <FaKey className="h-4 w-4" />
              {passkeyLoading ? "Checking passkey..." : "Sign in with Passkey"}
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs uppercase tracking-wide text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAuthMode("password");
                setOtpStep("email");
                setOtpCode("");
                setError(null);
                setMessage(null);
              }}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${authMode === "password" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              disabled={loading}
            >
              <FaLock className="h-3 w-3" />
              Login with Password
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
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${authMode === "otp" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              disabled={loading}
            >
              <FaEnvelope className="h-3 w-3" />
              Login with Email OTP
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
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400"
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
                className="text-xs font-medium text-slate-500 underline underline-offset-2"
                disabled={loading}
              >
                Use a different email
              </button>
            ) : null}

            {!twoFactorRequired && authMode === "password" && (step === "login" || step === "register") ? (
              <>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400"
                  disabled={loading}
                />
              </>
            ) : null}

            {!twoFactorRequired && authMode === "password" && step === "register" ? (
              <>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Retype your password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400"
                  disabled={loading}
                />
              </>
            ) : null}

            {!twoFactorRequired && authMode === "otp" && otpStep === "code" ? (
              <>
                <label htmlFor="otp-code" className="block text-sm font-medium text-slate-700">
                  One-time code
                </label>
                <input
                  id="otp-code"
                  type="text"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400"
                  disabled={loading}
                  inputMode="numeric"
                />
              </>
            ) : null}

            {twoFactorRequired ? (
              <>
                <label htmlFor="two-factor-code" className="block text-sm font-medium text-slate-700">
                  Authenticator or backup code
                </label>
                <input
                  id="two-factor-code"
                  type="text"
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value.trim().toUpperCase())}
                  placeholder="123456 or BACKUPCODE"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400"
                  disabled={loading}
                />
              </>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
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
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 px-4 py-10" />}>
      <LoginPageContent />
    </Suspense>
  );
}
