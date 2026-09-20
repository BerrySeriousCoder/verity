ALTER TABLE review_runs ADD COLUMN engine_version integer NOT NULL DEFAULT 1;
ALTER TABLE review_runs ALTER COLUMN engine_version SET DEFAULT 2;
CREATE TABLE review_work_items (
 run_id uuid NOT NULL REFERENCES review_runs(id),
 revision integer NOT NULL,
 id text NOT NULL,
 title text NOT NULL,
 role text NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','completed','failed','retry_wait')),
 lease_token uuid,
 attempt integer NOT NULL DEFAULT 0,
 error text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(run_id,revision,id)
);
CREATE TABLE review_checks (
 run_id uuid NOT NULL REFERENCES review_runs(id),
 revision integer NOT NULL,
 id text NOT NULL,
 data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(run_id,revision,id)
);
CREATE INDEX review_checks_run ON review_checks(run_id,revision);
