import { ascendantLevel } from './late-level';

// The campaign's final wall and most expensive fleet: three maxed combined-arms bases, every lane a kamikaze
// stream. Only a run several Singularities deep clears it. No `nextLevel` - a win here rolls back to "Play Again".
export const level26 = ascendantLevel({
	name: 'level-26', title: 'Ascendant',
	width: 720, height: 1100, margin: 135,
	left: { skiff: { rate: 9, level: 12 }, bulwark: { rate: 8, level: 12 }, detonator: { rate: 9, level: 10 } },
	center: { gunner: { rate: 9, level: 12 }, railgunLancer: { rate: 7, level: 12 }, detonator: { rate: 9, level: 10 } },
	right: { wasp: { rate: 8, level: 11 }, carrier: { rate: 5, level: 11 }, detonator: { rate: 9, level: 10 } },
});
