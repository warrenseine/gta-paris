# Deploy on a VPS (Scaleway / OVH / Hetzner)

Always-on single VM — no cold starts, open UDP (for a future WebRTC transport),
and an EU/Paris datacenter for low latency. Render stays available too
(`render.yaml`); this is an additional, lower-latency target.

The steps below use **Scaleway (Paris)** — the lowest latency for French players —
but the exact same deploy works on OVH or Hetzner (just create an Ubuntu VM there).

## 1. Create the instance (Scaleway)
- Console → **Instances ▸ Create instance**.
- Region/AZ: **Paris (`par1` or `par2`)**.
- Type: pick **≥ 2 GB RAM** (e.g. `PLAY2-MICRO` or `DEV1-S`). The client build
  (`pnpm build`/esbuild) can OOM on 1 GB — if you must use a 1 GB box, add swap first:
  `sudo fallocate -l 2G /swap && sudo chmod 600 /swap && sudo mkswap /swap && sudo swapon /swap`.
- Image: **Ubuntu 22.04/24.04**.
- A **public IP** (flexible IP) is assigned by default. Add your SSH key. Note the IP.

## 2. Open the network
Scaleway → **Security Groups** for the instance: allow inbound **TCP 22, 80, 443**
and **UDP 20000–20100** (the WebRTC datachannel range). The default group is
usually permissive; if you locked it down, add those. No OS firewall tweaks
needed on Scaleway — `setup.sh` handles the rest best-effort.

The WebRTC channel is **optional** — if UDP is blocked, the game still works over
the WebSocket (just with TCP's head-of-line latency). Open the UDP range to get
the low-latency input path.

## 3. TLS hostname
Caddy needs a hostname to issue HTTPS (browsers require `wss://`). Two options:
- **Your domain:** add a DNS **A record** → the instance IP, use `DOMAIN=play.example.com`.
- **No domain (easiest):** use **nip.io** — `DOMAIN=<ip-with-dashes>.nip.io`, e.g. for
  IP `51.15.20.30` → `DOMAIN=51-15-20-30.nip.io`. It resolves to your IP and Caddy
  gets a real cert for it. Zero DNS setup.

## 4. Install + run
SSH in, then:
```bash
git clone https://github.com/warrenseine/gta-paris.git
cd gta-paris
bash deploy/vps/setup.sh         # installs Docker (+ best-effort firewall)
# log out/in once so the docker group applies, then:
DOMAIN=51-15-20-30.nip.io docker compose -f deploy/vps/docker-compose.yml up -d --build
```
Caddy fetches a Let's Encrypt cert automatically. Open `https://<DOMAIN>`.

## 5. Updates
```bash
git pull && DOMAIN=<your-domain> docker compose -f deploy/vps/docker-compose.yml up -d --build
```
`restart: always` survives reboots. Always-on, so no keep-warm cron needed.

## Notes
- Same `Dockerfile` Render uses; `node:22-slim` is multi-arch (works on ARM VMs too).
- UDP is unblocked here — when we add the WebRTC/geckos.io transport, expose its
  UDP port in the Security Group + compose.
- Other hosts: **OVH VPS** (Gravelines/Roubaix) or **Hetzner** CAX11 (Germany) —
  identical steps, just create the Ubuntu VM in their console.
