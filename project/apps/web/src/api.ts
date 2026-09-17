import type {
  DocumentVersion,
  ExtractionSummary,
  EvidenceBlock,
  ResolvedEvidence,
  ReviewRun,
  ReviewDetail,
  ReviewScope,
} from '@verity/core';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    const body: unknown = await response.json().catch(() => null);
    if (
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof body.message === 'string'
    )
      message = body.message;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  reviews: (workspaceId: string) =>
    request<{ runs: ReviewRun[] }>(`/api/workspaces/${workspaceId}/reviews`),
  review: (workspaceId: string, id: string) =>
    request<ReviewDetail>(`/api/workspaces/${workspaceId}/reviews/${id}`),
  createReview: (
    workspaceId: string,
    input: { policyId: string; quotationIds: string[]; task: string },
  ) =>
    request<{ run: ReviewRun }>(`/api/workspaces/${workspaceId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  scope: (workspaceId: string, id: string, scope: ReviewScope) =>
    request(`/api/workspaces/${workspaceId}/reviews/${id}/scope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scope),
    }),
  answer: (workspaceId: string, id: string, answers: Record<string, string>) =>
    request(`/api/workspaces/${workspaceId}/reviews/${id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    }),
  control: (workspaceId: string, id: string, action: 'cancel' | 'retry') =>
    request(`/api/workspaces/${workspaceId}/reviews/${id}/${action}`, {
      method: 'POST',
    }),
  evidence: (workspaceId: string, id: string) =>
    request<ResolvedEvidence>(`/api/workspaces/${workspaceId}/evidence/${id}`),
  extraction: (document: DocumentVersion) =>
    request<ExtractionSummary>(
      `/api/workspaces/${document.workspaceId}/documents/${document.id}/extraction`,
    ),
  retryExtraction: (document: DocumentVersion) =>
    request<{ queued: boolean }>(
      `/api/workspaces/${document.workspaceId}/documents/${document.id}/extraction/retry`,
      { method: 'POST' },
    ),
  blocks: (workspaceId: string, unitId: string, offset = 0) =>
    request<{ blocks: EvidenceBlock[]; hasMore: boolean }>(
      `/api/workspaces/${workspaceId}/units/${unitId}?offset=${offset}`,
    ),
  search: (document: DocumentVersion, query: string, offset = 0) =>
    request<{ blocks: ResolvedEvidence[]; hasMore: boolean }>(
      `/api/workspaces/${document.workspaceId}/search?documentId=${document.id}&q=${encodeURIComponent(query)}&offset=${offset}`,
    ),
  workspace: () => request<{ id: string; name: string }>('/api/workspace'),
  documents: (workspaceId: string, offset = 0) =>
    request<{ documents: DocumentVersion[]; hasMore: boolean }>(
      `/api/workspaces/${workspaceId}/documents?offset=${offset}&limit=50`,
    ),
  upload: async (workspaceId: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<{ document: DocumentVersion }>(
      `/api/workspaces/${workspaceId}/documents`,
      { method: 'POST', body },
    );
  },
  fileUrl: (document: DocumentVersion) =>
    `/api/workspaces/${document.workspaceId}/documents/${document.id}/file`,
};
