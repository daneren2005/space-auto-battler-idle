import type { HangarConfig } from '@/game/components/hangar';

// The player's fleet carries across levels as the exact rate + level they left the previous one with: their
// bought upgrades are re-applied on top of the level's player-station base (see game-scene create()), so for that
// end state to be reproduced unchanged, the base every level seeds the player with has to be the same one their
// upgrades were bought on top of.  If a later level seeded the player a bigger base, their carried upgrades would
// stack on top of it and their fleet would jump forward for free just by advancing - which is not continuity.
//
// So every level's player station uses this one starting loadout, and only the *enemy* station's base escalates
// per level to ramp the difficulty.  A fresh, un-carried run (level 1, or a wiped save) therefore always starts
// from exactly this, and every level after simply rebuilds whatever the player has bought on top of it.
export const PLAYER_START_SHIPS: NonNullable<HangarConfig['ships']> = { skiff: { rate: 1, level: 1 } };
