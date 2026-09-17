export function EmptyViewer() {
  return (
    <section className="flex min-h-110 flex-col items-center justify-center bg-linear-to-br from-white to-stone-50 px-6 py-16 text-center">
      <div
        className="mb-10 -rotate-6 rounded-lg border border-stone-200 bg-white px-5 py-7 shadow-lg shadow-stone-200/50"
        aria-hidden="true"
      >
        <div className="mb-3 h-1 w-11 rounded bg-emerald-900/20" />
        <div className="mb-3 h-1 w-11 rounded bg-stone-200" />
        <div className="mb-3 h-1 w-11 rounded bg-stone-200" />
        <div className="h-1 w-7 rounded bg-stone-200" />
      </div>
      <span className="text-[10px] font-semibold tracking-widest text-stone-400">
        A CLEAR VIEW OF THE ORIGINAL
      </span>
      <h2 className="mt-4 mb-3 font-serif text-3xl tracking-tight text-stone-700">
        Your documents, in focus.
      </h2>
      <p className="text-xs leading-6 text-stone-500">
        Upload a policy, quotation, or supporting PDF.
        <br />
        Select a document to explore its pages here.
      </p>
      <div className="mt-8 flex gap-5 text-[10px] text-stone-400">
        <span>Original PDF</span>
        <span>Page navigation</span>
        <span>Zoom controls</span>
      </div>
    </section>
  );
}
