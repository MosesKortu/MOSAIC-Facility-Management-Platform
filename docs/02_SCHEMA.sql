-- MOSAIC reference schema (PostgreSQL 16+) — GENERATED, do not edit.
-- Source of truth: apps/api/migrations/*.up.sql. Regenerate with `pnpm schema:doc`;
-- a test fails if this file is out of date.

-- ═══ 0001_initial_schema ═══
-- 0001 — MOSAIC V2 initial schema (PostgreSQL 16+).
-- Greenfield: the V2 additions from docs/08_IMPLEMENTATION_CONTRACT.md (auditor role, user_type,
-- groups, sponsors, grant group allocations, bookings.allocation_id) are part of the initial
-- schema rather than ALTERs, because no V1 production database exists to migrate from.
-- Decisions referenced as D# are in docs/09_ARCHITECTURE.md §1.

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- equipment_id = + slot_range && in one exclusion constraint

-- ─── Enums ──────────────────────────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('standard_user', 'super_user', 'admin', 'auditor');
CREATE TYPE user_type AS ENUM ('internal', 'external');      -- identity classification, not authorization
CREATE TYPE facility_code AS ENUM ('NFL', 'NCL', 'SLN');
CREATE TYPE booking_status AS ENUM ('confirmed', 'active', 'completed', 'cancelled');
CREATE TYPE support_tier AS ENUM ('none', 'technician', 'supervisor');
CREATE TYPE equipment_status AS ENUM ('operational', 'maintenance', 'offline');
CREATE TYPE practical_status AS ENUM ('not_requested', 'pending', 'signed_off', 'rejected');
CREATE TYPE session_event_state AS ENUM ('authorizing', 'active', 'fault', 'completed');
CREATE TYPE session_event_source AS ENUM ('relay', 'user', 'system');

-- ─── People ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sso_identifier VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'standard_user',
    user_type user_type NOT NULL DEFAULT 'internal',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Externals are researchers only; staff/admin/auditor roles are internal by definition.
    CONSTRAINT users_external_is_standard CHECK (user_type = 'internal' OR role = 'standard_user')
);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_user_type ON users (user_type);
CREATE INDEX idx_users_is_active ON users (is_active);

-- D9: every external collaborator has exactly one internal sponsor.
CREATE TABLE external_user_sponsors (
    external_user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    sponsor_user_id UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (external_user_id <> sponsor_user_id)
);
CREATE INDEX idx_external_user_sponsors_sponsor ON external_user_sponsors (sponsor_user_id);

CREATE FUNCTION check_external_user_sponsor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT user_type FROM users WHERE user_id = NEW.external_user_id) <> 'external' THEN
        RAISE EXCEPTION 'sponsored user % must be external', NEW.external_user_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF (SELECT user_type FROM users WHERE user_id = NEW.sponsor_user_id) <> 'internal' THEN
        RAISE EXCEPTION 'sponsor % must be internal', NEW.sponsor_user_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER external_user_sponsors_types
    BEFORE INSERT OR UPDATE ON external_user_sponsors
    FOR EACH ROW EXECUTE FUNCTION check_external_user_sponsor();

CREATE TABLE groups (
    group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX groups_name_unique_active ON groups (LOWER(name)) WHERE is_active = true;

-- A user may belong to several groups; deactivating a membership keeps its history.
CREATE TABLE group_memberships (
    group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_group_memberships_user ON group_memberships (user_id);
CREATE INDEX idx_group_memberships_group ON group_memberships (group_id);

-- ─── Funding ────────────────────────────────────────────────────────────────────────────────────
-- D7: remaining_balance = allocated_budget − Σ consumed across all allocations. It is changed only
-- by the booking/cancellation transactions, together with the allocation balance.
CREATE TABLE grants (
    grant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_code VARCHAR(100) UNIQUE NOT NULL,
    pi_user_id UUID NOT NULL REFERENCES users(user_id),
    allocated_budget NUMERIC(12, 2) NOT NULL,
    remaining_balance NUMERIC(12, 2) NOT NULL,
    expiration_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (allocated_budget >= 0),
    CHECK (remaining_balance >= 0 AND remaining_balance <= allocated_budget)
);
CREATE INDEX idx_grants_pi_user ON grants (pi_user_id);
CREATE INDEX idx_grants_expiration_date ON grants (expiration_date);

-- "How much of this grant is available to this group?" — not a duplicate grant.
CREATE TABLE grant_group_allocations (
    allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id UUID NOT NULL REFERENCES grants(grant_id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE RESTRICT,
    allocated_amount NUMERIC(12, 2) NOT NULL,
    remaining_balance NUMERIC(12, 2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (grant_id, group_id),
    UNIQUE (allocation_id, grant_id),  -- target of the bookings composite FK below
    CHECK (allocated_amount >= 0),
    CHECK (remaining_balance >= 0),
    CHECK (remaining_balance <= allocated_amount)
);
CREATE INDEX idx_grant_group_allocations_grant ON grant_group_allocations (grant_id);
CREATE INDEX idx_grant_group_allocations_group ON grant_group_allocations (group_id);

-- Backstop for Σ allocations ≤ grant budget. The service enforces it under a grant row lock
-- (the trigger alone cannot see concurrent uncommitted inserts).
CREATE FUNCTION check_grant_not_over_allocated() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target_grant UUID := NEW.grant_id;  -- both grants and grant_group_allocations carry grant_id
BEGIN
    IF (SELECT COALESCE(SUM(allocated_amount), 0) FROM grant_group_allocations WHERE grant_id = target_grant)
       > (SELECT allocated_budget FROM grants WHERE grant_id = target_grant) THEN
        RAISE EXCEPTION 'allocations exceed budget of grant %', target_grant
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER grant_group_allocations_within_budget
    AFTER INSERT OR UPDATE ON grant_group_allocations
    FOR EACH ROW EXECUTE FUNCTION check_grant_not_over_allocated();
CREATE CONSTRAINT TRIGGER grants_budget_covers_allocations
    AFTER UPDATE OF allocated_budget ON grants
    FOR EACH ROW EXECUTE FUNCTION check_grant_not_over_allocated();

-- ─── Equipment ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE equipment (
    equipment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    facility facility_code NOT NULL,
    name JSONB NOT NULL,         -- {"en": …, "es": …, "ca": …}; "en" required as the fallback
    description JSONB NOT NULL,
    base_rate_hourly NUMERIC(10, 2) NOT NULL,
    buffer_time_minutes INT NOT NULL DEFAULT 30,
    -- NULL = certifications for this instrument never expire; otherwise expires_at is set to
    -- sign-off time + this many months.
    certification_validity_months INT,
    interlock_ip VARCHAR(45),
    interlock_mqtt_topic VARCHAR(255),
    status equipment_status NOT NULL DEFAULT 'operational',
    is_active BOOLEAN NOT NULL DEFAULT true,  -- false = retired: 404 "no longer available"
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (name ? 'en' AND description ? 'en'),
    CHECK (base_rate_hourly >= 0),
    CHECK (buffer_time_minutes >= 0),
    CHECK (certification_validity_months IS NULL OR certification_validity_months > 0)
);
CREATE INDEX idx_equipment_facility ON equipment (facility);
CREATE INDEX idx_equipment_status ON equipment (status);

-- D8: weekly bookable windows in facility-local time (FACILITY_TIMEZONE). weekday is ISO 1=Mon…7=Sun.
-- Non-overlap between windows of the same equipment/weekday is validated by the service.
CREATE TABLE equipment_availability_windows (
    window_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES equipment(equipment_id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    opens_at TIME NOT NULL,
    closes_at TIME NOT NULL,
    CHECK (closes_at > opens_at),
    UNIQUE (equipment_id, weekday, opens_at)
);
CREATE INDEX idx_equipment_availability_windows_equipment ON equipment_availability_windows (equipment_id);

CREATE TABLE support_tariffs (
    tariff_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier support_tier UNIQUE NOT NULL,
    rate_hourly NUMERIC(10, 2) NOT NULL CHECK (rate_hourly >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,  -- false → SUPPORT_UNAVAILABLE for new bookings
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (tier <> 'none' OR (rate_hourly = 0 AND is_available))
);
-- Reference tariffs from the V1 schema; admin-managed afterwards (every change is audited).
INSERT INTO support_tariffs (tier, rate_hourly) VALUES
    ('none', 0.00),
    ('technician', 40.00),
    ('supervisor', 60.00);

-- ─── Training & certification ───────────────────────────────────────────────────────────────────
CREATE TABLE training_modules (
    module_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL UNIQUE REFERENCES equipment(equipment_id) ON DELETE CASCADE,
    sop_document_url TEXT NOT NULL,
    -- [{ "question_id": int, "prompt": text, "options": [text], "correct_option": int }]
    -- correct_option is never sent to clients.
    quiz_schema JSONB NOT NULL,
    passing_score INT NOT NULL DEFAULT 80 CHECK (passing_score BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_certifications (
    cert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES equipment(equipment_id) ON DELETE CASCADE,
    theoretical_passed BOOLEAN NOT NULL DEFAULT false,
    theoretical_score INT CHECK (theoretical_score BETWEEN 0 AND 100),  -- latest attempt
    theoretical_passed_at TIMESTAMPTZ,
    practical_status practical_status NOT NULL DEFAULT 'not_requested',
    practical_requested_at TIMESTAMPTZ,
    practical_signed_off_at TIMESTAMPTZ,
    practical_rejected_at TIMESTAMPTZ,
    practical_rejection_reason TEXT,
    evaluated_by UUID REFERENCES users(user_id),
    expires_at TIMESTAMPTZ,
    UNIQUE (user_id, equipment_id),
    CHECK (practical_status <> 'rejected' OR length(trim(practical_rejection_reason)) > 0),
    CHECK (practical_status <> 'signed_off' OR (theoretical_passed AND practical_signed_off_at IS NOT NULL))
);
CREATE INDEX idx_user_certifications_equipment ON user_certifications (equipment_id);
CREATE INDEX idx_user_certifications_pending ON user_certifications (practical_requested_at)
    WHERE practical_status = 'pending';

-- ─── Bookings ───────────────────────────────────────────────────────────────────────────────────
-- user_id = beneficiary (gates are evaluated against them); booked_by_user_id = actor. They differ
-- only for super_user/admin proxy bookings, which are audited.
CREATE TABLE bookings (
    booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES equipment(equipment_id),
    user_id UUID NOT NULL REFERENCES users(user_id),
    booked_by_user_id UUID NOT NULL REFERENCES users(user_id),
    grant_id UUID NOT NULL REFERENCES grants(grant_id),
    allocation_id UUID NOT NULL,
    support_requested support_tier NOT NULL DEFAULT 'none',
    slot_range TSTZRANGE NOT NULL,
    status booking_status NOT NULL DEFAULT 'confirmed',
    calculated_base_cost NUMERIC(10, 2) NOT NULL CHECK (calculated_base_cost >= 0),
    calculated_support_cost NUMERIC(10, 2) NOT NULL CHECK (calculated_support_cost >= 0),
    total_cost NUMERIC(10, 2) GENERATED ALWAYS AS (calculated_base_cost + calculated_support_cost) STORED,
    force_override BOOLEAN NOT NULL DEFAULT false,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES users(user_id),
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The consumed allocation must belong to the booking's grant.
    FOREIGN KEY (allocation_id, grant_id) REFERENCES grant_group_allocations (allocation_id, grant_id),
    CHECK (NOT isempty(slot_range) AND lower_inc(slot_range) AND NOT upper_inc(slot_range)),
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)),
    EXCLUDE USING gist (equipment_id WITH =, slot_range WITH &&) WHERE (status <> 'cancelled')
);
CREATE INDEX idx_bookings_user ON bookings (user_id);
CREATE INDEX idx_bookings_grant ON bookings (grant_id);
CREATE INDEX idx_bookings_allocation ON bookings (allocation_id);
CREATE INDEX idx_bookings_status ON bookings (status);
CREATE INDEX idx_bookings_created_at ON bookings (created_at);
-- Reporting scans by period across all equipment (the exclusion index leads with equipment_id).
CREATE INDEX idx_bookings_slot_range ON bookings USING gist (slot_range);

-- ─── Operational history ────────────────────────────────────────────────────────────────────────
CREATE TABLE equipment_status_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES equipment(equipment_id) ON DELETE CASCADE,
    previous_status equipment_status NOT NULL,
    new_status equipment_status NOT NULL,
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    changed_by UUID NOT NULL REFERENCES users(user_id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (previous_status <> new_status)
);
CREATE INDEX idx_equipment_status_events_equipment ON equipment_status_events (equipment_id, changed_at);
CREATE INDEX idx_equipment_status_events_changed_at ON equipment_status_events (changed_at);

CREATE TABLE session_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    state session_event_state NOT NULL,
    source session_event_source NOT NULL,
    detail TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_session_events_booking ON session_events (booking_id, occurred_at);
CREATE INDEX idx_session_events_occurred_at ON session_events (occurred_at);

-- ─── Audit & notifications ──────────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NOT NULL REFERENCES users(user_id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_log_actor ON audit_log (actor_user_id);
CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at);

-- Append-only: no application workflow may rewrite history. (Production additionally grants the
-- application role only INSERT/SELECT on this table.)
CREATE FUNCTION reject_audit_log_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_log_append_only
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();

-- In-app only (no email/push without approval).
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);

-- ═══ 0002_audit_log_sequence ═══
-- 0002 — deterministic audit ordering.
-- created_at defaults to the transaction start, so several events written by one transaction share
-- a timestamp. seq records the exact order in which events were appended.
ALTER TABLE audit_log ADD COLUMN seq BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX idx_audit_log_seq ON audit_log (seq);
