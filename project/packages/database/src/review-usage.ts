import { Pool } from 'pg';
import { databaseUrl } from './config.js';

// Read-only local report. No model calls and no document text is printed.
const pool = new Pool({ connectionString: databaseUrl() });
try {
  const requested = process.argv.slice(2);
  if (requested.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))
    throw new Error('Usage: pnpm review:usage [run-uuid ...]');
  const runs = await pool.query(
    `SELECT id, status, batching_version, model_calls, input_tokens, output_tokens,
      cached_tokens, thought_tokens, metered_calls,
      round(extract(epoch FROM (updated_at-created_at))) AS elapsed_seconds
     FROM review_runs WHERE ($1::uuid[] IS NULL OR id=ANY($1::uuid[]))
     ORDER BY created_at DESC LIMIT 10`,
    [requested.length ? requested : null],
  );
  for (const run of runs.rows) {
    console.log('\nRun', run.id);
    console.table([run]);
    const stages = await pool.query(
      `SELECT CASE WHEN key LIKE 'v2/%' THEN split_part(key,'/',2)
        WHEN key LIKE 'relationships/%' THEN 'relationships/' || split_part(key,'/',2)
        ELSE split_part(key,'/',1) END AS stage,
        count(*)::int AS saved_responses,
        sum(input_tokens)::float8 AS input_tokens, sum(output_tokens)::float8 AS output_tokens,
        sum((usage_details->>'cachedTokens')::bigint)::float8 AS cached_tokens,
        sum((usage_details->>'thoughtTokens')::bigint)::float8 AS thought_tokens,
        count(*) FILTER (WHERE usage_details ? 'cachedTokens')::int AS cache_metered_responses,
        round(avg((usage_details->>'durationMs')::numeric))::float8 AS average_request_ms,
        count(*) FILTER (WHERE key LIKE '%/followup')::int AS followups
       FROM review_steps WHERE run_id=$1 AND model IS NOT NULL GROUP BY 1 ORDER BY sum(input_tokens) DESC`,
      [run.id],
    );
    console.table(stages.rows);
    const checks = await pool.query(
      `SELECT count(*)::int AS checks, count(*) FILTER (WHERE data->>'state'='done')::int AS processed,
        count(*) FILTER (WHERE data->'finding'->>'verified'='true' AND data->'finding'->>'status' IN ('aligned','different'))::int AS accepted_findings
       FROM review_checks WHERE run_id=$1 AND revision=(SELECT revision FROM review_runs WHERE id=$1)`,
      [run.id],
    );
    console.table(checks.rows);
  }
  console.log(
    'Token counts are not a bill or an accuracy score. Missing cache measurements are unknown, not zero. Thought tokens are reported separately; do not add them to output tokens without checking provider billing semantics. Elapsed time includes pauses. Compare completed runs with the same documents/scope and inspect correctness.',
  );
} finally {
  await pool.end();
}
