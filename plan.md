# Atlas & Ink: plan

**Product** ([PREREQUISITE_RESEARCH.md](PREREQUISITE_RESEARCH.md)): one linked graph of story entities, seen through 3 views (Atlas = maps, Codex = characters/lore, Manuscript = chapters), plus a GM mode. The full MVP is about 5 months of work.

**Status:** Milestones 1 to 7 are built, tested and on `main`; M2 to M7 each have a "done" section further down. Everything still to do is ticked off in [checklist.md](checklist.md), and the [Roadmap](#roadmap-whats-left) at the end gives the order. From here down to Verification is the original M1 plan, kept as written; notes in square brackets mark where a later milestone changed it.

**This milestone:** auth + Postgres + the entity/type/relationship model + a working **Codex** (create, edit, search, link, trash, export). Atlas and Manuscript come later and build on this model. VibeWise is skipped.

**Env (at the start):** Node 22.13, pnpm 9.15, Docker 29.6, gh; `origin` = github.com/ved-jadhav-10/world-builder.

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

**Later (per research):** Leaflet/OpenSeadragon + sharp (libvips) tiling, Konva/PixiJS, Yjs + Hocuspocus, Cloudflare R2, Pandoc, Resend/SES, Razorpay + Paddle, Mumbai-region hosting. [Leaflet and sharp arrived in M3 and Resend in M7; the rest is still ahead.]

## Layout
```
package.json  pnpm-workspace.yaml  tsconfig.base.json  eslint.config.js  .prettierrc
docker-compose.yml   # postgres:17; dev DB + atlas_test
.env.example         # DATABASE_URL TEST_DATABASE_URL BETTER_AUTH_SECRET BETTER_AUTH_URL WEB_ORIGIN
                     # [later: API_PORT, STORAGE_DIR, EMAIL_PROVIDER, RESEND_API_KEY, EMAIL_FROM, REQUIRE_EMAIL_VERIFICATION, TRUST_PROXY]
.gitignore  README.md (setup)  plan.md (this plan)
apps/api (@atlas/api)   apps/web (@atlas/web)   packages/shared (@atlas/shared)
.github/workflows/ci.yml   # lint + typecheck + test with Postgres service
```
Root scripts: `dev` (api + web) · `db:up` / `db:down` · `db:generate` / `db:migrate` (Drizzle Kit) · `db:seed` · `test` · `lint` · `typecheck` · `format` · `build`.

## Data model: `apps/api/src/db/schema.ts`
Everything is world-scoped. Built-in types are seeded per world, so users can edit them.
- **Better Auth tables** (`user`, `session`, `account`, `verification`): generated with its CLI.
- **`worlds`**: id uuid, owner_id, name, slug, description, timestamps, deleted_at.
- **`world_members`**: world_id, user_id, role (owner|editor|commenter|reader|player). The MVP writes the owner row only, so v1 roles need no migration. [M6 added invites for player, reader and co-GM (`editor`).]
- **`entity_types`**: world_id, key, name, icon, color, `field_schema jsonb` (ordered `{key,label,type,options?}`), is_builtin, sort_order.
  - Seeds: Character, Location, Faction, Item, Species, Culture, Event, Lore Article.
  - Users can add their own types (an MVP feature in the research).
- **`entities`**
  - world_id, type_id, name, `aliases text[]`, summary, `fields jsonb`, `body jsonb` (TipTap)
  - `search_text` (derived by the app on write), `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED`
  - `visibility` (public|reader|player|gm|hidden, default gm) [enforced on every read since M5]
  - created_by, timestamps, `deleted_at` (Trash)
  - Indexes: (world_id, type_id), (world_id, deleted_at), GIN(search_vector). `'simple'` avoids stemming fantasy names.
- **`relationship_types`**: world_id, key, label, inverse_label. Seeds: member of, located in, owns, ally of, enemy of, parent of, sibling of, spouse of, of species, of culture.
- **`relationships`**: world_id, source_id, target_id, type_id, notes, nullable `valid_from_day` / `valid_to_day` (bigint in-world day) [editable since M4], timestamps, deleted_at.
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
  - No email verification yet; reset emails go to the console until an email provider is picked. [M7 added both, through Resend, plus our own request limits.]
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

Ctrl/Cmd+K opens global search (shadcn `Command`). Shell nav: Codex active; Atlas and Manuscript disabled ("coming soon"). [All views are live now, plus Timeline, Quests, Gallery, People and `/account`.]

Key files: `api/client.ts` (fetch wrapper), `api/queries/*.ts` (Query hooks), `components/{FieldRenderer,RelationshipsPanel,EntityPicker,RichTextEditor}.tsx`.

## Build order
0. Save this plan as `plan.md` in the repo root.
1. Scaffold: monorepo, tooling, docker-compose, `.env.example`, README.
2. Shared: schemas + field validation, with unit tests.
3. API: env → schema/migrations → Better Auth → guards → modules (worlds → types → entities → relationships → tags → search → export), with integration tests per module.
4. Web: auth → worlds → Codex list + entity page → relationships/tags → search → type editor → trash/export.
5. Seed script and CI workflow.

## Later milestones
All built; each has a "done" section below: **M2** Manuscript, **M3** Atlas, **M4** calendars, progressions and timeline, **M5** GM tools, galleries and Markdown export, **M6** invites and members, **M7** accounts, email and abuse limits. What is left is in [checklist.md](checklist.md), with the suggested order in the Roadmap at the end.

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

## Milestone 5 (GM tools, galleries, Markdown export): done

- **Audiences ("view as"):** everything has a visibility, and each audience sees a fixed set: the GM everything, a player public + player, a reader public + reader, the public only (`packages/shared/src/audience.ts`). The API enforces it on every read; this is not a cosmetic filter.
  - A `player` or `reader` member gets their audience from their role. A GM can preview another one with an `x-view-as` header; previews are read-only (every write returns 403), and a real player sending the header is ignored.
  - What is filtered: entries, search, type counts, relationships and tags that point at hidden entries, the timeline, progressions, maps, pins, gallery pictures and quests. A hidden entry answers 404 like a missing one. A pin tied to a hidden entry, or a link to a map the audience can't open, is dropped rather than leaked.
  - The manuscript is the author's own workspace, so it is GM-only (403 for others). Scene-anchored progressions are withheld from other audiences, since they point into it.
  - Maps, pins, progressions and pictures have their own visibility, **GM-only by default** like entries.
- **Quest log:** quests are entries of a new built-in Quest type (status Not started / Ongoing / Completed / Abandoned, objectives, reward) with a "given by" link, backfilled into existing worlds by the migration. `/quests` is a board you can drag cards across, and a quest's visibility decides whether players see it.
- **Galleries:** pictures per entry (the first becomes its portrait; one portrait per entry is enforced by the database) and per world. Uploads are checked by content, bounded to 4096 px, re-saved as WebP with a thumbnail, and lose their metadata (GPS and camera tags). A picture can be tagged to a scene or date, and an entry viewed "as of" a moment shows the picture that fits it.
- **Markdown export:** `GET /export/markdown` returns a zip with one note per entry (YAML front-matter, `[[wikilinks]]`, relationships, changes over time), the manuscript as chapters of scenes, maps with their pins, a timeline, the calendar, the pictures, and the full JSON. Every link points at a note that exists (tested). Editors only, since it includes GM-only content.
- **Fixed on the way:** libvips keeps files open in a cache, and on Windows that broke deleting a map or picture (`EBUSY`). The cache is off and file removal retries.
- **Verified in Chrome** (scripted, 19 steps), including a **real player** in a second session: gallery upload, lightbox edits and portrait swap, the as-of picture, the quest board with drag and drop, the preview banner, and what a player cannot see or do.
- **Deferred:**
  - inviting players and readers (the roles and enforcement exist; there is no invite flow or portal yet) [done in M6], and "hidden until chapter N" reveals
  - visibility per field or per block inside an entry
  - the GM screen dashboard, session notes, handouts pushed live, fog of war, and exporting only what players can see

## Milestone 6 (Invites and members): done

- **Invite links:** the owner makes a link for a role (player, reader or co-GM) with an expiry (1, 7 or 30 days, or never; 7 by default) and a use limit (one person up to unlimited), plus a note such as "Tuesday group". `/join/<token>` shows what the link is for before anyone signs in, then sends visitors through sign-up or sign-in and back (the `next` address now survives both forms).
  - Only a SHA-256 hash of the secret is stored, so a leaked database does not leak working links. The secret is shown once, when the link is made; a lost link is cancelled and replaced. Cancelling deletes the row and leaves the people who joined with it where they are.
  - A use is claimed by one conditional `UPDATE` inside the transaction that adds the member, so several people racing for the last use cannot all get in (tested with five at once); a refused attempt rolls its membership back. Check constraints add a second layer: a link can never be for an owner or be used past its limit.
  - Someone who is already a member keeps their role and uses up nothing, so an owner opening a player link is not demoted and a player opening a co-GM link is not promoted.
- **Members:** the owner sees name, email and role, changes a role (the person's view changes at once, since every read is filtered by the live role), or removes someone, who can return with a new link. Members can leave from the sidebar; the owner cannot leave or be changed. Roles an owner can hand out are player, reader and co-GM (`editor`); `commenter` stays in the schema but is not offered, since it has no features yet.
- **Rules:** people management is owner-only (co-GMs get 403), is refused while previewing as another audience, and gives strangers a 404. The unauthenticated preview reveals only the world's name, the role and the inviter's name, to someone holding the secret; unknown, cancelled and deleted-world links all answer 404, while an expired or used-up one answers 410 with the reason. Invites and members are not in the exports (they hold emails).
- **Web:** World settings › People (members, role selects, remove, invite links and a dialog that shows the link once with a Copy button), the join page, "Leave world" in the sidebar for anyone who is not the owner, and role names ("Co-GM") on the worlds list. The demo seed now also creates `player@atlas.local` and `reader@atlas.local` (password `demo-password`) as real members of Aerth.
- **Verified in Chrome** (scripted, 14 steps, with separate browser sessions for the GM, a new player and a co-GM): link creation and the once-only secret, the signed-out join page, sign-up and sign-in round trips through the link, what a real player sees and cannot do, a role change taking effect, invalid and expired links, an existing member keeping their role, cancelling, leaving, removing, and phone width. This caught a real bug (the role toast read the select after it had reverted).
- **Deferred:**
  - handing ownership to someone else, and several owners
  - email invitations (there is no email provider yet, so links are shared by hand) [done in M7], and an "invite by name" lookup
  - a notice to the GM when someone joins, and an audit trail of who joined with which link
  - the rest of the player portal from the research: player journals and notes on entries, "hidden until chapter N", handouts pushed live, and exporting only what players can see

## Milestone 7 (Accounts, email and abuse limits): done

- **Email:** `lib/mailer.ts` sends through Resend over plain HTTPS (no SDK), or prints the message to the API log when `EMAIL_PROVIDER=console` (the default, for development). Tests collect messages in an in-memory outbox. Templates are in `lib/email-templates.ts` and escape every name.
  - Sending is in the background, so a slow or failing provider never holds up a request, and password-reset answers take the same time whether or not an account exists.
- **Sign-up and sign-in:** `REQUIRE_EMAIL_VERIFICATION` (on by default whenever the provider is real) refuses sign-in until the address is confirmed. Sign-up then leads to a "Check your email" page, and trying to sign in again sends a fresh link. Following the link confirms the address and signs the person in. A used or expired link explains itself.
- **Password reset:** forgot-password and reset-password pages. The reset ends every other session, and the answer is identical for unknown addresses (tested).
- **Account page** (`/account`, from the name in the sidebar or the worlds list): rename, change password (signs out other devices) and delete the account. Deleting asks for the password, lists the worlds that will go, removes the person and every world they own (the database cascades the rows) and then their map and picture files from disk. Worlds someone only joined are left alone.
- **Emailed invites:** the invite dialog takes up to 10 addresses. The link is emailed once, when it is made, since the secret is never stored; the owner still sees the link as before.
- **Rate limits:** `@fastify/rate-limit` with per-route allowances in `lib/rate-limits.ts`, counted per signed-in person or client address: invite lookup and join, invite creation, world creation, uploads, search and exports. Over the limit is a 429 with a readable message. Better Auth's own limits (sign-in, sign-up, reset and confirmation emails) now see the real client address, handed over in a header the auth route sets from Fastify's `request.ip`; before this they all shared one bucket. `TRUST_PROXY=true` makes that address the one a proxy forwards.
- **Verified in Chrome** (scripted, 17 steps, with email confirmation switched on): sign-up and the check-email page, an unconfirmed sign-in, the confirmation link, renaming, a wrong and a right password change, a bad address in the invite dialog, an emailed invite, forgot and reset password, the old password failing, a bad reset link, account deletion with a wrong and a right password, and phone width. It caught a real bug: the sign-up form was replaced by a spinner while the session was re-read, wiping the "check your email" message, so that message is now a page of its own.
- **Deferred:**
  - a verified sending domain and the real provider keys (launch work, see the checklist), and a notice to the owner when someone joins
  - changing the email address, and downloading all of an account's data in one file (each world still exports on its own)
  - sharing rate-limit counters between API instances

## Roadmap: what's left

The to-do list is in [checklist.md](checklist.md): every feature not built yet, grouped by area (A to H, plus the validation work in I) and tagged with the research's phase (MVP, v1, v2, v3). This section keeps the decisions that go with it.

### Suggested order
1. **Launch readiness (section A).** Nothing else matters until strangers can safely use it. Email, account deletion and rate limits are done (M7); object storage, deployment, the legal pages and age rule, and billing are not.
2. **Public reader wiki with spoiler gating (F).** The research ranks it as the strongest reason to switch, and the audience rules, progressions and invites it needs now exist.
3. **GM screen, session notes and rollable tables (D).** Finishes the game-master half.
4. **Relationship graph, family trees and plot board (B).** Finishes the writer half.
5. Then the rest of B to F, importers (H) for whichever tool users most want to leave, and v2 and v3 items as demand shows.

### Deliberately not building (integrate or skip)
A battlemap VTT, dynamic lighting, line of sight and 3D minis; full rules automation; character builders for licensed game systems; hosting audio files; a paid-GM marketplace; random dungeon generation (import instead); streaming audio to Discord (use Kenku FM).

### Known limits to revisit
- Tiling runs in the API process, one map at a time; uploads and tiles are on local disk.
- Rate-limit counters (ours and Better Auth's) live in each API process's memory, so they are per instance.
- libvips caching is off (`sharp.cache(false)`) because it broke file deletes on Windows; a Linux deployment could turn it back on after testing.
- The manuscript is the author's own workspace, GM-only; readers cannot see chapters yet (section F of the checklist).
- "View as" previews and invited members share one audience engine; new content types must go through `visibleTo()` and the audience rules, with a test in `audience.test.ts`.
