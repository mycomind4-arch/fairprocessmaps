# What's wired vs. what's left

This round edits the real files in place (not new copies) — diff these
against your repo and merge, don't just overwrite.

## Fully wired end-to-end
- Map click → parcel popup → **Open as project** button (`PropertyMap.tsx`)
- Button → `POST /api/v1/properties/resolve` (find-or-create Property by APN)
- → `NewProjectModal` shows existing projects for that property, or a
  create form (`GET`/`POST /api/v1/properties/[id]/projects`)
- → creating/selecting a project routes to `/project/[id]`
- Dashboard header + mini-map + nav badge read from
  `GET /api/v1/projects/[id]`, which joins property + open/critical
  finding counts

## You still need to
1. **Create the D1 database and bind it**:
   ```
   wrangler d1 create fairprocess
   wrangler d1 execute fairprocess --file=database/d1/schema.sql
   ```
   then drop the returned `database_id` into `wrangler.toml` (currently a
   `REPLACE_WITH_D1_DATABASE_ID` placeholder).

2. **Local dev needs a D1 binding too** — either run `wrangler dev` (not
   `next dev`) so `getCloudflareContext()` resolves, or add
   `@cloudflare/next-on-pages`'s dev shim. Plain `next dev` won't have
   `env.DB` available.

3. **The five dashboard section panels are still placeholders.** Reuse
   `EvidencePanel` / `TimelinePanel` / `DocumentUpload`, but they currently
   fetch by `propertyId` — since evidence now hangs off `project_id`, they
   need a prop rename and their own fetches/routes pointed at
   `project_id` instead.

4. **"Property Intelligence" (AI-scraped public data) has no backend yet** —
   this is the natural next piece: a Workflow that, on project creation,
   kicks off AI research against county records and writes results as
   `evidence` rows with `source = 'ai_research'`.

5. **`due_process_score` on `projects`** is a cached column — nothing
   writes to it yet. That's the due-process rule engine, ported from
   `backend/ai/services/due_process_analyzer.py` in the old stack into a
   Workflow that runs the rule table against a project's evidence/timeline
   and updates the score + `due_process_findings`.
