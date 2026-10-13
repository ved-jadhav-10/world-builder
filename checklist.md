# Atlas & Ink: checklist

Everything not built yet, in one place to tick off. The overall plan, the milestones already built, the suggested order and what is deliberately skipped are in [plan.md](plan.md). The reasoning behind each feature is in [PREREQUISITE_RESEARCH.md](PREREQUISITE_RESEARCH.md).

Tags in brackets are the research's phase for the item (MVP, v1, v2, v3); "deferred in M3" means that milestone chose to leave it out. Tick an item (`[x]`) when it ships.

## A. Launch readiness (not feature work; no milestone covers it)
- [ ] **Email provider** (Resend or SES): email verification, password reset (today the link only prints to the API log), invite emails, "someone joined" notices.
- [ ] **Object storage** (Cloudflare R2) for maps, tiles and pictures, with per-plan quotas. Files live on local disk today, behind `modules/atlas/files.ts` and `modules/gallery/files.ts`, so the move touches those two modules.
- [ ] **Tiling as a real job queue.** It runs inside the API process, one map at a time.
- [ ] **Deployment:** Mumbai-region hosting plus a CDN for tiles, production config, backups, monitoring.
- [ ] **Rate limits and abuse limits** beyond Better Auth's own: invite joins, uploads, search, exports.
- [ ] **Scale test** with the research's synthetic world (10,000 entries, 500 chapters, 50 maps), then virtualise long lists and cluster pins where it shows.
- [ ] **Legal and trust:** terms and privacy policy; the AI Charter (no training on user work, AI crawlers blocked on public wikis, AI opt-in with the user's own key); export guaranteed on every plan including lapsed ones; account deletion, correction and breach-notification flows.
- [ ] **Age rule:** minimum age 18, or verifiable parental consent (many fanfic writers and players are teenagers).
- [ ] **India and EU compliance:** DPDP Consent Manager rules start November 13, 2026 and full obligations on May 13, 2027; GDPR basics (lawful basis, processing agreements, transfer clauses, cookie consent). Not legal advice; check with a professional.
- [ ] **Moderation, if public sharing ships (F):** takedown process, an India grievance officer, NSFW and hate-speech rules, and no public publishing of non-SRD WotC text.
- [ ] **Billing:** Razorpay (INR, UPI) and Paddle (global tax). Free tier with unlimited entries and limited map storage (for example 3 maps, 250 MB); Pro about $6 to $8 a month or ₹199 to ₹299; annual discount; a capped founder lifetime deal. Never cap in a way that locks users out of work they already have.
- [ ] **Public marketing site** (`apps/site`, Next.js or Astro) with landing and SEO comparison pages, an in-app "what's new" [v1], and a Discord community with roadmap voting.
- [ ] **Search upgrade** to Meilisearch or Typesense if Postgres full-text stops being enough.

## B. Writing and the Codex
- [ ] **Series codex:** entries shared across books, or scoped per book or per series [MVP].
- [ ] **To-do lists and mass edit** (bulk tag, move, permission changes) [MVP].
- [ ] **Saved filters, entry templates and world templates** [MVP].
- [ ] **More built-in types:** Religion, Language, Magic or Tech System and Glossary [v1]. Users can already add any of these as their own type; the built-ins would come with ready-made fields.
- [ ] **Relationship graph and family trees**, generated from relationship data [v1]. The data exists; nothing draws it yet.
- [ ] **Arc tracker** showing how traits and relationships change across chapters, powered by progressions [v1].
- [ ] **Plot board** (beat and scene cards on a corkboard or kanban, plus a multi-thread timeline with one row per storyline) and **structure templates** (Three-Act, Save the Cat, Hero's Journey, Kishōtenketsu) [v1].
- [ ] **Faction diplomacy scores** (−100 to +100, shown as a web) [v1].
- [ ] **Comments**, and **version history** per entry and per chapter with restore; **revision snapshots** in the manuscript [v1; the snapshots were deferred in M2].
- [ ] **Goals, streaks and timed sprints**, **overused-word tracking**, **style and genre guide entries** [v1; goals and streaks deferred in M2].
- [ ] **Manuscript drag-and-drop reordering** (moves are menu-based today; deferred in M2).
- [ ] **Character extras:** abilities with charges, voice and dialogue sheet, interview questionnaire, species trait inheritance, colour palette field [v1]; turnaround sheet [v2]; stat blocks, system-agnostic or 5e [v2].
- [ ] **Content tree** of all articles, **pop-out windows**, **keyboard shortcuts** for common actions [v1].
- [ ] **Lore wiki extras:** secret blocks inside an article, embedded maps and timelines [MVP/v1 in the research; see also field-level secrets in F].
- [ ] **More exports:** DOCX [MVP]; EPUB, PDF and a story-bible PDF [v1]; screenplay and comic script formats [v3].

## C. Atlas, timeline and continuity
- [ ] **Maps:** replace a map's image without deleting it (deferred in M3); pin clustering when zoomed out [MVP; deferred in M3].
- [ ] **Drill-down transitions** (the child map visually opens from its spot on the parent), a **measure tool** with custom scale and travel times by foot, horse or ship, and **layers** (political, terrain, trade routes) [v1; deferred in M3].
- [ ] **Time-aware layers** (borders by year) [v2] and as-of views for the Atlas and the manuscript (deferred in M4).
- [ ] **Journey lines** (the route taken, by date), **pointcrawl or node maps**, **map prep notes on pins** (GM-only notes shown while running a session) [v1].
- [ ] **Fog of war** and reveals for players [v2]; light annotation tools beyond the current pins, labels, paths and regions [v1].
- [ ] **Map art importers** for Azgaar and Watabou output [MVP import is plain upload today]; hex and grid overlays and a vector map editor [v3].
- [ ] **Calendars:** several calendars per world and parallel timeline tracks beyond lanes by type (deferred in M4); **calendar reminders** on entries [v1].
- [ ] **Progressions** for relationships, names and aliases (deferred in M4).
- [ ] **Timeline playback** and **chronicles playback** (animating events in place on the map) [v2].
- [ ] **Continuity checker:** warns when a dead character reappears, travel is impossible, ages clash or an item has two owners [v2; the research found no competitor that offers it].
- [ ] **Universal VTT export**, a **token maker** [v2].

## D. Running the game (GM tools)
- [ ] **GM screen dashboard** with configurable widgets (initiative, pinned NPCs, tables, timers, notes) [v1; deferred in M5].
- [ ] **Session notes and recaps** linked to the entries involved [v1; deferred in M5], with **live tables** embedded in prep notes [v1].
- [ ] **Player handouts** and image reveals pushed to players live [v1; deferred in M5].
- [ ] **Shops and merchants** (a location's inventory doubles as a priced shop) [v1].
- [ ] **Rollable tables:** weighted rows and dice ranges, chained tables, dice expressions in results, CSV import, an embeddable roller [v1]; a **dice roller and roll log** [v1].
- [ ] **Entry-aware generators** that read your own world and save results as entries, input variables, culture-based name generators, encounter templates [v2].
- [ ] **Initiative and HP tracker**, condition tracking, loot and treasure tracker, downtime and XP tracker [v2]; session scheduling [v2, or integrate].
- [ ] **System packs** (optional, never in the core): an encounter builder, a custom stat-block builder, system-styled sheets, an opt-in SRD 5.2 compendium with automatic attribution, ORC for Pathfinder, Daggerheart only after legal review [v2].
- [ ] **Homebrew publisher** (Markdown to rulebook-style pages and PDF) with a **licence attribution helper**, and **world variables** (flags such as `war_started = true` for conditional text) [v2].

## E. Players, readers and membership
- [ ] **Hand over ownership**, and several owners.
- [ ] **Email invitations** and inviting by name (links are shared by hand until email exists, see A); a notice when someone joins; an audit trail of who joined with which link.
- [ ] **Comments for the `commenter` role** (the role exists but has no features of its own yet) [v1].
- [ ] **Player journals and posts**, so players add their own notes to entries [v1]; discussion boards [v2].
- [ ] **Mobile companion** for character sheets and handouts [v2].
- [ ] **Shared content library** across a party [v3].

## F. Sharing and publishing
- [ ] **Hidden until chapter N** and **spoiler gating**: pages and fields revealed after a chosen chapter [v1; deferred in M5].
- [ ] **Field-level and block-level visibility** inside an entry [deferred in M5].
- [ ] **Public reader wiki** for chosen pages [v1], with **password-protected pages** for beta readers or players [v1]; AI crawlers blocked.
- [ ] **Progression-driven spoiler-safe wiki:** readers see only what is true up to their chapter [v2; nobody offers it].
- [ ] **Export only what players can see** (the current exports include GM-only content, so they are editor-only) [deferred in M5].
- [ ] **Later publishing:** per-world analytics, white-label, followers and notifications, featured worlds, challenges and prompts [v2]; custom domains, supporter tiers, a reading storefront [v3].

## G. Collaboration and platform
- [ ] **Real-time co-editing** (Yjs with Hocuspocus), live editing indicators, an activity feed [v2].
- [ ] **Offline drafting** (y-indexeddb, cached tiles) [v2]; a Tauri **desktop app** [v3].
- [ ] **Mood boards and a whiteboard** (tldraw, check its licence, or Excalidraw), expanding cards and frames, embedded media; Pinterest and Unsplash import [v1/v2].
- [ ] **Audio:** location soundtracks as Spotify, YouTube or Tabletop Audio links on locations and scenes [v2].
- [ ] **Public API** that can read and write world data [v3]; a **plugin, theme and template marketplace** [v3].
- [ ] A **commission tracker** for artists [v3].

## H. Integrations
- [ ] **Importers** [v1], building first whichever the research's interviews say users most want to leave: World Anvil, Kanka, Campfire, Obsidian and Markdown, Scrivener and DOCX, Notion, Homebrewery.
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
