CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  owner_hash TEXT NOT NULL,
  study TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('participant','qa')),
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 32),
  consent_version TEXT NOT NULL,
  created INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX participant_slots ON sessions(study,slot) WHERE mode='participant' AND active=1;
--> statement-breakpoint
CREATE TABLE answers (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  seq INTEGER NOT NULL CHECK (seq BETWEEN 0 AND 63),
  response_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK(choice IN ('left','right','tie','unsure','technical')),
  telemetry TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  recorded INTEGER NOT NULL,
  PRIMARY KEY (session_id,seq),
  UNIQUE (session_id,response_id)
);
