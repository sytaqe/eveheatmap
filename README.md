# EVE Heatmap

An interactive kill and jump activity heatmap for the EVE Online galaxy, built with React and SVG.

---

## Overview

EVE Heatmap visualizes player activity across the EVE Online universe by overlaying kill and jump statistics onto a 2D map of all solar systems and stargate connections. Data is fetched hourly from the public ESI API and stored as JSON snapshots. The UI is a static React application deployable to GitHub Pages with no server required.

---

## Architecture

```
eveheatmap/
├── public/
│   └── data/
│       ├── mapSolarSystems.jsonl   # SDE: solar system positions (downloaded by script)
│       ├── mapStargates.jsonl      # SDE: stargate connections (downloaded by script)
│       ├── mapRegions.jsonl        # SDE: region names (downloaded by script)
│       ├── sde_version.json        # Cached SDE build number (committed)
│       └── kills/
│           ├── index.json          # Ordered list of snapshot metadata
│           └── kills_YYYYMMDD_HHMM.json  # Hourly kill/jump snapshots
├── src/
│   ├── config.js                   # EVE SSO client ID
│   ├── main.jsx
│   ├── App.jsx                     # Root component; data loading, SSO callback, location polling
│   ├── components/
│   │   ├── MapCanvas.jsx           # SVG galaxy map with pan/zoom
│   │   ├── ColorScale.jsx          # Color legend bar with mode toggle buttons
│   │   ├── TimeSlider.jsx          # Snapshot time selector
│   │   └── LoginButton.jsx         # EVE SSO login/logout button
│   └── utils/
│       ├── colorScale.js           # Color mapping constants and functions
│       ├── auth.js                 # EVE SSO PKCE OAuth2 flow
│       └── cookies.js              # Cookie get/set/delete helpers
├── scripts/
│   ├── download_sde.py             # Download and extract SDE files (skips if up to date)
│   ├── fetch_kills.py              # Fetch system kills and jumps from ESI; save snapshot
│   └── scheduler.py               # Run fetch_kills.py every hour at :00 (local use)
└── .github/workflows/
    ├── fetch-kills.yml             # GitHub Actions: fetch ESI data hourly and commit
    └── deploy.yml                  # GitHub Actions: daily SDE check + Vite build + Pages deploy
```

---

## Map Rendering

- **Source data**: EVE Online Static Data Export (SDE), JSONL format downloaded from the official EVE developer endpoint.
- **Coordinate system**: `position2D` field from `mapSolarSystems.jsonl` is used for 2D projection. Systems without `position2D` are excluded.
- **Stargate connections**: Lines drawn between systems linked by `mapStargates.jsonl`.
- **Region labels**: Shown at low zoom levels (k < 12), positioned at the centroid of each region's member systems.
- **System name labels**: Shown at high zoom levels (k ≥ 12), from `name.en` in the SDE.
- **Pan and zoom**: Mouse drag to pan; scroll wheel to zoom (range: 0.05× – 20×). Circle radius grows proportionally with zoom (1× at initial, 3× visual size at max zoom).

---

## URL Hash Routing

The current view is reflected in the URL hash so it can be bookmarked or shared:

| Hash | Description |
|---|---|
| `#/snapshot/20260628_0200` | Snapshot mode, specific snapshot by datetime stem |
| `#/hourly/14` | Hourly avg mode, hour 14 UTC |

The hash is updated via `history.replaceState` as the user changes mode or time selection. On page load the hash is parsed to restore the view.

---

## Time Slider

The time slider bar at the bottom of the screen has two modes, toggled by a switch:

| Mode | Description |
|---|---|
| **Snapshot** | Select a single hourly snapshot with a slider. The top 20 systems by current metric are shown in the upper-right corner (scrollable). |
| **Hourly Avg** | Select an hour of day (0–23 UTC). Per-system averages are read from `hourly_avg.json` (pre-computed by `fetch_kills.py`). All regions with a non-zero aggregated metric are ranked and shown in the upper-right corner (scrollable). |

---

## Color Scale

Kill/jump counts are mapped to a **two-stage logarithmic color spectrum**:

| Range | Color |
|---|---|
| 0 | Dark blue `#1a3a5c` |
| `MAX_COUNTS` | Red |
| `MAX_COUNTS_HIGH` | White |

Constants defined in `src/utils/colorScale.js`:

| Mode | `MAX_COUNTS` (→ red) | `MAX_COUNTS_HIGH` (→ white) |
|---|---|---|
| Ship + Pod kills | 50 | 500 |
| NPC kills | 1 000 | 10 000 |
| Jumps | 500 | 5 000 |

When a system's count exceeds `MAX_COUNTS`, its circle radius scales from 1× up to 2× (log-interpolated) as the count approaches `MAX_COUNTS_HIGH`.

