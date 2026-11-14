# Atlas & Ink: checklist

Everything not built yet, in one place to tick off. The overall plan, the milestones already built, the suggested order and what is deliberately skipped are in [plan.md](plan.md). The reasoning behind each feature is in [PREREQUISITE_RESEARCH.md](PREREQUISITE_RESEARCH.md).

Tags in brackets are the research's phase for the item (MVP, v1, v2, v3); "deferred in M3" means that milestone chose to leave it out. Tick an item (`[x]`) when it ships.

## A. Launch readiness (not feature work; no milestone covers it)

- [x] **Email** through Resend: confirmation at sign-up, password reset with forgot and reset pages, and emailed invites (M7). In development the messages print to the API log instead.
- [ ] **Email go-live:** a Resend account and a verified sending domain (SPF and DKIM), then `EMAIL_PROVIDER`, `RESEND_API_KEY` and `EMAIL_FROM` in production. (The "someone joined" notice is in E.)
- [ ] **Object storage** (Cloudflare R2) for maps, tiles and pictures, with per-plan quotas. Files live on local disk today, behind `modules/atlas/files.ts` and `modules/gallery/files.ts`, so the move touches those two modules.
- [ ] **Tiling as a real job queue.** It runs inside the API process, one map at a time.
- [ ] **Deployment:** Mumbai-region hosting plus a CDN for tiles, backups, monitoring. A one-container image, a production compose file and a guide ([DEPLOY.md](DEPLOY.md)) exist (M51); a real server is still to come.
- [x] **Rate limits and abuse limits** beyond Better Auth's own: invite lookups and joins, invite creation, world creation, uploads, search and exports (M7). Counters are in memory, so several API instances would need a shared store.
- [ ] **Scale test** with the research's synthetic world (10,000 entries, 500 chapters, 50 maps), then virtualise long lists and cluster pins where it shows.
- [ ] **Legal and trust:** terms and privacy policy (drafts in [docs/legal/](docs/legal/), M51, to be reviewed); the AI Charter (no training on user work, AI crawlers blocked on public wikis, AI opt-in with the user's own key); export guaranteed on every plan including lapsed ones; breach-notification flow. (Account deletion and name and password changes shipped in M7.)
- [ ] **Account extras** (deferred in M7): changing the email address, and downloading all of an account's data in one file (each world still exports on its own).
- [ ] **Age rule:** minimum age 18, or verifiable parental consent (many fanfic writers and players are teenagers).
- [ ] **India and EU compliance:** DPDP Consent Manager rules start November 13, 2026 and full obligations on May 13, 2027; GDPR basics (lawful basis, processing agreements, transfer clauses, cookie consent). Not legal advice; check with a professional.
- [ ] **Moderation, now that public sharing has shipped (F, M49; it stays switched off in production until this is done):** takedown process, an India grievance officer, NSFW and hate-speech rules, and no public publishing of non-SRD WotC text.
- [ ] **Billing:** Razorpay (INR, UPI) and Paddle (global tax). Free tier with unlimited entries and limited map storage (for example 3 maps, 250 MB); Pro about $6 to $8 a month or ₹199 to ₹299; annual discount; a capped founder lifetime deal. Never cap in a way that locks users out of work they already have.
- [ ] **Public marketing site** (`apps/site`, Next.js or Astro) with landing and SEO comparison pages, an in-app "what's new" [v1], and a Discord community with roadmap voting.
- [ ] **Search upgrade** to Meilisearch or Typesense if Postgres full-text stops being enough.

## B. Writing and the Codex

- [x] **Series codex:** entries are shared across every book by default, or scoped to one book or several (M34).
- [x] **Mass edit:** bulk visibility, tag and trash from a type's list (M16). Still to do: moving entries between types, and bulk edit from search results [MVP].
- [x] **To-do lists:** a world to-do list for the GM and editors; a task can point at an entry (M21). Still to do: due dates, priorities and manual ordering [MVP].
- [x] **Saved filters and entry templates:** per-person saved filters (tag, visibility, sort) on a type's list, and entry templates made from an entry (M22). A new world can start from the **sample world** (M50). Still to do: more ready-made worlds, and saving your own world as a template.
- [x] **More built-in types:** Religion, Language, Magic or Tech System and Glossary Term, with ready-made fields, added to new and existing worlds (M19).
- [x] **Relationship graph and family trees**, generated from relationship data (M10). Still to do: dragging nodes, and aunts, uncles and cousins in the tree [v1].
- [x] **Arc tracker** showing how a name, details and links change across chapters or scenes, powered by progressions (M26).
- [x] **Plot board** (a grid of beats by storylines with cards) and **structure templates** (Three-Act, Save the Cat, Hero's Journey, Kishōtenketsu) (M11). Still to do: the multi-thread timeline view over in-world time [v1].
- [x] **Faction diplomacy scores** (−100 to +100, shown as a web) (M27).
- [x] **Version history** per entry and per scene with a word-level comparison, named versions and restore (M14). Still to do: history for chapters and other records, and partial restore [v1].
- [x] **Comments** on entries and scenes, with replies, resolving and a comments page (M23). Still to do: notifications and mentions, comments on a passage of text [v1].
- [x] **Goals, streaks and timed sprints:** a daily goal, a manuscript target and deadline, streaks, a heatmap and a sprint timer (M15).
- [x] **Overused-word tracking** (a Word check page) and a **Style Guide** entry type (M24). Still to do: highlighting words in the editor, a per-scene breakdown [v1].
- [x] **Manuscript drag-and-drop reordering** in the binder, with the menu moves kept for keyboard and touch (M25).
- [x] **Character extras:** abilities with charges, a voice and dialogue sheet, an interview questionnaire, species trait inheritance and a colour palette field (M35). Still to do: turnaround sheet and stat blocks [v2].
- [x] **Content tree** of all articles, **pop-out windows** for an entry, and **keyboard shortcuts** (M36).
- [x] **Lore wiki extras:** secret blocks inside an article, embedded maps and timelines (M37). Field-level secrets are still F.
- [x] **Manuscript export to Word (.docx)**, in a standard submission layout or a clean one (M17).
- [x] **Manuscript export to EPUB** for e-readers (M18).
- [x] **More exports:** the manuscript as a PDF, a story-bible PDF, and screenplay (Fountain) and comic-script scaffolds (M38). The script formats lay out structure and leave the writing to adapt.

## C. Atlas, timeline and continuity

- [x] **Maps:** replace a map's image without deleting it; pin clustering when zoomed out (M13).
- [x] A **measure tool** with custom scale and travel times by foot, horse or ship, and **layers** (political, terrain, trade routes) (M13). Still to do: **drill-down transitions** (the child map visually opens from its spot on the parent) [v1].
- [x] **Time-aware map items** (borders, roads and anything else with a start and end) and an as-of date for the Atlas (M29). Still to do: an as-of view of the manuscript.
- [x] **Map prep notes on pins** (GM-only notes, never sent to players) (M13).
- [x] **Journey lines**, routes with dated stops that show how far along they are on any date (M29). **Pointcrawl or node maps** too: blank canvas maps and a route finder (M30).
- [x] **Fog of war** and reveals for players (M31); light annotation tools: arrows and circles beside the pins, labels, paths and regions (M29).
- [x] **Map art importers**: SVG exports are drawn into a map picture, and a GeoJSON file brings places, roads and areas in as items (M30). Still to do: hex and grid overlays and a vector map editor [v3], and Azgaar's own .map format.
- [x] **Calendars:** several calendars per world, timeline tracks by tag as well as by type, and **calendar reminders** (a world "today" and a coming-up list with yearly anniversaries) (M28). Still to do: reminders as notifications, and showing a date in the other calendars on entry pages.
- [x] **Progressions** for relationships, names and aliases (M26). Still to do: the as-of Atlas (borders by year) and as-of manuscript.
- [x] **Timeline playback** (a play bar that moves the marker, with an "on this date" list) and **chronicles playback** (the map's as-of date plays through time: dated items, journeys and dated places appear, move and go where they happen) (M32).
- [x] **Continuity checker:** warns when a dead character reappears, a narrator is outside their life, a parent is younger than a child, a link starts outside someone's life, an item has two owners or a narrator is in two places at once (M12). Still to do: travel feasibility from map distances, and age against species lifespan [v2].
- [x] **Universal VTT export** (a map's picture, grid, walls and lights as a .dd2vtt file) and a **token maker** (ring-and-crop PNG tokens made in the browser) (M33).

## D. Running the game (GM tools)

- [x] **GM screen** with widgets: dice, table roller, pinned entries, scratchpad, clocks and the current session (M9), rearranged by dragging (M50).
- [x] **Session notes and recaps** linked to the entries involved (M9). Still to do: live tables embedded in prep notes [v1].
- [x] **Player handouts** (text and a picture) revealed to players, who are told within seconds by polling (M20). Still to do: instant push, and handouts tied to scenes, entries and pins [v1].
- [x] **Shops and merchants:** a "Wares for sale" list on locations and characters, with prices and optional stock (M40). Still to do: a shop view for players, buying into a character's inventory, and linking wares to item entries [v1].
- [x] **Rollable tables:** weighted rows and dice ranges, chained tables, dice expressions in results, pasted-row import, and a **dice roller and roll log** (M8). Still to do: an embeddable roller inside notes [v1].
- [ ] **Entry-aware generators** that read your own world and save results as entries, input variables, culture-based name generators, encounter templates [v2].
- [x] **Initiative and HP tracker** with conditions (M39), and a **loot and treasure tracker** and a **party XP and downtime tracker**, all GM-screen widgets (M46). Still to do: session scheduling [v2, or integrate].
- [ ] **System packs** (optional, never in the core): an encounter builder, a custom stat-block builder, system-styled sheets, an opt-in SRD 5.2 compendium with automatic attribution, ORC for Pathfinder, Daggerheart only after legal review [v2].
- [ ] **Homebrew publisher** (Markdown to rulebook-style pages and PDF) with a **licence attribution helper**, and **world variables** (flags such as `war_started = true` for conditional text) [v2].

## E. Players, readers and membership

- [x] **Hand over ownership** (M41). Still to do: several owners.
- [x] **A notice when someone joins** (emailed to the owner) and **an audit trail** of joins, role changes, removals and handovers (M41). Still to do: inviting by name (looking up an existing user). (Emailing an invite link shipped in M7.)
- [x] **Comments for the `commenter` role:** commenters can be invited and comment on what readers can see (M23).
- [x] **Player journals:** players keep private notes on any entry they can see, and the GM reads everyone's (M44). Still to do: shared posts and discussion boards [v2].
- [ ] **Mobile companion** for character sheets and handouts [v2].
- [ ] **Shared content library** across a party [v3].

## F. Sharing and publishing

- [x] **Hidden until chapter N** and **spoiler gating**: an entry can be held back from wiki readers until a chapter has been read (M49). Still to do: single fields and blocks of an article revealed after a chapter.
- [x] **Field-level visibility:** a field can be marked GM only in the type editor (M45); block-level visibility came with secret blocks (M37). Still to do: fields shown to players only after a date or chapter (see spoiler gating).
- [x] **Public reader wiki** of a world's public entries, with an optional **password** for beta readers; AI crawlers asked to stay out (M49). Off in production until `PUBLIC_WIKIS=true`. Still to do: maps, timeline and graph on the wiki, a password per page, server-side rendering for search engines.
- [x] **Progression-driven spoiler-safe wiki:** readers say which chapter they have reached and see every entry, name and link as it stood then (M49). Still to do: remembering progress for signed-in readers.
- [x] **Export only what players can see:** the JSON and Markdown exports take an audience (players, readers or the public) and hold only what that audience can see (M43). Still to do: the same for the story-bible PDF and the manuscript exports.
- [ ] **Later publishing:** per-world analytics, white-label, followers and notifications, featured worlds, challenges and prompts [v2]; custom domains, supporter tiers, a reading storefront [v3].

## G. Collaboration and platform

- [ ] **Real-time co-editing** (Yjs with Hocuspocus), live editing indicators, an activity feed [v2].
- [ ] **Offline drafting** (y-indexeddb, cached tiles) [v2]; a Tauri **desktop app** [v3].
- [x] **Boards: a canvas and mood boards** (M52): entry cards, notes, pictures, frames, colour swatches, playable links and labelled arrows, shown to players without what is hidden from them. Built on React Flow (MIT). Still to do: freehand drawing, expanding cards, version history and comments on boards, Pinterest and Unsplash import [v2].
- [x] **Audio:** soundtrack links (Spotify, YouTube, Tabletop Audio or any web address) on locations, characters and sessions (M42), and a built-in **ambience player** with six scenes of generated music and weather (M48). Linked tracks on YouTube, Spotify and SoundCloud play inside the app (M50). Still to do: links on manuscript scenes.
- [ ] **Public API** that can read and write world data [v3]; a **plugin, theme and template marketplace** [v3].
- [ ] A **commission tracker** for artists [v3].

## H. Integrations

- [ ] **Importers** [v1]. Markdown notes and Obsidian vaults import as entries with their links (M51). Still to do, building first whichever the research's interviews say users most want to leave: World Anvil, Kanka, Campfire, Obsidian and Markdown, Scrivener and DOCX, Notion, Homebrewery. (vvd already imports from World Anvil, Obsidian, Notion, Google Docs and Word.)
- [ ] **Discord webhooks** (changes and session recaps) [v1]; a **Discord bot** for lore lookups and table rolls [v2].
- [ ] **VTT exports:** Foundry journal and actor packs, an Owlbear extension, Roll20 handouts [v2].
- [ ] **Link to D&D Beyond or Demiplane** character sheets, read-only [v3].
- [ ] **Game-dev export and write API** (JSON per type for Unity, Unreal and Godot) [v2]; branching dialogue editor, play mode, Ink and Yarn export, localization view, voice-over management, a visual-novel template [v3].
- [ ] **Opt-in AI, bring your own key only** [v3]: per-entry context controls, generation prompts, chapter-to-codex summaries, an AI continuity finder, semantic search.

## I. Validation (not code; the research says to do this before investing much more)

- [ ] Interview 15 to 20 people each from fantasy novelists, GMs and indie narrative designers: what they use, what they pay, what made them switch last time.
- [ ] Test a clickable prototype of the drill-down map and chapter hover cards and measure sign-up intent.
- [ ] Test INR and USD price points on a landing page.
- [ ] Ask target users where they stand on AI: none, opt-in with their own key, or built in.
- [ ] Find which tool they most want to leave, and build that importer first.
- [ ] Check whether upload-and-annotate is enough or users want to draw maps in-app.
- [ ] Check whether GM features or writer features win the first 100 paying users.
- [ ] Try vvd's free tier hands-on: how deep its spoiler controls, campaigns, map travel times and import go (see the research's vvd section).
