import { ascendantLevel } from './late-level';

// Act V - Ascendant: the first wall a maxed un-prestiged run cannot break. Every lane now fields a kamikaze
// Detonator stream, so even a thick screen leaks and the station dies - grinding the prior level can't out-scale it,
// only a Singularity's Ascendancy damage/rate bonuses win the race to the enemy bases first (see docs/ai-run.md).
export const level17 = ascendantLevel({
	name: 'level-17', title: 'Breach', nextLevel: 'level-18',
	width: 620, height: 980, margin: 120,
	left: { skiff: { rate: 8, level: 10 }, bulwark: { rate: 7, level: 10 }, detonator: { rate: 8, level: 9 } },
	center: { gunner: { rate: 8, level: 10 }, railgunLancer: { rate: 6, level: 10 }, detonator: { rate: 8, level: 9 } },
	right: { wasp: { rate: 6, level: 10 }, carrier: { rate: 4, level: 9 }, detonator: { rate: 8, level: 9 } },
});
