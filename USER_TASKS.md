# Atlas & Ink: things only you can do

Everything in this list needs a person: an account to open, a decision to make, money to spend, or
ears. Nothing here blocks development on your own machine. The build plan is in
[plan.md](plan.md) and the feature list in [checklist.md](checklist.md).

Each item says what to do, why it is yours, and what to change in the project afterwards.

## 1. Listen and look (an hour, any time)

- [ ] **Listen to the six ambience scenes.** Open any world, press play at the foot of the
      sidebar, and go through Scriptorium, Tavern hearth, Rain on the shutters, Open sea, Wildwood
      at night and Deep places. They were built and measured (levels, clipping, silence) but
      never heard by a person, so the judgement of whether each one is pleasant is yours. Note
      anything harsh, dull, too busy or too loud. The recipes are plain numbers in
      `apps/web/src/lib/ambience/scenes.ts` (tempo, mode, chords, how busy the harp is, how loud
      the rain is), so most complaints are a one-line change.
- [ ] **Look over the front page and the two themes** (`/` when signed out; the account menu
      switches Vellum and Lamplight). Say what you would change.
- [ ] **Decide on the antique charts.** The front page and sign-in pages use six public-domain
      scans from Wikimedia Commons (Olaus Magnus, Ortelius, Braun and Hogenberg, Blaeu, a Genoese
      portolan, a Metz Book of Hours). They are free to use and credited in the footer. If you
      would rather commission or draw your own, they live in `apps/web/public/charts/`.
- [ ] **Confirm the name.** "Atlas & Ink" is still a working name in the notes. Check the
      trademark and the domain before anything public carries it.

## 2. Before anyone else uses it

- [ ] **Hosting.** Pick where it runs (the plan suggests a Mumbai region plus a CDN). The
      project ships a `Dockerfile` and `docker-compose.prod.yml` to build from; the steps are in
      [DEPLOY.md](DEPLOY.md). You need: a server or container host, a Postgres 17 database with
      backups, and a domain.
- [ ] **A fresh secret for production.** `BETTER_AUTH_SECRET` must be a new random value on the
      server (`openssl rand -base64 32`), never the one in your local `.env`.
- [ ] **Email.** Make a Resend account, verify your sending domain (SPF and DKIM records at your
      DNS host), then set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM`. Until then
      confirmation, reset and invite emails only print to the server log.
- [ ] **File storage.** Maps and pictures are saved on the server's disk (`STORAGE_DIR`). That is
      fine on one machine with backups. For anything bigger, open a Cloudflare R2 (or S3) bucket;
      moving the two file modules onto it is development work that needs your bucket and keys.
- [ ] **Backups.** Decide where database dumps and the `storage/` folder are copied to and how
      often, and try one restore.

## 3. Legal and trust (needs you, and probably a professional)

- [ ] **Terms of use and a privacy policy.** Drafts to start from are in
      [docs/legal/](docs/legal/). They are starting points written by a program, not legal
      advice: have them read by someone qualified, fill in your company details, and link the
      finished pages from the front page footer.
- [ ] **The age rule.** Decide between "18 and over" and verifiable parental consent, and put it
      in the terms and on the sign-up page.
- [ ] **India's DPDP Act and the EU's GDPR.** The research notes DPDP consent-manager rules from
      13 November 2026 and full duties from 13 May 2027. Check what applies to you.
- [ ] **A takedown and abuse process, then turn public wikis on.** Reader wikis are built but
      switched off in production. Before setting `PUBLIC_WIKIS=true`: decide your rules for
      public content, name a contact (India requires a grievance officer), and set `ABUSE_EMAIL`
      so every wiki page carries a "Report this wiki" link.
- [ ] **The AI charter.** The product promises no training on users' work and no built-in AI.
      Write that promise where users can see it and hold yourself to it.

## 4. Money

- [ ] **Decide the plans and prices.** The research suggests a free tier (unlimited entries, a
      few maps) and Pro at about $6 to $8 or ₹199 to ₹299 a month. Nothing in the app is limited
      by plan yet.
- [ ] **Payment accounts.** Razorpay for India (INR, UPI) and Paddle for the rest (it handles
      sales tax). Both need your business and bank details. Billing code waits on these.

## 5. Find out what people want (the research says do this before building much more)

- [ ] Talk to 15 to 20 people each from fantasy novelists, game masters and indie narrative
      designers: what they use now, what they pay, what made them switch last time.
- [ ] Ask which tool they most want to leave. That decides which importer to build first
      (World Anvil, Kanka, Campfire, Obsidian, Scrivener, Notion).
- [ ] Ask where they stand on AI: none, opt-in with their own key, or built in.
- [ ] Try vvd's free tier yourself and note how far its spoiler controls, campaigns and imports
      go. The reader wiki here (pick your chapter, see the world as it stood then) is the feature
      to compare against.
- [ ] Put the front page in front of a few of them and watch whether they understand it in five
      seconds.

## 6. Decisions I made for you (change any of them)

- **Public wikis are off in production** until you set `PUBLIC_WIKIS=true`, because the earlier
  plan said publishing should wait for the legal items above.
- **Music is generated in the browser**, not recorded, so there is nothing to license or host.
  Real recordings would sound richer; they would also need licences and storage.
- **The ink colour changed** from indigo to blue-black with a verdigris green accent, and the
  heading face from Fraunces to EB Garamond, to lean into the old-chart look.
- **Fonts are served from the app**, not from Google, so no visitor data goes to a third party.
- **Real-time co-editing, the desktop app, the public API, the marketplace and built-in AI were
  not built.** Each is weeks of work or needs decisions and accounts from you; they stay on the
  checklist.
