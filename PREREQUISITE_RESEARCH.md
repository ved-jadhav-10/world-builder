# Worldbuilding & Story Platform: Complete Research Report

Oct 7, 2026 · @VJ

## Summary

There is a real but narrow gap: no product joins nested deep-zoom maps, a manuscript-grade chapter editor and structured character sheets in one connected world. LegendKeeper leads on nested maps but has no manuscript editor. Campfire and World Anvil have manuscripts but weaker map nesting, and Scrivener, Dabble, Novelcrafter and Plottr have no maps at all.

- **What to build:** one linked graph of story entities, seen through three views (Atlas for maps, Codex for characters and lore, Manuscript for chapters), plus a GM mode for running games.
- **Who first:** fantasy novelists who also run or play tabletop RPGs. They are online, vocal, and currently pay for two separate products.
- **Biggest idea from competitor research:** "progressions", facts that change by scene or date, so the whole world can be viewed as of any chapter. Novelcrafter does this only for its codex.
- **TTRPG features to build natively:** rollable tables that pull from your own world, a GM screen with map prep notes, shops, faction scores and quest tracking, and a book-style homebrew publisher.
- **Don't build a battlemap VTT.** Export to Foundry, Owlbear and Roll20 (Universal VTT format) and integrate with Discord instead.
- **Trust is a feature:** never train AI on user work, keep any AI opt-in, and guarantee full export. WotC's Sigil VTT shuts down on October 31, 2026, which is why users fear lock-in.
- **India compliance clock:** DPDP Consent Manager rules start November 13, 2026; full obligations apply from May 13, 2027.
- **Realistic outcome:** a profitable indie SaaS rather than a venture-scale company, unless it later expands into game studios.

This report assumes you are building for other creators. If it's only for your own use, LegendKeeper plus Scrivener or Dabble covers about 80% of the need today.

## The idea

The product is a browser-based "story operating system": one workspace where a world's geography, people, history and narrative all link to each other. Working name: **Atlas & Ink**.

**The problem.** Creators juggle 3 to 5 tools: a map maker, a wiki, a plotting tool, a manuscript editor, and sometimes a narrative or VTT tool. Nothing links across them. Renaming a city means editing five apps, and nobody can check a character's location in chapter 12 against the map or the timeline.

**The promise.** Zoom from the world map into a tavern, click the barkeep, and see her sheet, every chapter she appears in, and where she was on the timeline. Then keep writing.

### Who it's for

| Segment | Core job | What they value most | Willingness to pay |
| --- | --- | --- | --- |
| Fantasy/SFF novelists (incl. web serials, fanfic) | Keep a sprawling canon consistent across a series | Chapter editor + linked codex + maps | Moderate; tired of subscriptions, love lifetime deals |
| TTRPG game masters (D&D and others) | Prep and run campaigns, reveal lore gradually | Nested maps, GM secrets, session tools | High; proven by LegendKeeper, World Anvil, Kanka |
| Indie game devs / narrative designers | Lore bible + branching dialogue that ships into an engine | Structured data, JSON and Ink/Yarn export | High per seat, but a small segment |
| Comic artists / illustrators | Visual references, character turnarounds, mood boards | Galleries, boards, colour palettes | Low to moderate |
| Screenwriters | Story bible, beat boards | Beat boards, character arcs | Low; script tools dominate |
| Collaborative teams / shared worlds | Co-own a setting | Permissions, comments, live co-editing | Per seat |

**Beachhead:** fantasy novelists who also run or play TTRPGs. Game-dev export is a later expansion, not the starting point.

### How it fits together

- **Everything is an entity:** Character, Location, Faction, Item, Event, Species, Culture, Religion, Language, Magic System, Lore Article, Chapter, Scene, Map, plus types users define themselves.
- **Typed relationships** link entities (member of, located in, owns, enemy of, appears in) and can be limited to a date range.
- **A Location is a map pin**, and any pin can open a child map: world, continent, region, city, building, room.
- **Progressions** record how an entity changes at a scene or date, so every view can show the world "as of" chapter 12.
- **Chapters detect mentions** of entity names and aliases, filling each entity's "appears in" list automatically.
- **Timeline events** link who took part, where it happened, and what changed.
- **Visibility layers** apply to every entity, field and pin: public, reader, player, GM-only, or hidden until chapter N.
- **Three views plus a mode:** Atlas (maps), Codex (characters and lore), Manuscript (chapters), and a GM mode for running sessions.

## Complete feature list

