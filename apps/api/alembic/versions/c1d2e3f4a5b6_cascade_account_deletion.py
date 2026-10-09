from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None

_ACCOUNT_FKS = """
ALTER TABLE health_wellness DROP CONSTRAINT IF EXISTS health_wellness_athlete_id_fkey;
ALTER TABLE health_wellness ADD CONSTRAINT health_wellness_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE activity_summary DROP CONSTRAINT IF EXISTS activity_summary_athlete_id_fkey;
ALTER TABLE activity_summary ADD CONSTRAINT activity_summary_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE training_calendar DROP CONSTRAINT IF EXISTS training_calendar_athlete_id_fkey;
ALTER TABLE training_calendar ADD CONSTRAINT training_calendar_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE ftp_history DROP CONSTRAINT IF EXISTS ftp_history_athlete_id_fkey;
ALTER TABLE ftp_history ADD CONSTRAINT ftp_history_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_athlete_id_fkey;
ALTER TABLE goals ADD CONSTRAINT goals_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE user_integrations DROP CONSTRAINT IF EXISTS user_integrations_athlete_id_fkey;
ALTER TABLE user_integrations ADD CONSTRAINT user_integrations_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_athlete_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE gear_shoes DROP CONSTRAINT IF EXISTS gear_shoes_athlete_id_fkey;
ALTER TABLE gear_shoes ADD CONSTRAINT gear_shoes_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE share_tokens DROP CONSTRAINT IF EXISTS share_tokens_athlete_id_fkey;
ALTER TABLE share_tokens ADD CONSTRAINT share_tokens_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE notification_rules DROP CONSTRAINT IF EXISTS notification_rules_athlete_id_fkey;
ALTER TABLE notification_rules ADD CONSTRAINT notification_rules_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE workout_exercises DROP CONSTRAINT IF EXISTS workout_exercises_athlete_id_fkey;
ALTER TABLE workout_exercises ADD CONSTRAINT workout_exercises_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE workout_sets DROP CONSTRAINT IF EXISTS workout_sets_athlete_id_fkey;
ALTER TABLE workout_sets ADD CONSTRAINT workout_sets_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE integration_sync_runs DROP CONSTRAINT IF EXISTS integration_sync_runs_athlete_id_fkey;
ALTER TABLE integration_sync_runs ADD CONSTRAINT integration_sync_runs_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE integration_sync_errors DROP CONSTRAINT IF EXISTS integration_sync_errors_athlete_id_fkey;
ALTER TABLE integration_sync_errors ADD CONSTRAINT integration_sync_errors_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
ALTER TABLE source_records DROP CONSTRAINT IF EXISTS source_records_athlete_id_fkey;
ALTER TABLE source_records ADD CONSTRAINT source_records_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES athletes(id) ON DELETE CASCADE;
"""


def upgrade() -> None:
    op.execute(_ACCOUNT_FKS)


def downgrade() -> None:
    pass
