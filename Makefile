.PHONY: help dev dev-up dev-down migrate seed test test-backend test-frontend test-e2e lint format clean docker-build

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: dev-up migrate seed ## Start all services, run migrations, and seed data
	@echo "🚀 FairProcess 2.0 is running:"
	@echo "   Web:       http://localhost:3000"
	@echo "   API:       http://localhost:8000"
	@echo "   API Docs:  http://localhost:8000/docs"

dev-up: ## Start Docker services
	docker compose -f infra/docker/docker-compose.yml up -d

dev-down: ## Stop Docker services
	docker compose -f infra/docker/docker-compose.yml down

migrate: ## Run database migrations
	python scripts/migrate.py

seed: ## Seed sample data
	bash scripts/seed.sh

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests
	cd backend/api && uv run pytest tests/ -v --cov=src --cov-report=term-missing
	cd backend/ingestion && uv run pytest tests/ -v

test-frontend: ## Run frontend tests
	cd frontend/web && pnpm test

test-e2e: ## Run end-to-end tests
	cd frontend/web && pnpm test:e2e

lint: ## Run linters
	cd backend/api && uv run ruff check src && uv run ruff format --check src && uv run mypy src
	cd backend/ingestion && uv run ruff check src
	cd frontend/web && pnpm lint

format: ## Format code
	cd backend/api && uv run ruff format src
	cd backend/ingestion && uv run ruff format src
	cd frontend/web && pnpm format

clean: ## Clean build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/web/.next frontend/web/node_modules
	docker compose -f infra/docker/docker-compose.yml down -v

docker-build: ## Build all Docker images
	docker compose -f infra/docker/docker-compose.yml build
