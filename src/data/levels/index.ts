import type { LevelConfig } from './types';
import { level1 } from './level-1';
import { level2 } from './level-2';

// Every level, in play order.  Add new levels here (one file each) and chain them with `nextLevel`.
export const levels: Array<LevelConfig> = [
	level1,
	level2,
];

export const firstLevel = levels[0];

export function getLevel(name: string): LevelConfig | undefined {
	return levels.find(level => level.name === name);
}

export function getLevelIndex(name: string): number {
	return levels.findIndex(level => level.name === name);
}

export type { LevelConfig } from './types';
