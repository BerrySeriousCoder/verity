import type { DocumentVersion } from '@verity/core';

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
