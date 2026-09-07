# FairProcess 2.0 — Local Development Setup

## Prerequisites
- Node.js 20+
- npm/yarn
- Cloudflare account (free tier works)
- `npx wrangler login` already run

## Quick Start (5 minutes)

### 1. Install Dependencies
```bash
cd frontend/web
npm install
```

### 2. Build for Cloudflare
```bash
npm run cf:build
```
This generates `.open-next/` directory with the Cloudflare Worker code.

### 3. Start Development Server
```bash
npx wrangler dev
```

This will:
- Create a **local D1 database** automatically (`.wrangler/state/v3/d1/` directory)
- Bind D1 as `DB` and R2 as `EVIDENCE_BUCKET`
- Start the dev server on `http://localhost:8787`

### 4. Apply Database Schema (First Time Only)
In a **separate terminal**:
```bash
npx wrangler d1 execute fairprocess --local --file=../../database/d1/schema.sql
```

Or, to apply migrations:
```bash
npx wrangler migrations apply fairprocess --local
```

### 5. Open in Browser
```bash
http://localhost:8787
```

---

## Detailed Setup

### Environment Variables
Create `.dev.vars` (not `.env`) in `frontend/web/`:
```
NEXT_PUBLIC_API_URL=http://localhost:8787
RECORDER_USER_ID=<optional: county recorder username>
RECORDER_PASSWORD=<optional: county recorder password>
```

### Local D1 Database
- **Location:** `.wrangler/state/v3/d1/`
- **Persistent across dev sessions:** Yes
- **Reset:** Delete the directory and run `wrangler dev` again

### Local R2 Bucket
- **Name:** `fairprocess-evidence` (from wrangler.toml)
- **Files stored:** `.wrangler/state/v3/r2/`
- **Reset:** Delete the directory

### Database Migrations
```bash
# View current migrations
ls database/d1/migrations/

# Apply all pending migrations
npx wrangler d1 migrations apply fairprocess --local

# Check migration status
npx wrangler d1 migrations list fairprocess --local
```

---

## Common Issues

### "env.DB is undefined"
**Problem:** You ran `npm run dev` (Next.js dev server) instead of `npx wrangler dev`.
**Solution:** Use `npx wrangler dev` — it provides Cloudflare bindings that `next dev` doesn't have.

### Database not initialized
**Problem:** Tables don't exist.
**Solution:** Run the schema apply command:
```bash
npx wrangler d1 execute fairprocess --local --file=../../database/d1/schema.sql
```

### R2 bucket not found
**Problem:** "fairprocess-evidence" bucket missing.
**Solution:** It's auto-created on first `wrangler dev` run. If not, restart wrangler.

### Port 8787 already in use
**Solution:** Kill the old process or use a different port:
```bash
npx wrangler dev --port 8788
```

### Build takes forever
**Problem:** `npm run cf:build` is slow on first run.
**Solution:** This is normal (transpiling React + Next.js for edge). Subsequent builds are faster due to caching.

---

## Development Workflow

### Making Changes
1. **Frontend code:** Hot-reload works automatically via `wrangler dev`
2. **API routes:** Changes apply on next request
3. **Database schema:** Requires a new migration + `wrangler migrations apply`

### Database Changes
1. Create new migration file:
   ```bash
   touch database/d1/migrations/XXX_description.sql
   ```
2. Write your SQL
3. Apply it:
   ```bash
   npx wrangler d1 migrations apply fairprocess --local
   ```

### Testing Locally
```bash
cd frontend/web
npm test                 # Run vitest
npm run test:e2e        # Run Playwright tests
```

---

## Accessing the Local API

The worker serves both the frontend (SSR) and API routes.

| Path | What |
|------|------|
| `http://localhost:8787/` | Frontend (map + dashboard) |
| `http://localhost:8787/api/v1/health` | Health check |
| `http://localhost:8787/api/v1/projects?id=...` | Get project |
| `http://localhost:8787/api/v1/cases` | List cases |

### Example: Create a Project
```bash
curl -X POST http://localhost:8787/api/v1/properties/resolve \
  -H "Content-Type: application/json" \
  -d '{"apn":"101-234-056"}'
```

---

## Deployment (Production)

### To Cloudflare Workers
```bash
cd frontend/web
npm run cf:build
npx wrangler deploy
```

### Set Remote Database
```bash
# Create remote D1 database
npx wrangler d1 create fairprocess

# Copy the database_id into wrangler.toml
# Then apply schema
npx wrangler d1 execute fairprocess --remote --file=../../database/d1/schema.sql

# Deploy
npx wrangler deploy
```

---

## Debugging

### View Local Database
```bash
# List all tables
npx wrangler d1 query fairprocess "SELECT name FROM sqlite_master WHERE type='table';" --local

# Query specific table
npx wrangler d1 query fairprocess "SELECT * FROM projects LIMIT 5;" --local

# Export as SQL
npx wrangler d1 backup fairprocess --local
```

### View Logs
```bash
# Wrangler dev shows logs directly
# For persistent logs, redirect:
npx wrangler dev 2>&1 | tee dev.log
```

### Browser DevTools
- Open `http://localhost:8787`
- Open DevTools (F12)
- Check **Console** for client-side errors
- Check **Network** for API calls

---

## Architecture Quick Reference

| Component | Local Setup |
|-----------|------------|
| **Frontend** | Next.js 15, served via Worker |
| **API Routes** | Cloudflare Workers (OpenNext) |
| **Database** | D1 (SQLite), local in `.wrangler/state/v3/d1/` |
| **File Storage** | R2 (S3-compatible), local in `.wrangler/state/v3/r2/` |
| **AI** | Claude API (requires ANTHROPIC_API_KEY env var if calling agents) |
| **Maps** | MapLibre GL JS, embedded in frontend |

---

## Next Steps

1. **Explore the map:** Click on parcels to create a project
2. **Add timeline events:** Test the due-process analyzer
3. **Upload evidence:** Try the evidence vault
4. **Try Case Assistant:** Chat with Claude about your case
5. **Run migrations:** Add custom rules via policy compiler

---

## Troubleshooting

**Still stuck?** Check these files:
- `README.md` — Original project README
- `INTEGRATION_NOTES.md` — Phase notes + API docs
- `docs/architecture/adr.md` — Architecture decisions
- `frontend/web/wrangler.toml` — Worker config

**Need to reset everything?**
```bash
rm -rf .wrangler node_modules
npm install
npm run cf:build
npx wrangler dev
```
