"""Test migration for gear, share tokens, and notification rules tables.

Verifies that the four new tables are created with the expected columns
and indexes, then properly dropped on downgrade.
"""

import psycopg

# ---------------------------------------------------------------------------
# SQL strings that mirror the migration exactly
# ---------------------------------------------------------------------------

_UPGRADE_SQL = """
CREATE TABLE IF NOT EXISTS gear_shoes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id        UUID NOT NULL REFERENCES athletes(id),
    name              TEXT NOT NULL,
    brand             TEXT,
    model             TEXT,
    purchase_date     DATE,
    current_mileage_m REAL DEFAULT 0,
    retired_at        TIMESTAMPTZ,
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gear_assignments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id TEXT NOT NULL,
    shoe_id     UUID NOT NULL REFERENCES gear_shoes(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS share_tokens (
    token       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id  UUID NOT NULL REFERENCES athletes(id),
    activity_id TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notification_rules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id   UUID NOT NULL REFERENCES athletes(id),
    rule_type    TEXT NOT NULL,
    enabled      BOOLEAN DEFAULT TRUE,
    last_fired_at TIMESTAMPTZ,
    config       JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_gear_shoes_athlete
    ON gear_shoes (athlete_id);

CREATE INDEX IF NOT EXISTS idx_gear_assignments_shoe
    ON gear_assignments (shoe_id);

CREATE INDEX IF NOT EXISTS idx_share_tokens_activity
    ON share_tokens (activity_id);

CREATE INDEX IF NOT EXISTS idx_notification_rules_athlete_type
    ON notification_rules (athlete_id, rule_type);
"""

_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS idx_notification_rules_athlete_type;
DROP INDEX IF EXISTS idx_share_tokens_activity;
DROP INDEX IF EXISTS idx_gear_assignments_shoe;
DROP INDEX IF EXISTS idx_gear_shoes_athlete;

DROP TABLE IF EXISTS gear_assignments CASCADE;
DROP TABLE IF EXISTS share_tokens CASCADE;
DROP TABLE IF EXISTS notification_rules CASCADE;
DROP TABLE IF EXISTS gear_shoes CASCADE;
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def _text_name(value: object) -> str:
    """psycopg returns catalog ``name`` columns as bytes; normalise."""
    return value.decode() if isinstance(value, bytes) else str(value)


