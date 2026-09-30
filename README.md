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

## Browser Support

Requires a modern desktop or mobile browser with Canvas 2D and Web Audio API support (Chrome, Edge, Firefox, Safari). Best experienced with sound on. 🎧
