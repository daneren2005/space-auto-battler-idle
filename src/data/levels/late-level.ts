import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import type { HangarConfig } from '@/game/components/hangar';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

type Fleet = NonNullable<HangarConfig['ships']>;

// Shared shape for the Act V "Ascendant" levels (17+): three allied enemy bases strung across the top of a large
// field, the player at the bottom. These fleets are tuned past the ceiling a single un-prestiged run can out-build,
// so clearing them relies on the Ascendancy bonuses banked from a Singularity (see docs/ai-run.md, plans/04). Every
// campaign level is still one explicit level-N.ts export; this only spares ten near-identical station blocks.
export function ascendantLevel(opts: {
	name: string
	title: string
	nextLevel?: string
	width: number
	height: number
	margin: number
	left: Fleet
	center: Fleet
	right: Fleet
}): LevelConfig {
	const { width, height, margin } = opts;
	return {
		name: opts.name,
		title: opts.title,
		bounds: { width, height },
		nextLevel: opts.nextLevel,
		entities: [
			{
				type: 'station', x: width / 2, y: height - margin,
				color: PLAYER_COLOR, ...factionCollision(0), player: true, ships: PLAYER_START_SHIPS,
			} satisfies Config,
			{
				type: 'station', x: Math.round(width * 0.2), y: margin,
				color: ENEMY_COLOR, ...factionCollision(1), ships: opts.left,
			} satisfies Config,
			{
				type: 'station', x: Math.round(width * 0.5), y: margin,
				color: ENEMY_COLOR, ...factionCollision(1), ships: opts.center,
			} satisfies Config,
			{
				type: 'station', x: Math.round(width * 0.8), y: margin,
				color: ENEMY_COLOR, ...factionCollision(1), ships: opts.right,
			} satisfies Config,
		],
	};
}
