ALTER TABLE document_versions ADD COLUMN format text NOT NULL DEFAULT 'pdf'
  CHECK (format IN ('pdf', 'csv', 'xlsx'));

CREATE TABLE document_extractions (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL UNIQUE REFERENCES document_versions(id),
  parser_version text NOT NULL DEFAULT 'verity-extraction-v1',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  warnings jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE evidence_units (
  id uuid PRIMARY KEY,
  extraction_id uuid NOT NULL REFERENCES document_extractions(id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pdf_page', 'sheet_rows')),
  locator jsonb NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]',
  UNIQUE (extraction_id, ordinal)
);

CREATE TABLE evidence_blocks (
  id uuid PRIMARY KEY,
  unit_id uuid NOT NULL REFERENCES evidence_units(id),
  ordinal integer NOT NULL,
  text text NOT NULL,
  anchor jsonb NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED,
  UNIQUE (unit_id, ordinal)
);
CREATE INDEX evidence_blocks_search_idx ON evidence_blocks USING gin(search_vector);
CREATE INDEX document_extractions_queue_idx ON document_extractions(status, lease_until);

INSERT INTO document_extractions (id, document_id)
SELECT gen_random_uuid(), id FROM document_versions;
