# Atlas & Ink

A browser-based "story operating system": one linked graph of story entities (characters, places, factions, lore) seen through three views — **Atlas** (maps), **Codex** (characters and lore) and **Manuscript** (chapters).

This repo currently contains **Milestone 1** (accounts, the entity / type / relationship model and a working Codex), **Milestone 2** (the Manuscript) and **Milestone 3** (the Atlas). See [plan.md](plan.md) for the plan and tech-stack decisions, and [PREREQUISITE_RESEARCH.md](PREREQUISITE_RESEARCH.md) for the product research.

## What works today

- Email + password accounts (Better Auth, sessions stored in Postgres)
- Worlds, each seeded with editable built-in types (Character, Location, Faction, Item, Species, Culture, Event, Lore Article)
- Custom entity types with their own fields (text, number, choice, link, …)
- Entity pages: aliases, summary, rich-text notes, typed fields, visibility
- Two-way relationships ("located in" ↔ "contains") and custom relationship types
- Tags, Ctrl/Cmd+K search across names, aliases and text, Trash with restore
- Full JSON export of a world, including the manuscript
- **Manuscript:** books, parts, chapters and scenes; reorder and move them from the contents; an autosaving scene editor with word counts
- Scene details: point of view, location, in-world date and summary
- Codex names and aliases are underlined as you write, with hover previews, a Codex side panel and a distraction-free focus mode
- Every entry lists the scenes it **appears in** (by mention, point of view or setting)
- **Atlas:** upload a map image of any size; it is cut into tiles in the background and zooms smoothly
- Pins linked to entries, text labels, roads and rivers, and regions, each shown only from the zoom level you choose
- Maps inside maps: a pin can open a child map, with breadcrumbs (World › Kaldor › Port Vael)
- Entry pages list the maps they appear on, and Ctrl/Cmd+K also finds maps and map labels

## Prerequisites

- Node.js **22.12+** and pnpm **9** (`corepack enable` sets up pnpm)
- Docker Desktop (for Postgres) — make sure it is running

## Getting started

```bash
pnpm install
cp .env.example .env          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:up                    # Postgres 17 in Docker (dev DB + atlas_test)
pnpm db:migrate               # apply migrations
pnpm db:seed                  # optional demo world: demo@atlas.local / demo-password
pnpm dev                      # web on http://localhost:5173, API on :3000
```

Open http://localhost:5173. Uploaded maps and their tiles are kept in `storage/` (set `STORAGE_DIR` to move it). The Vite dev server proxies `/api` to the API, so the browser and API share an origin and session cookies just work.

## Scripts

| Command                                        | What it does                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                                     | API (tsx watch) and web (Vite) together                          |
| `pnpm test`                                    | Shared unit tests + API integration tests (against `atlas_test`) |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | ESLint, TypeScript, Prettier                                     |
| `pnpm build`                                   | Production builds (`apps/api/dist`, `apps/web/dist`)             |
| `pnpm db:generate`                             | Create a migration after editing `apps/api/src/db/schema.ts`     |
| `pnpm db:migrate` / `pnpm db:seed`             | Apply migrations / add the demo world                            |
| `pnpm db:up` / `pnpm db:down`                  | Start / stop Postgres                                            |

## Layout

```
apps/api         Fastify API: auth, world-scoped modules, Drizzle schema + migrations, tests
apps/web         Vite + React app: routes, components, TanStack Query hooks
packages/shared  Zod schemas, field validation and API types used by both
```

Every route under `/api/worlds/:worldId` runs behind a session check and a world-membership check; non-members get a 404 so world IDs can't be probed.
