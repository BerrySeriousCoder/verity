export function databaseUrl(): string {
  const configured = process.env['DATABASE_URL'];
  if (configured) return configured;
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('DATABASE_URL must be set in production.');
  }
  return 'postgresql://verity:verity_local_only@127.0.0.1:55432/verity';
}
