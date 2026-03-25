"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type MouseEventHandler, useState } from "react";

export default function LoginPage() {
  const router = useRouter();

  const [step, setStep] = useState<"email" | "login" | "register">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function routeAfterAuth(status: string | null | undefined) {
    const nextPath = status === "active" ? "/dashboard" : "/onboarding";
    router.push(nextPath);
    router.refresh();
  }

  async function handleContinueWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    setError(null);

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

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        user?: { status?: string | null };
      };

      if (!response.ok || !data.success) {
        setError(data.error ?? "Login failed");
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

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
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

  const handleGoogleClick: MouseEventHandler<HTMLButtonElement> = () => {
    window.location.href = "/api/auth/google";
  };

  const handleGithubClick: MouseEventHandler<HTMLButtonElement> = () => {
    window.location.href = "/api/auth/github";
  };

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
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Continue with Google
            </button>

            <button
              type="button"
              onClick={handleGithubClick}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Continue with GitHub
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs uppercase tracking-wide text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form className="space-y-3" onSubmit={step === "email" ? handleContinueWithEmail : step === "login" ? handleLogin : handleRegister}>
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
              disabled={loading || step !== "email"}
            />

            {step !== "email" ? (
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setConfirmPassword("");
                  setError(null);
                }}
                className="text-xs font-medium text-slate-500 underline underline-offset-2"
                disabled={loading}
              >
                Use a different email
              </button>
            ) : null}

            {step === "login" || step === "register" ? (
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

            {step === "register" ? (
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

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
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
