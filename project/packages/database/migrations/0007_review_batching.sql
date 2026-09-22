ALTER TABLE review_runs ADD COLUMN batching_version integer NOT NULL DEFAULT 1;
ALTER TABLE review_runs ALTER COLUMN batching_version SET DEFAULT 2;
