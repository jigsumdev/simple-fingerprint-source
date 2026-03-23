-- Precision Scanner: identity persistence schema

CREATE TABLE IF NOT EXISTS observations (
  observation_id    TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL,
  raw_json          TEXT NOT NULL,
  normalized_json   TEXT NOT NULL,
  core_fingerprint  TEXT NOT NULL,
  extended_fingerprint TEXT NOT NULL,
  matched_cluster_id TEXT,
  comparison_json   TEXT
);

CREATE INDEX IF NOT EXISTS idx_observations_core_fp
  ON observations (core_fingerprint);

CREATE INDEX IF NOT EXISTS idx_observations_extended_fp
  ON observations (extended_fingerprint);

CREATE INDEX IF NOT EXISTS idx_observations_cluster
  ON observations (matched_cluster_id);

CREATE INDEX IF NOT EXISTS idx_observations_created
  ON observations (created_at);

CREATE TABLE IF NOT EXISTS identity_clusters (
  cluster_id                    TEXT PRIMARY KEY,
  first_seen_at                 TEXT NOT NULL,
  last_seen_at                  TEXT NOT NULL,
  latest_core_fingerprint       TEXT NOT NULL,
  representative_normalized_json TEXT NOT NULL,
  observation_count             INTEGER NOT NULL DEFAULT 1,
  confidence_level              TEXT NOT NULL DEFAULT 'low'
);

CREATE INDEX IF NOT EXISTS idx_clusters_core_fp
  ON identity_clusters (latest_core_fingerprint);

CREATE TABLE IF NOT EXISTS cluster_membership (
  cluster_id      TEXT NOT NULL,
  observation_id  TEXT NOT NULL,
  match_score     REAL NOT NULL,
  classification  TEXT NOT NULL,
  PRIMARY KEY (cluster_id, observation_id),
  FOREIGN KEY (cluster_id) REFERENCES identity_clusters (cluster_id),
  FOREIGN KEY (observation_id) REFERENCES observations (observation_id)
);
