# Deploy on Oracle Cloud (Always Free, always-on)

Free Ampere A1 ARM VM — no sleep/cold-starts, open UDP (for a future WebRTC
transport), and a Paris region for low latency. More setup than Render, but $0.
Render stays available too (`render.yaml`); this is an additional target.

## 1. Create the instance
- Oracle Cloud console → **Compute ▸ Instances ▸ Create**.
- Region: **eu-paris-1** (or Frankfurt/Amsterdam if Paris A1 is "out of capacity").
- Shape: **Ampere (VM.Standard.A1.Flex)**, e.g. 2 OCPU / 12 GB (Always Free covers up to 4/24).
- Image: **Ubuntu 22.04/24.04 (aarch64)**.
- Add your SSH key. Note the **public IP**.
- Tip: if you hit "out of host capacity", retry over a few hours or pick another AD/region.

## 2. Open the network
Two layers must allow 80/443:
- **VCN Security List** (console → Networking → your VCN → Security List): add **Ingress** rules for TCP **80** and **443** from `0.0.0.0/0`.
- **OS firewall**: handled by `setup.sh` below (Ubuntu images block them by default).

## 3. Point a domain at it (needed for HTTPS / `wss://`)
Browsers need TLS for the WebSocket. Add a DNS **A record** → the instance IP.
No domain? Use a free one from https://www.duckdns.org (e.g. `gtaparis.duckdns.org`).

## 4. Install + run
SSH in, then:
```bash
git clone https://github.com/warrenseine/gta-paris.git
cd gta-paris
bash deploy/oracle/setup.sh      # installs Docker, opens the OS firewall
# log out/in once so the docker group applies, then:
DOMAIN=your.domain.com docker compose -f deploy/oracle/docker-compose.yml up -d --build
```
Caddy fetches a Let's Encrypt cert automatically. Open `https://your.domain.com`.

## 5. Updates
```bash
git pull && DOMAIN=your.domain.com docker compose -f deploy/oracle/docker-compose.yml up -d --build
```
`restart: always` brings it back after reboots. Always-on, so no keep-warm cron needed.

## Notes
- The image is the same `Dockerfile` Render uses; `node:22-slim` is multi-arch so it builds on ARM.
- UDP is open at the OS level here — when we add the WebRTC/geckos.io transport, just expose its UDP port in the VCN Security List + compose.
