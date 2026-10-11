# Atlas & Ink

A browser-based "story operating system": one linked graph of story entities (characters, places, factions, lore) seen through three views — **Atlas** (maps), **Codex** (characters and lore) and **Manuscript** (chapters).

This repo currently contains **Milestone 1: the MVP foundation** — accounts, the entity / type / relationship model and a working Codex. See [plan.md](plan.md) for the plan and tech-stack decisions, and [PREREQUISITE_RESEARCH.md](PREREQUISITE_RESEARCH.md) for the product research.

## What works today

- Email + password accounts (Better Auth, sessions stored in Postgres)
- Worlds, each seeded with editable built-in types (Character, Location, Faction, Item, Species, Culture, Event, Lore Article)
- Custom entity types with their own fields (text, number, choice, link, …)
- Entity pages: aliases, summary, rich-text notes, typed fields, visibility
- Two-way relationships ("located in" ↔ "contains") and custom relationship types
- Tags, Ctrl/Cmd+K search across names, aliases and text, Trash with restore
- Full JSON export of a world

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

Open http://localhost:5173. The Vite dev server proxies `/api` to the API, so the browser and API share an origin and session cookies just work.

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
