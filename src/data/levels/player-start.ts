import type { HangarConfig } from '@/game/components/hangar';

// Every level seeds the player with this same base, and their carried upgrades are rebuilt on top of it (see
// game-scene create()). It must stay constant: a bigger base would let carried upgrades stack for a free jump.
// Only the enemy station's base escalates per level.
export const PLAYER_START_SHIPS: NonNullable<HangarConfig['ships']> = { skiff: { rate: 1, level: 1 } };
