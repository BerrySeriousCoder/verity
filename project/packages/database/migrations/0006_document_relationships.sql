ALTER TABLE review_runs ADD COLUMN policy_ids uuid[];
UPDATE review_runs SET policy_ids=ARRAY[policy_id];
ALTER TABLE review_runs ALTER COLUMN policy_ids SET NOT NULL;
ALTER TABLE review_runs ADD COLUMN document_relationships jsonb;
