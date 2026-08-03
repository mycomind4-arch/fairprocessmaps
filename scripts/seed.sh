#!/bin/bash
# Seed sample data for FairProcess 2.0
# Run with: bash scripts/seed.sh
set -e

API_URL="${API_URL:-http://localhost:8000}"

echo "🌱 Seeding FairProcess 2.0 sample data..."
echo ""

# ─── Create sample properties ───
echo "Creating properties..."

PROP1=$(curl -s -X POST "$API_URL/api/v1/properties" \
  -H "Content-Type: application/json" \
  -d '{
    "parcel_id": "01-1234-567-001",
    "address": "1234 Telegraph Ave",
    "city": "Oakland",
    "county": "Alameda",
    "state": "CA",
    "zip_code": "94612",
    "country": "US",
    "property_type": "commercial",
    "owner_name": "Acme Properties LLC"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

PROP2=$(curl -s -X POST "$API_URL/api/v1/properties" \
  -H "Content-Type: application/json" \
  -d '{
    "parcel_id": "01-9876-543-002",
    "address": "456 Broadway",
    "city": "Oakland",
    "county": "Alameda",
    "state": "CA",
    "zip_code": "94607",
    "country": "US",
    "property_type": "residential",
    "owner_name": "Jane Doe"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

PROP3=$(curl -s -X POST "$API_URL/api/v1/properties" \
  -H "Content-Type: application/json" \
  -d '{
    "parcel_id": "03-5555-111-003",
    "address": "789 Redwood Hwy",
    "city": "Eureka",
    "county": "Humboldt",
    "state": "CA",
    "zip_code": "95501",
    "country": "US",
    "property_type": "residential",
    "owner_name": "John Smith"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

echo "  ✅ Created 3 properties"
echo "     - $PROP1 (Oakland commercial)"
echo "     - $PROP2 (Oakland residential)"
echo "     - $PROP3 (Humboldt residential)"

# ─── Run due-process analysis on each ───
echo ""
echo "Running due-process analysis (no evidence yet → score 100)..."

for PID in "$PROP1" "$PROP2" "$PROP3"; do
  if [ -n "$PID" ]; then
    SCORE=$(curl -s "$API_URL/api/v1/due-process/property/$PID" | python3 -c "import sys,json; print(json.load(sys.stdin)['overall_score'])" 2>/dev/null || echo "?")
    echo "  Property $PID: score = $SCORE"
  fi
done

echo ""
echo "✅ Seed complete!"
echo ""
echo "Next steps:"
echo "  - Upload evidence documents via the web UI at http://localhost:3000"
echo "  - Or POST to $API_URL/api/v1/upload/property/{id} with a file"
echo "  - View API docs at $API_URL/docs"
