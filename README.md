# Echo Weaver — Shadow Tide

A dark, atmospheric browser maze game built with vanilla JavaScript and the HTML5 Canvas API. The world is invisible — you can only see it by making sound. Navigate a procedurally generated labyrinth, collect all six crystals, and escape through the exit before the Shadow Tide consumes everything.

## Gameplay

- **See with sound.** Press `Space` to emit an echo ping. Sound waves propagate through the maze (modeled with an acoustic arrival-time field), revealing walls, crystals, enemies, and terrain as they ripple outward — then slowly fade back into darkness.
- **Collect 6 crystals** scattered throughout the maze, then reach the exit portal.
- **Survive the enemies.** Wraith-like hunters guard the crystals, chase you, and are repelled by your pings. Each enemy is assigned a preferred crystal target and coordinates with others to avoid crowding.
- **Beware the Shadow Tide.** A purple tide rises from the center of the map over time. Standing in it drains your lives, and any enemy caught outside its edge is gradually consumed — temporarily shrinking the threat, but the tide keeps moving.
- **3 lives.** Get hit too often and the weave unravels.

### Controls

| Input | Action |
|---|---|
| `WASD` / Arrow keys | Move |
| `Space` | Echo ping (reveals the map, repels enemies) |
| `Esc` or ⚙️ Settings | Pause & open settings |
| 🔄 Restart | Regenerate the maze and start over |
| 🔊 | Toggle mute |
| Touch drag (mobile) | Dynamic on-screen joystick |

### Settings

The in-game panel lets you tune difficulty live: tide speed, enemy count (applies on restart), ping repulsion strength, and enemy/player speed multipliers.

## Technical Highlights

- **Eikonal-style acoustic propagation** — pings compute a per-cell sound arrival-time and energy field with a binary min-heap, so echoes bend realistically around walls instead of drawing flat circles.
- **Procedural maze generation** — random rooms connected by corridors, with distance-constrained placement of the player start, exit, and crystals.
- **Enemy AI** — crystal-target assignment with crowd penalties, wall avoidance, ping repulsion, and tide consumption mechanics.
- **Procedural audio engine** — Web Audio API only: synthesized ambient drone, generative background music, feedback-delay reverb, and echo effects (no audio assets).
- **Particle systems & camera** — smooth-follow camera with screen shake, tide creatures (leapers/swimmers/ripples), glowing wall reveals, and fading visibility.
- **Responsive & mobile-ready** — canvas scales to the viewport; touch devices get a dynamic joystick.

## Project Structure

```
.
├── index.html          # Page shell, HUD, settings panel, script loading
├── css/
│   └── style.css       # HUD, overlays, settings panel, mobile controls
└── js/
    ├── config.js       # Tunable constants and default settings (window.EW.Config)
    ├── audio.js        # Procedural Web Audio engine (window.EW.AudioEngine)
    ├── map.js          # Maze generation & enemy/crystal placement (window.EW.Map)
    ├── game.js         # Core state, update loop, rendering, acoustics, AI (window.EW.Game)
    └── main.js         # Bootstrap, DOM wiring, input, game loop (window.EW.Main)
```

All modules attach to a single global namespace (`window.EW`) and are loaded in dependency order via plain `<script>` tags — no build step required.

## Running Locally

No dependencies or build tools needed. Serve the folder statically and open it in a modern browser:

```bash
# Python
python3 -m http.server 8000

# or Node
npx serve .
```

Then visit <http://localhost:8000>. Opening `index.html` directly also works, though a local server is recommended for consistent behavior.

## Grid-Dependent System Map

The world is a uniform tile grid defined in `js/config.js`: `CELL = 20` px, `MAP_COLS = 55`, `MAP_ROWS = 38`, giving `WORLD_W × WORLD_H = 1100 × 760`. Every entity stores continuous world coordinates but queries the grid via `Game.worldToGrid()` (`floor(world / CELL)`). Below is every system whose behavior depends on the grid, with line references into `js/map.js`, `js/game.js`, and `js/main.js`.

### 1. Static topology — `mapGrid` (walls/floor)

