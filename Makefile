.PHONY: help dev migrate migrate-remote seed test test-policy lint format deploy clean

WEB := frontend/web
D1  := fairprocess

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Run the app locally (wrangler, not `next dev` — API routes need D1/R2 bindings)
	cd $(WEB) && npx wrangler dev

migrate: ## Apply D1 migrations locally
	cd $(WEB) && npx wrangler d1 migrations apply $(D1) --local

migrate-remote: ## Apply D1 migrations to the deployed database
	cd $(WEB) && npx wrangler d1 migrations apply $(D1) --remote

seed: ## Load the demo case into the local D1 database
	cd $(WEB) && npx wrangler d1 execute $(D1) --local --file=../../database/d1/seed_demo_case.sql

test: ## Run the full test suite
	cd $(WEB) && npx vitest run

test-policy: ## Run policy-engine tests only (rules, statuses, neutrality)
	cd $(WEB) && npx vitest run src/lib/policy

typecheck: ## Typecheck the worker
	cd $(WEB) && npx tsc --noEmit

lint: ## Lint
	cd $(WEB) && npm run lint

deploy: ## Build and deploy to Cloudflare
	cd $(WEB) && npx opennextjs-cloudflare build && npx wrangler deploy

clean: ## Clean build artifacts
	rm -rf $(WEB)/.next $(WEB)/.open-next $(WEB)/node_modules