class TestMigrationUpgrade:
    """Verify upgrade creates all 4 tables with expected columns."""

    @staticmethod
    def _table_exists(cursor: psycopg.Cursor, table_name: str) -> bool:
        cursor.execute(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.tables"
            "  WHERE table_name = %s"
            "    AND table_schema = 'public'"
            ")",
            (table_name,),
        )
        return bool(cursor.fetchone()[0])

    @staticmethod
    def _column_exists(cursor: psycopg.Cursor, table: str, column: str) -> tuple[bool, str | None]:
        cursor.execute(
            "SELECT data_type, is_nullable FROM information_schema.columns"
            " WHERE table_name = %s AND column_name = %s"
            "   AND table_schema = 'public'",
            (table, column),
        )
        row = cursor.fetchone()
        if row is None:
            return False, None
        # psycopg may return bytes; normalise to str
        raw = row[0]
        if isinstance(raw, bytes):
            raw = raw.decode()
        return True, raw

    @staticmethod
    def _index_exists(cursor: psycopg.Cursor, index_name: str) -> bool:
        cursor.execute(
            "SELECT EXISTS ("
            "  SELECT 1 FROM pg_indexes"
            "  WHERE indexname = %s"
            "    AND schemaname = 'public'"
            ")",
            (index_name,),
        )
        return bool(cursor.fetchone()[0])

    def test_upgrade_creates_all_tables(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            cur.execute(_UPGRADE_SQL)

            for table in ("gear_shoes", "gear_assignments", "share_tokens", "notification_rules"):
                assert self._table_exists(cur, table), f"{table} should exist after upgrade"

    def test_gear_shoes_columns(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            cur.execute(_UPGRADE_SQL)

            expected = [
                ("id", "uuid"),
                ("athlete_id", "uuid"),
                ("name", "text"),
                ("brand", "text"),
                ("model", "text"),
                ("purchase_date", "date"),
                ("current_mileage_m", "real"),
                ("retired_at", "timestamp with time zone"),
                ("notes", "text"),
                ("created_at", "timestamp with time zone"),
            ]
            for col, dtype in expected:
                exists, actual = self._column_exists(cur, "gear_shoes", col)
                assert exists, f"gear_shoes.{col} missing"
                assert actual == dtype, f"gear_shoes.{col}: expected {dtype}, got {actual}"

    def test_gear_assignments_columns(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            cur.execute(_UPGRADE_SQL)

            expected = [
                ("id", "uuid"),
                ("activity_id", "text"),
                ("shoe_id", "uuid"),
                ("assigned_at", "timestamp with time zone"),
            ]
            for col, dtype in expected:
                exists, actual = self._column_exists(cur, "gear_assignments", col)
                assert exists, f"gear_assignments.{col} missing"
                assert actual == dtype, f"gear_assignments.{col}: expected {dtype}, got {actual}"

    def test_share_tokens_columns(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            cur.execute(_UPGRADE_SQL)

            expected = [
                ("token", "uuid"),
                ("athlete_id", "uuid"),
                ("activity_id", "text"),
                ("created_at", "timestamp with time zone"),
                ("revoked_at", "timestamp with time zone"),
                ("expires_at", "timestamp with time zone"),
            ]
            for col, dtype in expected:
                exists, actual = self._column_exists(cur, "share_tokens", col)
                assert exists, f"share_tokens.{col} missing"
                assert actual == dtype, f"share_tokens.{col}: expected {dtype}, got {actual}"

    def test_notification_rules_columns(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            cur.execute(_UPGRADE_SQL)

            expected = [
                ("id", "uuid"),
                ("athlete_id", "uuid"),
                ("rule_type", "text"),
                ("enabled", "boolean"),
                ("last_fired_at", "timestamp with time zone"),
                ("config", "jsonb"),
            ]
            for col, dtype in expected:
                exists, actual = self._column_exists(cur, "notification_rules", col)
                assert exists, f"notification_rules.{col} missing"
                assert actual == dtype, f"notification_rules.{col}: expected {dtype}, got {actual}"

    def test_upgrade_creates_indexes(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            cur.execute(_UPGRADE_SQL)

            expected = [
                "idx_gear_shoes_athlete",
                "idx_gear_assignments_shoe",
                "idx_share_tokens_activity",
                "idx_notification_rules_athlete_type",
            ]
            for idx in expected:
                assert self._index_exists(cur, idx), f"Index {idx} should exist after upgrade"


class TestMigrationDowngrade:
    """Verify downgrade removes all 4 tables and indexes."""

    @staticmethod
    def _table_exists(cursor: psycopg.Cursor, table_name: str) -> bool:
        cursor.execute(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.tables"
            "  WHERE table_name = %s"
            "    AND table_schema = 'public'"
            ")",
            (table_name,),
        )
        return bool(cursor.fetchone()[0])

    def test_downgrade_drops_all_tables(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            # Apply upgrade first
            cur.execute(_UPGRADE_SQL)

            # Verify tables exist before downgrade
            for table in ("gear_shoes", "gear_assignments", "share_tokens", "notification_rules"):
                assert self._table_exists(cur, table), f"{table} should exist before downgrade"

            # Apply downgrade
            cur.execute(_DOWNGRADE_SQL)

            # Verify tables are gone
            for table in ("gear_shoes", "gear_assignments", "share_tokens", "notification_rules"):
                assert not self._table_exists(cur, table), (
                    f"{table} should not exist after downgrade"
                )

    def test_downgrade_removes_indexes(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            cur.execute(_UPGRADE_SQL)
            cur.execute(_DOWNGRADE_SQL)

            # Check indexes are gone (pg_indexes only shows existing indexes).
            # Match only the four indexes this migration creates — other
            # migrations' indexes (e.g. idx_notifications_athlete_unread) are
            # unrelated and must not be caught by a LIKE pattern.
            cur.execute(
                "SELECT indexname FROM pg_indexes"
                " WHERE schemaname = 'public'"
                "   AND indexname IN ("
                "     'idx_gear_shoes_athlete',"
                "     'idx_gear_assignments_shoe',"
                "     'idx_share_tokens_activity',"
                "     'idx_notification_rules_athlete_type'"
                "   )"
            )
            remaining = cur.fetchall()
            assert len(remaining) == 0, f"Indexes remain after downgrade: {remaining}"

    def test_downgrade_preserves_existing_tables(self, db_conn: psycopg.Connection) -> None:
        """Sanity check: downgrade doesn't drop unrelated tables."""
        with db_conn.cursor() as cur:
            # Get count of tables before
            cur.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            )
            before = {_text_name(row[0]) for row in cur.fetchall()}

            # Apply upgrade + downgrade
            cur.execute(_UPGRADE_SQL)
            cur.execute(_DOWNGRADE_SQL)

            # Get tables after
            cur.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            )
            after = {_text_name(row[0]) for row in cur.fetchall()}

            # The 4 tables this migration manages are expected to disappear;
            # anything else must remain. (They may already exist when the
            # database is migrated to head, so exclude them explicitly.)
            gone = before - after - {"gear_shoes", "gear_assignments", "share_tokens", "notification_rules"}
            assert len(gone) == 0, f"Downgrade removed unrelated tables: {gone}"
