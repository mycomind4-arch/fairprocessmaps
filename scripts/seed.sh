#!/usr/bin/env bash
set -e

echo "🌱 Seeding sample data..."

# PostGIS seed
psql   "postgresql://fp:${POSTGRES_PASSWORD:-fp_dev}@localhost:5432/fairprocess"   -c "
INSERT INTO properties (parcel_id, address, city, county, state, zip_code, property_type, owner_name)
VALUES
  ('12345-678-901', '1234 Main St', 'Oakland', 'Alameda', 'CA', '94607', 'residential', 'Jane Doe'),
  ('12345-678-902', '1235 Main St', 'Oakland', 'Alameda', 'CA', '94607', 'commercial', 'Acme LLC'),
  ('12345-678-903', '1236 Main St', 'Oakland', 'Alameda', 'CA', '94607', 'residential', 'John Smith')
ON CONFLICT (parcel_id) DO NOTHING;
"

# Neo4j seed
cypher-shell -u neo4j -p "${NEO4J_PASSWORD:-fp_dev}"   -f database/neo4j/seeds/sample.cypher

echo "✅ Seed complete."
