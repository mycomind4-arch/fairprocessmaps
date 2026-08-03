#!/usr/bin/env bash
set -e

echo "🗄️  Running PostGIS migrations..."
psql   "postgresql://fp:${POSTGRES_PASSWORD:-fp_dev}@localhost:5432/fairprocess"   -f database/postgis/migrations/001_init.sql

echo "🔗 Running Neo4j migrations..."
cypher-shell -u neo4j -p "${NEO4J_PASSWORD:-fp_dev}"   -f database/neo4j/migrations/001_schema.cypher

echo "✅ Migrations complete."
