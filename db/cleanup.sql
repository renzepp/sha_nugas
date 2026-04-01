-- ═══════════════════════════════════════════════════════════════
--  Sha-Desk — Post-migration cleanup
--  Run this AFTER confirming the app loads correctly from the
--  new relational tables (subjects, assignments, etc.).
--
--  This drops the old single-JSONB-blob `data` table that is
--  no longer needed now that migration is complete.
--
--  ⚠️  Only run once. Irreversible.
-- ═══════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS data;
