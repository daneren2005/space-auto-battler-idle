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
import { level17 } from './level-17';
import { level18 } from './level-18';
import { level19 } from './level-19';
import { level20 } from './level-20';
import { level21 } from './level-21';
import { level22 } from './level-22';
import { level23 } from './level-23';
import { level24 } from './level-24';
import { level25 } from './level-25';
import { level26 } from './level-26';

// Every level, in play order; chain new ones with `nextLevel`. Five acts of rising difficulty:
//   Act I  - Skirmish  (1-4):  Skiffs only, rising rate/level; unlocks the Gunner.
//   Act II - Escalation (5-9): Gunners and Wasp swarms; level 7 is the first wall (a kamikaze Detonator stream a
//                              lean fleet can't soak), so dying-and-grinding starts here; a second station; map grows.
//   Act III- Fortress  (10-14): tanks (Bulwark) and snipers (Railgun) at steep levels, each fronted by a Detonator
//                              breaker so fights stay decisive; a third front. Level 14 is a hard wall.
//   Act IV - Onslaught (15-16): Carriers and combined-arms fleets on the largest maps; 16 is the last level a maxed
//                              un-prestiged run can still clear.
//   Act V  - Ascendant (17-26): fleets past that ceiling; only the Ascendancy bonuses banked from a Singularity carry
//                              a run through them. 17 is the first prestige wall, 26 the campaign's final wall.
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
	level17,
	level18,
	level19,
	level20,
	level21,
	level22,
	level23,
	level24,
	level25,
	level26,
];

export const firstLevel = levels[0];

export function getLevel(name: string): LevelConfig | undefined {
	return levels.find(level => level.name === name);
}

export function getLevelIndex(name: string): number {
	return levels.findIndex(level => level.name === name);
}

export type { LevelConfig } from './types';
