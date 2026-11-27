-- Fresh installation only. No schema versions, upgrades, conversions or migration history.
-- Ironloom and OpenFGA own separate PostgreSQL schemas/databases.
CREATE SCHEMA ironloom;
CREATE TABLE ironloom.operators (
    operator_id text PRIMARY KEY CHECK (btrim(operator_id) <> '')
);
CREATE TABLE ironloom.installation (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    installation_id text NOT NULL UNIQUE CHECK (btrim(installation_id) <> ''),
    bootstrap_token_hash bytea,
    administrator_id text REFERENCES ironloom.operators,
    bootstrap_consumed_at timestamptz,
    grants_initialized_at timestamptz,
    CHECK ((administrator_id IS NULL) = (bootstrap_consumed_at IS NULL)),
    CHECK (administrator_id IS NULL OR bootstrap_token_hash IS NULL),
    CHECK (grants_initialized_at IS NULL OR administrator_id IS NOT NULL)
);
-- No replacement token or reopened bootstrap after administrator_id is fixed.
CREATE FUNCTION ironloom.preserve_bootstrap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'installation identity cannot be removed';
    END IF;
    IF NEW.installation_id IS DISTINCT FROM OLD.installation_id THEN
        RAISE EXCEPTION 'installation identity cannot be changed';
    END IF;
    IF OLD.administrator_id IS NOT NULL AND
       (NEW.administrator_id IS DISTINCT FROM OLD.administrator_id OR
        NEW.bootstrap_consumed_at IS DISTINCT FROM OLD.bootstrap_consumed_at OR
        NEW.bootstrap_token_hash IS NOT NULL) THEN
        RAISE EXCEPTION 'bootstrap already consumed';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_bootstrap BEFORE UPDATE OR DELETE ON ironloom.installation
FOR EACH ROW EXECUTE FUNCTION ironloom.preserve_bootstrap();
CREATE FUNCTION ironloom.prevent_installation_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'installation identity cannot be truncated';
END;
$$;
CREATE TRIGGER prevent_installation_truncate BEFORE TRUNCATE ON ironloom.installation
FOR EACH STATEMENT EXECUTE FUNCTION ironloom.prevent_installation_truncate();
CREATE TABLE ironloom.local_logins (
    operator_id text PRIMARY KEY REFERENCES ironloom.operators,
    username text NOT NULL UNIQUE CHECK (btrim(username) <> ''),
    password_hash text NOT NULL CHECK (btrim(password_hash) <> '')
);
CREATE TABLE ironloom.oidc_logins (
    issuer text NOT NULL,
    subject text NOT NULL,
    operator_id text NOT NULL REFERENCES ironloom.operators,
    PRIMARY KEY (issuer, subject)
);
CREATE TABLE ironloom.nodes (
    node_id text PRIMARY KEY,
    host_id text NOT NULL,
    approved_by text NOT NULL REFERENCES ironloom.operators,
    enrollment jsonb NOT NULL CHECK (jsonb_typeof(enrollment) = 'object')
);
CREATE TABLE ironloom.projects (
    project_id text PRIMARY KEY,
    owner_id text NOT NULL REFERENCES ironloom.operators,
    name text NOT NULL CHECK (btrim(name) <> ''),
    owner_node_id text REFERENCES ironloom.nodes,
    last_human_interaction_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ironloom.conversations (
    conversation_id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES ironloom.projects,
    archived boolean NOT NULL DEFAULT false,
    next_event_sequence numeric(20,0) NOT NULL DEFAULT 1
        CHECK (next_event_sequence BETWEEN 1 AND 18446744073709551615)
);
CREATE TABLE ironloom.commands (
    operator_id text NOT NULL REFERENCES ironloom.operators,
    command_id text NOT NULL,
    conversation_id text REFERENCES ironloom.conversations,
    payload_hash text NOT NULL,
    receipt jsonb CHECK (jsonb_typeof(receipt) = 'object'),
    PRIMARY KEY (operator_id, command_id),
    UNIQUE (operator_id, command_id, conversation_id)
);
CREATE TABLE ironloom.events (
    conversation_id text NOT NULL REFERENCES ironloom.conversations,
    sequence numeric(20,0) NOT NULL CHECK (sequence BETWEEN 1 AND 18446744073709551615),
    operator_id text NOT NULL,
    command_id text NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    PRIMARY KEY (conversation_id, sequence),
    FOREIGN KEY (operator_id, command_id, conversation_id) REFERENCES ironloom.commands (operator_id, command_id, conversation_id)
);
-- Transactional dispatch/notification outbox; delivery does not prove execution termination.
CREATE TABLE ironloom.outbox (
    conversation_id text NOT NULL,
    sequence numeric(20,0) NOT NULL,
    delivered_at timestamptz,
    PRIMARY KEY (conversation_id, sequence),
    FOREIGN KEY (conversation_id, sequence) REFERENCES ironloom.events
);

-- Runtime records are validated using their owning crate contracts on every read/write boundary.
CREATE TABLE ironloom.records (
    kind text NOT NULL,
    record_id text NOT NULL,
    project_id text REFERENCES ironloom.projects,
    assignment_id text,
    revision numeric(20,0) NOT NULL CHECK (revision BETWEEN 1 AND 18446744073709551615),
    body jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, record_id)
);
CREATE INDEX records_scope ON ironloom.records(kind, project_id, assignment_id);
CREATE TABLE ironloom.sessions (
    session_id text PRIMARY KEY,
    operator_id text NOT NULL REFERENCES ironloom.operators,
    token_hash bytea NOT NULL UNIQUE,
    csrf_hash bytea NOT NULL,
    method text NOT NULL CHECK (method IN ('local','oidc')),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);
