# Atlas & Ink: plan

**Product** ([PREREQUISITE_RESEARCH.md](PREREQUISITE_RESEARCH.md)): one linked graph of story entities, seen through 3 views (Atlas = maps, Codex = characters/lore, Manuscript = chapters), plus a GM mode. The full MVP is about 5 months of work.

**Status:** Milestones 1 to 15 are built, tested and on `main`; M2 to M15 each have a "done" section further down. Everything still to do is ticked off in [checklist.md](checklist.md), and the [Roadmap](#roadmap-whats-left) at the end gives the order. From here down to Verification is the original M1 plan, kept as written; notes in square brackets mark where a later milestone changed it.

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

## Roadmap: what's left

The to-do list is in [checklist.md](checklist.md): every feature not built yet, grouped by area (A to H, plus the validation work in I) and tagged with the research's phase (MVP, v1, v2, v3). This section keeps the decisions that go with it.

### Suggested order
Launch is not near, so the order is features first; launch readiness (A), integrations (H) and validation (I) come last.
1. **The rest of B, C, D, E and G**: version history, comments, map layers and measuring, the continuity checker, co-editing and so on, as the checklist lists them.
2. **Spoiler gating and field-level visibility (F).** The public reader wiki itself waits for the moderation and legal items in A, since it makes content public.
3. **Last:** integrations and importers (H), validation (I), and launch readiness (A): object storage, deployment, legal pages and age rule, billing.

### Deliberately not building (integrate or skip)
A battlemap VTT, dynamic lighting, line of sight and 3D minis; full rules automation; character builders for licensed game systems; hosting audio files; a paid-GM marketplace; random dungeon generation (import instead); streaming audio to Discord (use Kenku FM).

### Known limits to revisit
- Tiling runs in the API process, one map at a time; uploads and tiles are on local disk.
- Rate-limit counters (ours and Better Auth's) live in each API process's memory, so they are per instance.
- libvips caching is off (`sharp.cache(false)`) because it broke file deletes on Windows; a Linux deployment could turn it back on after testing.
- The manuscript is the author's own workspace, GM-only; readers cannot see chapters yet (section F of the checklist).
- "View as" previews and invited members share one audience engine; new content types must go through `visibleTo()` and the audience rules, with a test in `audience.test.ts`.
