-- CoralZone auth schema (MySQL). Run once against DATABASE_URL with
-- `node scripts/migrate.mjs` from /frontend. Safe to re-run — every
-- statement is idempotent.
--
-- Note on row-level security: MySQL has no equivalent of Postgres' native
-- RLS policies. Every query in api/_lib/auth-core.js scopes user-owned
-- rows by an id the server derives from the verified session — never one
-- read off the request — which is the application-level substitute. If
-- you later give the database user used by this app least-privilege
-- grants (no DROP/ALTER, no access to unrelated schemas), that's a useful
-- second layer on top.

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  email_normalized VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NULL,
  google_id VARCHAR(64) NULL,
  email_verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_users_email_normalized (email_normalized),
  UNIQUE KEY uniq_users_google_id (google_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  purpose ENUM('signup', 'login') NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_evc_user_purpose (user_id, purpose),
  CONSTRAINT fk_evc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sessions_token_hash (token_hash),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key VARCHAR(191) NOT NULL PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  window_started_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Cloud storage ───────────────────────────────────────────────────────────
-- Scaffolding for the admin Cloud storage build-out (buckets, API keys,
-- billing). Nothing reads/writes these yet except storage_quotas being
-- defaulted in code (see src/lib/storage-plans.ts) — they exist now so later
-- steps are additive, not another migration. The actual file bytes/metadata
-- live in the separate coralz-storage service's own `media` table; these
-- rows are CoralzOne's side of the relationship, keyed by that service's
-- owner_id/bucket_id strings (both are this app's own CHAR(36) ids, so no
-- cross-database foreign key — just matching ids kept in sync by the app).

CREATE TABLE IF NOT EXISTS storage_buckets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  frozen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_storage_buckets_user (user_id),
  CONSTRAINT fk_storage_buckets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per user who has ever been on a paid plan or had a manual quota
-- override. A user with NO row here is on the Starter plan's defaults (see
-- getEffectiveQuota() in src/lib/storage-plans.ts) — that's deliberate, so
-- every brand-new signup doesn't need a row inserted just to get a quota.
CREATE TABLE IF NOT EXISTS storage_quotas (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  plan ENUM('starter', 'pro', 'scale') NOT NULL DEFAULT 'starter',
  bytes_quota BIGINT UNSIGNED NOT NULL,
  max_upload_bytes BIGINT UNSIGNED NOT NULL,
  extra_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active', 'frozen') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_storage_quotas_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS storage_api_keys (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  bucket_id CHAR(36) NULL,
  name VARCHAR(80) NOT NULL,
  key_prefix CHAR(12) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  last_used_at DATETIME NULL,
  request_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_storage_api_keys_hash (key_hash),
  KEY idx_storage_api_keys_user (user_id),
  CONSTRAINT fk_storage_api_keys_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_storage_api_keys_bucket FOREIGN KEY (bucket_id) REFERENCES storage_buckets (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS storage_extra_purchases (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  bytes_added BIGINT UNSIGNED NOT NULL,
  amount_ngn_kobo BIGINT UNSIGNED NOT NULL,
  paystack_reference VARCHAR(100) NULL,
  status ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_storage_extra_purchases_user (user_id),
  UNIQUE KEY uniq_storage_extra_purchases_reference (paystack_reference),
  CONSTRAINT fk_storage_extra_purchases_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
