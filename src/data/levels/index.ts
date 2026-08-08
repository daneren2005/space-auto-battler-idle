import type { LevelConfig } from './types';
import { level1 } from './level-1';
import { level2 } from './level-2';
import { level3 } from './level-3';
import { level4 } from './level-4';
import { level5 } from './level-5';
import { level6 } from './level-6';
import { level7 } from './level-7';
import { level8 } from './level-8';
import { level9 } from './level-9';
import { level10 } from './level-10';
import { level11 } from './level-11';
import { level12 } from './level-12';
import { level13 } from './level-13';
import { level14 } from './level-14';
import { level15 } from './level-15';
import { level16 } from './level-16';

// Every level, in play order; chain new ones with `nextLevel`. Four acts of rising difficulty:
//   Act I  - Skirmish  (1-4):  Skiffs only, rising rate/level; unlocks the Gunner.
//   Act II - Escalation (5-9): Gunners and Wasp swarms; level 7 is the first wall (a kamikaze Detonator stream a
//                              lean fleet can't soak), so dying-and-grinding starts here; a second station; map grows.
//   Act III- Fortress  (10-14): tanks (Bulwark) and snipers (Railgun) at steep levels, each fronted by a Detonator
//                              breaker so fights stay decisive; a third front. Level 14 is a hard wall.
//   Act IV - Onslaught (15-16): Carriers and combined-arms fleets on the largest maps; 16 is the prestige wall.
// From level 7 on, most levels are tuned so a lean fleet loses on arrival and must grind the prior level first
// (progressAfterMatch drops back a level on a loss); the enemy fleet cost never decreases (see campaign.spec).
export const levels: Array<LevelConfig> = [
	level1,
	level2,
	level3,
	level4,
	level5,
	level6,
	level7,
	level8,
	level9,
	level10,
	level11,
	level12,
	level13,
	level14,
	level15,
	level16,
];

export const firstLevel = levels[0];

export function getLevel(name: string): LevelConfig | undefined {
	return levels.find(level => level.name === name);
}

export function getLevelIndex(name: string): number {
	return levels.findIndex(level => level.name === name);
}

export type { LevelConfig } from './types';
