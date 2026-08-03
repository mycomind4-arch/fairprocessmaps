#!/usr/bin/env python3
"""Database migration runner.

Runs SQL migration files in order against the PostGIS database.
Tracks applied migrations in a _migrations table.
"""
import asyncio
import os
import sys
from pathlib import Path
from datetime import datetime

import asyncpg


async def run_migrations(migrations_dir: str, database_url: str):
    """Run all pending SQL migrations in order."""
    conn = await asyncpg.connect(database_url)

    # Create migrations tracking table
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # Get already-applied migrations
    applied = await conn.fetch("SELECT filename FROM _migrations")
    applied_set = {row["filename"] for row in applied}

    # Find migration files
    mig_path = Path(migrations_dir)
    if not mig_path.exists():
        print(f"⚠️  Migrations directory not found: {migrations_dir}")
        return

    sql_files = sorted(mig_path.glob("*.sql"))
    if not sql_files:
        print(f"⚠️  No .sql files found in {migrations_dir}")
        return

    pending = [f for f in sql_files if f.name not in applied_set]

    if not pending:
        print("✅ All migrations already applied")
        return

    print(f"📋 {len(pending)} pending migration(s):")

    for sql_file in pending:
        print(f"  → Running {sql_file.name}...")
        sql = sql_file.read_text()

        try:
            await conn.execute(sql)
            await conn.execute(
                "INSERT INTO _migrations (filename) VALUES ($1)",
                sql_file.name,
            )
            print(f"  ✅ {sql_file.name} applied")
        except Exception as e:
            print(f"  ❌ {sql_file.name} failed: {e}")
            await conn.close()
            sys.exit(1)

    await conn.close()
    print(f"\n✅ {len(pending)} migration(s) applied successfully")


if __name__ == "__main__":
    migrations_dir = os.environ.get("MIGRATIONS_DIR", "database/postgis/migrations")
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://fp:fp_dev@localhost:5432/fairprocess",
    )
    asyncio.run(run_migrations(migrations_dir, database_url))
