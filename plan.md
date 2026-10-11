# Atlas & Ink: Milestone 1 (MVP Foundation)

**Product** ([PREREQUISITE_RESEARCH.md](PREREQUISITE_RESEARCH.md)): one linked graph of story entities, seen through 3 views (Atlas = maps, Codex = characters/lore, Manuscript = chapters), plus a GM mode. The full MVP is about 5 months of work.

**This milestone:** auth + Postgres + the entity/type/relationship model + a working **Codex** (create, edit, search, link, trash, export). Atlas and Manuscript come later and build on this model. VibeWise is skipped.

**Env:** Node 22.13, pnpm 9.15, Docker 29.6, gh. The repo has 1 commit, `origin` = github.com/ved-jadhav-10/world-builder, and no code yet. Don't commit or push unless asked.

## Stack
| Layer | Choice | Alternatives |
|---|---|---|
| Lang / runtime / repo | TypeScript strict · Node 22 LTS · pnpm workspaces | JS · Bun · npm workspaces, Turborepo |
| Web | Vite · React 19 · React Router v7 (all pages and nested layouts; can adopt framework mode later for per-route SSR) · TanStack Query | Next.js, RR7 framework mode · TanStack Router · SWR |
| UI | Tailwind v4 · shadcn/ui (Radix) · cmdk | CSS Modules · MUI, Mantine |
| Forms / validation | react-hook-form + zod (shared with API) | TanStack Form · TypeBox, Valibot |
| Rich text | TipTap (stores ProseMirror JSON) | Lexical, BlockNote, Slate |
| API | Fastify 5 + fastify-type-provider-zod · tsx for dev | Hono, Express, NestJS, tRPC |
| DB | PostgreSQL 17 · Drizzle ORM + Kit · postgres.js | MySQL, MongoDB · Prisma, Kysely |
| Auth | Better Auth (self-hosted, sessions in Postgres) | Clerk, Auth0, Supabase Auth, Auth.js |
| Search | Postgres full-text, `'simple'` config, prefix matching | Meilisearch / Typesense (later) |
| Dev / test / CI | Docker Compose · Vitest · ESLint + Prettier · GitHub Actions | native PG · Jest · Biome |

**Rendering:** the logged-in workspace renders in the browser: search engines never see it, and it's heavily interactive. The public wiki, landing and SEO pages get server rendering in v1 via a monorepo `apps/site` (Next.js or Astro), with no rewrite needed.

**Later (per research):** Leaflet/OpenSeadragon + sharp (libvips) tiling, Konva/PixiJS, Yjs + Hocuspocus, Cloudflare R2, Pandoc, Resend/SES, Razorpay + Paddle, Mumbai-region hosting.

## Layout
```
package.json  pnpm-workspace.yaml  tsconfig.base.json  eslint.config.js  .prettierrc
docker-compose.yml   # postgres:17; dev DB + atlas_test
.env.example         # DATABASE_URL TEST_DATABASE_URL BETTER_AUTH_SECRET BETTER_AUTH_URL WEB_ORIGIN
.gitignore  README.md (setup)  plan.md (this plan)
apps/api (@atlas/api)   apps/web (@atlas/web)   packages/shared (@atlas/shared)
.github/workflows/ci.yml   # lint + typecheck + test with Postgres service
```
Root scripts: `dev` (api + web) · `db:up` · `db:generate` / `db:migrate` (Drizzle Kit) · `db:seed` · `test` · `lint` · `typecheck`.

## Data model: `apps/api/src/db/schema.ts`
Everything is world-scoped. Built-in types are seeded per world, so users can edit them.
- **Better Auth tables** (`user`, `session`, `account`, `verification`): generated with its CLI.
- **`worlds`**: id uuid, owner_id, name, slug, description, timestamps, deleted_at.
- **`world_members`**: world_id, user_id, role (owner|editor|commenter|reader|player). The MVP writes the owner row only, so v1 roles need no migration.
- **`entity_types`**: world_id, key, name, icon, color, `field_schema jsonb` (ordered `{key,label,type,options?}`), is_builtin, sort_order.
  - Seeds: Character, Location, Faction, Item, Species, Culture, Event, Lore Article.
  - Users can add their own types (an MVP feature in the research).