Hovering over a system displays its current count below the circle.

Right-clicking a system circle opens a context menu showing the system name. When logged in via EVE SSO, a **Set Destination** item is shown; selecting it calls `POST /ui/autopilot/waypoint/` on ESI to set the system as the autopilot destination in the EVE client.

---

## Data Modes

Three display modes are toggled via buttons in the color scale bar:

| Button | Data field | Description |
|---|---|---|
| **Ship+Pod** | `s + p` | Player ship kills + pod kills |
| **NPC** | `n` | NPC kills |
| **Jumps** | `j` | Ship jumps through the system |

---

## Snapshot Format

Each hourly snapshot (`kills_YYYYMMDD_HHMM.json`) is a JSON object keyed by solar system ID (string):

```json
{
  "30000142": { "s": 12, "p": 3, "n": 0, "j": 450 },
  ...
}
```

| Key | Meaning |
|---|---|
| `s` | Ship kills |
| `p` | Pod kills |
| `n` | NPC kills |
| `j` | Ship jumps |

Snapshots older than 7 days are deleted automatically by `fetch_kills.py`. After each fetch, `hourly_avg.json` is recomputed from all retained snapshots, containing per-system averages keyed by UTC hour (0–23).

`index.json` lists all available snapshots in chronological order:

```json
[
  { "timestamp": "2026-06-28T01:31:58Z", "filename": "kills_20260628_0131.json" },
  ...
]
```

---

## EVE SSO Integration (Character Location)

Authentication uses the **EVE SSO OAuth2 PKCE flow** — no server required, all tokens stored in browser cookies.

### Setup

1. Register an application at [developers.eveonline.com](https://developers.eveonline.com/):
   - **Callback URLs**: `http://localhost:5173/` (dev) and your GitHub Pages URL (production)
   - **Scopes**: `esi-location.read_location.v1 esi-ui.write_waypoint.v1`
2. Set the Client ID for local development in `src/config.js` (used as fallback):
   ```js
   export const EVE_CLIENT_ID = import.meta.env.VITE_EVE_CLIENT_ID ?? 'your_dev_client_id'
   ```
3. For production, add a repository secret named `EVE_CLIENT_ID` in GitHub Settings → Secrets and variables → Actions. The deploy workflow injects it as `VITE_EVE_CLIENT_ID` at build time.

### Behavior

- After login, the character's current solar system is highlighted with a yellow ring.
- Location is polled every **60 seconds** normally.
- After a system change is detected, polling accelerates to **20-second intervals for 3 minutes**.
- Tokens are refreshed automatically using the stored refresh token.
- All auth data (`access_token`, `refresh_token`, `character_id`, expiry) is stored in browser cookies only — nothing is sent to any server beyond ESI.

### Track Mode

The **Track** button (visible after login when a location is detected) keeps the map centered on the character's current system at maximum zoom. Panning or zooming below zoom level 12 cancels tracking; zooming out within the range 12–20× does not.

---

## Scripts

### Download SDE

```bash
python scripts/download_sde.py
```

Checks the current SDE build number against the cached version. Downloads and extracts `mapSolarSystems.jsonl`, `mapStargates.jsonl`, and `mapRegions.jsonl` only if the build has changed.

### Fetch Kill/Jump Data

```bash
python scripts/fetch_kills.py
```

Fetches `GET /universe/system_kills/` and `GET /universe/system_jumps/` from ESI, merges the results, and saves a timestamped snapshot to `public/data/kills/`.

### Local Scheduler

```bash
python scripts/scheduler.py
```

Runs `fetch_kills.py` every hour at :00 UTC. Keep the process running in the background.

---

## GitHub Actions

### `fetch-kills.yml`

- **Trigger**: Every hour at :00 UTC (`cron: '0 * * * *'`), or manual dispatch.
- Runs `fetch_kills.py` and commits any new snapshot files.

### `deploy.yml`

- **Trigger**: Every day at 12:00 UTC (`cron: '0 12 * * *'`), or manual dispatch.
- Checks for SDE updates (`download_sde.py`), commits the version cache if changed.
- Runs `npm ci && npm run build` and deploys `dist/` to GitHub Pages.

**Required repository setting**: Settings → Pages → Source → **GitHub Actions**

---

## Local Development

```bash
# Install dependencies
npm install

# Download SDE data (first time or after EVE patches)
python scripts/download_sde.py

# Fetch initial kill/jump snapshot
python scripts/fetch_kills.py

# Start dev server
npm run dev
# → http://localhost:5173/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Map rendering | SVG (no external map library) |
| Data fetching | EVE ESI public API |
| Auth | EVE SSO OAuth2 with PKCE |
| Token storage | Browser cookies |
| Data pipeline | Python 3 |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages |
