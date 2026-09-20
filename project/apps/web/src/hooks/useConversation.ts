'use client';

import { useEffect, useState } from 'react';
import type { ReviewDetail, ReviewEvent } from '@verity/core';

export function useConversation(
  workspaceId: string | undefined,
  runId: string | null,
  generation = 0,
) {
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    setEvents([]);
    setDetail(null);
    setConnected(false);
    if (!workspaceId || !runId) return;
    const seen = new Set<string>();
    const source = new EventSource(
      `/api/workspaces/${workspaceId}/reviews/${runId}/events`,
    );
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener('activity', (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as ReviewEvent;
      if (!seen.has(event.id)) {
        seen.add(event.id);
        setEvents((current) => [...current, event]);
      }
    });
    source.addEventListener('snapshot', (message: MessageEvent<string>) => {
      const next = JSON.parse(message.data) as ReviewDetail;
      setDetail(next);
    });
    source.addEventListener('end', () => {
      source.close();
      setConnected(false);
    });
    return () => source.close();
  }, [workspaceId, runId, generation]);
  return { events, detail, connected };
}
