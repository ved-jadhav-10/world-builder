# Atlas & Ink

**A home for your whole story world.** Keep your maps, characters, places, lore and chapters in one place, linked together, so the world you build and the story you write never drift apart.

Atlas & Ink is for fantasy writers, and for game masters who run the same worlds at the table.

## The problem

Most worldbuilders juggle a map in one app, notes in another, a manuscript in a third, and a spreadsheet of dates somewhere else. Nothing links, so details slip: a character is in two cities on the same day, a place changes name halfway through the book, and the map no longer matches the text.

Atlas & Ink keeps all of it in one linked web. Everything in your world is an **entry** (a person, a place, a faction, an item, an event), and the same entries show up in the map, the notes and the manuscript.

## What you can do

**Write the world down**

- **Codex:** a page for every character, place, faction, item, species, culture, event and lore article. Add your own types and fields, link entries to each other ("lives in" and "contains" stay in sync), tag them and search across everything.

**Draw it**

- **Atlas:** upload a map of any size and zoom into it smoothly. Drop pins that open an entry, add labels, roads, rivers and regions, and nest maps inside maps (world, then kingdom, then city).

**Write the story**

- **Manuscript:** books, parts, chapters and scenes with an autosaving editor, word counts and a distraction-free mode. Names from your Codex are recognised as you type, and every entry shows the scenes it appears in.

**Keep time straight**

- **Calendars and timeline:** invent your own calendar, with months, weekdays, leap years, eras and moons. Put dates on entries and scenes, see everything on a timeline, and open any entry **as it was** on a given date or scene. Characters age, titles change, and nothing contradicts itself.

**Run it at the table**

- **Invite your group:** send a link and your players, readers or a co-GM join with their own account. Each sees only what you have shared with their role, and you can change a role or remove someone at any time.
- **View as a player:** preview your world as a player, a reader or the public, and see only what they would. Everything has a visibility (maps, pins, entries, pictures and changes), and new things start private.
- **Quest log:** a board of quests (not started, ongoing, completed, abandoned), linked to the people and places involved.
- **Galleries:** portraits and artwork for each entry, tagged to a moment in the story, plus a gallery for the whole world.

**Take it with you**

- **Export:** download your world as Markdown notes for Obsidian (one per entry, with links and pictures) or as a full JSON backup.

## Where it stands

All six planned milestones are built: Codex, Manuscript, Atlas, Timeline, the GM tools, and invites for players, readers and co-GMs. Invites are links you send by hand, since there is no email service yet. The plan and the design decisions are in [plan.md](plan.md), what is left to build is in [checklist.md](checklist.md), and the market research behind the product is in [PREREQUISITE_RESEARCH.md](PREREQUISITE_RESEARCH.md).

## Try it

You need Node.js 22.12+, pnpm 9 and Docker Desktop (for the database).

```bash
pnpm install
cp .env.example .env     # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:up               # start Postgres in Docker
pnpm db:migrate          # create the tables
pnpm db:seed             # optional: a demo world, sign in as demo@atlas.local / demo-password
pnpm dev                 # open http://localhost:5173
```

The demo world, Aerth, has characters, places, a calendar, a timeline, quests, and a mix of public and secret entries, so "view as a player" has something to show. It also has a real player (`player@atlas.local`) and reader (`reader@atlas.local`), both with the password `demo-password`, so you can sign in as them in a private window and compare. Maps and pictures are uploads, so add your own.

## For developers

A pnpm monorepo: a Fastify + Postgres API (`apps/api`), a React app (`apps/web`) and the schemas and logic they share (`packages/shared`). Useful commands:

| Command                                        | What it does                                    |
| ---------------------------------------------- | ----------------------------------------------- |
| `pnpm dev`                                     | Run the API and the web app together            |
| `pnpm test`                                    | Unit tests and API tests (needs the Docker DB)  |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Code checks                                     |
| `pnpm build`                                   | Production builds                               |
| `pnpm db:generate`                             | Create a migration after changing the DB schema |

Uploaded maps and pictures are kept in `storage/` (set `STORAGE_DIR` to move it). Every world route requires a signed-in member of that world; anyone else gets a 404. Invite links store only a hash of their secret.
