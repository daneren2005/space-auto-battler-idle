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
- **`@daneren2005/shared-memory-physics`** — transform/velocity/body components, the physics system, and the live shared spatial map.
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
`PhysicalWorld` and wires up the systems. Almost all heavy lifting (memory allocation, load/save,
running systems on/off-thread) is the library's; this class only composes it.

### The system triple

Most systems in [src/game/systems/](../src/game/systems/) are three files sharing a name stem:

| File | Role |
| --- | --- |
| `x-system.ts` | Creates the `ComponentSystem`: declares `required` components, extra `queries`, `getWorker`, and optional `getInitData`. |
| `x-update.ts` | The **pure update function** — runs identically on the main thread or in the worker. All the game logic lives here. May attach `preRun` / `entityRemoved` / `init` to the function. |
| `x.worker.ts` | The worker entry: `createComponentWorker(self, xUpdate)`. Thin. A system that creates entities off-thread passes the component registry too — `createComponentWorker(self, xUpdate, registry)` — so the worker has each component's `toBlock` (see Worker-side entity creation). That import pulls the registry into the worker bundle (spawn-ship/weapon workers are ~15KB heavier for it), so only entity-creating workers do it. |

A worker can be given one-time setup: the system's `getInitData()` builds a payload that rides the worker's init
message, and `xUpdate.init(data)` (attached to the update function) runs once in the worker before it reports
loaded. Whatever `init` returns is merged onto the per-run `world` every run — the way to hold state that must
persist across runs inside the worker (see the seeded RNG under Determinism).

To change what a system *does*, edit `x-update.ts`. To change *which* entities/data it sees, edit
`x-system.ts`. All game systems extend `GameComponentSystem`
([game-component-system.ts](../src/game/systems/game-component-system.ts)), which only adds the world's
`bounds` to the per-run data so update functions can keep entities on screen.

### Systems, in run order (see `GameWorld.initSystems`)

1. **update-health-timers** — shield regen / health timers.
2. **spawn-ship** — stations launch ships per their hangar production lines. Ships are **created in the worker**
   from their factory config (`createEntityWorker(world, { type, ...overrides }, callbacks)`): the worker merges the
   type template, allocates + writes every component block off-thread via each component's `toBlock`, and the main
   thread adopts the descriptor next frame. Per-ship randomness (velocity, steer force, strafe leg) is rolled in the
   update with the worker's seeded RNG and passed as config, since `toBlock` can't reach it. **weapon** creates
   projectiles/drones the same way.
