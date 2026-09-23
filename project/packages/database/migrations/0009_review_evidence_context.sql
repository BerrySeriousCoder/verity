-- Keep existing run checkpoints and layouts intact.
ALTER TABLE review_runs ALTER COLUMN batching_version SET DEFAULT 4;
