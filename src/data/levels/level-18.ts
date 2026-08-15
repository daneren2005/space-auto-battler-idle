import { ascendantLevel } from './late-level';

// Levels 18-23 are a deliberately flat plateau: the exact fleet AND bounds of the level-17 wall. A run that only
// scrapes past 17 still coin-flips here and creeps up a level at a time, but a Singularity that buys deep enough to
// dominate 17 streams the whole plateau in one push and reaches the 24-26 ramp (see docs/ai-run.md).
export const level18 = ascendantLevel({
	name: 'level-18', title: 'Onslaught', nextLevel: 'level-19',
	width: 620, height: 980, margin: 120,
	left: { skiff: { rate: 8, level: 10 }, bulwark: { rate: 7, level: 10 }, detonator: { rate: 8, level: 9 } },
	center: { gunner: { rate: 8, level: 10 }, railgunLancer: { rate: 6, level: 10 }, detonator: { rate: 8, level: 9 } },
	right: { wasp: { rate: 6, level: 10 }, carrier: { rate: 4, level: 9 }, detonator: { rate: 8, level: 9 } },
});