- **`entities`**
  - world_id, type_id, name, `aliases text[]`, summary, `fields jsonb`, `body jsonb` (TipTap)
  - `search_text` (derived by the app on write), `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED`
  - `visibility` (public|reader|player|gm|hidden, default gm; enforced in v1)
  - created_by, timestamps, `deleted_at` (Trash)
  - Indexes: (world_id, type_id), (world_id, deleted_at), GIN(search_vector). `'simple'` avoids stemming fantasy names.
- **`relationship_types`**: world_id, key, label, inverse_label. Seeds: member of, located in, owns, ally of, enemy of, parent of, sibling of, spouse of, of species, of culture.
- **`relationships`**: world_id, source_id, target_id, type_id, notes, nullable `valid_from_day` / `valid_to_day` (bigint in-world day; the UI comes with the calendars milestone), timestamps, deleted_at.
- **`tags`** (world_id, name, color) + **`entity_tags`** (entity_id, tag_id).

Rules:
- Fields hold scalars only: text, long_text, number, date-as-text, select, multi_select, boolean, url.
- **Every entity↔entity link is a `relationships` row.** That gives one source for graphs, family trees and "appears in".

## Shared: `packages/shared/src`
- `schemas/`: zod for world, entity type + field definition, entity create/update, relationship, tag, list/search params.
- `fields.ts`: `buildFieldValuesSchema(fieldSchema)` validates `fields`; used by the API and the web forms.
- `search.ts`: `deriveSearchText(entity)` = name + aliases + summary + TipTap plain text + string field values.

## API: `apps/api/src`
- `env.ts` (zod env) · `app.ts` (`buildApp()`, Fastify 5 + zod provider; tests use `app.inject()`) · `server.ts` (:3000).
- `auth.ts`: Better Auth email + password with the Drizzle adapter, mounted at `/api/auth/*`.
  - httpOnly SameSite=Lax cookie; built-in rate limit on.
  - No email verification yet; reset emails go to the console until an email provider is picked.
- `plugins/auth-guard.ts`: `requireSession` (`auth.api.getSession`) and `requireWorldRole(minRole)` (via `world_members`). Every world-scoped query also filters by `world_id`.
- `modules/<name>/{routes,service}.ts`. All routes are under `/api`; world-scoped ones under `/worlds/:worldId`.
  - `worlds`: list, create (seeds types + owner membership in one transaction), get, update, soft-delete.
  - `entity-types`: CRUD + field-schema edit; deleting a type that has entities is blocked.
  - `entities`: list (type/tag filter, sort by name or updated, keyset pagination), create, get, update, soft-delete, restore, trash list.
  - `relationships`: create and delete. Per-entity list covers both directions, with `inverse_label` for incoming links.
  - `tags`: CRUD + attach/detach.
  - `search`: `GET ?q=` runs a ranked prefix search (`to_tsquery(…':*')`) over non-deleted entities.
  - `export`: `GET` returns the full world as JSON (a trust feature).
- `db/client.ts` · `db/seed-definitions.ts` (built-in types and relationship types) · `db/seed.ts` (demo world). Migrations go to `apps/api/drizzle/`.

## Web: `apps/web/src`
The Vite dev proxy sends `/api` to :3000, so cookies are same-origin with no CORS. Uses the Better Auth React client.

Routes:
- `/sign-in` · `/sign-up`
- `/`: my worlds + create
- `/w/:slug`: Codex home with a type sidebar (with counts) and recent entities
- `/w/:slug/codex/:typeKey`: list with tag filter and sort
- `/w/:slug/e/:entityId`: name, aliases, field form from `field_schema`, TipTap body, relationships panel + entity picker, tags, visibility
- `/w/:slug/settings` (+ JSON export) · `/w/:slug/settings/types` (type and field editor) · `/w/:slug/trash`