CREATE TABLE ironloom.oidc_attempts (
    state_hash bytea PRIMARY KEY,
    protected_context bytea NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE TABLE ironloom.credentials (
    credential_id text PRIMARY KEY,
    owner_id text NOT NULL REFERENCES ironloom.operators,
    protected_secret bytea NOT NULL,
    revision bigint NOT NULL DEFAULT 1,
    deleted_at timestamptz
);
CREATE TABLE ironloom.authorization_outbox (
    operation_id text PRIMARY KEY,
    body jsonb NOT NULL,
    completed_at timestamptz
);
CREATE TABLE ironloom.dispatch (
    assignment_id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES ironloom.projects,
    owner_node_id text NOT NULL REFERENCES ironloom.nodes,
    claim_node_id text,
    fence bigint NOT NULL DEFAULT 0,
    lease_expires_at timestamptz,
    state text NOT NULL,
    requires_reconciliation boolean NOT NULL DEFAULT false,
    body jsonb NOT NULL
);
CREATE TABLE ironloom.processes (
    process_id text PRIMARY KEY,
    assignment_id text NOT NULL REFERENCES ironloom.dispatch,
    node_id text NOT NULL REFERENCES ironloom.nodes,
    fence bigint NOT NULL,
    os_pid bigint,
    boot_identity text NOT NULL,
    state text NOT NULL,
    body jsonb NOT NULL
);
CREATE TABLE ironloom.file_owners (
    assignment_id text NOT NULL REFERENCES ironloom.dispatch,
    relative_path text NOT NULL,
    worker_id text NOT NULL,
    PRIMARY KEY (assignment_id, relative_path)
);
CREATE TABLE ironloom.resource_pools (
    device_id text PRIMARY KEY,
    physical_host_id text NOT NULL,
    hardware_key text NOT NULL,
    parent_id text REFERENCES ironloom.resource_pools,
    authority_id text NOT NULL,
    capacity_bytes numeric(20,0),
    headroom_bytes numeric(20,0) NOT NULL DEFAULT 0,
    external_bytes numeric(20,0),
    concurrency_limit bigint NOT NULL CHECK (concurrency_limit > 0),
    reconciled boolean NOT NULL DEFAULT false,
    UNIQUE (physical_host_id, hardware_key)
);
CREATE TABLE ironloom.resource_reservations (
    reservation_id text PRIMARY KEY,
    device_id text NOT NULL REFERENCES ironloom.resource_pools,
    node_id text NOT NULL REFERENCES ironloom.nodes,
    fence bigint NOT NULL,
    reserved_bytes numeric(20,0) NOT NULL CHECK (reserved_bytes > 0),
    active_requests bigint NOT NULL DEFAULT 0 CHECK (active_requests >= 0),
    concurrency bigint NOT NULL CHECK (concurrency > 0),
    residency_key text NOT NULL,
    last_used_at timestamptz NOT NULL DEFAULT now(),
    lease_expires_at timestamptz NOT NULL,
    reconciled boolean NOT NULL DEFAULT false,
    UNIQUE (device_id, residency_key)
);
CREATE TABLE ironloom.usage (
    inference_id text PRIMARY KEY,
    assignment_id text NOT NULL REFERENCES ironloom.dispatch,
    project_id text NOT NULL REFERENCES ironloom.projects,
    revision bigint NOT NULL,
    reserved_micros numeric(20,0) NOT NULL DEFAULT 0,
    usage jsonb,
    settled boolean NOT NULL DEFAULT false
);
CREATE TABLE ironloom.audit (
    audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id text REFERENCES ironloom.operators,
    project_id text REFERENCES ironloom.projects,
    operation text NOT NULL,
    body jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);
