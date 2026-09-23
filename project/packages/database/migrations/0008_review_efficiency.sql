-- Existing runs keep their execution layout and checkpoints.
ALTER TABLE review_runs ALTER COLUMN batching_version SET DEFAULT 3;
ALTER TABLE review_runs ADD COLUMN cached_tokens bigint NOT NULL DEFAULT 0;
ALTER TABLE review_runs ADD COLUMN thought_tokens bigint NOT NULL DEFAULT 0;
ALTER TABLE review_runs ADD COLUMN metered_calls integer NOT NULL DEFAULT 0;
ALTER TABLE review_steps ADD COLUMN usage_details jsonb;