Ctrl/Cmd+K opens global search (shadcn `Command`). Shell nav: Codex active; Atlas and Manuscript disabled ("coming soon").

Key files: `api/client.ts` (fetch wrapper), `api/queries/*.ts` (Query hooks), `components/{FieldRenderer,RelationshipsPanel,EntityPicker,RichTextEditor}.tsx`.

## Build order
0. Save this plan as `plan.md` in the repo root.
1. Scaffold: monorepo, tooling, docker-compose, `.env.example`, README.
2. Shared: schemas + field validation, with unit tests.
3. API: env → schema/migrations → Better Auth → guards → modules (worlds → types → entities → relationships → tags → search → export), with integration tests per module.
4. Web: auth → worlds → Codex list + entity page → relationships/tags → search → type editor → trash/export.
5. Seed script and CI workflow.

## Later milestones (not this plan)
- **M2 Manuscript:** book › part › chapter › scene, TipTap scene editor, alias-based mention detection, hover cards, "appears in".
- **M3 Atlas:** upload → `sharp` tiling worker → Leaflet CRS.Simple, entity-linked pins, nested child maps + breadcrumbs.
- **M4:** custom calendars, progressions ("as of chapter N"), timeline.
- **M5:** GM basics (view as player, quest log), galleries, Markdown export.

## Verification
1. `pnpm install` → `db:up` → `db:migrate` → `db:seed` → `pnpm dev` (web :5173, API :3000).
2. `pnpm typecheck`, `lint` and `test` pass. API tests (DB `atlas_test`) cover:
   - sign-up and sign-in; world creation seeds types
   - entity CRUD, with field validation rejecting bad values
   - soft delete and restore
   - relationships from both sides, with the inverse label
   - prefix search on names and aliases
   - export completeness
   - **isolation:** user B gets 404/403 on user A's world, entities and export
3. Browser walkthrough:
   - Sign up and create a world.
   - Create the Character "Mira" (aliases, fields, body) and the Location "The Gilded Eel".
   - Link Mira "located in" the Eel; the Eel shows the inverse.
   - Ctrl+K "gild" finds the Eel.
   - Add a custom type "Ship" with fields, and create one.
   - Delete Mira and restore her from Trash.
   - Download the JSON export.
   - A second user in a private window is refused on the first world's URL.

## Milestone 2 (Manuscript): done

- **Data:** `manuscript_nodes` is one tree table (book › part › chapter › scene) holding body, plain text, word count, POV, location and in-world date. `scene_mentions` is derived from scene text.
- **Mentions:** `packages/shared/src/mentions.ts` matches names and aliases: whole words, case-insensitive, longest first, ambiguous terms skipped.
  - The server rebuilds a scene's mentions on save, and rescans the world when an entity is created, renamed, trashed or restored.
  - The editor highlights using the same matcher.
- **API:** the `/manuscript` tree, node create / update / move / delete, `/manuscript/scenes/:id` (and `/body`), `/mention-index` and `/entities/:id/appearances`. The JSON export now includes the manuscript.
- **Web:** contents binder, autosaving scene editor (serialized saves, Ctrl+S), scene details, hover cards (tap on touch screens), Codex side panel, focus mode, and "Appears in" on entry pages.
- **Deferred:**
  - writing goals and streaks, and revision snapshots (both v1 in the research)
  - drag-and-drop reordering (moves are menu-based for now)

## Milestone 3 (Atlas): done

- **Data:** `maps` nest through `parent_id` (the breadcrumbs) and can show an entity. `map_features` holds pins, text labels, paths and regions. Positions are fractions of the map's width and height, so they survive any image size. Features can link to an entity and to another map. Trashed entities read as unlinked until restored.
- **Tiling:** an upload is streamed to disk, its real format and size read with `sharp`, then it is cut in the background into a 256 px WebP pyramid (Google layout, transparent edge padding), one map at a time. The API polls the `processing` / `ready` / `failed` status, retry is a button, and unfinished maps resume on server start.
  - Files live under `STORAGE_DIR` (default `storage/`, git-ignored) behind `modules/atlas/files.ts`, so a move to object storage touches one module.
  - Tiles are served through the API behind the session and membership checks, so private worlds stay private.
  - Limits: 200 MB per file, 40,000 px per side, 1 gigapixel. A 12,000 × 8,000 map tiled in about 18 s using under 300 MB.