This list merges your requested features, the additions from the first report, and roughly 100 features found in competitors and D&D tools. Each feature carries a release phase: **MVP** (launch), **v1** (public launch), **v2**, **v3**, or **skip** (integrate or don't build). Segments: N = novelists, GM = game masters, GD = game devs, A = artists.

### Your requested features

**Nested, zoomable maps (Atlas)**

- Upload very large maps (aim for 16K to 30K px), auto-tiled for smooth deep zoom. (MVP)
- Any pin or region opens a child map, with breadcrumbs: World › Kaldor › Vesh › Old Quarter › The Gilded Eel. (MVP)
- Drill-down transitions: the child map visually opens from its spot on the parent. (v1)
- Pins with custom icons and colours, linked to entities; clustering when zoomed out; labels that appear by zoom level. (MVP)
- Regions and borders, roads and rivers, text labels. (MVP)
- Measure tool with a custom scale and travel-time estimates by foot, horse or ship. (v1)
- Layers (political, terrain, trade routes) and time-aware layers showing borders in different years. (v1 layers; v2 time-aware)
- GM-secret pins and fog-of-war reveal for players. (v2)
- Light drawing and annotation; import art from Inkarnate, Wonderdraft, Azgaar or Watabou rather than painting maps in-app. (MVP import; v1 drawing)
- Hex/grid overlays and a vector map editor. (v3)

**Character boards**

- Template-driven sheets: name, aliases, age in your custom calendar, species, culture, faction, appearance, personality, goals, fears, voice notes. (MVP)
- Appearance gallery with multiple portraits, outfits and age variants, each tagged to a chapter or date. (MVP)
- Inventory and equipment, where each item is its own entity with owners and history. (MVP)
- Optional stat blocks, system-agnostic or 5e. (v2)
- Relationship panel feeding a relationship graph and family tree. (v1)
- Arc tracker showing how traits and relationships change across chapters. (v1, powered by progressions)
- Auto-generated "appears in" list: chapters, scenes, events, maps. (MVP)

**Storyboard: plot, lore and chapters**

- Plot board: beat and scene cards on a corkboard or kanban, plus a multi-thread timeline with one row per storyline. (v1)
- Structure templates: Three-Act, Save the Cat, Hero's Journey, Kishōtenketsu. (v1)
- Lore wiki: rich-text articles with templates, @mentions, auto-linking, backlinks, embedded maps and timelines, and secret blocks. (MVP)
- Manuscript editor: book › part › chapter › scene, distraction-free mode, scene metadata (POV, location, in-world date), word counts and goals. (MVP)
- Split screen with the codex beside the manuscript, and hover cards on entity names. (MVP)
- Comments and revision snapshots in the manuscript. (v1)

### Maps and battlemaps (additional)

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Map pins in global search | Search finds pins across all maps | World Anvil | All | MVP |
| Map prep notes on pins | GM-only notes keyed to pins, shown while running a session | D&D Beyond (2026 roadmap) | GM | v1 |
| Pointcrawl / node maps | Abstract travel graphs of places and paths | LegendKeeper Boards | GM, GD | v1 |
| Journey lines | Draws the route characters or the party actually took, by date | World Anvil | N, GM | v1 |
| Image and handout reveals | Push an image full-screen to players | D&D Beyond Maps | GM | v1 |
| Chronicles playback | Animates timeline events in place on the map | World Anvil | N, GM | v2 |
| Universal VTT export | Exports battlemaps with walls, doors and lights | Roll20 (import), Dungeondraft | GM | v2 |
| Token maker | Turns character art into framed VTT tokens | Roll20 | GM, A | v2 |
| Random dungeon generation | Procedural dungeon layouts | Dungeon Scrawl, donjon, Watabou | GM | skip (import) |
| Dynamic lighting, line of sight, multi-level scenes | Tactical VTT rendering | Foundry v14, Roll20, Owlbear | GM | skip (export) |

### Worldbuilding and lore

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Custom calendars and timelines | Any months, weekdays, moons, eras and leap rules; parallel timelines | World Anvil, Kanka, Fantasy Calendar | All | MVP |
| Core entity types | Factions, magic/tech systems, languages, religions, cultures, species, items, glossary | Campfire, World Anvil | All | MVP (6 core), v1 (rest) |
| User-defined entity types | Users create new types with their own fields, icons and permissions | Kanka v3.0 | All | MVP |
| Search, tags, saved filters, templates | Find anything; reusable entity and world templates | All major tools | All | MVP |
| Relationship graph and family trees | Generated from relationship data, not drawn by hand | World Anvil, Kanka | N, GM | v1 |
| Faction diplomacy scores | Relations between factions scored from −100 to +100, shown as a web | World Anvil | GM, N | v1 |
| Rule-based continuity checker | Warns when a dead character reappears, travel is impossible, ages clash, or an item has two owners | Nobody (gap) | N, GM | v2 |
| Template marketplace | Community-made world and entity templates | World Anvil, Kanka plugins | All | v3 |

### Characters and NPCs (additional)

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Progressions | Changes attached to a scene or date; viewing "as of chapter 12" shows the right facts | Novelcrafter | N, GM | MVP |
| Aliases for mention detection | Names, nicknames and titles all count as mentions | Novelcrafter | N | MVP |
| Life status | Alive, dead, missing or unknown, filterable | Kanka | All | MVP |
| Abilities with charges | Abilities on any entity, with uses-per-rest tracking | Kanka | GM | v1 |
| Voice and dialogue sheet | How a character speaks, for reference and AI context | Novelcrafter | N, GD | v1 |
| Interview questionnaire | Guided questions that fill out a character | Bibisco (not re-verified) | N | v1 |
| Species trait inheritance | A character inherits abilities from their species | Kanka | GM, GD | v1 |
| Colour palette field | Hex swatches stored on a character | Artist workflows | A | v1 |
| Turnaround reference sheet | Front, side and back views plus palette on one exportable sheet | Artist workflows | A | v2 |

### Writing and editing (additional)

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Series codex | Entries shared across books, scoped per book or per series | Novelcrafter | N | MVP |
| Goals, streaks and sprints | Daily targets and timed writing sprints | Dabble, Novelcrafter | N | v1 |
| Overused-word tracking | Highlights tracked words in prose | Novelcrafter | N | v1 |
| Style and genre guide entries | Codex entries that define voice and genre conventions | Novelcrafter | N | v1 |
| Screenplay and comic script formats | Script formatting and beat boards | Final Draft, Celtx (not re-verified) | N, A | v3 |

### Running sessions (GM tools)

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| View as player | GM sees exactly what players see | Roll20 | GM | MVP |
| Quest log with statuses | Not started, ongoing, abandoned, completed; linked locations | Kanka | GM | MVP |
| GM screen dashboard | Configurable widgets: initiative, pinned NPCs, tables, timers, notes | World Anvil, Kanka, EmberScreen | GM | v1 |
| Session notes and recaps | Log each session, linked to the entities involved | Campaign Logger, World Anvil | GM | v1 |
| Player handouts | Reveal documents and images to players | Roll20, D&D Beyond | GM | v1 |
| Shops and merchants | A location's inventory doubles as a priced shop | Kanka, Roll20 (Sept 2026) | GM | v1 |
| Calendar reminders | Date-based reminders on entities, using the in-world calendar | Kanka | GM | v1 |
| Live tables inside session notes | Prep notes with rollable tables and rules embedded | D&D Beyond (promised) | GM | v1 |
| Dice roller and roll log | Roll anywhere; keep a shared history | D&D Beyond, Roll20, Avrae | GM | v1 |
| Initiative and HP tracker | Turn order, hit points, conditions | D&D Beyond, Roll20 | GM | v2 |
| Encounter builder | Difficulty budget vs. party for 2014, 2024 and other rule sets | Kobold+, D&D Beyond | GM | v2 (system pack) |
| Loot and treasure tracker | Who got what, and when | Roll20 Treasure sheets | GM | v2 |
| Downtime and XP/milestone tracker | Per-character downtime days and progression | Common in DM tools (not re-verified) | GM | v2 |
| Session scheduling | Availability polls, recurring sessions, time zones | Discord bots, Kobold+ (not re-verified) | GM | v2, or integrate |

### Generators and random tables

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Rollable tables | Weighted rows and dice ranges, rolled on click | World Anvil, Chartopia | GM, N | v1 |
| Chained tables | One roll triggers sub-tables (first name + surname + trait) | Chartopia | GM | v1 |
| Dice expressions in results | "3d6 × 10 gp" resolves inline | Chartopia | GM | v1 |
| CSV import and embeddable roller | Import spreadsheets; embed a roller on a wiki page | Chartopia | GM | v1 |
| Entity-aware generators | Tables pull from your own wiki and can save results as new entities | Nobody (gap) | All | v2 |
| Input variables | A generator takes parameters such as region or culture | Chartopia | GM, GD | v2 |
| Culture-based name generators | Names built from your conlang's sounds and rules | Fantasy Name Generators, donjon | N, GM, GD | v2 |
| Encounter templates | Boss, boss + minions, horde, duo | Kobold+ | GM | v2 |

### Rules, homebrew and stat blocks

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Book-style homebrew publisher | Markdown to rulebook-style pages: stat blocks, spells, items, covers, contents, PDF | Homebrewery, GM Binder | GM, GD | v2 |
| Custom stat-block builder | Users design stat-block layouts for any game system | World Anvil Creator Studio | GM, GD | v2 |
| System-styled sheets via plugins | Attributes rendered as a game system's character sheet | Kanka plugins | GM | v2 |
| SRD compendium (opt-in) | Searchable SRD 5.2 monsters, spells and rules, with attribution | D&D Beyond, 5e tools | GM | v2 |
| Condition tracking | Conditions applied to creatures, synced to sheets | D&D Beyond Maps | GM | v2 |
| World variables | Global flags such as war\_started = true, usable in conditional text | World Anvil, Arcweave, articy | GM, GD | v2 |

### Player-facing features

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Player portal | Players see only what has been revealed to them | World Anvil, Kanka, LegendKeeper | GM | v1 |
| Player journals and posts | Players add their own notes to entities | Kanka, World Anvil | GM | v1 |
| Discussion boards | Forum threads inside a world | World Anvil | GM, N | v2 |
| Mobile companion | Character sheet and handouts on a phone | D&D Beyond, Campfire | GM | v2 |
| Shared content library | Share purchased or homebrew content with the party | D&D Beyond, Demiplane | GM | v3 |

### Collaboration and organisation

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| To-do lists and mass edit | Tasks per world; bulk tag, move or permission changes | World Anvil (July 2026) | All | MVP |
| Trash and recovery | Restore deleted entities | Kanka | All | MVP |
| Automatic category ordering | Sort by name, created or updated | World Anvil | All | MVP |
| Roles and permissions | Owner, editor, commenter, reader, player | All major tools | All | v1 |
| Comments | Threads on any entity or chapter passage | World Anvil, Campfire | All | v1 |
| Version history | Per entity and per chapter, with restore | Most tools | All | v1 |
| Content tree | Auto-generated hierarchy of all articles | World Anvil | All | v1 |
| Pop-out windows | Detach sheets or notes into separate windows for multi-monitor GMs | Foundry v14 | GM | v1 |
| Keyboard shortcuts | Hotkeys for rolling, generating and saving | Kobold+ | GM | v1 |
| In-app "what's new" | Changelog inside the app instead of pop-ups | Roll20 | All | v1 |
| Real-time co-editing | Several people edit the same page at once | LegendKeeper, World Anvil | All | v2 |
| Live editing indicators | See who is editing which article | World Anvil (June 2026) | All | v2 |
| Activity feed | What changed, and by whom | Kanka, World Anvil | All | v2 |

### Visual and artist tools

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Image galleries | Galleries per entity and per world | World Anvil, Campfire | All | MVP |
| Pinterest and Unsplash import | Drag images in from boards and stock sites | LegendKeeper | A, N | v1 |
| Mood boards / infinite whiteboard | Freeform canvas of images, notes and entity cards | Milanote, LegendKeeper Boards | All | v2 |
| Expanding cards and frames | Resize a card into a live embed of the entity; group with frames | LegendKeeper | All | v2 |
| Embedded media | YouTube and Spotify players on boards | LegendKeeper | All | v2 |
| Commission tracker | Clients, status, deadlines, payments | Nobody (gap) | A | v3 |

### Publishing, sharing and monetisation

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Export: Markdown, JSON, DOCX | Full backup and Obsidian-compatible export | Most tools | All | MVP |
| Export: EPUB, PDF, story-bible PDF | Book and reference outputs | Campfire, Scrivener | N | v1 |
| Public reader wiki | Publish chosen pages | World Anvil, Kanka, LegendKeeper | N, GM | v1 |
| Spoiler gating | Pages and fields revealed after chapter N | World Anvil (partial) | N | v1 |
| Password-protected pages | Private sharing with beta readers or players | World Anvil | All | v1 |
| Progression-driven spoiler-safe wiki | Readers see only what is true up to their chapter | Nobody (gap) | N | v2 |
| Per-world analytics | Traffic stats for public worlds | World Anvil | N, GM | v2 |
| White-label | Remove platform branding | World Anvil | All | v2 |
| License attribution helper | Auto-inserts SRD, ORC or DPCGL attribution in exports | Nobody (gap) | GM, GD | v2 |
| Custom domains | Host a public world on your own domain | World Anvil (not re-verified) | N, GM | v3 |
| Supporter tiers | Patreon-style paid access to a world | World Anvil | N, GM | v3 |
| Reading storefront | Readers buy chapters or books in-app | Campfire Read | N | v3 |
| Paid GM listings | GMs sell seats at their games | StartPlaying | GM | skip (link out) |

### Community

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Challenges and prompts | Seasonal worldbuilding and writing challenges, awards, showcases | World Anvil, Kanka | All | v2 |
| Followers and notifications | Followers hear about new public articles | World Anvil | N, GM | v2 |
| Featured worlds | Curated discovery page | World Anvil | All | v2 |

### Game dev and narrative design

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Engine JSON export and write API | JSON per entity type for Unity, Unreal and Godot; an API that can write | articy, Arcweave | GD | v2 |
| Branching dialogue editor | Node graph with conditions and variables | articy, Arcweave, Twine | GD, GM | v3 |
| Play mode | Play the branching story as the player, with a variable debugger | Arcweave, articy | GD, GM | v3 |
| Ink and Yarn export | Dialogue as Ink or Yarn Spinner scripts | Ink, Yarn Spinner | GD | v3 |
| Embeddable playable story | Play a branch from the public wiki | Arcweave | GD, N | v3 |
| Edit while playing | Fix text during a play-test | Arcweave (May 2026) | GD | v3 |
| Localization view | Per-language text with translation status, import and export | articy, Arcweave | GD | v3 |
| Voice-over management | Attach audio to lines; synthesized previews | articy | GD | v3 |
| Visual-novel template | Prebuilt visual-novel project structure | Arcweave | GD, A | v3 |

### Audio

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Location soundtracks | Spotify, YouTube or Tabletop Audio links on locations and scenes | Alchemy, Foundry playlists | GM | v2 |
| Audio on dialogue nodes | Loops or one-shots when a node plays | Arcweave | GD | v3 |
| Stream audio to Discord | Pipe music into a voice call | Kenku FM | GM | skip (integrate) |

### Integrations and platform

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Importers | From World Anvil, Kanka, Campfire, Obsidian/Markdown, Scrivener/DOCX, Notion, Homebrewery | Switching aid (idea) | All | v1 |
| Discord webhooks | Post changes and session recaps to a channel | Kanka, World Anvil | GM | v1 |
| Discord bot | Look up lore and roll tables from Discord | Avrae, World Anvil (not re-verified) | GM | v2 |
| VTT exports | Foundry journal and actor packs, an Owlbear extension, Roll20 handouts | Foundry, Owlbear SDK | GM | v2 |
| Offline chapter drafting | Write without a connection, sync later | Scrivener, Campfire | N | v2 |
| Desktop app | Offline-first desktop build | Scrivener, Campfire | N | v3 |
| D&D Beyond / Demiplane link | Read-only link to an external character sheet | Roll20 × Demiplane | GM | v3 |
| Public API | Read and write world data | World Anvil, Kanka | GD | v3 |
| Plugin and theme marketplace | Third-party sheets, themes and widgets, with review | Kanka, Foundry, Owlbear | All | v3 |

### Opt-in AI (bring your own key only)

| Feature | What it does | Seen in | For | Phase |
| --- | --- | --- | --- | --- |
| Per-entity AI context controls | Choose which details may be sent to which model | Novelcrafter | N | v3 |
| Generation prompts | Backstory or NPC ideas using world context | Kanka Bragi | All | v3 |
| Chapter-to-codex summaries | Proposes codex updates from a finished chapter | Idea | N | v3 |
| AI continuity finder | Flags contradictions the rule checker can't | Idea | N | v3 |
| Semantic search | Search the world by meaning | Idea | All | v3 |

## Roadmap

&#91;embedded content: roadmap · 4 phases, headline features\]

The MVP (months 0–5) proves the connected world for writers and GMs, v1 (months 6–9) is the public launch, v2 (months 10–15) adds collaboration and running games, and v3 (month 15 onward) reaches game devs. Every feature's phase is listed in the feature tables above.

## Existing solutions

No tool covers all five core needs well: nested maps, character sheets, plotting, a lore wiki and chapter writing. LegendKeeper is the map benchmark, Campfire is closest to the full vision, and the writing tools stop at the manuscript. Key: ✅ strong, ◐ partial, ❌ none.

| Tool | Nested maps | Characters | Plotting | Wiki | Chapters | Platform | Pricing (2026) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [LegendKeeper](https://www.legendkeeper.com/) | ✅ best in class | ◐ | ◐ | ✅ | ❌ | Web | Free plan views and exports only; Pro $9/mo or $7.50/mo annual |
| [World Anvil](https://www.worldanvil.com/faq) | ◐ | ✅ | ◐ | ✅ | ◐ | Web | Free: 2 worlds, 42 articles, 100 MB; paid from $4.50/mo annual; lifetime tiers |
| [Campfire](https://aitoolscoop.com/tool/campfire-writing/) | ◐ (2 free maps) | ✅ | ✅ | ✅ | ✅ | Web, desktop, mobile | Free tier; modules from $2/mo; all modules $12/mo |
| [Kanka](https://kanka.io/pricing) | ◐ (no nested zoom) | ✅ | ◐ | ✅ | ❌ | Web, open source | Free, unlimited; $4.99, $9.99, $24.99/mo |
| [Notebook.ai](https://new.notebook.ai/) | ❌ | ✅ | ◐ | ✅ | ◐ | Web | Free (5 universes); Premium $9/mo or $84/yr |
| [Obsidian + plugins](https://publish.obsidian.md/hub/02+-+Community+Expansions/02.01+Plugins+by+Category/Plugins+for+TTRPG) | ◐ (DIY) | ◐ | ◐ | ✅ | ◐ | Desktop, mobile, local files | Free for personal use |
| Notion templates | ❌ | ◐ | ◐ | ◐ | ◐ | Web, desktop, mobile | Free personal; Plus $10/user/mo |
| [Scrivener](https://plotprose.com/scrivener-alternative/) | ❌ | ◐ | ◐ | ◐ | ✅ gold standard | Mac, Windows, iOS | One-time $59.99 (Mac or Windows); $23.99 iOS |
| Plottr | ❌ | ◐ | ✅ | ◐ | ❌ | Windows, Mac, web, iOS | From $60/yr; Pro $9.99/mo; lifetime $150 or $599 |
| Dabble | ❌ | ◐ | ✅ | ◐ | ✅ | Web, desktop, mobile | $19, $29, $49/mo; $699 lifetime |
| [Novelcrafter](https://novelmage.com/blog/novelcrafter-pricing-in-2026-what-you-actually-pay) | ❌ | ✅ | ✅ | ✅ | ✅ | Web | $4 to $20/mo; AI billed through your own key |
| [Sudowrite](https://www.inkfluenceai.com/blog/best-ai-for-writing-novels-2026) | ❌ | ◐ | ◐ | ◐ | ✅ (AI-first) | Web | $10 to $44/mo annual |
| [Arcweave](https://arcweave.com/pricing) | ❌ | ◐ | ✅ branching | ◐ | ❌ | Browser only | Free (non-commercial); Pro $15/member/mo annual |
| [articy:draft X](https://www.articy.com/en/support/frequently-asked-questions/) | ◐ | ✅ | ✅ flow | ✅ | ❌ | Windows | Free (700 objects); from €6.99/mo |
| [Inkarnate](https://pricetimeline.com/data/price/inkarnate) | ❌ (map art only) | ❌ | ❌ | ❌ | ❌ | Web | Free (3 maps); $7.99 or $14.99/mo |
| [Wonderdraft](https://wonderdraft.net/) / [Dungeondraft](https://dungeondraft.net/) | ❌ (map art only) | ❌ | ❌ | ❌ | ❌ | Desktop | $29.99 / $19.99 one-time |
| Campaign Logger | ❌ | ◐ | ◐ | ◐ | ❌ | Web | $5/mo or $4/mo annual |

### What stands out

- **LegendKeeper** sells true map-within-map nesting, regions, paths, measuring and multiplayer cursors, and reports 26M+ pages created ([changelog](https://www.legendkeeper.com/changelog/legendkeeper-0-18-0-0/)). It has no manuscript editor and no generative AI by design. It is your most direct map competitor.
- **World Anvil** claims 2.5 million users and does almost everything, but reviewers cite a steep learning curve and dated UI. A cut in the free article cap left some users unable to edit their own work ([Trustpilot](https://www.trustpilot.com/review/worldanvil.com)).
- **Campfire** has 18 modules including a manuscript editor. Its free plan caps you at 25,000 words, 10 characters and 2 maps, and its modular pricing confuses buyers. It rejects AI-generated work.
- **Kanka** is free and unlimited, with 400,000+ users. Paid tiers mostly buy bigger uploads, and v3.0 added user-defined modules ([blog](https://blog.kanka.io/2025/02/19/version-3-0-custom-modules/)).
- **Obsidian plugin stacks** are powerful but DIY. The Leaflet maps plugin is in maintenance mode and the original Fantasy Calendar plugin is unmaintained ([repo](https://github.com/fantasycalendar/obsidian-fantasy-calendar)).
- **Novelcrafter** has the strongest writer-side codex, with progressions and a series codex ([docs](https://www.novelcrafter.com/help/docs/codex/progressions-additions)), but it is text-only with no maps.
- **Map makers** create art but don't link it to lore. Import their output rather than compete; Inkarnate restructured its plans in early 2026.
- **Narrative tools:** articy:draft X is the studio standard (Windows, subscription), Arcweave is browser-only, and Twine, Ink and Yarn Spinner are free.
- **New 2024–2026 entrants** include CharGen, MythScribe, Aevon, Trails Weaver, Novelos, Scyn, Kindling, Hextml and dunia.gg. Many are AI-first, and many "alternatives" articles are written by these vendors, so treat them as marketing.

### Does anyone do nested maps well?

Yes, LegendKeeper; a 2026 tester rated its nested zoom the strongest of the tools tested ([CharGen](https://char-gen.com/alternatives/kanka-legendkeeper)). World Anvil, Kanka, Campfire, Trails Weaver, Hextml and Obsidian Leaflet do it partially. Nobody yet offers an animated drill-down, borders that change with the timeline, character positions per chapter, or travel-time checks against scenes. Those are your openings.

### Market gaps users complain about

1. Fragmentation: writers routinely stack 2 to 3 subscriptions.
2. Worldbuilding tools have weak editors; writing tools have weak worlds.
3. Clunky interfaces and steep learning curves (World Anvil, Scrivener, Obsidian setup).
4. Free-tier cuts and lock-in (World Anvil's article cap, Sigil's shutdown).
5. Subscription fatigue and demand for lifetime deals.
6. Distrust of AI; writers seek tools that advertise "no AI".
7. Map upload limits (Kanka 10 to 100 MiB by tier; LegendKeeper 14K px).
8. Plugin stacks that depend on unpaid solo maintainers.
9. Weak offline support in browser-only tools.

## D&D and TTRPG landscape

The big D&D platforms are moving toward prep and lore, which is our ground, while the VTT layer is crowded and volatile. Prices below were checked on October 7, 2026.

| Product | What it is | Pricing | Our move |
| --- | --- | --- | --- |
| [D&D Beyond](https://dndbeyond-support.wizards.com/hc/en-us/articles/7747225116820-Subscriptions-Pricing) | Official D&D toolset: builder, sheets, homebrew, Maps VTT, encounters, mobile app | Hero $2.99/mo; Master $5.99/mo; books extra | Link characters; compete on world depth |
| Sigil | WotC's 3D VTT | Shuts down October 31, 2026; its content then becomes inaccessible | Cautionary tale: sell "export everything" |
| [Roll20](https://help.roll20.net/hc/en-us/articles/360037774633-Feature-Breakdown) | Browser VTT, Dungeon Scrawl, Demiplane integration | Plus $5.99/mo; Pro $10.99/mo (may be outdated) | Export to it (UVTT, handouts) |
| [Foundry VTT](https://foundryvtt.com/article/faq/) | Self-hosted VTT with a huge module ecosystem; v14 since April 2026 | $50 one-time | Export journal and actor packs |
| [Owlbear Rodeo](https://www.owlbear.rodeo/pricing) | Lightweight VTT with an extension SDK | Free (200 MB, 2 rooms); $3.99 or $7.99/mo | Build an extension that shows our wiki and handouts in-room |
| Fantasy Grounds | VTT with 50+ licensed systems | Free to play since November 2025 | Skip, or export later |
| [Alchemy RPG](https://startplaying.games/blog/posts/a-comprehensive-list-of-virtual-tabletops) | Cinematic, theater-of-the-mind VTT | Free core; Unlimited about $8 to $10/mo (unverified) | Learn from its cinematic scene pages |
| [Demiplane](https://app.demiplane.com/subscription) | Per-system toolsets and character builders; Daggerheart partner | Free (7 characters); Standard $47.88/yr | Link out |
| [Kobold+ Fight Club](https://koboldplus.club/) | Encounter builder for several rule sets | Free | Build a light version in a system pack |
| [Homebrewery](https://sourceforge.net/projects/the-homebrewery.mirror/) / GM Binder | Markdown to rulebook-style PDFs | Free; Homebrewery is MIT-licensed | Build our own publisher; import Homebrewery markdown |
| [Chartopia](https://chartopia.d12dev.com/about/) / donjon | Random tables and generators | Free | Build entity-aware tables |
| [Encounter+](https://apps.apple.com/us/app/encounterplus-for-d-d-5e/id1170693487) | iOS and Mac GM toolkit and VTT | Free download; Premium price unverified | Later export target |
| Shard Tabletop | 5e VTT plus character sheets | Gamemaster Pro $9.99/mo | Skip |
| [Quest Portal](https://www.questportal.com/pricing) | VTT with an AI GM assistant paid in credits | Free tier; Pro price unverified | Watch |
| StartPlaying | Marketplace for paid GMs | 15% per booking per its help center; an older page says 10% | Link out |
| Avrae | D&D Discord bot linked to D&D Beyond | Free (third-party sources) | Integrate; our bot handles lore lookups |

### 2025–2026 news that matters

- **D&D Beyond is moving into prep.** Its mid-2026 roadmap prioritises Scene Prep (GM notes keyed to map pins), DM tools outside the VTT, a refreshed encounter builder and a rebuilt rules engine ([roadmap](https://www.dndbeyond.com/posts/2223-mid-year-update-d-d-beyonds-2026-development)).
- **Sigil is closing.** WotC laid off about 90% of the Sigil team in March 2025 and ended development in October 2025. D&D Beyond's Sigil Sunset FAQ says it stays available through October 31, 2026.
- **D&D Beyond Maps 2026:** character sheet in Maps (April), conditions synced with sheets (July), custom reveals for Master subscribers (September).
- **Roll20 2026:** a claimed 10× performance gain (January), random dungeons in Dungeon Scrawl (May), Universal VTT uploads with automatic walls, doors and lights (July), Shops & Treasure sheets (September 9) and a Token Maker (September 29) ([blog](https://blog.roll20.net/)).
- **Foundry v14** went stable on April 1, 2026 with multi-level scenes, Regions V2, pop-out apps and a VFX framework ([release notes](https://foundryvtt.com/releases/14.359)).
- **Owlbear Rodeo 2.4** (May 2026) added automatic fog detection ([blog](https://blog.owlbear.rodeo/)).
- **Fantasy Grounds** became free to play on November 8, 2025.
- **Universal VTT (.dd2vtt)** is now the de facto map interchange format; Roll20 accepts it on all tiers.

### Licensing: what we can ship

- **D&D SRD 5.1 and 5.2** are under CC-BY-4.0, which is irrevocable and only requires an attribution statement ([SRD 5.2.1](https://www.dndbeyond.com/srd)). SRD 5.2 (April 22, 2025) covers the 2024 rules. It excludes trademarked monsters such as beholders and mind flayers, the artificer, bastions and the aasimar.
- **The 2024 Basic Rules** on D&D Beyond are free to read but not CC-licensed, so don't copy them.
- **Pathfinder 2e Remaster** core books use the ORC license ([Paizo](https://paizo.com/blog/new-and-revised-licenses)); Pathfinder Infinite has a separate license.
- **Daggerheart's DPCGL** allows compatible content only in permitted formats, and limits VTT use to official partners plus a whitelist. Its waiver and indemnity clauses drew criticism from creators ([FAQ](https://www.daggerheart.com/faq/)).
- **Recommendation:** keep the core system-agnostic. Offer optional system packs (5e SRD, PF2e under ORC; Daggerheart only after legal review), insert attribution automatically, and never let users publish non-SRD WotC text. This is product guidance, not legal advice.

## Build, integrate or skip

Build what makes the world smarter; connect to tools that run the table. A battlemap VTT would take years to match Foundry, Roll20 and Owlbear, while an export button takes weeks.

**Build natively**

1. Progressions and a series codex: the core writer differentiator. (MVP to v1)
2. GM screen, map prep notes and "view as player": prep that lives inside the world. (MVP to v1)
3. Shops, faction scores and quest statuses, reusing item and relationship entities. (v1)
4. Rollable tables that can see your world and save results as entities. (v1 to v2)
5. A book-style homebrew publisher with automatic license attribution. (v2)
6. World variables shared by GM and game-dev modes, then a play mode for branching dialogue. (v2 to v3)
7. A light encounter builder and condition tracking inside optional system packs. (v2)

**Integrate or export**

- **Battlemaps, tokens, lighting:** Universal VTT export, Foundry journal and actor packs, an Owlbear extension, Roll20 handouts.
- **Discord:** webhooks first, then a bot for lore lookups and table rolls; leave dice and combat to Avrae.
- **Character builders:** link to D&D Beyond and Demiplane instead of rebuilding them.
- **Map art:** import from Inkarnate, Wonderdraft, Azgaar and Watabou.
- **Audio:** Spotify, YouTube and Tabletop Audio embeds; Kenku FM for Discord.
- **Game engines:** JSON and an API for Unity, Unreal and Godot; Ink and Yarn exports.
- **Paid games:** a "run this world on StartPlaying" link.

**Skip**

- Dynamic lighting, line of sight and 3D minis.
- Full rules automation.
- Character builders for licensed game systems.
- Hosting audio files.
- A paid-GM marketplace.

## Top 10 reasons users would switch

The strongest pitch is the connection between modules, not any single module. Ranked by how likely each is to make someone move their world:

1. **The world as of any date.** Progressions, calendars, time-aware map layers and timeline playback let you view everything as of a chapter or year. Novelcrafter does this only for text; World Anvil only for maps.
2. **A spoiler-safe public wiki.** Readers see only what is true up to their chapter. Serial authors with Patreon audiences would switch for this alone.
3. **Map-first and manuscript-grade.** LegendKeeper-class nested maps plus a real chapter editor, with hover cards linking the two.
4. **Generators that know your world.** "Roll a random NPC from the dwarven culture in Ironhold" creates a linked, saved entity.
5. **Prep-to-play GM screen.** Session notes, map prep, live tables, initiative, shops and faction scores in one dashboard, plus "view as player".
6. **Export everything, no lock-in.** Universal VTT, Foundry and Owlbear packs, JSON, Markdown, DOCX and EPUB. Sigil's shutdown makes this an emotional selling point.
7. **One world, three outputs.** The same entities feed a novel, a TTRPG campaign and a game-dev dialogue export.
8. **A homebrew publisher with legal autopilot.** Rulebook-style PDFs with the right SRD, ORC or DPCGL attribution added automatically.
9. **Your own entity types, plus a marketplace.** Users design custom types; later, creators sell templates, themes and sheets.
10. **Trust and fair pricing.** A public no-AI-training pledge, opt-in AI only, INR pricing for India, and a founder lifetime deal.

## Technical build guide

A React and PostgreSQL stack, with tiled image maps, a ProseMirror-based editor and Yjs for collaboration, is buildable by a solo developer or small team.

| Layer | Recommended choice | Why |
| --- | --- | --- |
| Frontend | React + TypeScript (Next.js or Vite) | Richest map, editor and canvas ecosystem |
| Backend | Node (NestJS or Fastify), or Supabase | Fast to ship; Supabase bundles auth and Postgres |
| Database | PostgreSQL: entity rows, a relationships table with valid-from/to dates, JSONB for custom fields | Recursive queries handle trees and nesting; no graph database needed early |
| Search | Postgres full-text first, then Meilisearch or Typesense | Cheap to start, easy to upgrade |
| Map tiling | libvips on upload, producing a DZI or XYZ tile pyramid | Fast, low-memory; a 20K × 20K map zooms smoothly |
| Map viewer | Leaflet with CRS.Simple for MVP; OpenSeadragon for the deepest zoom; OpenLayers or MapLibre for vector maps later | Leaflet is simple, with a large plugin ecosystem |
| Drawing layer | Konva or PixiJS | Stays fast with thousands of pins |
| Whiteboard | tldraw (check its commercial licence) or Excalidraw (MIT) | Don't build a canvas from scratch |
| Chapter editor | TipTap on ProseMirror; Lexical as an alternative | Custom nodes for mentions, secrets and comments; first-class Yjs support |
| Collaboration | Yjs with Hocuspocus or y-websocket; Liveblocks or PartyKit if hosted | Edits merge without conflicts; defer to v2 |
| Offline | y-indexeddb for drafts; cached tiles via a service worker; a Tauri desktop app later | Offline drafting comes almost for free |
| Storage | [Cloudflare R2](https://www.budgetforge.dev/tools/cloudflare-r2-pricing-2026) | $0.015/GB-month with no egress fees; map tiles are read-heavy |
| Hosting | Mumbai-region compute (AWS ap-south-1, GCP or DigitalOcean Bangalore) plus a global CDN | Low latency in India; simpler data handling under DPDP |
| Exports | Pandoc for DOCX, EPUB and PDF; Markdown with YAML front-matter; a published JSON schema | Obsidian-compatible and engine-friendly |

### Nested maps, step by step

1. On upload, generate a tile pyramid with libvips and store it in R2.
2. Display it in Leaflet using pixel coordinates (CRS.Simple).
3. Give each map a parent map and an anchor rectangle marking where it sits on the parent.
4. When the user zooms past a threshold inside an anchor, cross-fade into the child map.
5. Store pins as entity references, so a pin, its wiki page and its chapter mentions stay in sync.

### Notes

- Store manuscripts per scene, not as one giant document, for speed and fewer edit conflicts.
- Save editor documents as ProseMirror JSON or Yjs updates; derive plain text for search and a mention index for backlinks.
- Virtualise long lists, cluster pins, generate tiles in a background job queue, and cap storage per plan.
- Test early with a synthetic world of 10,000 entities, 500 chapters and 50 maps.
- A 2026 Tech-Insider comparison put 1 TB stored and 10 TB served at about $15/month on R2 versus about $919/month on S3.

## Business

Expect a profitable indie SaaS: the category has millions of users, but price points are small and users are subscription-weary.

### Demand signals

- World Anvil claims 2.5 million worldbuilders, Kanka 400,000+, and LegendKeeper 26M+ pages created. Obsidian estimated about one million users in 2023. All figures are self-reported.
- Mordor Intelligence sizes the adjacent screenwriting-software market at $185.78 million in 2025 ([report](https://www.mordorintelligence.com/industry-reports/screen-and-script-writing-software-market)). Broader "creative software" estimates vary too widely to rely on.

### Monetisation models in the category

| Model | Examples | Notes |
| --- | --- | --- |
| Freemium + one Pro tier | LegendKeeper ($9/mo) | Simple; the free tier must be useful, not just a trial |
| Generous free + supporter tiers | Kanka | Grows community fast; earns from power users through upload limits |
| Per-campaign premium boosts | Kanka | Pay to upgrade one campaign; transferable |
| Tiered guild + lifetime | World Anvil | Lifetime brings cash upfront but is a long-term cost |
| Modular à la carte + lifetime | Campfire ($2/module, $12 all) | Flexible but confusing |
| One-time licence | Scrivener, Wonderdraft, Dungeondraft | Loved by users; needs paid major upgrades |
| Storage tiers | Owlbear Rodeo (200 MB, 5 GB, 10 GB) | Ties price to real costs |
| Platform + bring-your-own AI key | Novelcrafter ($4 to $20/mo) | Keeps AI costs off your books |
| Per seat | Arcweave ($15 to $25/member), articy | For studios |

### Recommended pricing

- **Free:** unlimited entities and articles, limited map storage (for example 3 maps and 250 MB). Never cap existing content in a way that blocks editing.
- **Pro:** about $6 to $8/month, with India pricing around ₹199 to ₹299/month through Razorpay and UPI AutoPay.
- **Annual discount** plus a capped founder lifetime deal to fund development.
- **Later upsells:** team seats (v2), white-label and per-world analytics.

### Marketing channels

- A Discord community with roadmap voting.
- Reddit: r/worldbuilding, r/fantasywriters, r/DMAcademy, r/DnD, r/rpg and r/gamedev. Post genuine showcases, not ads.
- AuthorTube, BookTube and TTRPG YouTubers with affiliate codes; World Anvil leans heavily on these.
- A November writing challenge to fill the gap NaNoWriMo left, plus seasonal worldbuilding challenges.
- SEO comparison pages such as "World Anvil alternative" and "nested map worldbuilding".
- A Product Hunt and Hacker News launch once the drill-down map demo looks striking.

## Legal, trust and privacy

In this market trust is a feature: a clear AI policy and guaranteed export protect you from the backlash that hurt NaNoWriMo and World Anvil. Nothing here is legal advice.

### AI policy

- **Why it matters:** NaNoWriMo's September 2024 statement on AI led to board resignations and lost goodwill. It closed on March 31, 2025, citing a long decline in participation ([Futurism](https://futurism.com/nanowrimo-closing-embracing-ai)).
- **Competitor stances:** LegendKeeper doesn't train AI on user content or share it with AI providers ([privacy policy](https://www.legendkeeper.com/privacy/)). World Anvil says it doesn't train on user work and blocks scrapers on a best-effort basis ([FAQ](https://www.worldanvil.com/faq)). Campfire rejects AI-generated work and doesn't train on user content ([post](https://www.threads.com/@campfirewriting/post/C_gQHpgR_y4?hl=en)). Novelcrafter and Sudowrite build around AI for a pro-AI audience.
- **Publish an AI Charter:** no training on user work, no sale of data to AI companies, AI crawlers blocked on public wikis, AI features opt-in with the user's own key, and AI-assisted content labelled on public pages.
- **Decide early** whether public galleries accept AI-generated art; a visible "human-made" tag is one option.

### Ownership and terms

- Users keep all IP. Your terms take only the licence needed to host, display and back up their content.
- Guarantee export on every plan, including free and lapsed accounts.
- Never reduce free limits in a way that locks users out of work they already have.

### Moderation (if public sharing exists)

- Run a DMCA-style takedown process.
- In India, follow the IT Act 2000 and the 2021 Intermediary Guidelines: appoint a grievance officer and publish takedown timelines.
- Set content rules for NSFW gating and hate speech. Host fan-fiction worlds under user responsibility, with takedown compliance.
- Block public publishing of non-SRD WotC text.

### Data privacy

- **India's DPDP Act 2023 and Rules 2025:** the Rules were notified on November 13, 2025 ([PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2)). The Data Protection Board is live now. Consent Manager rules start November 13, 2026, and Consent Managers must be Indian companies ([Vinsys](https://www.vinsys.com/blog/dpdp-act-compliance-deadline-nov-2026-for-consent-manager)).
- **Full DPDP obligations apply from May 13, 2027:** notices, consent, security safeguards, breach reporting, user rights and children's data.
- **Under-18 users:** many fanfic writers and TTRPG players are teenagers. Either set a minimum age of 18 or build verifiable parental consent.
- **Build in from day one:** clear standalone consent notices, purpose limitation, deletion and correction flows, and breach notification.
- **GDPR (EU and UK users):** a lawful basis, data processing agreements, standard contractual clauses for transfers, user rights, and cookie consent.
- **Payments and tax:** Paddle acts as merchant of record for global VAT; Razorpay suits INR and UPI. GST registration applies past the turnover threshold, with special rules for exported services, so consult a CA.

## Risks, open questions and caveats

The biggest risk is a competitor closing the gap first, so validate the "maps + manuscript" pitch before writing much code.

### Key risks

| Risk | Mitigation |
| --- | --- |
| LegendKeeper adds a manuscript editor, or Campfire fixes its maps | Win on the connections (progressions, spoiler-safe wiki) and ship fast |
| D&D Beyond builds deeper prep tools | Stay system-agnostic and deeper on the world |
| Scope explosion | Keep the MVP narrow; everything else waits |
| Storage costs from huge free-tier maps | Tiling, quotas and R2 |
| Lifetime deals sold too cheaply | Cap the number sold and price them sensibly |
| Trust incidents: data loss, AI ambiguity, free-tier cuts | AI Charter, backups, export guarantee |
| Crowded field of AI-first entrants | Human-first, map-first positioning |
| DPDP children's-data and intermediary rules | Age gate or parental consent; grievance officer |
| Game-system licensing mistakes | System-agnostic core; legal review per system pack |

### Questions to answer before building

- [ ] Interview 15 to 20 people each from fantasy novelists, GMs and indie narrative designers: what they use, what they pay, and what made them switch last time.
- [ ] Test a clickable prototype of the drill-down map and chapter hover cards, and measure sign-up intent.
- [ ] Test INR and USD price points on a landing page.
- [ ] Ask target users where they stand on AI: none, opt-in with their own key, or built-in features.
- [ ] Find which tool they most want to leave, and build that importer first.
- [ ] Check whether upload-and-annotate is enough, or users want to draw maps in-app.
- [ ] Check whether GM features or writer features win the first 100 paying users.

### Research caveats

- Prices come from 2026 sources, but some conflict (Dabble, Roll20 Plus) and World Anvil's per-tier prices couldn't be confirmed. Check official pricing pages before publishing comparisons.
- Quest Portal Pro, Encounter+ Premium and current Alchemy prices couldn't be verified on official pages.
- Campfire's 80% royalty and $12/month figures come from third-party reviews.
- Features marked "not re-verified" were taken from the research brief and not rechecked.
- StartPlaying's help center says 15% per booking; an older page says 10%.
- Many 2026 "alternatives" articles are vendor marketing, and user counts and market sizes are self-reported or low-reliability.

## Sources

**Worldbuilding and writing tools**

- [LegendKeeper home](https://www.legendkeeper.com/) · [features](https://www.legendkeeper.com/features/) · [0.18 changelog](https://www.legendkeeper.com/changelog/legendkeeper-0-18-0-0/) · [Boards](https://www.legendkeeper.com/boards-announcement/) · [privacy policy](https://www.legendkeeper.com/privacy/)
- [World Anvil FAQ](https://www.worldanvil.com/faq) · [pricing](https://www.worldanvil.com/pricing) · [features list](https://www.worldanvil.com/w/WorldAnvilCodex/a/list-features) · [news June 2026](https://blog.worldanvil.com/newsletter/world-anvil-news-june-2026/) · [July 2026](https://blog.worldanvil.com/newsletter/world-anvil-news-july-2026/) · [September 2026](https://blog.worldanvil.com/newsletter/world-anvil-news-september-2026/) · [Trustpilot reviews](https://www.trustpilot.com/review/worldanvil.com)
- [Kanka features](https://kanka.io/features) · [pricing](https://kanka.io/pricing) · [v3.0 custom modules](https://blog.kanka.io/2025/02/19/version-3-0-custom-modules/)
- [Campfire review 2026 (AI Tool Scoop)](https://aitoolscoop.com/tool/campfire-writing/) · [Campfire AI stance](https://www.threads.com/@campfirewriting/post/C_gQHpgR_y4?hl=en)
- [Novelcrafter Codex](https://www.novelcrafter.com/features/codex) · [Progressions](https://www.novelcrafter.com/help/docs/codex/progressions-additions) · [Series Codex](https://www.novelcrafter.com/help/docs/codex/series-codex) · [pricing 2026 (NovelMage)](https://novelmage.com/blog/novelcrafter-pricing-in-2026-what-you-actually-pay)
- [Notebook.ai](https://new.notebook.ai/) · [Obsidian TTRPG plugins](https://publish.obsidian.md/hub/02+-+Community+Expansions/02.01+Plugins+by+Category/Plugins+for+TTRPG) · [Fantasy Calendar plugin repo](https://github.com/fantasycalendar/obsidian-fantasy-calendar)
- [Scrivener alternatives 2026 (PlotProse)](https://plotprose.com/scrivener-alternative/) · [Best AI for writing novels 2026 (Inkfluence)](https://www.inkfluenceai.com/blog/best-ai-for-writing-novels-2026)
- [World Anvil alternatives 2026 (CharGen)](https://char-gen.com/alternatives/world-anvil) · [Kanka and LegendKeeper alternatives (CharGen)](https://char-gen.com/alternatives/kanka-legendkeeper)
- [Inkarnate pricing changes](https://pricetimeline.com/data/price/inkarnate) · [Wonderdraft](https://wonderdraft.net/) · [Dungeondraft](https://dungeondraft.net/)
- [Arcweave pricing](https://arcweave.com/pricing) · [Arcweave what's new](https://arcweave.com/whats-new) · [articy:draft X what's new](https://www.articy.com/help/adx/WhatsNew.html) · [articy FAQ](https://www.articy.com/en/support/frequently-asked-questions/)

**D&D and TTRPG**

- [D&D Beyond mid-year 2026 roadmap](https://www.dndbeyond.com/posts/2223-mid-year-update-d-d-beyonds-2026-development) · [2026 roadmap](https://www.dndbeyond.com/posts/2132-d-d-beyonds-2026-development-roadmap) · [subscription pricing](https://dndbeyond-support.wizards.com/hc/en-us/articles/7747225116820-Subscriptions-Pricing) · [SRD 5.2.1](https://www.dndbeyond.com/srd)
- [Roll20 blog](https://blog.roll20.net/) · [Roll20 feature breakdown](https://help.roll20.net/hc/en-us/articles/360037774633-Feature-Breakdown) · [Roll20 UVTT maps (TechRaptor)](https://techraptor.net/tabletop/news/roll20-announces-new-automatic-map-features-in-partnership-with-czepeku) · [Roll20 Token Maker (Bleeding Cool)](https://bleedingcool.com/games/roll20-launches-brand-new-token-maker-system/)
- [Foundry VTT FAQ](https://foundryvtt.com/article/faq/) · [Foundry release 14.359](https://foundryvtt.com/releases/14.359) · [Owlbear Rodeo pricing](https://www.owlbear.rodeo/pricing) · [Owlbear Rodeo blog](https://blog.owlbear.rodeo/)
- [Demiplane subscription](https://app.demiplane.com/subscription) · [Kobold+ Fight Club](https://koboldplus.club/) · [Chartopia](https://chartopia.d12dev.com/about/) · [Homebrewery](https://sourceforge.net/projects/the-homebrewery.mirror/) · [Encounter+](https://apps.apple.com/us/app/encounterplus-for-d-d-5e/id1170693487) · [Quest Portal pricing](https://www.questportal.com/pricing) · [VTT list 2026 (StartPlaying)](https://startplaying.games/blog/posts/a-comprehensive-list-of-virtual-tabletops)
- [Paizo licenses](https://paizo.com/blog/new-and-revised-licenses) · [Daggerheart FAQ](https://www.daggerheart.com/faq/)

**Business, legal and infrastructure**

- [NaNoWriMo closure (Futurism)](https://futurism.com/nanowrimo-closing-embracing-ai)
- [DPDP Rules notification (PIB)](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2) · [DPDP Consent Manager deadline (Vinsys)](https://www.vinsys.com/blog/dpdp-act-compliance-deadline-nov-2026-for-consent-manager)
- [Cloudflare R2 pricing 2026 (BudgetForge)](https://www.budgetforge.dev/tools/cloudflare-r2-pricing-2026)
- [Screenwriting software market (Mordor Intelligence)](https://www.mordorintelligence.com/industry-reports/screen-and-script-writing-software-market)

Also referenced without links: D&D Beyond's Sigil Sunset FAQ, StartPlaying's help center, SmiteWorks' Fantasy Grounds announcement, and Tech-Insider's 2026 storage comparison.