3. **physics** (library) — movement + collisions. Runs after spawns so a ship exists a frame before
   anything can hit it. Stamps each run's `tick`, keeps `PhysicalWorld.spatialMap` synchronized from the worker,
   and retains Flatbush for collision broadphase performance; the scene reads moves off it.
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
    levels/               level-1.ts ... level-26.ts (hand-authored), types.ts, index.ts, player-start.ts, stress-test.ts.
                          late-level.ts: the ascendantLevel() builder the Act V walls (17-26) share (three enemy bases + a player base).
    progress.ts           localStorage per-run progress: level + peak reached + carried money/upgrades (Carry). Save migration + startingCarry.
    meta.ts               localStorage prestige record (separate key): Dark Matter + Ascendancy node levels + prestigeUnlocked. Node buy logic.
    ascendancy.ts         The prestige tree: node defs + effect helpers (money/rate/damage multipliers, pre-unlocks, cost discount) + the Dark Matter formula.
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
  A component's data is a typed-array block indexed via exported `*_INDEX` constants. Each component is defined as
  two halves so it can be created off-thread: `toBlock(config)` (worker-safe: pure config → block values, no
  entity/world) and `attach(entity, memory, index)` (builds the accessor over that block). Loading is
  `attach(entity, memory, memory.create(toBlock(config)))`; a worker calls only `toBlock`, and the main thread runs
  `attach` when it adopts the entity. A component's own extra allocations (a resource block) go in `attach`, which
  runs on the main thread in both paths. Creation-time randomness (attack's steer force) rolls in `toBlock` only
  when it's handed the `entity` — which happens on the main thread (direct placement), never in a worker.
- **Worker-side entity creation.** `createEntityWorker(world, config, callbacks)` (in a system marked
  `createsEntities: true`) creates an entity entirely off-thread from a factory config: the worker merges the type
  template, mints a shared-atomic id, and writes each component's block via `toBlock`; the main thread adopts it next
  frame. Creation-time randomness lives in the update function (which holds the seeded RNG), not in `toBlock`.
- **Entity templates** ([data/entities/index.ts](../src/data/entities/index.ts)) are the per-type static
  config the factory stamps entities from. Every buildable ship is stamped by `makeShipConfig(type)`.
- **Spatial indexes.** `GameWorld` extends the physics package's `PhysicalWorld`, whose live shared map follows
  entity lifecycle and every finalized physics move. It is available for occasional client/worker queries without
  a rebuild. The query-heavy target-enemy worker deliberately still builds a Flatbush `SpatialIndex` per run: it
  performs one nearest search per ship, where the packed snapshot is faster than the mutable shared map. The live
  map's 16,384 entity/slot records and 32,768 buckets are allocated before workers clone the heap, avoiding
  cross-thread heap growth during the stress workload; its 100-unit cells keep the slot budget near one per ship.
- **Levels → Scenes.** A `LevelConfig` is `{ name, title, bounds, entities, nextLevel? }`. Loading it calls
  `world.load({ entities, bounds })`, which frees old entities and adds new ones **in place** — no page
  reload; workers resync from the add/remove deltas (memory `in-place-level-reload`). Between levels a short
  camera fade (`GameScene.startTransition`) hides the swap: it fades the play area out, runs the swap once the
  screen is covered so the new level starts simulating immediately, then fades back in.
- **Carry / progress.** `Carry` = unspent money + per-type bought rate/level upgrades. A win advances +
  saves; a loss drops back a level; both carry forward what the player finished with. `progressAfterMatch`
  in [progress.ts](../src/data/progress.ts) is the single decision point. `Progress` also tracks
  `highestLevelIndex` (the peak, which a loss never lowers) — prestige banks off it and it gates the Singularity unlock.
- **Prestige (Singularity / Dark Matter / Ascendancy).** A second persisted record ([meta.ts](../src/data/meta.ts),
  its own localStorage key) holds banked **Dark Matter** + purchased **Ascendancy** node levels, so a prestige wipes
  the run but never the meta. The Ascendancy ([ascendancy.ts](../src/data/ascendancy.ts)) is a small tree of
  run-spanning nodes whose effects apply at run load / prestige time. Two kinds: **main-thread seeds/reads** —
  Standing Fleet seeds a fresh run's `startingCarry`, Quartermaster is a live cost discount the `ShipRoster` reads,
  Event Horizon scales Dark Matter earned; and **per-player worker multipliers** — Salvage (money earned), Doctrine
  (ships/second), Munitions (ship damage) are stamped onto the player station's `controller.moneyMultiplier` /
  `hangar.rateMultiplier` / `hangar.damageMultiplier` blocks in `setupStationsAndCarry` each load, and the physics /
  spawn workers read them live off the block (fixed-point x1000, default 1x on every non-player station — no
  `getInitData` plumbing, and refreshes on every in-place reload including after a prestige). **Enter the Singularity** (a pause-menu action, unlocked the first
  time a run reaches `PRESTIGE_UNLOCK_LEVEL_INDEX`) banks `darkMatterForLevel(highestLevelIndex)`, wipes the run, and
  reloads level 1 with the prestige-seeded carry. The GameScene owns the live `Meta`; the UIScene's Ascendancy modal
  reads it and calls `buyAscendancyNode` / `enterSingularity`. The headless [auto-play](../src/game/auto-play.ts)
  mirrors the whole loop for the ai-run report: it carries its own `Meta`, stamps the multipliers + cost discount like
  `setupStationsAndCarry`, and once a level past the unlock is lost more than `DEFAULT_PRESTIGE_AFTER_DEATHS` times it
  banks Dark Matter, greedily buys the cheapest affordable nodes, and restarts (stopping if a prestige can't better the
  previous run's peak). Act V (levels 17-26) is authored to need it: those walls are lethal to a maxed un-prestiged
  fleet, so only the Ascendancy bonuses carry a run through.
- **Ship roster.** `ShipRoster` is a testable view+mutator over a station's money/hangar blocks. Values the
  spawn worker also reads (money, rate, level) are written with **Atomics**. The GameScene owns the player's
  roster; the UIScene drives it.
- **Determinism.** A run's randomness is seeded (`rand-seed`) so a fixed seed replays identically. `GameWorld` takes
  a `seed` (random by default for normal play; auto-play passes `DEFAULT_AUTO_PLAY_SEED`). Main-thread code that
  rolls randomness — the `attack` component's load — uses `world.rand`. Worker code can't share that RNG across the
  thread boundary, so the `spawn-ship` system sends the seed via `getInitData` and its update's `init` hook builds a
  worker-local `Rand` (reached as `world.rand` each run). Add new randomness through these, never `Math.random`.
- **Display / camera.** Fixed canvas (`DISPLAY_WIDTH/HEIGHT`, portrait for campaign, wide for stress test).
  The game camera zooms to fit the level's bounds into the play-area strip; the HUD has its own full-canvas
  camera, so HUD size never changes with level size.

## Common "how do I…" extension points

- **Add a ship type** → add a key to `SHIP_TYPES` + its def in [ship-types.ts](../src/data/ship-types.ts).
  The factory, weapon/spawn/projectile/collision systems already handle whatever a def describes. Add a
  sprite (see [plans/05-assets.md](../plans/05-assets.md)) and update relevant tests.
- **Tune how a ship levels up** → each def carries a `progression: ProgressionTrack[]`; each track grows one
  stat (`shields` / `damage` / `projectiles`) by `amount` (default 1) every `every` levels, with `phase`
  (default 1) picking which levels grant. `phase 1` is the "every Nth level past the first" cadence; two
  `every: 2` tracks with `phase 0` (even) and `phase 1` (odd) alternate. `shieldsForLevel` /
  `weaponDamageForLevel` / `contactDamageForLevel` / `projectileCountForLevel` sum the matching tracks; the
  spawn worker stamps the level-scaled shields/damage/shot-count onto each ship it builds.
- **Add a level** → new `level-N.ts` in [data/levels/](../src/data/levels/), export it from `index.ts`, and
  set the previous level's `nextLevel`.
- **Add a system** → create the `x-system.ts` / `x-update.ts` / `x.worker.ts` triple, then `addSystem` it in
  `GameWorld.initSystems` at the right point in the run order.
- **Add a component** → new file in [components/](../src/game/components/), register it in `components/index.ts`.
- **Add an Ascendancy node** → add its id to `ASCENDANCY_NODES` + a def in [ascendancy.ts](../src/data/ascendancy.ts),
  write its effect helper there, and apply it where the effect lives (starting-carry seed / `ShipRoster` cost /
  Dark Matter formula). The pause-menu Ascendancy modal renders every node in `ASCENDANCY_NODES` automatically. A
  main-thread effect needs no worker changes; a per-run global multiplier the spawn/physics worker must see is
  stamped onto the player's `controller` / `hangar` block in `setupStationsAndCarry` (fixed-point x1000) and read
  live off the block by the worker — see Salvage / Doctrine / Munitions.

## Commands

- `npm run dev` — dev server. `npm run build` / `npm run preview`.
- `npm run type-check` — `tsc --noEmit`. `npm run lint` (`lint:fix` to autofix).
- `npm run test:unit` (Vitest) — `npm run test:e2e` (Playwright).
- `npm run report:balance` / `npm run report:ai-run` — analysis scripts (see [ai-run.md](./ai-run.md),
  [level-balance.md](./level-balance.md)).

Always run `type-check` and `lint` after editing; most changes should add or update tests (see AGENTS.md).
