# Architecture Overview

> **Read this first.** It's a map of the codebase so common questions can be answered without
> re-reading every file. When you make an architectural change, update this doc in the same change
> (see [AGENTS.md](../AGENTS.md)).

## What the game is

A browser space auto-battler / idle game. Stations from opposing factions continuously build ships
that auto-target, move, and fight. The human plays one faction: they spend kill-reward money on
per-ship-type upgrades while the battle runs itself. Clearing a level advances the campaign; losing
drops back a level. Everything the player earned carries forward.

## Tech stack

- **Phaser 3** — rendering, scenes, input, camera, asset loading. Renders only; it does not own game state.
- **`@daneren2005/shared-memory-ecs`** — the ECS: `BaseWorld`, `ComponentSystem`, entity factory,
  component workers, `PerformanceTiming`.
- **`@daneren2005/shared-memory-physics`** — transform/velocity/body components + the physics system.
- **`@daneren2005/shared-memory-objects`** — low-level typed-array/shared-memory primitives.
- These three `@daneren2005/*` packages are **sibling checkouts**, not just npm deps (see auto-memory
  `shared-memory-packages-are-sibling-checkouts`). Worker code must import them via their `/worker` and
  `/atomics` subpaths, never the barrels (memory `worker-bundle-subpath-imports`).
- **Vite** (build/dev, worker bundling via `?worker`), **Vitest** (unit), **Playwright** (e2e),
  **oxlint** (lint), **TypeScript** (`tsc --noEmit`).

## The core idea: ECS over shared memory, systems in workers

Entities are ids. Each component stores its data in a flat typed array (a "block") in shared memory.
Systems declare which components they need and run an update function over the matching entities.
Because the data lives in `SharedArrayBuffer`s, a system's update can run **on a web worker thread** —
the worker reads and writes the very same memory the main thread renders from, so there's no
serialization across the boundary.

`GameWorld` ([src/game/entities/game-world.ts](../src/game/entities/game-world.ts)) is where "what this
game is made of" is declared. It hands the component registry + entity templates to the library's
`BaseWorld` and wires up the systems. Almost all heavy lifting (memory allocation, load/save,
running systems on/off-thread) is the library's; this class only composes it.

### The system triple

Most systems in [src/game/systems/](../src/game/systems/) are three files sharing a name stem:

| File | Role |
| --- | --- |
| `x-system.ts` | Creates the `ComponentSystem`: declares `required` components, extra `queries`, and `getWorker`. |
| `x-update.ts` | The **pure update function** — runs identically on the main thread or in the worker. All the game logic lives here. |
| `x.worker.ts` | The worker entry: `createComponentWorker(self, xUpdate)`. Thin. |

To change what a system *does*, edit `x-update.ts`. To change *which* entities/data it sees, edit
`x-system.ts`. All game systems extend `GameComponentSystem`
([game-component-system.ts](../src/game/systems/game-component-system.ts)), which only adds the world's
`bounds` to the per-run data so update functions can keep entities on screen.

### Systems, in run order (see `GameWorld.initSystems`)

1. **update-health-timers** — shield regen / health timers.
2. **spawn-ship** — stations launch ships per their hangar production lines.
3. **physics** (library) — movement + collisions. Runs after spawns so a ship exists a frame before
   anything can hit it. Stamps each run's `tick`; the scene reads moves off it.
4. **interpolation** (library, main-thread only — no worker) — writes a per-frame render position
   between physics steps so 20Hz physics draws smoothly at 60fps.
5. **target-enemy** — each ship picks a target.
6. **weapon** — armed ships fire at their target (spawns projectiles, or drones for the Carrier).
7. **move-to-target** — steer toward the chosen target.
8. **update-projectiles** — projectile lifetime + homing guidance.

## Per-frame data flow

`GameScene.update(delta)` ([game-scene.ts](../src/game/game-scene.ts)):

