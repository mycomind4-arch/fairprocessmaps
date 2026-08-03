#!/usr/bin/env bash
# Start all services for local development

docker compose -f infra/docker/docker-compose.yml up -d

echo "⏳ Waiting for services..."
sleep 10

./scripts/migrate.sh
./scripts/seed.sh

echo ""
echo "🚀 FairProcess 2.0 is running:"
echo "   Web:       http://localhost:3000"
echo "   API:       http://localhost:8000"
echo "   API Docs:  http://localhost:8000/docs"
echo "   Temporal UI: http://localhost:8233"
echo "   Neo4j:     http://localhost:7474"
echo "   MinIO:     http://localhost:9001"
