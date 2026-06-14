# Deploying GTA Paris

Single process: the Node server serves the built client **and** the authoritative
Colyseus WebSocket on one port. State is in-memory + ephemeral (guest players,
nothing persisted), so it just needs a long-lived process — no database, no disk.

The client reads `process.env.PORT` on the server and connects same-origin
(`wss://` over HTTPS), so any managed host that injects `PORT` and gives an HTTPS
domain works with **no code changes**.

## Recommended: Render free tier

Push-to-deploy, managed TLS, zero server admin. Free web services **sleep after
15 min idle** and take ~30–60s to wake — the client handles this with a join-retry
("Waking up the city…" then connects), so the first player after an idle period
waits through a spinner and everyone after joins instantly.

Why sleep is fine here:
- **State loss on sleep is irrelevant** — the world is ephemeral.
- **Won't sleep mid-game** — Render keeps free services awake while receiving
  WebSocket messages, and the client sends an input packet every tick while
  connected. One active player keeps it up.
- **750 free hours/mo** is enough when it sleeps while empty.

### Deploy (Blueprint)
1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. It reads
   [`render.yaml`](render.yaml): a Docker web service, `/health` check, free plan.
3. Deploy. Play at the `https://<name>.onrender.com` URL it gives you.

### Deploy (manual, no blueprint)
New → **Web Service** → connect repo → Runtime **Docker** → Plan **Free** →
Health check path `/health` → Create. Done.

> Don't set `PORT` yourself — Render injects it; the server binds it automatically.

## Always-on (no cold start): Render Starter or Railway

If the ~30–60s first-join wait bugs you:
- **Render Starter (~$7/mo)** — same setup, just pick the Starter plan; never sleeps.
- **Railway (~$5/mo)** — New Project → Deploy from repo (uses the Dockerfile),
  no sleep, auto TLS. Reads `PORT` the same way.

## Local production run

```bash
pnpm install
pnpm build                  # builds the client into packages/client/dist
PORT=2567 pnpm start        # open http://localhost:2567
```

## Docker (any host / self-managed VPS)

```bash
docker build -t gta-paris .
docker run -p 80:2567 gta-paris      # play at http://<host>/
```
For a self-managed VPS (e.g. Hetzner ~€4/mo) put **Caddy** in front for HTTPS:
```
# /etc/caddy/Caddyfile
yourdomain.com {
    reverse_proxy localhost:2567
}
```
The client auto-uses `wss://` + same origin, so no code change is needed.

## Env vars
- `PORT` — listen port (managed hosts set this; default 2567 locally).

## Scaling notes
- One process = one default `paris` room. Interest management (`@view()`, ~150 m
  radius) caps each client's bandwidth to nearby entities — load-tested to ~100
  concurrent clients at ~29 Hz.
- Past one room: run multiple rooms (Colyseus matchmaking) or multiple
  hosts/regions — not just "add instances" (state is per-process).
- Lower latency later: swap the WebSocket transport for WebRTC datachannels
  (geckos.io) — needs open UDP + TURN, which rules out most managed PaaS and
  points back at a VPS.
