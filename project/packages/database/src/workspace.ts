import type { Pool } from 'pg';

export const LOCAL_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';

export async function ensureLocalWorkspace(pool: Pool): Promise<void> {
  await pool.query(
    'INSERT INTO workspaces (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    [LOCAL_WORKSPACE_ID, 'My review workspace'],
  );
}
