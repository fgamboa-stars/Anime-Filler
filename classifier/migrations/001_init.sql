CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------------------------------------

CREATE TABLE anime (
  id                  integer PRIMARY KEY,           -- AniList Media ID
  slug                text UNIQUE,
  title               text NOT NULL,
  format              text,
  source              text,
  status              text,
  season_year         integer,
  total_episodes      integer,
  genres              text[] NOT NULL DEFAULT '{}',
  tags                jsonb NOT NULL DEFAULT '[]',   -- [{ name, rank }]; series-level, per AniList
  studios             text[] NOT NULL DEFAULT '{}',
  characters          text[] NOT NULL DEFAULT '{}',
  related_anime_ids   integer[] NOT NULL DEFAULT '{}',
  franchise           text,
  season_label        text,
  franchise_order     integer,
  alternative_titles  text[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX anime_genres_idx ON anime USING gin (genres);
CREATE INDEX anime_tags_idx ON anime USING gin (tags jsonb_path_ops);

CREATE TABLE episodes (
  id                         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anime_id                   integer NOT NULL REFERENCES anime (id),
  number                     integer NOT NULL CHECK (number >= 0),
  title                      text,
  description                text,
  arc_name                   text,
  aired_at                   timestamptz,
  -- Hash of everything that influences a prediction. Unchanged hash means no rework on re-import.
  content_hash               text NOT NULL,
  -- Decision cache key: same inputs and same knowledge reuse the stored prediction.
  input_hash                 text,
  -- Denormalized from the current classification_history row, so filtering never needs a join.
  current_classification_id  integer,
  category                   text,
  confidence                 real,
  decision                   text,
  trust_level                text NOT NULL DEFAULT 'LOW' CHECK (trust_level IN ('HIGH', 'MEDIUM', 'LOW')),
  review_status              text NOT NULL DEFAULT 'UNREVIEWED' CHECK (review_status IN ('UNREVIEWED', 'APPROVED', 'OVERRIDDEN')),
  origin                     text CHECK (origin IN ('engine', 'human', 'import')),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anime_id, number)
);
CREATE INDEX episodes_category_idx ON episodes (category);
-- The review queue: predictions no human has looked at, paged by id.
CREATE INDEX episodes_review_queue_idx ON episodes (decision, id)
  WHERE review_status = 'UNREVIEWED' AND origin = 'engine';

CREATE TABLE episode_tags (
  episode_id  integer NOT NULL REFERENCES episodes (id),
  tag         text NOT NULL,
  source      text NOT NULL CHECK (source IN ('detector', 'manual')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (episode_id, tag)
);
CREATE INDEX episode_tags_tag_idx ON episode_tags (tag, episode_id);

CREATE TABLE episode_embeddings (
  episode_id    integer PRIMARY KEY REFERENCES episodes (id),
  model         text NOT NULL,
  content_hash  text NOT NULL,
  -- Denormalized so the index below can leave unreviewed predictions out of cross-series search entirely.
  anime_id      integer NOT NULL,
  trust_level   text NOT NULL,
  embedding     vector(384) NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Only trusted examples are searchable across series. A wrong prediction can't reach another show.
CREATE INDEX episode_embeddings_trusted_hnsw_idx ON episode_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)
  WHERE trust_level IN ('HIGH', 'MEDIUM');
CREATE INDEX episode_embeddings_anime_idx ON episode_embeddings (anime_id);

-- ---------------------------------------------------------------------------------------------------------
-- Rules and engine configuration: data, not code
-- ---------------------------------------------------------------------------------------------------------

CREATE TABLE classification_rules (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_name        text NOT NULL UNIQUE,
  target_category  text NOT NULL,
  score_value      real NOT NULL,
  enabled          boolean NOT NULL DEFAULT true,
  decisive         boolean NOT NULL DEFAULT false,
  condition        jsonb NOT NULL,
  explanation      text NOT NULL,
  -- Learned. score_value is never touched by the system.
  skill            real NOT NULL DEFAULT 0.5,
  high_fires       real NOT NULL DEFAULT 0,
  high_correct     real NOT NULL DEFAULT 0,
  medium_fires     real NOT NULL DEFAULT 0,
  medium_correct   real NOT NULL DEFAULT 0,
  last_updated     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tag_detectors (
  tag           text PRIMARY KEY,
  pattern       text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  last_updated  timestamptz NOT NULL DEFAULT now()
);

-- Single row. Every change bumps version, which invalidates cached decisions.
CREATE TABLE engine_settings (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  settings    jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE confidence_calibration (
  version     text PRIMARY KEY,
  tiers       jsonb NOT NULL,
  report      jsonb,
  active      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX confidence_calibration_one_active_idx ON confidence_calibration (active) WHERE active;

-- ---------------------------------------------------------------------------------------------------------
-- Predictions and their full trace
-- ---------------------------------------------------------------------------------------------------------

CREATE TABLE classification_history (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  episode_id       integer NOT NULL REFERENCES episodes (id),
  category         text NOT NULL,
  confidence       real NOT NULL,
  raw_score        real,
  evidence_tier    text,
  decision         text,
  origin           text NOT NULL CHECK (origin IN ('engine', 'human', 'import')),
  trust_level      text NOT NULL CHECK (trust_level IN ('HIGH', 'MEDIUM', 'LOW')),
  engine_name      text,
  engine_version   text,
  distribution     jsonb,
  reasons          jsonb NOT NULL DEFAULT '[]',
  supporting_rules jsonb NOT NULL DEFAULT '[]',
  similar_episodes jsonb NOT NULL DEFAULT '[]',
  arc_context      jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classification_history_episode_idx ON classification_history (episode_id, id DESC);

ALTER TABLE episodes
  ADD CONSTRAINT episodes_current_classification_fk
  FOREIGN KEY (current_classification_id) REFERENCES classification_history (id);

CREATE TABLE prediction_scores (
  classification_id  integer NOT NULL REFERENCES classification_history (id),
  contributor        text NOT NULL,
  weight             real NOT NULL,
  strength           real NOT NULL,
  support            real NOT NULL,
  share              real NOT NULL,
  top_category       text NOT NULL,
  distribution       jsonb NOT NULL,
  reasons            jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY (classification_id, contributor)
);

-- Relational so rule accuracy is a query, not a scan of JSON.
CREATE TABLE classification_rule_hits (
  classification_id  integer NOT NULL REFERENCES classification_history (id),
  rule_id            integer NOT NULL REFERENCES classification_rules (id),
  target_category    text NOT NULL,
  score_value        real NOT NULL,
  applied_score      real NOT NULL,
  PRIMARY KEY (classification_id, rule_id)
);
CREATE INDEX classification_rule_hits_rule_idx ON classification_rule_hits (rule_id);

CREATE TABLE review_audit_log (
  id                          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  episode_id                  integer NOT NULL REFERENCES episodes (id),
  action                      text NOT NULL CHECK (action IN ('APPROVE', 'OVERRIDE')),
  original_classification_id  integer REFERENCES classification_history (id),
  original_origin             text,
  original_prediction         text,
  original_confidence         real,
  new_classification_id       integer NOT NULL REFERENCES classification_history (id),
  new_classification          text NOT NULL,
  reason                      text,
  reviewer                    text NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_audit_log_episode_idx ON review_audit_log (episode_id, id DESC);
CREATE INDEX review_audit_log_created_idx ON review_audit_log (created_at);
CREATE INDEX review_audit_log_original_idx ON review_audit_log (original_classification_id);

-- ---------------------------------------------------------------------------------------------------------
-- Learned knowledge. All of this can be rebuilt from the tables above with `cli rebuild-learning`.
-- ---------------------------------------------------------------------------------------------------------

CREATE TABLE series_profiles (
  anime_id             integer PRIMARY KEY REFERENCES anime (id),
  canon_percentage     real NOT NULL DEFAULT 0,
  filler_percentage    real NOT NULL DEFAULT 0,
  distribution         jsonb NOT NULL,
  labeled_count        integer NOT NULL DEFAULT 0,
  effective_count      real NOT NULL DEFAULT 0,
  common_tags          jsonb NOT NULL DEFAULT '[]',
  arc_structure        jsonb NOT NULL DEFAULT '{}',
  reviewed_predictions integer NOT NULL DEFAULT 0,
  correct_predictions  integer NOT NULL DEFAULT 0,
  historical_accuracy  real,
  -- Hash of the series' trusted labels. Part of the decision cache key: only trusted changes force rework.
  evidence_hash        text NOT NULL DEFAULT 'none',
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE arc_profiles (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anime_id       integer NOT NULL REFERENCES anime (id),
  start_episode  integer NOT NULL,
  end_episode    integer NOT NULL,
  category       text NOT NULL,
  kind           text NOT NULL,
  confidence     real NOT NULL,
  episode_count  integer NOT NULL,
  name           text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arc_profiles_lookup_idx ON arc_profiles (anime_id, start_episode, end_episode);
CREATE INDEX arc_profiles_category_idx ON arc_profiles (category);

-- P(category | tag), trust-weighted. LOW-trust predictions never appear in these counts.
CREATE TABLE tag_patterns (
  scope     text NOT NULL CHECK (scope IN ('episode', 'series')),
  tag       text NOT NULL,
  category  text NOT NULL,
  weight    real NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, tag, category)
);

CREATE TABLE category_counts (
  category  text PRIMARY KEY,
  count     real NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------------------------------------

CREATE TABLE anilist_cache (
  key         text PRIMARY KEY,
  payload     jsonb NOT NULL,
  expires_at  timestamptz NOT NULL
);

CREATE TABLE jobs (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('IMPORT_ANIME', 'RECLASSIFY_SERIES')),
  anime_id      integer NOT NULL,
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED')),
  attempts      integer NOT NULL DEFAULT 0,
  run_after     timestamptz NOT NULL DEFAULT now(),
  error         text,
  result        jsonb,
  requested_by  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
CREATE INDEX jobs_claim_idx ON jobs (run_after, id) WHERE status = 'PENDING';
-- Collapses a burst of reviews into one pending re-classification per series.
CREATE UNIQUE INDEX jobs_one_pending_idx ON jobs (kind, anime_id) WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------------------------------------
-- Guarantees enforced by the database itself, so no code path can get around them
-- ---------------------------------------------------------------------------------------------------------

-- Only a human decision may change a reviewed episode. Curated labels are out of the engine's reach too, though
-- a newer version of the same dataset may replace them.
CREATE FUNCTION protect_reviewed_episode() RETURNS trigger AS $$
DECLARE
  new_origin text;
BEGIN
  IF NEW.current_classification_id IS NOT DISTINCT FROM OLD.current_classification_id
     AND NEW.category IS NOT DISTINCT FROM OLD.category
     AND NEW.trust_level IS NOT DISTINCT FROM OLD.trust_level
     AND NEW.review_status IS NOT DISTINCT FROM OLD.review_status THEN
    RETURN NEW;
  END IF;
  IF OLD.review_status <> 'UNREVIEWED' OR OLD.origin = 'import' THEN
    SELECT origin INTO new_origin FROM classification_history WHERE id = NEW.current_classification_id;
    IF NEW.current_classification_id IS NOT DISTINCT FROM OLD.current_classification_id
       OR NOT (new_origin = 'human' OR (new_origin = 'import' AND OLD.review_status = 'UNREVIEWED')) THEN
      RAISE EXCEPTION 'episode % (%, %) can only be changed by a new human review', OLD.id, OLD.origin, OLD.review_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER episodes_protect_reviewed
  BEFORE UPDATE ON episodes
  FOR EACH ROW EXECUTE FUNCTION protect_reviewed_episode();

-- Audit trails are append-only.
CREATE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_audit_log_append_only
  BEFORE UPDATE OR DELETE ON review_audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER classification_history_append_only
  BEFORE UPDATE OR DELETE ON classification_history
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
