# Putting Atlas & Ink on a server

Written for whoever sets up the first real install. It assumes you can use a terminal and have a
Linux server with Docker, and a domain name pointed at it. The accounts and decisions that have to
come first are listed in [USER_TASKS.md](USER_TASKS.md).

## What runs

One container holds the whole app: the API, which also serves the built web pages. Beside it runs
PostgreSQL 17. Maps and pictures are files on a volume. Nothing else is needed for one machine.

```
browser ──https──▶ your reverse proxy ──▶ app :3000 ──▶ postgres
                                            │
                                            └─▶ /data/storage (maps, tiles, pictures)
```

## First install

```bash
git clone https://github.com/ved-jadhav-10/world-builder.git && cd world-builder
cp .env.production.example .env.production
# Edit .env.production: your address, two fresh secrets (openssl rand -base64 32), email settings.
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The app listens on `127.0.0.1:3000`. Each start first brings the database up to date
(`node dist/migrate.js`), then serves.

Put a reverse proxy with HTTPS in front. With Caddy it is three lines:

```
atlas.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Check it: `curl https://atlas.example.com/api/health` should answer `{"ok":true}`, and the address
in a browser should show the front page.

## Settings

| Setting                                          | What it does                                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                                     | The address people use. Sign-in cookies and email links are built from it, so it must be exact                                      |
| `BETTER_AUTH_SECRET`                             | Signs sessions and wiki passes. Changing it signs everyone out                                                                      |
| `POSTGRES_PASSWORD`                              | The database password. Set once, before the first start                                                                             |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | `console` prints emails to the log; `resend` sends them. With real email, new accounts must confirm their address before signing in |
| `PUBLIC_WIKIS`                                   | `true` lets world owners open public reader wikis. Leave `false` until your terms and takedown process exist                        |
| `ABUSE_EMAIL`                                    | Adds "Report this wiki" to wiki pages                                                                                               |

The app trusts the proxy's `X-Forwarded-For` header for rate limits (`TRUST_PROXY=true` in the
compose file), so do not expose port 3000 to the internet directly.

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations run by themselves on start. Take a backup first.

## Backups

Two things hold everything: the database and the storage volume.

```bash
# Database
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U atlas atlas | gzip > atlas-$(date +%F).sql.gz
# Files
docker run --rm -v world-builder_storage:/data -v "$PWD":/backup alpine tar czf /backup/storage-$(date +%F).tgz -C /data .
```

Run both on a schedule, copy the results off the machine, and practise a restore once:

```bash
gunzip -c atlas-2026-11-14.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U atlas atlas
```

## Known limits of this setup

- **One app container.** Map tiling runs inside it, one map at a time, and rate-limit counters
  live in its memory. Running several copies needs a shared job queue and a shared counter store
  first (see "Known limits" in [plan.md](plan.md)).
- **Files on local disk.** Fine for one machine with backups. Object storage (Cloudflare R2 or S3)
  is the next step and is not built yet.
- **No server-side rendering.** Search engines see little of the front page or the public wikis
  beyond their titles.
- **This image has been built and started on a development machine, not run in production.** Treat the first
  deployment as a test: watch the logs (`docker compose ... logs -f app`) through sign-up, an
  upload and an export.