| System | Location | How it uses the grid |
|---|---|---|
| Map generation | `map.js:65–79` | Carves 11–17 random rooms + L-corridors directly into `mapGrid` rows/columns |
| Entity placement | `map.js:80–134` | Player start, exit, crystals, and enemy spawns are chosen from floor cells (`mapGrid[r][c] === 0`) using cell-space distance filters |
| Wall lookup | `game.js:36–37` | `worldToGrid()` + `isWall(wx, wy)` is the single source of truth for geometry |
| Exposed-wall test | `game.js:38` | `isExposedWall(c, r)` checks 4-neighbors in `mapGrid` (defined; not currently called during render) |

### 2. Collision & movement (cell lookups at world coords)

| System | Location | Grid dependency |
|---|---|---|
| Player collision | `game.js:723–727` | Axis-separated `isWall()` probes; position clamped to `CELL … WORLD − CELL` |
| Enemy collision | `game.js:348, 505–515` | Same `isWall()` axis tests while moving and while stunned |
| Enemy wall-feel steering | `game.js:480–495` | Probes `isWall()` at `CELL * 1.2` ahead; sweeps ±45°/±90°/±135° for the nearest open ray |
| Stuck recovery | `game.js:531–611` | Scans a ±5-cell neighborhood of `mapGrid` for the nearest open cell center to jolt toward; region-stuck threshold measured in cells (`CELL * 2`) |
| Camera & viewport | `main.js:55`, `game.js:834–837` | Canvas aspect ratio from `WORLD_W/WORLD_H`; render loop converts the camera rect to `gridLeft/Top/Right/Bottom` for tile culling |

### 3. Acoustic echo field (the core grid solver)

| System | Location | Grid dependency |
|---|---|---|
| Buffer allocation | `game.js:661–670` | Flat `Float32Array(MAP_COLS * MAP_ROWS)` fields — `arrivalTime`, `energy`, `gradX/gradY` — indexed `r * MAP_COLS + c` |
| Eikonal Dijkstra solve | `game.js:72–204` | 8-neighbor propagation over cells; diagonals blocked only if both orthogonal neighbors are walls (`mapGrid` check, line 148); walls never entered (line 151); travel time = `dir.dist * CELL / ACOUSTIC_SPEED`; energy decays per hop plus spatial fade past `PING_MAX_RADIUS * PING_EDGE_FADE_START` |
| Wavefront reveal | `game.js:219–259` | Each frame iterates all ROWS×COLS cells; cells whose `arrivalTime` falls within `ACOUSTIC_VISUAL_WINDOW` set `visGrid = max(vis, 0.8·energy)`, and adjacent wall cells set `wallGlow = max(glow, energy)` |
| Wavefront rendering | `game.js:871–907` | Draws each revealed cell as a `CELL×CELL` screen quad with smoothstep fade over `ACOUSTIC_VISUAL_DECAY_DURATION` (0.8 s) |
| Note | `game.js:172–176, 664–665` | `gradX/gradY` (unit direction back toward the ping origin) are computed and stored per cell but never read — reserved/dead data |

### 4. Memory grids — visibility & wall glow

| System | Location | Grid dependency |
|---|---|---|
| `visGrid` decay | `game.js:269` | Full ROWS×COLS scan each frame, linear fade at `VISIBILITY_DECAY = 0.26/s` (~3.8 s to fully dark) |
| `wallGlow` decay | `game.js:260–266` | Full-grid scan at `WALL_GLOW_DECAY = 1.6/s` (~0.6 s to fully dark) |
| Ambient player glow | `game.js:39, 699, 734` | `revealCircle()` writes `visGrid` in a radius of `PLAYER_GLOW_CELLS = 3.2` cells around the player every frame |
| Event reveals | `game.js:772, 779, 797–798` | Crystal pickup reveals `CELL*7`; exit reveal `CELL*10`; respawn multiplies the entire `visGrid` by 0.3 and re-reveals the player radius |
| Tile shading | `game.js:840–866` | Floor/wall color brightness driven by per-cell `visGrid`; wall tremble offset scales with `wallGlow²` |

