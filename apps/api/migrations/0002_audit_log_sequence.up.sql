-- 0002 — deterministic audit ordering.
-- created_at defaults to the transaction start, so several events written by one transaction share
-- a timestamp. seq records the exact order in which events were appended.
ALTER TABLE audit_log ADD COLUMN seq BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX idx_audit_log_seq ON audit_log (seq);
