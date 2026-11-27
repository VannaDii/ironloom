-- Ironloom owns this schema. OpenFGA owns its separate PostgreSQL database/migrations.
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
    conversation_id text NOT NULL REFERENCES ironloom.conversations,
    payload_hash text NOT NULL,
    receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
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