### 5. AI perception (grid-gated)

| System | Location | Grid dependency |
|---|---|---|
| Player detection | `game.js:358–359` | Enemy sees player only if within `3.2 * CELL` **and** the target cell's `visGrid > 0.3` |
| Chase give-up | `game.js:370–373` | Hunting degrades to alerted beyond `3.8 * CELL` when not visible |
| Ping alerting/stun | `game.js:296–313` | Enemy's cell index looked up in `arrivalTime`/`energy`; alerted when the wavefront crosses its cell (energy > 0.05); stunned if arrival distance < `CELL * 4` |
| Alert arrival / crystal attraction / motes | `game.js:365, 403–441` | Thresholds in cells: `CELL*3` (reaches alert target), `CELL*2.5` (crystal pull starts), mote trail between `CELL*2` and `CELL*10` |
| Crowd avoidance | `game.js:283–291, 454–469` | Separation radius `CELL*5.5`, crowd-avoid radius `CELL*8`, close-neighbor count at `CELL*4` |
| Crystal assignment scoring | `map.js:24–58` | Distance + abstract/crowd penalties + exploration noise all expressed in multiples of `CELL` (`CELL*6`, `CELL*12`, `CELL*15`) |

### 6. Tide (anchored to the grid midpoint)

| System | Location | Grid dependency |
|---|---|---|
| Radius setup | `map.js:140–142` | `tideMaxRadius = hypot(MAP_COLS/2·CELL, MAP_ROWS/2·CELL) + CELL*3` |
| Advance/retreat | `game.js:617, 741–747` | Shrinks at `settings.tideSpeed * CELL` px/s; "sated" retreat target extends `15 * CELL` |
| Player damage zone | `game.js:748–767` | In/outside tested against distance to grid center; tide particles spawn at `CELL*0.8–2.0` offsets |
| Enemy consumption | `game.js:316–340` | Enemies outside `tideRadius` (from grid center) dissolve after `ENEMY_CONSUME_DURATION`; death particles at `CELL*1.2` radius |
| Tide effect spawns | `game.js:42–54` | Leapers/swimmers/ripples spawn on the ring between `tideRadius` and `tideMaxRadius` around grid center |
| HUD status | `game.js:630–632` | Distance-to-grid-center vs `tideRadius` drives "IN TIDE!" warning |

### 7. Entities & rendering (cell-quantized lookups)

| System | Location | Grid dependency |
|---|---|---|
| Exit glow | `game.js:926–930` | Rendered only if the exit's cell has `visGrid > 0.35`; pulse size in `CELL` units |
| Crystal rendering | `game.js:938–947` | Skipped if its cell's `visGrid < 0.035`; halo/hexagon sized in `CELL` fractions |
| Enemy rendering | `game.js:952–977` | Alpha driven by owning cell's `visGrid`; body/eye sizes in `CELL` fractions |
| Player rendering | `game.js:983–992` | Glow/trail radii scale with `CELL * scaleX` |
| Pickup/win/hit radii | `game.js:769, 782, 789` | Contact tests at `CELL*1.4` (crystal), `CELL*1.8` (exit), `CELL*1.0` (enemy hit) |
| Respawn safety | `map.js:147–177` | Enumerates all interior floor cells; prefers cells >`CELL*10` from enemies and inside the tide circle |

### Coupling summary

- **`mapGrid`** feeds: collision, steering feelers, stuck recovery, acoustic propagation, exposed-wall test, and all placement logic.
- The **acoustic field** writes into **`visGrid`/`wallGlow`**, which in turn gate **rendering** (tiles, crystals, enemies, exit) and **AI vision** — the grid is the sole coupling channel between the echo system and everything else.
- The **tide** is anchored to the grid center and scaled in `CELL` units, so changing `CELL` or map dimensions rescales gameplay distances globally.

## Browser Support

Requires a modern desktop or mobile browser with Canvas 2D and Web Audio API support (Chrome, Edge, Firefox, Safari). Best experienced with sound on. 🎧
