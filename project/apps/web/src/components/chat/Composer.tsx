'use client';

import { useRef } from 'react';
import type { DocumentVersion } from '@verity/core';

export function Composer({
  value,
  onChange,
  onSubmit,
  onUpload,
  attachments,
  onRemove,
  onOpen,
  onFiles,
  busy,
  working,
  disabled,
  onStop,
  replying,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onUpload: (files: File[]) => void;
  attachments: DocumentVersion[];
  onRemove: (id: string) => void;
  onOpen: (document: DocumentVersion) => void;
  onFiles: () => void;
  busy: boolean;
  working: boolean;
  disabled: boolean;
  onStop: () => void;
  replying: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      className="rounded-2xl border border-zinc-700 bg-zinc-800/80 p-3 shadow-xl shadow-black/10 focus-within:border-zinc-500"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {!!attachments.length && (
        <div className="mb-2 flex max-h-24 flex-wrap gap-2 overflow-auto">
          {attachments.map((file) => (
            <span
              key={file.id}
              className="flex max-w-full items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
            >
              <button
                type="button"
                className="max-w-48 truncate text-left hover:text-white"
                onClick={() => onOpen(file)}
                title={file.filename}
              >
                {file.filename}
              </button>
              {!replying && (
                <button
                  type="button"
                  aria-label={`Remove ${file.filename}`}
                  className="ml-1 px-1 text-zinc-500 hover:text-white"
                  onClick={() => onRemove(file.id)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <textarea
        aria-label="Message Verity"
        rows={3}
        maxLength={5000}
        className="max-h-48 min-h-20 w-full resize-y bg-transparent px-1 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          replying
            ? 'Reply to the agent…'
            : 'Tell me what to check. Mention which file is the policy and which is the quotation…'
        }
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (!disabled && !busy && !working && value.trim()) onSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            ref={input}
            type="file"
            multiple
            accept=".pdf,.csv,.xlsx"
            aria-label="Attach documents"
            className="sr-only"
            disabled={disabled || busy || replying || working}
            onChange={(event) => {
              onUpload(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <button
            type="button"
            aria-label="Upload documents"
            disabled={disabled || busy || replying || working}
            onClick={() => input.current?.click()}
            className="grid size-8 place-items-center rounded-lg text-xl text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:opacity-40"
          >
            ＋
          </button>
          <button
            type="button"
            disabled={disabled || busy || replying || working}
            onClick={onFiles}
            className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:opacity-40"
          >
            Files
          </button>
          <span className="hidden font-mono text-[10px] text-zinc-500 sm:inline">
            {busy ? 'Uploading…' : 'PDF · CSV · XLSX'}
          </span>
        </div>
        {working ? (
          <button
            type="button"
            aria-label="Stop task"
            onClick={onStop}
            className="grid size-9 place-items-center rounded-full bg-zinc-100 text-sm text-zinc-900 hover:bg-white"
          >
            ■
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send message"
            disabled={disabled || busy || !value.trim()}
            className="grid size-9 place-items-center rounded-full bg-zinc-100 text-lg text-zinc-900 hover:bg-white disabled:opacity-30"
          >
            ↑
          </button>
        )}
      </div>
    </form>
  );
}
