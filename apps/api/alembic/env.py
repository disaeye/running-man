"""Alembic environment configuration.

Reads DATABASE_URL from the process environment, falling back to ../.env so
the ini file stays generic.
"""

import os
from importlib import import_module
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

context = import_module("alembic.context")

# ------------------------------------------------------------------
# Config object
# ------------------------------------------------------------------
config = context.config

# Logging setup
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ------------------------------------------------------------------
# Target metadata — import models so autogenerate can diff them
# ------------------------------------------------------------------
from infrastructure.db import Base  # noqa: E402

for model_module in (
    "infrastructure.db.models",
    "infrastructure.db.models.definitions",
    "infrastructure.db.models.domain_constraints",
    "infrastructure.db.models.sharing",
    "infrastructure.db.models.strength",
    "infrastructure.db.models.sync",
):
    import_module(model_module)

target_metadata = Base.metadata


def _sqlalchemy_url(raw_url: str) -> str:
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw_url


# ------------------------------------------------------------------
# Read DATABASE_URL from the process environment first, falling back to the
# .env file (same level as alembic.ini). The env override lets the schema
# lifecycle runner point alembic at disposable databases.
# ------------------------------------------------------------------
env_database_url = os.environ.get("DATABASE_URL")
if env_database_url:
    config.set_main_option("sqlalchemy.url", _sqlalchemy_url(env_database_url))
else:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for raw_line in env_path.read_text().splitlines():
            line = raw_line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _separator, val = line.partition("=")
                if key.strip() == "DATABASE_URL":
                    config.set_main_option("sqlalchemy.url", _sqlalchemy_url(val.strip()))
                    break


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (--sql)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
