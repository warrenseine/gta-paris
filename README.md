# GTA Paris

Grand Theft Auto–style game in a stylized 3D Paris. Tilted top-down camera,
blocky flat-shaded art, web-based, gamepad + keyboard/mouse. Authoritative
multiplayer (target 64–100 players) — being built in phases.

## Stack
- **Client**: Three.js render, TypeScript, Vite.
- **Server**: TypeScript, Colyseus (authoritative). *(wired in Phase 2)*
- **Shared** (`@gta/shared`): sim rules (movement, vehicle, hitscan, weapons),
  the compact Paris map data, and the wire schema — run by both sides.
- Monorepo via pnpm workspaces.

## Run
```bash
pnpm install
pnpm dev            # client (http://localhost:5173) + server (ws://localhost:2567)
# or individually:
pnpm dev:client
pnpm dev:server
```

## Controls (Phase 1)
- **Move**: WASD / left stick
- **Aim**: mouse / right stick (twin-stick)
- **Shoot**: left click / RT
- **Enter / exit car**: F / A
- **Sprint**: Shift / L3 · **Handbrake**: Space / B
- **Scoreboard**: hold Tab
- **Map**: M (or the MAP button) toggles the full Paris map
- Walk over a green box to pick up a weapon.

## Status — phased build
- [x] **Phase 0** Scaffold + tilted follow camera + server boots.
- [x] **Phase 1** Vertical slice (local): compact Paris (boulevards, Seine,
      Haussmann blocks, hero landmarks), on-foot movement, drivable cars,
      hitscan combat vs dummies, gun pickups, HUD. *Runs single-player, no net.*
- [x] **Phase 2** Authoritative Colyseus sim @30Hz, nickname join, client
      prediction + reconciliation (local) and interpolation (remotes). Two
      browsers share one Paris instance. *Cars are static props this phase.*
- [x] **Phase 3** Vehicles over the net: authoritative car sim + enter/exit,
      local-car prediction, remote-car interpolation. Interest management
      (`@view()` StateView): each client only receives entities within
      ~150 m. Players + cars sync across clients.
- [x] **Phase 4** Sandbox deathmatch (first milestone): server-validated
      hitscan with lag compensation, health/damage, death → respawn, kills/deaths
      scoreboard (Tab), killfeed, WASTED overlay, server-authoritative weapon
      pickups, tracer FX broadcast. **Players shoot each other for real.**
- [x] **Phase 5** Ambient NPC life: ~150 pedestrians wandering + ~26 traffic
      cars following the boulevards, server-simulated, interest-synced,
      client-interpolated. Cosmetic (no player collision) for now.
- [x] **Phase 6** Ship: single-process production build (server serves the
      client + WS on one port), `/health`, Docker, managed-PaaS deploy
      (`render.yaml`) with client join-retry through cold starts, WebAudio
      gunshot/hit SFX. Load-tested to **100 concurrent clients holding ~29 Hz**
      with NPCs running.

## Deploy
See [DEPLOY.md](DEPLOY.md). Easiest: push to GitHub → Render **Blueprint**
(reads [`render.yaml`](render.yaml), free tier). Local: `pnpm build && PORT=2567 pnpm start`.
Docker: `docker build -t gta-paris . && docker run -p 80:2567 gta-paris`.
