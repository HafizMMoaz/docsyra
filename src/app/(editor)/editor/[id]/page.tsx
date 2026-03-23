type EditorPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditorPage({ params }: EditorPageProps) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <input
            type="text"
            defaultValue={`Untitled Document ${id}`}
            className="w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2 text-base font-medium outline-none transition placeholder:text-slate-400 focus:border-slate-400"
            aria-label="Document title"
          />

          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Save
          </button>
        </header>

        <section className="flex-1 p-4 md:p-6">
          <textarea
            placeholder="Start writing..."
            className="min-h-100 w-full resize-none rounded-xl border border-slate-300 bg-white p-4 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
          />
        </section>
      </div>
    </main>
  );
}
