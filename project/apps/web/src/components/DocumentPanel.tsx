import { useRef } from 'react';
import type { DocumentVersion } from '@verity/core';
import { Button } from './Button';

interface DocumentPanelProps {
  documents: DocumentVersion[];
  selectedId?: string;
  canUpload: boolean;
  loading: boolean;
  uploading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onUpload: (file: File) => Promise<void>;
  onSelect: (document: DocumentVersion) => void;
  onLoadMore: () => Promise<void>;
}

export function DocumentPanel(props: DocumentPanelProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <aside
      className="flex flex-col border-b border-stone-200 p-5 md:border-r md:border-b-0"
      aria-label="Documents"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Documents</h2>
        <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">
          {props.documents.length}
          {props.hasMore ? '+' : ''}
        </span>
      </div>
      <p className="mt-2 mb-5 text-xs text-stone-500">
        Upload digital PDFs to get started.
      </p>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".pdf,application/pdf"
        aria-label="Choose PDF"
        disabled={!props.canUpload || props.uploading || props.loadingMore}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file)
            void props.onUpload(file).finally(() => {
              if (input.current) input.current.value = '';
            });
        }}
      />
      <Button
        variant="primary"
        className="w-full py-3"
        disabled={!props.canUpload || props.uploading || props.loadingMore}
        onClick={() => input.current?.click()}
      >
        {props.uploading ? 'Uploading…' : '+ Upload PDF'}
      </Button>
      <p className="mt-2 mb-6 text-center text-[10px] text-stone-400">
        One PDF at a time · Up to 20 MiB
      </p>
      {props.loading ? (
        <p role="status" className="px-1 py-4 text-xs leading-6 text-stone-500">
          Connecting to your workspace…
        </p>
      ) : props.documents.length === 0 ? (
        <p className="px-1 py-4 text-xs leading-6 text-stone-400">
          Your uploaded documents will appear here.
        </p>
      ) : (
        <ul className="-mx-2 max-h-60 space-y-1 overflow-auto md:max-h-125">
          {props.documents.map((document) => (
            <li key={document.id}>
              <button
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-emerald-700 ${props.selectedId === document.id ? 'border-emerald-100 bg-emerald-50/70' : 'border-transparent hover:bg-stone-50'}`}
                aria-pressed={props.selectedId === document.id}
                onClick={() => props.onSelect(document)}
              >
                <span className="shrink-0 rounded border border-amber-200/60 bg-amber-50/50 px-1.5 pt-3 pb-1 text-[8px] font-semibold text-amber-800/70">
                  PDF
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <strong className="text-xs font-medium wrap-anywhere">
                    {document.filename}
                  </strong>
                  <span className="text-[10px] text-stone-500">
                    {document.pageCount}{' '}
                    {document.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                    {(document.byteSize / 1024).toFixed(0)} KB
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {props.hasMore && (
        <Button
          variant="quiet"
          disabled={props.loadingMore || props.uploading}
          onClick={() => void props.onLoadMore()}
        >
          {props.loadingMore ? 'Loading…' : 'Load more documents'}
        </Button>
      )}
      <p className="mt-auto pt-7 text-[10px] leading-5 text-stone-400">
        <span className="mr-2 inline-block size-1.5 rounded-full bg-emerald-700/50" />
        Original files are preserved. Uploading does not run a review.
      </p>
    </aside>
  );
}