1. `world.update(delta)` — runs every system (dispatching worker runs). **Time is in milliseconds**
   (Phaser's delta; velocity is per-second and systems convert).
2. `syncSprites()` — one unconditional pass over every live sprite, reading position/facing/shield
   straight out of the shared blocks the workers + interpolation already wrote. No events, no id lists,
   no map lookups — at a few thousand ships nearly everything moved, so a full sweep is cheapest.
3. `updateExplosions(delta)` — advances pooled detonator blast sprites.
4. `checkForGameOver()` — win (no enemies) / loss (player station gone) in one pass.

Sprites and explosion sprites are **pooled**, not destroyed (Phaser's display-list removal is O(n)).
One-shot effects (explosions) come from the worker via entity events (memory `worker-to-render-effect-events`).

## Directory map

```
src/
  main.ts                 Campaign entry point: load progress -> startGame at saved level.
  stress-test.ts          Stress-test page entry.  ship-test.ts  Ship-test page entry.
  game/
    start-game.ts         Boots GameWorld + GameScene + UIScene into a Phaser.Game. One path for every entry point.
    game-scene.ts         The play scene: game loop, sprite sync, meta-game (money, win/lose, level jumps). Big file, well-commented.
    ui-scene.ts           The HUD/upgrade panel. Purely presentational; reads GameScene's public getters.
    display.ts            Fixed canvas sizes + play-area viewport math (HUD bands, camera fit).
    ship-roster.ts        Per-type upgrade economy (costs/affordability/buys) over a station's controller+hangar blocks.
    ship-test.ts, player-carry.ts, format-stats.ts
    components/           One file per component (health, controller, hangar, controlled, attack, combat, weapon, projectile).
                          index.ts merges them with the physics registry into the world's component map.
    systems/              The system triples (see above) + game-component-system.ts.
    entities/
      game-world.ts       GameWorld: registry + templates + system wiring.
      entity-list.ts
  data/
    ship-types.ts         SINGLE SOURCE OF TRUTH for ship types (SHIP_TYPES, per-type WeaponDef/stats/costs).
    entities/             Entity templates (station, ship, drone, projectile). ship.ts stamps every ShipType.
    levels/               level-1.ts ... level-N.ts (hand-authored), types.ts, index.ts, player-start.ts, stress-test.ts.
    progress.ts           localStorage meta-progress: which level + carried money/upgrades (Carry). Save migration lives here.
    generate-scene.ts     Builds a Scene ({entities, bounds}) for the world to load.
    level-balance.ts, colors.ts, collide-categories.ts, pretty-memory.ts
  math/                   Small pure helpers (distance, angles, normalize, ...).
e2e/                      Playwright specs (game-load, stress-test, ship-test).
scripts/                  Node report scripts (level-balance, ai-run).
docs/                     This file + ai-run.md, level-balance.md.
plans/                    Design docs / vision (01-overview, 02-architecture, 03-ship-roster, 04-levels-and-prestige, 05-assets).
```

Tests live in `__tests__/` folders next to the code (`*.spec.ts`).

## Key concepts

- **Components** are declared once in [components/index.ts](../src/game/components/index.ts) (merged with
  `physicsRegistry`). The world derives its typed component map and flat entity config from that registry.
  A component's data is a typed-array block indexed via exported `*_INDEX` constants.
- **Entity templates** ([data/entities/index.ts](../src/data/entities/index.ts)) are the per-type static
  config the factory stamps entities from. Every buildable ship is stamped by `makeShipConfig(type)`.
- **Levels → Scenes.** A `LevelConfig` is `{ name, title, bounds, entities, nextLevel? }`. Loading it calls
  `world.load({ entities, bounds })`, which frees old entities and adds new ones **in place** — no page
  reload; workers resync from the add/remove deltas (memory `in-place-level-reload`).
- **Carry / progress.** `Carry` = unspent money + per-type bought rate/level upgrades. A win advances +
  saves; a loss drops back a level; both carry forward what the player finished with. `progressAfterMatch`
  in [progress.ts](../src/data/progress.ts) is the single decision point.
- **Ship roster.** `ShipRoster` is a testable view+mutator over a station's money/hangar blocks. Values the
  spawn worker also reads (money, rate, level) are written with **Atomics**. The GameScene owns the player's
  roster; the UIScene drives it.
- **Display / camera.** Fixed canvas (`DISPLAY_WIDTH/HEIGHT`, portrait for campaign, wide for stress test).
  The game camera zooms to fit the level's bounds into the play-area strip; the HUD has its own full-canvas
  camera, so HUD size never changes with level size.

## Common "how do I…" extension points

- **Add a ship type** → add a key to `SHIP_TYPES` + its def in [ship-types.ts](../src/data/ship-types.ts).
  The factory, weapon/spawn/projectile/collision systems already handle whatever a def describes. Add a
  sprite (see [plans/05-assets.md](../plans/05-assets.md)) and update relevant tests.
- **Add a level** → new `level-N.ts` in [data/levels/](../src/data/levels/), export it from `index.ts`, and
  set the previous level's `nextLevel`.
- **Add a system** → create the `x-system.ts` / `x-update.ts` / `x.worker.ts` triple, then `addSystem` it in
  `GameWorld.initSystems` at the right point in the run order.
- **Add a component** → new file in [components/](../src/game/components/), register it in `components/index.ts`.

## Commands

- `npm run dev` — dev server. `npm run build` / `npm run preview`.
- `npm run type-check` — `tsc --noEmit`. `npm run lint` (`lint:fix` to autofix).
- `npm run test:unit` (Vitest) — `npm run test:e2e` (Playwright).
- `npm run report:balance` / `npm run report:ai-run` — analysis scripts (see [ai-run.md](./ai-run.md),
  [level-balance.md](./level-balance.md)).

Always run `type-check` and `lint` after editing; most changes should add or update tests (see AGENTS.md).
