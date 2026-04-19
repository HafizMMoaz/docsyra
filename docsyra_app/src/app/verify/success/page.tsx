export default function VerifySuccessPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center justify-center px-6 py-16">
      <section className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-emerald-900">Email verified</h1>
        <p className="mt-3 text-sm text-emerald-800">
          Your account is now verified. You can continue to your dashboard.
        </p>
        <a
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          Open Dashboard
        </a>
      </section>
    </main>
  );
}
