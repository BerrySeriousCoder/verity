ALTER TABLE review_runs ADD COLUMN roles_resolved boolean NOT NULL DEFAULT true;
ALTER TABLE review_runs ADD COLUMN messages jsonb NOT NULL DEFAULT '[]';
ALTER TABLE review_runs DROP CONSTRAINT review_runs_status_check;
ALTER TABLE review_runs ADD CONSTRAINT review_runs_status_check CHECK (status IN ('queued','running','needs_context','needs_scope','needs_input','completed','failed','cancelled'));

CREATE TABLE review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES review_runs(id),
  kind text NOT NULL CHECK (kind IN ('user','assistant','assistant_delta','tool_start','tool_result','step_start','step_result','status')),
  call_id text,
  title text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_events_run_cursor ON review_events(run_id,id);

INSERT INTO review_events(run_id,kind,title,data,created_at)
SELECT id,'user','User message',jsonb_build_object('text',task),created_at FROM review_runs;