- **API:** `/maps` (upload, update, delete, retry), `/maps/:id/tiles/:z/:x/:y`, `/maps/:id/thumbnail`, `/maps/:id/features`, `/entities/:id/maps` and `/atlas/search`. The JSON export now includes maps and features (not the image files).
- **Web:** the map list, a Leaflet viewer (`CRS.Simple`, drawn imperatively), tools for pins, labels, paths and regions, reshaping handles, a side panel for the selected item or the map, breadcrumbs, child maps opened from a pin, "On the map" on entry pages, and map results in Ctrl+K. Items can be set to appear only once you zoom in.
- **Verified in Chrome** (scripted): upload → tiles → deep zoom, every tool, drag and reshape, persistence, child maps and breadcrumbs, search, delete, and a phone-sized screen.
- **Deferred:**
  - replacing a map's image (delete and re-upload for now), and moving tiles to object storage
  - pin clustering (zoom-level visibility covers clutter for now)
  - the v1 items from the research: drill-down transitions, measure tool with travel times, and layers

## Milestone 4 (Timeline): done

- **Calendar:** one per world, with a default fantasy calendar until the world saves its own. It has any months, a weekday cycle, leap rules (every N years, with an offset, "except every M, unless every K"), eras and moons. Dates are stored as one **day number**: day 0 is the first day of year 0, and earlier days are negative. `packages/shared/src/calendar.ts` converts both ways. Changing the calendar relabels dates but never reorders them.
  - Leap years are counted in closed form over one repeat of the pattern, so any year converts in constant time. The tests check real Gregorian facts (leap years, known weekdays, day counts) and round-trip over ±60,000 days on odd calendars.
- **Dates:** every entry has two (`start_day`, `end_day`), named per type (Born/Died, Founded/Dissolved, Begins/Ends…). Scenes get a numeric `in_world_day`; the old free-text date stays as a note. Relationships can now hold for a period, editable with `PATCH /relationships/:id`.
- **Progressions:** a change to an entry's fields (a null clears one) or summary, anchored to a **scene** (reading order) or an **in-world day**. The rules live in `packages/shared/src/progressions.ts`:
  - same-kind anchors compare directly; a scene's day lets scenes and dates be compared
  - what can't be placed (a deleted scene, or an undated scene against a date) is reported as unplaced, never guessed
  - deleting a scene keeps its progressions, unplaced, rather than losing them
- **As of:** `?asOf=s:<scene>` or `?asOf=d:<day>` opens a read-only view of an entry at that point: changes applied and marked, relationships filtered by their period, and a note when it is before its start or after its end.
- **Timeline:** `GET /timeline` returns dated entries and scenes. The page has an SVG chart (lanes by type, drag to pan, Ctrl+scroll or buttons to zoom, an era-aware date ruler) and a list view. Clicking the ruler drops a marker, and entries opened from the timeline then show as of that date.
- **Also:** a calendar editor with presets and a preview, a "took part in" link type, dates in the demo seed and the JSON export, and date labels in the type editor.
- **Verified in Chrome** (scripted, 27 steps): calendar editing and validation, entry dates and range checks, progressions at a scene and a date, as-of views, link periods, scene dates, and the timeline (lanes, selection, marker, zoom, pan, filters, list, phone width).
- **Deferred:**
  - several calendars, and parallel timeline tracks beyond lanes by type
  - progressions for relationships, names and aliases; as-of views for the Atlas (borders by year) and the manuscript
  - timeline playback and journey lines, calendar reminders, and the continuity checker (all v1 or v2 in the research)
