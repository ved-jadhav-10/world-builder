# Atlas & Ink: plan

**Product** ([PREREQUISITE_RESEARCH.md](PREREQUISITE_RESEARCH.md)): one linked graph of story entities, seen through 3 views (Atlas = maps, Codex = characters/lore, Manuscript = chapters), plus a GM mode. The full MVP is about 5 months of work.

**Status:** Milestones 1 to 50 are built, tested and on `main`; M2 to M25 each have a "done" section further down. Everything still to do is ticked off in [checklist.md](checklist.md), and the [Roadmap](#roadmap-whats-left) at the end gives the order. From here down to Verification is the original M1 plan, kept as written; notes in square brackets mark where a later milestone changed it.

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
All built; each has a "done" section below: **M2** Manuscript, **M3** Atlas, **M4** calendars, progressions and timeline, **M5** GM tools, galleries and Markdown export, **M6** invites and members, **M7** accounts, email and abuse limits, **M8** dice, rollable tables and the roll log, **M9** session notes and the GM screen, **M10** the relationship graph and family trees, **M11** the plot board and structure templates, **M12** the continuity checker. What is left is in [checklist.md](checklist.md), with the suggested order in the Roadmap at the end.

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

## Milestone 8 (Dice, rollable tables and the roll log): done

- **Dice:** `packages/shared/src/dice.ts` parses and rolls `2d6+3`, `d20`, `d%`, `4d6kh3` and `2d20kl1` (keep highest or lowest), `3d6!` (exploding, cut off after 20 extra dice) and sums of those with constants. Limits: 100 dice per term, 1,000 sides, 10 terms. Parsing never throws; it returns a message saying what to fix. The random source is passed in, so the server uses `crypto.randomInt` and the tests a fixed one.
- **Tables:** a table's rows have weights, and rolling picks a position from 1 to the total weight, so weights 3, 3, 4 make a d10 with ranges 1-3, 4-6 and 7-10 (`rowRanges`). That covers both weighted rows and dice ranges. Row text can hold `[[2d6]]` (rolled in place) and `{{Other table}}` (rolls that table and splices in the result); a chain that loops back or goes more than 4 deep stays as written, with a note. Names are unique per world, ignoring case, because chaining finds tables by name. Pasted rows (`1-3, Rain`, tab or comma separated, quoted fields, a header row) are read by `parseTableText`, which reports every line it skipped or changed.
- **Roll log:** `rolls` keeps the newest 500 per world. Each entry is GM-only or "shown to the players", and players poll it every few seconds. Rolling is the GM's (editors, not while previewing); players see only the tables and rolls the GM shared. Tables have a visibility like everything else, and a hidden table answers 404.
- **API:** `/tables` (list, get, create, update with all rows replaced, delete), `/tables/:id/roll`, `/dice/roll` and `/rolls` (list, clear). Rolls are rate-limited (240 a minute). Tables are in the JSON export (as `rollTables`) and the Markdown export (`Tables/<name>.md`, with the roll ranges); the roll log is not exported.
- **Web:** Tables & dice in the sidebar (GM and players), a page with the table list, an editor (weights, derived ranges, add, remove, import dialog, visibility, save, delete) and a roll panel with a dice box, quick dice, "show my rolls to the players" and the log. After a roll, the row that came up is highlighted.
- **Also:** the Vite dev proxy follows `API_PORT`, since another project can hold port 3000.
- **Verified in Chrome** (scripted, 17 steps, with a real GM and a real player): creating and importing, saving before rolling, chained tables with inline dice, duplicate names refused, keep-highest dice with the dropped die struck out, bad expressions, sharing a roll and a table with a player, what the player cannot see or do (create, roll, edit, a hidden table), the import report, delete, clear log and phone width. It caught a real bug: deleting a table made the page refetch the deleted table and log a 404.
- **Deferred:**
  - an embeddable roller inside prep notes and session notes (comes with the session notes and the GM screen)
  - players rolling their own dice (only the GM rolls for now)
  - saving a roll's result as an entry (an entry-aware generator, v2)

## Milestone 9 (Session notes and the GM screen): done

- **Session notes:** sessions are entries of a new built-in Session type, like quests, so search, tags, links, dates, "as of" views, exports and visibility all work with no new machinery. Fields: number, status (Planned or Played), played on, recap and threads for next time; the body holds the prep and notes. A new `featured` link type ("features" / "featured in") ties a session to the characters, places and quests in it, using the ordinary relationships panel. The migration adds the type and link to existing worlds, and `GET /sessions` / `POST /sessions` list them (newest first, each with its links) and start the next one, numbered after the highest and called "Session N". Numbers count trashed sessions too, so one is never reused. A recap shared with the players is just a session whose visibility is Players; a player sees only those, and only the links to entries they can see. The link-gathering code that quests used now lives in `lib/entry-links.ts`, shared by both.
- **GM screen:** a page of widgets that belongs to one GM in one world (`gm_screens`, one row per person and world, the widgets stored as JSON and validated by `gmScreenSchema`). It is GM-only: players, readers and a GM previewing another view get 403. Widgets are dice and roll log, a table roller (pick a table, roll, optionally show the players), pinned entries (name, type and summary, resolved by the server so trashed entries drop out but stay pinned for a restore), a scratchpad, a segmented clock (4 to 12 segments, for doom clocks and countdowns) and the current session. Up to 24 widgets; each can be renamed, moved earlier or later and removed. A first-time GM gets dice, the current session and a scratchpad. The page autosaves a moment after the last change and again when leaving the page.
- **Also:** `RollPanel` has a compact mode for widgets, and the entry icon set gained the notebook pen.
- **Verified in Chrome** (scripted: 7 steps for sessions, 12 for the screen, with a real player): starting a session, the list with status, date, summary and links, what a player sees and does not, autosave of the scratchpad, dice and table rolls from the screen, pinning and unpinning entries with their summaries, the clock, reordering and removing with the order kept across a reload, a change saved on leaving the page, the player's refusal on both the page and the API, the preview view, and phone width. It caught a real accessibility nit: the dice widget nested a second landmark with the same name inside its frame.
- **Deferred:**
  - dragging widgets (they move with buttons for now), widgets that span columns, and several screens per world
  - an initiative tracker and HP (a v2 item; the scratchpad covers it for now)
  - a "mark as played" shortcut on a session card and a recap template
  - live tables embedded inside prep notes
  - player handouts pushed live

## Milestone 10 (Relationship graph and family trees): done

- **Graph:** `GET /graph` returns the neighbourhood of one entry (`focus`, `depth` 1 to 3, `limit` up to 300) or, with no focus, the most connected entries of the world. Links are followed one step at a time from the focus, only links among the entries returned come back, and `truncated` says when more was connected than fit. `day` keeps only the links that hold on that in-world day (their periods come from M4). Nodes carry the number of links drawn, not the number in the database.
- **Family:** `GET /family/:id` walks "parent of" up and down a number of generations (0 to 5 each way, at most 250 people), then adds the spouses and siblings of everyone found without following their own lines. Aunts and uncles appear only when linked as siblings of someone in the tree.
- **Audiences:** both are filtered like everything else. A link to an entry the audience cannot see is dropped before degrees are counted, so a player's picture does not show that anything hidden is there. A hidden entry cannot be the centre of a graph or tree; it answers 404 like a missing one.
- **Layouts (`packages/shared`, no new dependency):** `graph-layout.ts` is a deterministic force-directed layout (nodes start on a circle in the order given, so the same data always draws the same picture); `family.ts` puts each generation on a row, keeps couples side by side (several spouses in a row are allowed), centres children under their parents and orders each row by where the parents ended up. A person is placed in the generation the first path from the focus reaches, and loops, self-links and links to strangers are survived rather than hung on. Both are covered by unit tests, including a 250-node timing guard.
- **Web:** a Graph page (pan by dragging, zoom with the wheel or buttons, hover to spotlight an entry's neighbours, click for a panel with its links, double-click or "Centre here" to refocus, filters by entry type and by link type, "Label every link", dashed lines for links that hold only for a time) and a Family tree page (click a person to centre on them, double-click to open, ancestors and descendants selectors, zoom buttons, an explanation when no family is linked). Entry pages link to both, and Graph is in the sidebar for everyone.
- **Verified in Chrome** (scripted, 14 steps, with a real player): the world graph, focus and depth, the details panel and Centre here, the type and link filters and labels, wheel zoom, drag pan and reset, the family tree's rows, centring and generation limits, opening an entry, the empty family state, what a player cannot see in either page, a hidden entry as a focus, and phone width. It caught two real bugs: capturing the pointer on press sent the click to the background instead of to the entry, and the wheel listener was never attached because the SVG is not mounted yet when the page first renders.
- **Deferred:**
  - dragging nodes, saving a hand-arranged layout, and an in-world date control on the graph page (the API takes `day`)
  - aunts, uncles and cousins in the tree (the whole lineage of the ancestors), and marking divorces or deaths on it
  - faction diplomacy scores and the arc tracker, which build on this data

## Milestone 11 (Plot board and structure templates): done

- **The board:** a plot board is a grid. The columns are **beats** (the stages of a structure), the rows are **storylines** (one per plot thread, with a colour), and a **card** sits in one cell: one thing that happens, with a title, notes, an optional colour and an optional link to a manuscript scene. A world can have up to 20 boards, a board up to 40 beats, 20 storylines and 1,000 cards. The database enforces that a card can only sit in a beat and a storyline of its own board (composite foreign keys), whatever the code does, and deleting a beat or storyline takes its cards with it (the page says how many first). A board always keeps at least one beat and one storyline. A card's scene link is dropped, not the card, if the scene is deleted.
- **Templates:** a new board starts from Three-act structure (9 beats), Save the Cat (15), the Hero's Journey (12), Kishōtenketsu (4) or a blank board; each beat comes with a short reminder of what it is for, written for this app. After that the beats are ordinary: rename, reorder, add and remove them freely.
- **API:** `/plot` (boards), `/plot/:id` and, under it, `/beats`, `/threads`, `/cards`, `/cards/:id/move` and `PUT /order` (new order of columns and/or rows, which must list every one exactly once). Every change answers with the whole board, so the page shows what the server numbered. Moving a card renumbers both cells in one transaction under a row lock on the board, so simultaneous moves cannot leave a cell with repeated or skipped places (tested with six at once). Like the manuscript, boards are the author's own workspace: only the GM's view reads them, only editors change them, and a GM previewing another view gets 403.
- **Web:** Plot boards in the sidebar (GM only); a list with a template picker; a grid that scrolls inside its own frame, with the storyline names pinned on the left. Cards drag between cells (dropping on a card inserts before it, applied at once and put back if the server refuses), and open into a dialog with the same beat and storyline choices, so touch screens, where dragging does not work, can move cards too. Click a beat or storyline to rename, reorder or delete it. Plot boards are in both exports (JSON as `plotBoards`; Markdown as `Plot/<board>.md`, beat by beat, with scene links).
- **Verified in Chrome** (scripted, 13 steps, with a real player): the template picker, a fifteen-column Save the Cat board, adding cards with notes and colours, dragging between cells and onto a card with the result persisted, moving a card from its dialog, linking a scene and following the link, adding and renaming a storyline, renaming and reordering a beat, deleting a beat with a warning of its card count, renaming the board, the player's refusal on the page and the API, and phone width. Playwright cannot drag to a column that is scrolled out of view, so that check uses a four-beat board; browsers scroll the grid when you drag near its edge. It caught a real bug in the API: `.partial()` on a schema with defaults would have wiped a beat's description (and a storyline's colour) on every rename.
- **Deferred:**
  - the multi-thread timeline view (a row per storyline over in-world time), and showing a card's scene word count and status
  - drag to reorder beats and storylines (buttons for now), and cards that span several beats
  - a board's use as a checklist against the manuscript (which scenes lack a card), and structure templates a user saves themselves

## Milestone 12 (Continuity checker): done

- **The rules** (`packages/shared/src/continuity.ts`, a pure function of plain data, so the server only loads rows and the tests can set up any story):
  - **Appears after the end / before the start:** an entry with an end (or start) date is mentioned in a scene dated after (or before) it. Scenes where the entry is the point of view are left to the next rule, so a narrator is reported once.
  - **Narrates outside their life:** a scene told from the point of view of someone whose dates exclude the scene's date.
  - **Parent born after child**, and **child born more than a year after the parent ended** (a year is the length of year 0 in the world's own calendar).
  - **Link outside someone's life:** a link whose period starts before one of its entries began or after it ended, such as a marriage that starts after a death.
  - **Two owners at once:** two "owns" links to one item, by different owners, whose periods overlap (an open end counts as always); handing an item on, with an end date on the first, is accepted.
  - **In two places at once:** one narrator's scenes on one day set in different locations (a notice: travel may be possible; the checker knows nothing of distances).
- **Warnings and notices:** a problem with a character is a warning; the same with a place or a thing (a city that fell and is later ridden through) is only a notice.
- **Dismissing:** a flashback, a ghost or a ruin can all be on purpose, so a finding can be marked "it's intended". Each finding has a key built from the rule, the entries and a short hash of the scenes behind it. A dismissal therefore holds until the facts change: add another offending scene and the finding comes back, with its own key. Dismissals are per world and shared by co-GMs, and can be brought back.
- **API:** `GET /continuity` runs the rules (mentions come from the scene text, the same matcher as everywhere else) and returns the findings, the dismissed ones, names for everything mentioned and how much was checked; `POST` and `DELETE /continuity/dismissals`. It reads the manuscript and GM-only entries, so it is GM-only: players, readers and a GM previewing another view get 403.
- **Web:** Continuity in the sidebar (GM only). Findings in plain language, with dates in the world's calendar ("Their end date is 11 Rimewane, 2 AF, but 1 scene set later mentions them"), links to the entries and scenes involved, a filter by kind, "Check again", and the dismissed ones tucked away with "Bring back". An empty world says what to add (dates on entries and scenes) to get checks.
- **Verified in Chrome** (scripted, 10 steps, with a real player): the empty explanation, three findings with calendar dates and links, the kind filter, dismissing and surviving a reload, bringing back, a new scene reviving a dismissed finding, fixing a date making a finding go away, the player's refusal on the page and the API, and phone width.
- **Deferred:**
  - travel feasibility ("can they get from Vesh to the docks in a day?"), which needs distances on the Atlas and travel speeds
  - ages that clash with a species' lifespan, item ownership by someone who is dead, and progressions that contradict each other
  - findings on the entry page itself, and a count in the sidebar
  - rules a world can switch off or tune

## Milestone 13 (Atlas upgrades): done

- **Replace a map's image:** `POST /maps/:id/image` re-tiles the map from a new file and keeps every pin, label, path and region, since positions are fractions of the map. The map's `image_version` goes up and the tile and thumbnail addresses carry `?v=`, so a browser that cached the old tiles for a year fetches the new ones. Refused while the map is still being prepared (409); fixes a map whose tiling failed. A different-shaped image stretches the pins' positions, and the page says so after the upload.
- **Pin clustering:** pins that would sit within 34 screen pixels of each other become one numbered marker. Hovering names what is inside; clicking zooms to fit them. `clusterPins` in `packages/shared/src/map-tools.ts` is a pure, deterministic grid-hashed function (no flicker, every pin in exactly one group, the selected pin never absorbed); nothing clusters at the deepest zoom, so pins on the same spot still part.
- **Measure tool and travel times:** a map has an optional **scale** (`maps.scale`, jsonb: how many units the whole width spans, a unit name, and up to eight travel paces such as on foot 24 mi/day, horse, ship). The Measure tool (anyone can use it) shows the distance of a clicked route and how long each pace takes ("2 days 4 hours"; a day counts as 8 hours when a trip is under a day). The GM can set the scale from a line of known length ("this line is 120 mi") or in the map settings, with typical paces for miles, kilometres and leagues; a measured line can be saved as a path, and a path's panel shows its own length and times. Pixels are assumed square.
- **Layers:** named groups of features per map (`map_layers`, up to 20, `layer_id` on features, deleting a layer returns its items to the base map). Anyone can switch layers on and off for their own view, remembered per map in the browser; the GM chooses which start on. Other audiences only get layers that hold something they can see, so a secret layer's name does not leak.
- **GM prep notes on pins:** `gm_notes` on every map item, sent only to the GM and co-GMs (empty for players and in a "view as" preview), editable in the item's panel.
- **Exports:** the JSON export has layers, scales and prep notes; the Markdown export lists a map's scale, each item's layer and its GM notes (it is editor-only, like the rest of that export).
- **Fixed on the way:** dialogs taller than the screen could not be scrolled (the new settings made one taller); they now scroll.
- **Verified in Chrome** (scripted, 13 steps, with a real player): clustering and zooming apart, layer toggling and persistence, adding and deleting a layer, a pin's layer and prep notes, scale from a known line, distances and paces, undo, settings, a measured path, replacing the image (new tile addresses, pins kept), what a player can and cannot do, and a phone-sized screen.
- **Deferred:**
  - drill-down transitions (the child map visually opening from its spot on the parent)
  - layer ordering by drag, per-layer colour or opacity, and time-aware layers (borders by year)
  - travel feasibility in the continuity checker (the scale makes it possible now)
  - moving tiles to object storage, and keeping the old image until a replacement has tiled

## Milestone 14 (Version history): done

- **What is kept:** a `revisions` table holds snapshots of an entry (name, aliases, summary, fields, notes, start and end dates) or a scene (title, summary, text). Visibility is deliberately not part of a snapshot, so restoring can never expose something that was later hidden. Exactly one of `entity_id` and `node_id` is set (a check constraint); deleting the entry or scene deletes its history, trashing does not.
- **When versions are made** (`modules/revisions/service.ts`, hooked into the entry PATCH and the scene body and title/summary routes):
  - before the first edit of something with no history, its current text is kept as the earliest version, so even the first edit can be undone
  - after each edit, saves by the same person within 10 minutes of a version's start are folded into it, so writing makes a version every ten minutes or so rather than one per autosave; a save that changes nothing kept (a visibility change, a scene's date) adds nothing
  - past 60 automatic versions the oldest are dropped; people can also keep named versions (up to 100, deleted by hand)
- **Restoring** keeps the present text first if it is not already the newest version ("Before restoring an older version"), applies the old one through the normal update code (search text, mentions and word counts follow), then records a "Restored an older version" marker. The marker is its own kind of version, so the next edit starts a version of its own instead of being folded into, and overwriting, the one before. If a field the entry's type no longer has blocks the restore of its fields, the text is restored and the fields left as they are.
- **GM only:** every history route needs the editor role and the GM audience, so players, readers and "view as" previews get 403, and other worlds get 404. A co-GM's edits are recorded under their own name.
- **Text comparison** (`packages/shared/src/text-diff.ts`, pure): paragraphs are matched by longest common subsequence; a removed paragraph beside an added one is compared word by word (full stops and commas count as their own tokens, so "fisher." against "fisher" is not a change to the word), and two paragraphs with little in common show as a removal and an addition. Played back, a diff always gives exactly both sides; very long paragraphs fall back to replaced rather than freezing.
- **Web:** a History button on the entry page header and in the scene toolbar opens one dialog: the list of versions (who, when, how many words), a comparison with what is there now (green comes back, struck through goes away, long unchanged runs folded), naming a version, deleting one, and Restore with a confirmation. A scene's pending text is saved before the list loads, so it is in it; after a restore the notes editor or scene editor reloads the restored text. The entry page's header row now wraps on a phone.
- **Verified in Chrome** (scripted, 9 steps, with a real player): an edit and save listing two versions, the word-level comparison, naming a version, restoring (and that nothing is left unsaved), the replaced text staying in the history, a scene's version restored into a reloaded editor, a player seeing no History control and getting 403, and a phone-sized dialog.
- **Deferred:**
  - history for chapters, books and other kinds of record (map items, relationships, tags, entry types)
  - comparing two old versions with each other, and restoring only part of a version (just the text, or just one field)
  - showing who changed what in a shared entry as a live change feed, and comments (the next feature, which will use the same GM-only footing)

## Milestone 15 (Writing goals, streaks and sprints): done

- **Counting words** (`modules/writing`): every manuscript save works out how many words the scene gained or lost (new word count minus the saved one) and adds it to that person's total for the day in `writing_days`. Net words, so cutting a scene counts against the day; restoring an old version is not counted as writing. Counting is wrapped so that a failure can never get in the way of saving the text.
  - Days are calendar dates in the writer's own time zone, stored per person per world in `writing_goals`. It is fixed the first time the page is opened (from the browser) and changes only when the person says so, so travelling does not shuffle days already counted. "Today" is worked out in Node with `Intl`, not in Postgres: a browser reported `Asia/Calcutta`, which the Docker Postgres did not know, and the first version of the query returned a 500 for it (caught by the Chrome check, then covered by a test).
- **Goals:** a daily word goal, a manuscript target and a deadline, each optional and clearable; goals and words are personal, so a co-GM's do not change the owner's.
- **The numbers** (`packages/shared/src/writing-stats.ts`, pure and tested, including month, year and leap-day boundaries):
  - streaks: a day counts when it reaches the daily goal (any words at all with no goal); today does not break a streak until it has ended; the longest streak comes from the last year
  - manuscript progress as a percentage, and the words a day still needed to meet the deadline (today counts as a day; none once the target is met or the deadline has passed)
  - a Monday-to-Sunday heatmap, shaded by how close each day came to the goal (500 words stands in when there is no goal)
- **Sprints:** a timed sprint (10, 15, 25 or 45 minutes) records the day's words when it starts and, when time is up, how many were added since. It lives in `localStorage` outside React, so it keeps running while moving around the world; a runner mounted for the GM finishes it (and finishes one whose tab was closed, the next time the world opens). Finished sprints are saved and listed.
- **Web:** a "Writing goals" page (today against the goal, streak, manuscript progress, a six-month heatmap, a goals form, the sprint card with recent sprints) and a small chip in the scene toolbar: the sprint clock and words so far, or today's words against the goal.
- **GM only,** like the manuscript: players, readers and previews get 403.
- **Verified in Chrome** (scripted, 8 steps, with a real player): the empty page, saving goals, writing in a scene (the chip, the streak, a full heatmap cell), a sprint running across pages and being stopped, a sprint finishing with the right word count, a player refused, and a phone-sized screen.
- **Deferred:**
  - overused-word tracking and style or genre guide entries (the rest of that checklist item)
  - per-book or per-chapter targets, goals shared across a team, and a streak "freeze"
  - email or push reminders (an integration, so it waits with launch work)

## Milestone 16 (Bulk edit): done

- **API:** `POST /entities/bulk` applies one change to up to 200 entries in a single transaction: set who can see them, add a tag, remove a tag, or move them to the Trash. It answers `{ updated, skipped }`; ids that are not live entries of this world (unknown, already trashed, from another world) are skipped rather than failing the batch, so a stale selection still does the rest, and repeated ids count once. A tag from another world is a 404. Editors only; a "view as" preview is refused like every write. Trashing rebuilds the scene mentions once, not per entry.
- **Web:** a "Select" button on each type's list (editors) adds a checkbox to every row and a bar above the list: how many are picked, a "select all shown" box, who can see them (with a confirmation naming the audience), add or remove a tag, and move to Trash (with a confirmation; the Trash page restores them). Only entries on screen are changed, so changing a filter never touches rows you cannot see; after a change the selection clears.
- **Verified in Chrome** (scripted, 7 steps, with a real player): the checkboxes and counts, changing visibility for five entries, adding a tag to two and filtering by it, removing it, trashing two and finding them in the Trash, a player seeing no Select button and getting 403, and a phone-sized bar.
- **Deferred:**
  - bulk edit from search results and the all-entries list, and moving entries between types
  - bulk edits of dates or fields, and an undo for a bulk visibility change
  - to-do lists (the other half of that checklist item)

## Milestone 17 (Manuscript export to Word): done

- **What it makes:** `GET /export/manuscript.docx` builds a `.docx` with the `docx` library (MIT) from the manuscript tree: a title page (author and approximate length at the top, the title and "by" in the middle), then parts, chapters (each on a new page) and scenes in reading order, with the writer's formatting kept (bold, italic, underline, strike, code, line breaks, headings, block quotes, bullet and numbered lists, code blocks, rules) and web or mail links kept as real links. Empty scenes are skipped; a scene break goes between scenes.
- **Two layouts:** `manuscript` is the usual way to submit fiction (12 pt Times New Roman, double spaced, first-line indents except after a heading or break, chapters starting a third of the way down, "#" scene breaks, a running header "Surname / Title / page"); `clean` is a single-spaced reading layout (Cambria, spaced paragraphs, real Word heading styles, "* * *" breaks). US Letter or A4. One book or all of them. The author name defaults to the signed-in name.
- **Rich text to blocks** (`packages/shared/src/manuscript-text.ts`, pure and tested): a TipTap document becomes a flat list of blocks of styled runs, independent of any file format, so EPUB or PDF can reuse it later. Links to anything but http(s) or mailto are dropped rather than written into a file.
- **Editors only,** because the file holds every scene; refused to players, readers and previews. The API says what is wrong when there is nothing to export ("no manuscript yet", "no text yet") and the page shows that message.
- **Web:** "Export as Word" on the Manuscript page and "Manuscript as Word (.docx)" in World settings open one dialog (book, layout, paper, author name).
- **Verified:** API tests read the generated file's XML (title page, order, bold, links, scene breaks, paper size, escaping of `& < >`, other worlds); a scripted Chrome check downloads the file from the page; and the downloaded file was **opened in Microsoft Word** through COM (2 pages, the title page, heading and both paragraphs as expected). Pages and styles were not compared by eye against Word's own rendering.
- **Fixed on the way:** the export helper threw a bare "Export failed"; it now shows the API's message. Adding the `docx` package with `pnpm add` left the web package's links dangling (a missing `vite/client` types error): `pnpm install` repaired it.
- **Deferred:**
  - EPUB and PDF (the blocks above are the shared first step), a story-bible PDF, and screenplay or comic formats
  - front and back matter (dedication, acknowledgements), a table of contents, and footnotes
  - per-scene or per-chapter selection, and printing scene titles or notes

## Milestone 18 (EPUB export): done

- **What it makes:** `GET /export/manuscript.epub` builds an EPUB 3 by hand with `fflate` (no new dependency): the `mimetype` entry first and stored uncompressed, `container.xml`, a package file (title, author, language, an identifier derived from the book's id so re-exports are the same book, a modified date), a navigation document, a style sheet, a title page and one XHTML page per chapter, with a heading page for each part (and for each book when exporting several). Scenes are separated by a centred "* * *"; the first paragraph after a heading or break has no indent.
- **Shared first step with Word:** the same `richTextToBlocks` feeds `blocksToXhtml` (`packages/shared/src/manuscript-html.ts`, pure and tested): marks, links, line breaks, headings (shifted down to h3 so they sit under the chapter title), quotes, code, rules and nested lists, all escaped so the output is well-formed XML.
- **Same rules as the Word export:** editors only (it holds every scene), one book or all, the author defaults to the signed-in name, and the API says when there is nothing or no text to export.
- **Web:** the export dialog now has a File type (Word or E-book); the Word-only layout and paper choices hide for an e-book.
- **Verified:** API tests check the zip's structure (mimetype first and stored, every manifest entry present, navigation, per-chapter pages, escaping) and run a tag-balance check over every XML file; the Chrome check downloads an EPUB through the dialog and **parses every file with the browser's real XML parser**, which accepted them all. It was not opened in an e-reader app and not run through EPUBCheck.
- **Deferred:**
  - a cover image, and running the output through EPUBCheck
  - PDF and a story-bible export, front and back matter, footnotes
  - choosing the language of the book (it is always `en`)

## Milestone 19 (More built-in types): done

- **Four new built-in entry types** with ready-made fields, the same as a type a person adds themselves but present from the start: **Religion** (kind, deities, beliefs, practices, holy sites, clergy, followers), **Language** (status, spoken by, family, script, sounds, grammar, sample phrases), **Magic or Tech System** (kind, source, how it works, limits and costs, who can use it, ruling notes) and **Glossary Term** (pronunciation, category, meaning, used by). Each names its own two dates (Founded and Ended, Emerged and Died out, Discovered and Lost, Coined and Fell out of use).
- **Existing worlds get them too:** migration 0014 is generated from the same definitions (so the two cannot drift) and inserts each type into every world that does not already have one with that key, after that world's last type. Run against the 73 worlds in the development database it added each type once to every world with no repeated sort order. A custom type a person already made with one of these keys is left alone.
- **Web:** two more icons (`languages`, `book-a`) are offered for types. Everything else, from the sidebar to the entry page, follows from a type being data.
- **Tests:** a new world starts with the types in a fixed order; entries of each type take and validate their fields; one world's edits to a type don't touch another's. Two tests that counted the built-in types were updated. Chrome: the sidebar lists them and a Religion entry opens with its fields and saves.
- **Deferred:** a world's own "template" of types to copy into new worlds, and entry templates (both in the saved filters and templates item).

## Milestone 20 (Player handouts): done

- **Data:** a `handouts` table (title, plain text up to 10,000 characters, a visibility that starts as the GM's, `revealed_at`, and the picture's size and version). A handout's picture is stored with the gallery's own pipeline (checked by content, re-encoded as WebP, metadata stripped, thumbnail) under the handout's id, with no gallery row, so it never shows up in the Gallery. Deleting a handout deletes its files; deleting the world already clears the folder.
- **Revealing:** `revealed_at` is set the first time a handout is shown to anyone besides the GM, cleared when it is hidden, and set again when it is shown again, so a second reveal counts as new. Edits to the text do not move it. Lists are ordered by most recently revealed.
- **Access:** every read is filtered by audience like everything else: a player sees only handouts shared with players (a reader, none of those), a hidden handout is 404 for them, and its picture and thumbnail answer 404 as well. Creating, editing, deleting and changing pictures are editor-only and refused in a "view as" preview. Handouts are in the JSON export (not the pictures) and in the Markdown export as `Handouts.md`.
- **"Live" without new infrastructure:** a player's page asks for the handout list every 8 seconds while the tab is open (and when the list page is open). When one appears or is shown again, a message appears wherever they are in the world, with an Open button that shows it. The first visit marks what is already there as seen, so nobody gets a pile of old handouts; what has been seen is remembered per world in the browser. A GM previewing as a player is not interrupted. This costs a request every few seconds per open player tab; server-sent events would remove that and are the next step if it matters.
- **Web:** a Handouts page for the GM (cards with Hidden or Shown, Show to players or Hide, edit with a picture and a remove-picture button, delete with confirmation, a "show straight away" box on creation) and for players (the shared handouts, opened in a viewer with the picture and text).
- **Verified in Chrome** (scripted, 8 steps, with a real player in a second session): create with a picture, the player seeing nothing and the picture refused, the reveal popping up on the player's page while they were on another page and the picture loading in the viewer, no repeat of the message after a reload, hide then show again telling the player again, edit and delete, and a phone-sized page.
- **Deferred:**
  - instant delivery by server-sent events or websockets instead of polling
  - revealing in the middle of a session from the Sessions page or GM screen, handouts tied to a scene, entry or map pin, and a "show on the table" full-screen view
  - several pictures or rich text per handout, and per-player handouts

## Milestone 21 (To-do lists): done

- **Data:** a `todos` table (title up to 200 characters, notes up to 2,000, done and when it was finished, and an optional link to an entry that is cleared if that entry is deleted for good). A world holds up to 500 to-dos; adding more is refused with a message to clear finished ones.
- **Access:** the list is the working side of a world, so like the manuscript it is for the GM and editors: players, readers and the player preview get 403. A task can only point at a live entry of the same world; an entry in the trash reads as no link and the link comes back when it is restored.
- **Behaviour:** open tasks are listed oldest first, finished ones after, latest finished on top. Ticking a finished task again keeps its original finish time. "Clear finished" removes every finished task at once. To-dos are in the JSON export and in the Markdown export as `To-do.md`, a checklist.
- **Web:** a To-do page in the sidebar (GM only) with a quick-add row, an optional "About an entry" picker, open and finished sections, an entry chip that opens the entry, an edit dialog (title, notes, entry) and delete.
- **Verified in Chrome** (scripted, 9 steps): empty state, adding with and without an entry, ticking and unticking, editing and unlinking, opening the entry from its chip, clearing finished and deleting, the player having no link and a 403, and a phone-sized page.
- **Deferred:** due dates and priorities, manual ordering, to-dos shown on an entry's own page, to-dos tied to a scene or map pin, and recurring tasks.

## Milestone 22 (Entry templates and saved filters): done

- **Entry templates:** `entry_templates` table. "Save as template" on an entry page copies the entry's saved summary, fields, text and visibility into a named template for its type (unsaved edits are not included, and later changes to the entry do not change the template). The new-entry dialog offers "Start from a template" for the chosen type and creates the entry with that content; a delete button sits beside the choice. A world keeps up to 50 templates; they go with their type. Templates can hold GM-only secrets, so they are for the GM and editors only (403 for others) and are in the JSON export as `entryTemplates`.
- **List filter by visibility:** `GET /entities` takes `visibility`, shown as a select for the GM. It only narrows: a player asking for GM-only entries gets an empty list.
- **Saved filters:** `saved_filters` table, per person per world, for a type's list: tag, visibility and sort. Chips above the list apply a filter in one click (click again to clear) and an x deletes it; "Save this view" appears when the current filters differ from the defaults and are not saved yet. Every member can keep up to 30; one person's filters are invisible to others; a filter on a tag is removed with the tag. Saved filters are personal, so they are not in the world export.
- **Verified in Chrome** (scripted, 9 steps): saving a template, creating from it (summary and visibility carried over) and blank by default, saving, reloading, applying and deleting a filter, the visibility filter, a player keeping filters but seeing no visibility filter, templates or Save as template (and a 403 from the templates API), deleting a template, and a phone-sized list.
- **Deferred:**
  - **world templates** (starting a new world from a ready-made or saved world)
  - renaming a template or a filter, replacing a template's content from an entry, tag copying and starter relationships in templates
  - filters across all types, text filters and sharing a saved filter with the world

## Milestone 23 (Comments): done

- **Data:** a `comments` table: on an entry or a scene (a check constraint allows exactly one), an optional parent for replies (threads are one level deep), the author, the text (plain, up to 4,000 characters), `resolved_at` on a thread's first comment, and `edited_at`. Comments go with their entry or scene; a trashed entry's comments wait for it and come back on restore. Up to 500 per entry or scene. All comments are in the JSON export as `comments`.
- **Who:** comments are for the people working on the world: the owner, co-GMs and the **commenter** role, which can now be invited (it was held back until it had a feature). Players, readers and a GM previewing as one get 403, and the UI hides everything. A commenter sees and comments only on what readers can see (never GM-only or player-only entries); scene comments are for the GM side, since the manuscript is.
- **Rules:** you can edit only your own comments (marked "edited" when the words change); you can remove your own, and the owner and co-GMs can remove anyone's (removing a thread's first comment removes its replies); a thread can be resolved or reopened by its author or a co-GM; a reply must answer a thread's first comment, on the same entry.
- **Web:** a Comments button with an open-thread count on every entry page (for commenters too) and on the scene toolbar, opening a dialog with threads, replies, edit, delete, resolve and reopen, and "Show resolved"; a **Comments** page in the sidebar listing every thread in the world (Open, Resolved, All) with what it is about, the first words, the author, replies and a link.
- **Two bugs the check turned up, fixed:**
  - Dialogs opened from an entry page bubbled their form submit up to the entry's own save form (React portals), so writing a comment also tried to save the entry, and a commenter saw a permission error. The entry form now ignores submits that did not come from itself. This also stopped a silent extra save when saving a template.
  - Every non-GM viewer's entry page asked for the manuscript tree (for the "as of" control) and was refused. Only the GM asks now, and previews skip it and comments too.
- **Verified in Chrome** (scripted, 10 steps, GM plus a commenter and a player in their own sessions, and every 4xx or 5xx on a page counted as a failure): starting a thread, a commenter replying and editing only their own words, the GM resolving, the comments page and its links, a commenter's list leaving out GM-only and scene threads, the player having nothing, a reader preview hiding it, the scene button, and a phone-sized dialog.
- **Deferred:** notifications and mentions of people, comments on a selected passage of text, on maps, pins and other things, reactions, a "waiting on me" filter, and beta readers commenting on scenes (which needs manuscript sharing, F).

## Milestone 24 (Word check and Style Guide): done

- **Word check:** pure logic in `packages/shared/src/word-check.ts` (`analyzeWords`, `tokenize`, `wordsOfNames`) and `GET /manuscript/word-check` (GM side only, like the manuscript). It checks the whole manuscript or one book, part, chapter or scene and returns: word, different-word and sentence counts, words per sentence, sentences over 40 words, the **most used words** (three or more uses, leaving out small words and the names and aliases of the world's entries, so a character called Mira is not the top "overused word"), **crutch words** (just, really, very, suddenly, seemed and similar), **adverbs** ending in -ly (with a list of words that only look like adverbs, such as family and early), **words the writer asked to watch**, and **close repeats** (the same word again within 15 words). Every list is per 1,000 words as well as a count, and sorted the same way each time.
- **Web:** a Word check page in the GM sidebar: pick the whole manuscript or any item in the binder, type words to watch (kept in the browser only), and read stat tiles and bar lists. The wording says these are places to look, not rules.
- **Style Guide built-in type:** the second half of "style and genre guide entries". Fields for what it covers, point of view, tense, spelling, voice and tone, words to use, words to avoid and other rules. Added to new worlds and backfilled into existing ones by migration 0019 (checked on the dev database: 98 of 98 worlds, no clashing sort orders).
- **Migrations housekeeping:** my hand-written migrations 0016 to 0018 had no Drizzle snapshot, so `drizzle-kit generate` would have tried to create their tables again. Generating once showed the diff was exactly those four tables with the same constraint and index names, so the generated SQL was dropped and its snapshot kept as `0019_snapshot.json`; `drizzle-kit generate` now reports no changes.
- **Verified in Chrome** (scripted, 9 steps, every 4xx or 5xx counted): the page from the sidebar with a character name left out, narrowing to a chapter, watched words remembered after a reload, close repeats and adverbs, the empty state, creating a Style Guide entry with its fields, a player having no link and a 403, and a phone-sized page.
- **Deferred:** highlighting the words in the scene editor, a per-scene breakdown ("which scene leans on 'just' most"), a word-check button on the scene page, using Style Guide entries' "words to avoid" as the watch list automatically, readability scores, dialogue-tag and passive-voice checks, and languages other than English (the small-word and crutch lists are English).

## Milestone 25 (Drag and drop in the manuscript): done

- **Logic:** `resolveDrop` in `packages/shared/src/manuscript-move.ts` turns "drag this onto that, at its top edge, middle or bottom edge" into the parent and position for the existing move call, or null when it cannot go there: the book, part, chapter and scene nesting rules, nothing inside itself or its own descendants, and dropping where it already sits. Positions count from the list with the moved item taken out, matching what the API does. No server change was needed.
- **Web:** binder rows are draggable for people who can edit. The top and bottom quarter of a row put the item before or after it, the middle puts it inside (at the end); a row that cannot hold the item uses halves, and a position the rules refuse falls back to the one they allow. A line or a highlight shows where it will land, the dragged row fades, a drop into a collapsed item opens it, and a refused drop shows nothing and changes nothing. The Move up, Move down and Move to menu items stay, and are the way to move things by keyboard or on a touch screen, where browsers do not offer drag and drop.
- **Verified in Chrome** (scripted with real drag and drop, 8 steps): a scene dropped before another, a scene dropped into a chapter, a chapter reordered, two refused drops changing nothing (a scene onto a book, a chapter onto a scene), the menu still working, and the order surviving a reload, with no 4xx or 5xx.
- **Deferred:** dragging several items at once, drag handles and touch drag, scrolling the binder while dragging near its edge, and dragging between books.

## Milestone 26 (Progressions for names and links, and the arc tracker): done

- **Progressions** can now also change an entry's **name**, its **other names** (replacing the list) and its **links**: a link can end, become another kind, or get new notes. Link changes must name a live link of that entry (either end) and a kind from the same world (404 otherwise). The as-of view shows the new name and drops or relabels links. Shared rules: `applyProgressions` returns `name`, `aliases` and `links`.
- **Arc tracker** (`packages/shared/src/arc.ts`, GM sidebar "Arc tracker", `GET /progressions` for every change in the world): pick an entry and see its name, summary, details and links at the end of each chapter or scene, with changed cells highlighted and a toggle for "only what changes". Only scene-placed changes are read, since columns are story order.
- **Deferred:** the as-of Atlas (borders by year) and as-of manuscript; a chart view of the arc.

## Milestone 27 (Faction diplomacy): done

- **Data:** a `diplomacy_scores` table (migration 0020): one row per pair of entries, stored with the smaller id first so A with B is the same as B with A. Score is a whole number from −100 to +100 (a check constraint backs the API), plus a note and its own visibility (GM-only by default). Setting a pair again replaces it. A world holds up to 2,000. It cascades with the entries and is part of the world export.
- **API:** `GET /diplomacy` (everyone; others see only standings given to them between entries they can see, nothing that hints at a hidden entry), `PUT /diplomacy` and `DELETE /diplomacy/:id` (editors).
- **Web:** a Diplomacy page in the sidebar: a ring "web" of the entries involved, lines coloured and sized by how they stand, and a list from enemies to allies with edit and remove, plus a slider form. Words come from `diplomacyLabel` (At war, Hostile, Tense, Neutral, Friendly, Close, Allied).
- **Migration trap found:** the hand-written migrations 0017 to 0019 carry a `when` in the journal later than the clock, and Drizzle skips a migration whose `when` is earlier than the last applied one. After `drizzle-kit generate`, set the new entry's `when` above the highest one in `_journal.json`.
- **Deferred:** standings that change over time (via progressions), a per-faction page section, and showing the web on a faction's own page.

## Milestone 28 (Calendars, tracks and reminders): done

- **Further calendars:** an `extra_calendars` table (migration 0021), up to 8 per world, edited with the same form as the main calendar (`/settings/calendar/:id`). The main calendar is unchanged, and every date is still one day count, so calendars always agree. `GET/POST /calendars`, `PUT/DELETE /calendars/:id` (read for everyone, write for editors). The calendar settings page lists them and has a "convert a date" tool that shows one day in every calendar.
- **Today and reminders:** `worlds.current_day` set through `PUT /calendar/today` (the calendar response now carries `today`). `upcomingReminders` (shared, `reminders.ts`) turns entries' dates into what is coming up within 7, 30, 90 or 365 days: dates still ahead, and past dates returning each year as anniversaries (with years since; a 29 February skips to the next year that has one). The Timeline page shows the list as "Coming up".
- **Timeline tracks by tag:** the timeline data carries each entry's tag ids and the page can run tracks by type (as before) or by tag (an entry with several tags appears in each track; untagged ones go in "No tag").
- **Deferred:** pushing reminders as notifications, per-entry reminders that are not tied to its two dates, showing dates in other calendars on entry pages and the timeline, and fully custom tracks.

## Milestone 29 (Journeys, annotations and time-aware maps): done

- **New map item kinds** (migration 0022 adds them to the enum): **journey** (a route of 2 to 500 stops, each with an optional in-world day), **arrow** and **circle** (two points each: tail and head; centre and a point on the edge). Arrows and circles finish on the second click. A journey starts dashed.
- **Dates on map items:** every item can have "holds from" and "holds until" days. `GET /maps/:id/features?asOf=<day>` returns only items that hold then, for every audience (so a player reading the map as of a date is never sent what does not hold). The map page has an "As of…" control; reading at a date is read-only (editing is off).
- **Journeys on a date:** `journeyProgress` (shared, `journey.ts`) places the party between dated stops by the length of the line, and the map shows the part travelled solid, the rest faint, and a marker where they are. `reconcilePointDays` keeps stop dates with their stops when a line is reshaped (a stop added or removed shifts the ones after it).
- **Deferred:** as-of for layers as a whole, a play button over the dates (see playback), journeys tied to an entry (the party), and the as-of manuscript.

## Milestone 30 (Node maps, route finding and importers): done

- **Blank canvas maps:** `POST /maps/blank` (editors) draws a plain picture (square 2048, wide 2560 by 1600 or tall 1600 by 2560, in a chosen colour) and sends it through the normal tiling, so pins and paths work on nothing. The upload dialog has "No picture: start from a blank canvas".
- **Route finder** (`map-route.ts`, shared; the "Route" button on the map page): the shortest way along paths (and journeys) between two pins. A path joins a pin when one of its points is within 0.6% of the map's width of it, and two paths join where their points are that close. Lengths use the map's real pixel shape, so a tall map's vertical roads are not understated. The panel shows the roads taken, the distance and, with a scale, each way of travelling's time, and draws the route on the map.
- **SVG:** an uploaded SVG (what Azgaar's and Watabou's generators export) is drawn onto a white PNG up to 4,096 px on its long side before tiling (works for replacing a map's picture too). A broken SVG is a 400.
- **GeoJSON import** (`geojson-import.ts`, `POST /maps/:id/import/geojson`): points become pins (named from `name`, `title`, `label`, `burg` or `state`), lines paths, polygons regions; multi-part shapes split; everything scaled to fit with a margin, keeping proportions, north up unless turned off; up to 500 items, long lines thinned to 500 points; items arrive GM-only. Settings dialog has the file picker.
- **Not verified against real files:** I had no real Azgaar or Watabou export to hand, so the GeoJSON path is tested against hand-made GeoJSON, not their actual output. Azgaar's own .map/JSON format is not read.
- **Deferred:** hex and grid overlays, Azgaar's native format, snapping a path to a pin while drawing.

## Milestone 31 (Fog of war): done

- **Data:** `maps.fog_enabled` and a new map item kind **reveal** (an area of 3 to 500 points; migration 0023). Fog is switched on in the map settings; the **Reveal** tool outlines the areas players may see.
- **What players are sent when fog is on** (the GM and co-GMs are unaffected, and "view as" previews follow the same rules):
  - **Tiles** are cut on the fly: the picture shows inside revealed areas and plain fog (`#0f172a`) everywhere else (a mask from `revealMaskSvg`, composited with sharp). They are sent `private, no-cache` since reveals change; the GM's tiles stay immutable.
  - **Thumbnails** are plain fog.
  - **Items** (pins, labels, paths and so on) are dropped from the feature list, the map's item count, atlas search and an entry's "on the map" links unless at least one point is inside a revealed area. Reveal areas themselves are never sent to anyone but the GM.
- **Rules** are in `packages/shared/src/fog.ts` (point in polygon, which tile pixels an area covers at each zoom level).
- **Limits:** an item counts as revealed when any of its points is inside (a long road partly in view is shown whole); there is no automatic reveal by moving a token; a player who zoomed before a reveal sees the new area after reloading the tiles.
- **Deferred:** brush-style uncovering, reveals tied to a session, soft fog edges.

## Milestone 32 (Playback): done

- **Play bar** (`components/playback-bar.tsx`, `lib/use-playback.ts`): play and pause, a slider over the days, the date, and 0.5x to 4x speed. Playing the whole span takes about 24 seconds at 1x; it stops at the end and plays again from the start. Dragging the slider pauses.
- **Timeline:** the bar moves the marker (and clears it with the X); an "On this date" panel lists what the marker day falls inside, with links that open entries as of that date.
- **Map:** "As of…" now offers "Play through time" when anything on the map is dated. While reading at a date the map shows items that hold then, journeys part-travelled, and (switchable) places and people only within their own start and end dates, so a city's pin appears when it is founded. This filtering is done in the browser over the full feature list so playback is smooth; the server's `?asOf=` filter from M29 stays for other callers.
- **Not verified in a browser:** the animation loop is covered by typecheck and lint only.
- **Deferred:** looping, an event log that scrolls with the playback, and following a journey's position with the camera.

## Milestone 33 (Universal VTT export and token maker): done

- **Export:** `GET /maps/:id/export/vtt?grid=70` (editors, GM audience; rate-limited like other exports) returns a Universal VTT v0.3 file named after the map. `vtt.ts` (shared) builds it: the picture as base64 PNG (scaled to fit 8,192 px), the grid in squares (a pixels-per-square setting from 16 to 512), **walls** from paths and regions on a layer named "Walls" (a region is closed), and **lights** from pins on a layer named "Lights". Everything else on the map is left out. The map settings dialog has the download.
- **Token maker** (sidebar, GM): pick a file or one of an entry's pictures, zoom and slide the crop (`tokenCrop`, shared), choose a round or rounded-square shape, ring colour and thickness, background, and 140, 280 or 560 px; downloads a transparent PNG. All in the browser.
- **Not verified:** I could not test a real import into Foundry or Fantasy Grounds, so the file follows the published .dd2vtt layout from memory of the format. Portals and object lines are exported empty.
- **Deferred:** portals (doors) from pins on a "Doors" layer, token frames from a library, Foundry journal/actor packs (H in the checklist).

## Milestone 34 (Series codex): done

- **Model:** `entities.scope_book_ids` (migration 0024), a list of book ids from the manuscript. **Empty means shared** across the whole series, which is what every existing entry is. One id is a single-book entry; several make a series of their own ("books 1 and 2 only"). There is no separate "series" object, since a series is just a set of books. Create and update validate that every id is a book of this world (404 otherwise; duplicates are dropped); deleting a book removes it from every scope, so an entry that was only for that book becomes shared again rather than lost.
- **Codex list:** `GET /entities?bookId=` returns the shared entries plus those scoped to that book. The list page has a "Filter by book" select (GM side, since the manuscript is the GM's). The entry page has "Used in books" checkboxes. The world export carries `scopeBookIds`.
- **Deliberately not done:** search and mention detection ignore scope (a character from another book still links in prose), and scope is not part of saved filters or entry history.

## Milestone 35 (Character extras): done

- **Three new field types**, usable on any entry type (and so in the type editor): **Colour palette** (up to 12 `#rrggbb` colours, stored lowercase), **Abilities with charges** (a name, a description and, optionally, a maximum, charges left and when they come back; "Use one" and "Recharge" buttons; up to 40) and **Questions and answers** (up to 60; a button adds the 20 classic interview questions). They are validated in `fields.ts` like the others, are searchable by their words, and read in words in the Markdown export, the arc tracker and change history (`describeFieldValue`).
- **Built-in Character type** gains Speech style, Verbal tics and catchphrases, Sample dialogue, Colour palette, Abilities and Interview (the existing Voice notes stays); **Species** gains Innate abilities. New worlds get them from the seed, and migration 0025 appends them to existing worlds' built-in types unless a field with that key is already there.
- **Species trait inheritance:** an entry linked "of species" or "of culture" shows a read-only "From their species and culture" panel with the other end's filled-in details and abilities, so changing the species changes it. It is display, not copying: the character's own fields are not changed.
- **Deferred:** a turnaround sheet and stat blocks (v2); spending a charge from a play screen rather than the entry page.

## Milestone 36 (Content tree, pop-outs and shortcuts): done

- **Content tree** (`/tree`, in everyone's sidebar): every entry the viewer may see in one outline, grouped by type or by tag, with a name filter, collapsible groups and counts. Backed by `GET /entities/index` (id, type, name and tag ids only, up to 20,000, filtered by audience like the list).
- **Pop-out windows:** an entry's "open in its own window" button (on its page and in the tree) opens `/w/<world>/popout/e/<id>` in a small window with no sidebar, for keeping beside the manuscript or another page. It is the ordinary entry page, so it edits and saves normally.
- **Keyboard shortcuts** (`lib/shortcuts.ts`, `use-shortcuts.ts`): "g" then a letter goes to a page (c Codex, o content tree, a Atlas, t timeline, g graph, d diplomacy, q quests, l gallery; GM only: m manuscript, w writing goals, p plot, r arc tracker, k to-do; editors: s settings), "/" searches and "?" lists them. Nothing fires while typing in a field, the editor or an open dialog, or with Ctrl, Alt or Meta held.
- **Not verified in a browser** (the pure routing of keys is unit-tested; the listener and pop-out window are not).
- **Deferred:** pop-outs for the manuscript scene and map, a place hierarchy in the tree (by "located in"), and rebinding keys.

## Milestone 37 (Secret blocks and embeds in articles): done

- **Secret blocks** (`secret-blocks.ts`, shared; the padlock in an entry's notes toolbar, GM only): wrap any blocks in a `secretBlock`. `GET /entities/:id` strips them for every audience but the GM (so "view as" previews and players never get them), and `deriveSearchText` leaves them out, so the words are not searchable by anyone, the GM included. Editing an article for anything else leaves them alone. The Markdown export keeps them as a quote labelled "Secret". They are not hidden from the GM's own search, history or export.
- **Embedded maps and timelines** (the map button in the toolbar): `mapEmbed` shows a map's picture and name and opens it; if the viewer can't open the map it reads "This map isn't available". `timelineEmbed` lists up to 10 dated entries (everything, or one type) and links to the full timeline. Both read live data through the viewer's own access, so they leak nothing the viewer couldn't already open. A read-only reader sees them too.
- **Scope:** this is for entry notes; scene text in the manuscript does not offer these.
- **Deferred:** field-level and block-level visibility for other audiences (F), timeline embeds filtered by tag or date range, and secret blocks revealed to players after a chapter.

## Milestone 38 (More exports): done

- **Manuscript PDF** (`GET /export/manuscript.pdf`, same options as the Word export): a title page, a chapter on each new page, scene breaks, a running header ("Surname / Title / page", from page 1 after the title page) and PDF bookmarks for books, parts and chapters. Two looks: standard manuscript (12 pt Times, double spaced, indented) and a clean reading layout; Letter or A4. Built with `pdfkit` on the standard fonts, so text outside Western European letters is turned into the nearest plain letter or "?" (`toWinAnsi`, tested); an embedded Unicode font is the way to lift that.
- **Story bible PDF** (`GET /export/story-bible.pdf`, editors): a cover, every entry by type (aliases, summary, dates, fields, connections, notes), a timeline and a manuscript outline with scene summaries, page-numbered, with bookmarks. It includes GM-only material (secret blocks too), like the other exports.
- **Script formats** (`GET /export/manuscript-script?kind=screenplay|comic`, `script-export.ts`): honest scaffolds, not conversions. Screenplay (Fountain, opens in Final Draft, Highland, Fade In and others): each scene gets a heading from its place and date ("INT./EXT. VAEL HARBOUR - DAWN", or its title when it has no place), its summary as a synopsis, its viewpoint as a note, narration as action and a whole-paragraph quotation as dialogue under `@SPEAKER` to fill in. Comic script: a PAGE for each scene, a Panel for each stretch of action and `SPEAKER:` lines for speech.
- **Refactor:** the Word, EPUB, PDF and script exports share `loadManuscriptSource`.
- **Not verified:** PDFs were checked by reading their text back and by page counts in tests, not opened in a viewer; Fountain was not opened in a screenwriting app.
- **Deferred:** an embedded Unicode font, a table of contents with page numbers, images in the story bible, and speaker detection for dialogue.

## Milestone 39 (Initiative and HP tracker): done

- **Widget:** a new "Initiative and HP" GM-screen widget (`initiative` in `gm-screen.ts`, stored in the screen JSON, so no migration). Combatants have a name, initiative, optional HP and max HP, and conditions (a picker of the common ones). Add them with name, initiative and HP; they slot into order without stealing the current turn. Next turn skips anyone at 0 HP and a full lap starts a new round; "Sort and restart" sorts and returns to round 1. Damage and Heal keep HP between 0 and max. Combatants, round and turn autosave with the rest of the screen.
- **Logic:** pure functions in `initiative.ts` (shared, tested); the schema refuses HP above max and blank names.
- **Verified in Chrome:** adding, ordering, damage to 0 HP, turn skipping, round wrap, a condition, persistence across reload, phone width, no 4xx or 5xx.
- **Deferred:** re-sorting when an initiative number is edited, adding a pinned character or a rolled encounter straight into the fight (`entityId` is in the schema, unused), HP and conditions shown to players, custom conditions, and a loot or XP tracker.

## Milestone 40 (Shops and merchants): done

- **New field type `inventory`** ("Wares for sale"): a list of items with a name, a free-text price ("5 gp", "a favour"), optional stock (blank means no limit) and a note, up to 100 items. It is a normal field, so search, history, exports, "as of" views and field visibility all work with no new machinery; the words are searchable and `describeFieldValue` writes items as "Rope (1 gp, 3 in stock)".
- **Built in:** Location and Character get a `wares` field, so any location is a shop and any character a merchant. Migration 0026 adds it to existing worlds (skipping any that already have a `wares` field). A custom type can use the field type too.
- **Web:** the entry form shows the list with Sell one (stock down), Restock, "Limit the stock" and "No limit"; stock is saved with the entry like any edit.
- **Verified:** shared and API tests (validation, search, edit), the full suite, and Chrome (add, limit, restock, sell, save, reload).
- **Deferred:** a read-only shop card for players, buying into a character's inventory, wares linked to Item entries, and price conversion between currencies.

## Milestone 41 (Ownership handover and the member trail): done

- **Handover** (`POST /transfer-ownership`, owner only, People page crown button): the chosen member becomes the owner and the old owner a co-GM, in one transaction (so there is never a world without an owner); `worlds.owner_id` moves too, so account deletion follows the new owner. The target must already be a member.
- **Trail** (`world_member_events`, migration 0027; `GET /member-events`, owner only, newest 100): joined (with the link's note), role changed ("Player to Reader", by whom), removed, left, and ownership transferred. Names are copied in, so the trail survives renames and deleted accounts. A repeat use of a link and a no-op role change record nothing. The People page has an Activity list.
- **Join notice:** the owner is emailed when someone joins ("Pippa joined X as Player"), through the existing mailer and in the background so a failure never blocks the join.
- **Web:** the People page's data queries moved into a child component, so a co-GM or a just-demoted owner never requests data they can't read (it showed up as 403s in the Chrome check). The handover also refreshes the by-slug world entry, where the page reads the role.
- **Verified:** API tests (handover, refusals, owner-only, join mail, trail order, leaving), the full suite, and Chrome with two real browser sessions (join via link, activity shown, handover, old owner refused, new owner sees the trail, no 4xx).
- **Deferred:** several owners at once, inviting by name (looking up a user is a privacy question: exact email only would be the safe version), and a link's note in the join email.

## Milestone 42 (Soundtrack links): done

- **New field type `links`** ("Labelled links"): up to 40 entries of a name and an http(s) address (other schemes such as `javascript:` are refused), so it works for any music service. Read-only views show plain links that open in a new tab with `noopener`; editing shows the name and address with an open button.
- **Built in:** Location (Soundtrack), Character (Theme music) and Session (Playlist) get a `soundtrack` field; migration 0028 adds it to existing worlds, skipping any that already have one. Custom types can use the field type.
- **Verified:** shared and API tests (validation, unsafe schemes, the three types), full suite, Chrome (add, save, reload).
- **Deferred:** links on manuscript scenes (scenes are not entries), embedding a player, and a "now playing" widget on the GM screen.

## Milestone 43 (Export for an audience): done

- **`redactWorldExport(data, audience)`** (shared, tested) returns a copy of a world export holding only what that audience can see, reusing `canSee`: entries, maps, map features, pictures, tables, handouts and progressions by their visibility; secret blocks removed from the notes of entries that stay; relationships only when both ends stay; tags only when a kept entry uses them. A fogged map keeps its name and details but nothing drawn on it; GM notes on features are blanked; map and feature links to hidden entries are cut. The manuscript, plot boards, to-dos, templates, comments and faction scores are the author's own workspace and are always left out.
- **API:** `GET /export` and `GET /export/markdown` take `?audience=player|reader|public` (editors only, as before; `gm` is not a value, leave it out for the full copy). `exportWorld` takes the audience, and the Markdown zip's `world.json` and pictures follow it. File names carry the audience.
- **Web:** World settings › Export has an "Export for" select (Me, Players, Readers, The public) that applies to the JSON and Markdown downloads. The story bible and manuscript exports stay GM-only and say so.
- **Verified:** shared unit tests (fog, notes, workspace), API tests (entries by audience, secrets, relationships, tags, manuscript, handouts, editor-only, bad value), full suite, and Chrome (select Players, download, only the public entry in the file).
- **Not covered:** map images and handout pictures are not in the JSON anyway; the redaction does not look inside entry field values (there is no field-level visibility yet, see F).
- **Deferred:** an audience option for the story-bible PDF and for the manuscript exports (the manuscript would need per-chapter visibility first).

## Milestone 44 (Player journals): done

- **Private notes on entries** (`entity_journals`, migration 0029): one plain-text note (up to 10,000 characters) for each person and entry. `GET` and `PUT /entities/:id/journal` are the caller's own; `GET /entities/:id/journals` lists everyone else's for the GM (owner and co-GMs). An empty note deletes the row. The entry must be live and visible to the caller's audience (404 otherwise, so a hidden entry is not confirmed).
- **Who:** players, commenters and GMs. Readers share a rank with players but are refused (403); previews are refused by the role guard, and the panel is hidden while previewing. Other players can never read a note.
- **Kept out of everything else:** notes are not on the entry, in search, history, exports or the audience exports (tested), and are deleted with the entry or the account.
- **Web:** a "My notes" panel under the entry's notes (autosaves 0.8 s after typing stops, shows Saved) and, for the GM, a "Players' notes" list under it.
- **Verified:** API tests (save, update, clear, privacy between players, GM listing, entries a person can't see, readers, strangers, previews, length, not in the entry or export), the full suite, and Chrome with two real sessions (player writes, reload keeps it, GM reads it, no 4xx).
- **Deferred:** notes on manuscript scenes, sharing a note with the whole party or the GM only on purpose (posts), rich text and mentions, and a page listing all of one's notes.

## Milestone 45 (GM-only fields): done

- **A `gmOnly` flag on a field definition**, set with a checkbox in the type editor ("GM only (players and readers never see this field)"). Works on any field type, built-in or custom.
- **What changes for everyone but the GM** (players, readers, the public and a GM previewing): the entry's `fields` object leaves out the value (`GET /entities/:id`); the field's definition is missing from `GET /entity-types`, so no page lists its name (the web needed no change, since forms and sheets read the type); changes to it inside progressions are dropped; and the audience exports (M43) leave out the value, the definition and the progression changes.
- **Search:** the words of a GM-only field are left out of an entry's search text for everyone, the GM included, like secret blocks. Flagging or un-flagging a field re-derives the search text of that type's entries, so old text can't linger.
- **Not covered:** the session and quest lists read a few named fields (number, status, played on); flagging one of those as GM-only would not hide it there. History (revisions) and templates are editor-only already.
- **Verified:** shared tests (helpers, search text, export redaction), API tests (entry, type list, previews, search before and after un-flagging, progressions, exports), the full suite, lint, and Chrome with a real GM and player (flag Age, the GM still sees it, the player does not, no 4xx).
- **Deferred:** per-field visibility for one audience only (players but not readers), and revealing a field after a chapter or date.

## Milestone 46 (Loot and party widgets): done

- **Two more GM-screen widgets**, stored in the screen JSON like the initiative tracker (no migration, validated by `gmWidgetSchema`):
  - **Loot and treasure:** up to 100 items with a quantity, a free-text value ("50 gp", "priceless") and who carries it, grouped by carrier with the party's pack under "Party".
  - **Party XP and downtime:** up to 20 characters with XP and downtime days. Award XP to each, or split an amount evenly (the remainder goes to the first characters, so no points vanish; a loss splits the same way and never goes below 0), and give downtime days to everyone. Both are plain editable numbers too.
- **Logic** in `party.ts` (shared, tested): `awardXp`, `awardDowntime`, `groupByHolder`.
- **Fixed on the way:** widgets could push the GM screen wider than a phone (the grid item had no minimum width); frames now shrink and rows wrap.
- **Verified:** shared tests, an API test (saved as is, refusals), Chrome (add loot and members, split 100 XP three ways as 34/33/33, days, reload keeps it, no 4xx) and a phone-width screenshot read back.
- **Deferred:** XP thresholds and levels per rules system, coin purses with conversion, linking loot to Item entries and members to Character entries, and a log of awards.

## Milestone 47 (Vellum and ink: the look, the front page, themes): done

- **One look, decided:** vellum paper tones and iron-gall ink. The chrome carries no colour; one hue, verdigris (the green wash of old sea charts), marks links, selection and data, and vermilion is kept for warnings, secrets and deletions. Tokens live at the top of `apps/web/src/index.css` (`--ink`, `--primary`, `--rubric` and the paper tones), with a faint paper grain behind everything. Corners are tighter and resting cards have no shadow.
- **Type:** EB Garamond for titles and prose, Inter for controls, both self-hosted through `@fontsource-variable` (no request to Google Fonts any more, which also helps with privacy rules later).
- **Themes:** Vellum (light), Lamplight (dark) or "match my device", chosen in the account menu and remembered on the device (`lib/theme.ts`; an inline script in `index.html` sets it before the first paint, and Tailwind's `dark:` follows `data-theme`).
- **The mark:** a pair of chart dividers that is also the A of Atlas (`components/brand.tsx`, `public/favicon.svg`).
- **Front page** (`routes/landing-page.tsx`, shown at `/` to visitors; signed-in people still get their worlds): the screen is split like the name, a real antique chart on one half and the reading column on the other. The chart changes with the section (world, kingdom, city, roads), and in the middle the fixed half becomes one entry the visitor can rename, move through the years and view as a player. On phones there is no pinned half; each part carries its own picture.
- **Pictures:** six public-domain images from Wikimedia Commons in `apps/web/public/charts/` (Olaus Magnus's Carta marina 1539, Ortelius's Islandia 1587, Braun and Hogenberg's Paris 1572, Blaeu's Hven 1663, a Genoese portolan chart about 1320, a Metz Book of Hours leaf about 1440), credited in the front page's footer.
- **App shell:** the sidebar is grouped (the four views, then Write, Explore, Play, then entry types), groups fold and remember it, and the product and world are named at the top. The account row is a menu (account, theme, sign out). Sign-in, sign-up, reset and invite pages share `components/auth-shell.tsx` with a chart beside the form. The worlds list gives each world a small sea chart drawn from its id (`components/world-cover.tsx`), and the Codex home lists the types as a table of contents.
- **Verified:** the design inspector's page checks at 1440, 768 and 390 px (no failures: headline lines, margins, contrast, reduced motion), typecheck, lint, unit tests, and a Chrome tour of 16 pages in both themes with no console errors or failed requests.
- **Deferred:** a pass over every inner page for spacing and density, illustrations for empty states, and a server-rendered marketing site (`apps/site`) for search engines.

## Milestone 48 (Ambience: music and weather): done

- **What it is:** six scenes of quiet music with weather under it, for writing or for the table: Scriptorium, Tavern hearth, Rain on the shutters, Open sea, Wildwood at night, Deep places. The control sits at the foot of the sidebar (and as an icon on phones and on the worlds page): play or pause, pick a scene, set the volume and the balance between weather and music.
- **No recordings:** everything is made in the browser with the Web Audio API, so there is nothing to license, host or download. Plucked strings use the Karplus-Strong method, pipes and bells are a few sine partials, chords are filtered waves, and rain, fire, surf, wind, crickets, drips and thunder are shaped noise (`lib/ambience/synth.ts`, `scenes.ts`).
- **The music is composed by rule, not at random** (`lib/ambience/compose.ts`, pure and tested): each scene has a mode, a tempo and a four-chord loop; the accompaniment spells the chord, and the tune moves in four-bar phrases that repeat with small changes, start each bar on a chord tone, keep to five notes of the mode and rest between phrases.
- **Behaviour:** sound starts only from a click; it carries on across pages (the player lives outside React, `lib/ambience/player.ts`); scenes cross-fade; pausing hands the audio device back; the scene and levels are remembered on the device.
- **Verified:** unit tests for the composer; every scene rendered offline in Chrome and measured (no clipping, no silence, all within about 2 dB of each other, music and weather checked apart); and the control driven in Chrome (play, switch, volume, navigate, pause, reload).
- **Not verified:** how it sounds to a person. It was measured, not listened to, so the timbres and tunes need a human ear; the levels and recipes are easy to change in `scenes.ts`.
- **Deferred:** a scene suggested by an entry (a tavern entry starting Tavern hearth), the GM setting the scene for the whole table, and playing soundtrack links (M42) inside the app.

## Milestone 49 (The reader wiki, with spoiler-safe reading): done

- **What it is:** a public, read-only companion to a world at `/wiki/<world address>`, off until the owner or a co-GM opens it in World settings › Reader wiki. It shows only entries whose visibility is Public. No account is needed to read it; an optional password keeps it to beta readers.
- **The part nobody else does:** the reader says how far they have read ("Nothing yet", "Chapter 7", "The whole story") and the server works out every page for the end of that chapter. Names, summaries, fields and links that change later (progressions) still show their earlier state, in the index as well as on the page; an entry can be **held back until a chapter** has been read (a select on the entry page, `entities.reveal_node_id`); pictures tagged to a later scene wait too. A direct link to a held-back entry answers exactly as if it did not exist.
- **Rules** in `packages/shared/src/wiki.ts` (pure, tested): chapters numbered across parts and books with the scenes each covers, the reader's point (chapter, last scene read, latest day read), and the reveal test. Anything doubtful falls on the safe side: an unknown chapter is the start, a gate whose chapter was deleted hides the entry until the end, and a change dated by day is not applied while the scenes read so far have no date.
- **Never sent:** the manuscript, scene ids, chapter titles (unless the owner ticks "Show chapter titles"; the default is "Chapter 7"), GM-only fields and changes to them, secret blocks, non-public changes, links to entries the reader cannot see, and the gate itself (players and readers inside the app get `revealNodeId: null`, and audience exports drop it).
- **API** (`modules/wiki`): `GET /api/wiki/:slug`, `/entries/:id`, `/images/:id/file|thumbnail`, all taking `?chapter=start|end|<chapter id>`, and `POST /unlock`. A locked wiki answers 401 with only the world's name. The password is stored as a scrypt hash; a correct one sets a 30-day cookie signed with the server secret and the hash, so changing or removing the password ends every earlier pass. Requests are rate limited by address (unlock attempts tightly). Settings are `GET` and `PATCH /api/worlds/:id/wiki-settings`, editors only. Migration 0030.
- **Crawlers:** every wiki response carries `X-Robots-Tag: noai, noimageai`, and `public/robots.txt` asks the known AI crawlers to stay out of the whole site and all crawlers to stay out of the app and API.
- **Server switch:** `PUBLIC_WIKIS` (on by default, but off in production until set to `true`), because publishing needs the terms and takedown process in checklist A first. `ABUSE_EMAIL`, when set, adds a "Report this wiki" link.
- **Web:** `routes/wiki-pages.tsx` (index by type with a name filter, entry page with summary, article, details, connections and pictures, password gate, "not at this point in the story" page), and a small read-only article renderer (`components/rich-text-view.tsx`) so the public pages never load the editor. The reader's chapter is remembered on the device and travels in the address.
- **Verified:** shared tests (5) and API tests (11: closed by default, start, as-of names in page and index, secrets, held-back entries and their links, unknown chapter, titles, password and pass invalidation, permissions, the gate hidden from members, GM-only fields), the full suite, and Chrome with three real sessions (author sets the gate and opens the wiki in the app; a visitor with no account steps through chapters; a stranger meets the password), 19 checks, phone width included.
- **Limits:** an article's text is shown as written, so facts that change belong in progressions and late reveals in held-back entries (a "reveal after chapter" block inside an article is the obvious next step). Maps, the timeline and the relationship graph are not on the wiki yet. Readers signed in to the app with the Reader role are not gated by chapter (they have no stated progress).
- **Deferred:** spoiler blocks inside articles, fields revealed after a chapter, maps and timeline on the wiki, a per-reader progress for signed-in readers, server-side rendering for search engines, custom domains and analytics.

## Milestone 50 (The sample world, and smaller things): done

- **Start from the sample.** The New world dialog offers "A blank world" or "The sample world". `POST /worlds` takes `template: 'blank' | 'sample'`; the sample is filled in by `db/sample-world.ts` (if that fails the new world is removed again, so nobody is left with half of one). `pnpm db:seed` uses the same content and also opens the demo world's reader wiki.
- **What the sample holds** (Aerth): sixteen entries across people, places, a faction, an item, an event, two quests and a session, with public, player-only and GM-only among them and secret blocks in two articles; links, one of them dated; changes over time by date (Mira's life) and by scene (public, for the wiki); a three-chapter manuscript whose scenes mention the entries; a rumour table, a to-do list and a tavern's wares; and an entry held back from wiki readers until the last chapter.
- **A chart drawn by code** (`db/sample-map.ts`): an archipelago in the manner of an old sea chart (coasts with shallows and hatching, a mountain spine, woods, wind roses with compass lines, a neatline, a scale and a title), made as an SVG from a fixed seed, so no image file sits in the repository and nobody's artwork is borrowed. It returns the spots for the sample's pins, coast road and sea lane, so they always sit on the right coast. The map goes through the normal pipeline (PNG, then tiles).
- **GM screen:** widgets can be dragged by a grip to rearrange them; the arrow buttons stay for keyboard and touch.
- **Soundtrack links play in the app:** a link to a track or playlist on YouTube, Spotify or SoundCloud gets a play button on the entry (`lib/media-embed.ts`, tested). The service's player loads only when pressed (YouTube through its no-cookie address), so opening an entry tells third parties nothing. Other links stay plain links.
- **Wrong addresses and crashes** get a full page beside Ortelius's sea monsters ("Off the edge of the map") instead of a small box.
- **Verified:** an API test (blank stays empty; the sample's counts, manuscript, map ready with its eight features, table, to-dos, and the wiki reading correctly at the start, chapter 2 and the end), the seed run against the test database, and Chrome (the dialog, then the codex, chart with pins, timeline, a scene with recognised names, quests, graph and tables; no failed requests).
- **Deferred:** more ready-made worlds (a campaign starter, a novel planner), saving one of your own worlds as a template, and a nested city map in the sample.

## Roadmap: what's left

The to-do list is in [checklist.md](checklist.md): every feature not built yet, grouped by area (A to H, plus the validation work in I) and tagged with the research's phase (MVP, v1, v2, v3). This section keeps the decisions that go with it.

### Suggested order
Launch is not near, so the order is features first; launch readiness (A), integrations (H) and validation (I) come last.
1. **The rest of D, E and G** (B and C are done as of M38): GM tools, players and membership, co-editing and so on, as the checklist lists them.
2. **The rest of F.** The reader wiki and its spoiler gating shipped in M49, behind a server switch that stays off in production until the moderation and legal items in A are done. Still open: spoiler blocks inside articles, and maps and the timeline on the wiki.
3. **Last:** integrations and importers (H), validation (I), and launch readiness (A): object storage, deployment, legal pages and age rule, billing.

### Competitor check: vvd (November 10, 2026)
[vvd](https://vvd.world) already ships most of what F, G and H list: public wikis, real-time co-editing, offline and native apps, a whiteboard and importers. We are deeper on running games, progressions and continuity, and play maps. Details are in the research's [vvd section](PREREQUISITE_RESEARCH.md#vvd-the-closest-all-in-one-rival). What it changes:
- The **spoiler-safe reader wiki** (F) is our clearest opening, since vvd's spoilers look like plain on/off visibility.
- A public wiki, importers and collaboration are expected, not extras. The order above stays for now; whether to pull the World Anvil importer (H) earlier is an open question.
- Lead the pitch with GM depth, time and continuity, and a free tier without a document cap.

### Deliberately not building (integrate or skip)
A battlemap VTT, dynamic lighting, line of sight and 3D minis; full rules automation; character builders for licensed game systems; hosting audio files; a paid-GM marketplace; random dungeon generation (import instead); streaming audio to Discord (use Kenku FM).

### Known limits to revisit
- Tiling runs in the API process, one map at a time; uploads and tiles are on local disk.
- Rate-limit counters (ours and Better Auth's) live in each API process's memory, so they are per instance.
- libvips caching is off (`sharp.cache(false)`) because it broke file deletes on Windows; a Linux deployment could turn it back on after testing.
- The manuscript is the author's own workspace, GM-only; readers cannot see chapters, on the wiki or in the app. The wiki uses chapter order only to decide what a reader may see.
- "View as" previews and invited members share one audience engine; new content types must go through `visibleTo()` and the audience rules, with a test in `audience.test.ts`.
