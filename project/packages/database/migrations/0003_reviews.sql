CREATE TABLE review_runs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  policy_id uuid NOT NULL REFERENCES document_versions(id),
  quotation_ids uuid[] NOT NULL,
  task text NOT NULL,
  scope jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','needs_scope','needs_input','completed','failed','cancelled')),
  phase text NOT NULL DEFAULT 'Preparing sources',
  error text,
  revision integer NOT NULL DEFAULT 0,
  answers jsonb NOT NULL DEFAULT '{}',
  report jsonb,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  model_calls integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  reviewer_model text NOT NULL,
  auditor_model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_queue_idx ON review_runs(status, created_at);
CREATE TABLE review_steps (
  run_id uuid NOT NULL REFERENCES review_runs(id),
  key text NOT NULL,
  output jsonb NOT NULL,
  role text NOT NULL,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id,key)
);
