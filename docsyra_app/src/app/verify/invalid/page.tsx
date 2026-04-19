export default function VerifyInvalidPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center justify-center px-6 py-16">
      <section className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-amber-900">Verification link is invalid</h1>
        <p className="mt-3 text-sm text-amber-800">
          This link may be expired or already used. Request a new verification email from Settings.
        </p>
        <a
          href="/dashboard/settings"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
        >
          Go to Settings
        </a>
      </section>
    </main>
  );
}
