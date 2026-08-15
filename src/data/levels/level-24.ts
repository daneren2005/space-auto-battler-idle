import { ascendantLevel } from './late-level';

export const level24 = ascendantLevel({
	name: 'level-24', title: 'Collapse', nextLevel: 'level-25',
	width: 700, height: 1060, margin: 130,
	left: { skiff: { rate: 8, level: 11 }, bulwark: { rate: 7, level: 11 }, detonator: { rate: 8, level: 9 } },
	center: { gunner: { rate: 8, level: 11 }, railgunLancer: { rate: 6, level: 11 }, detonator: { rate: 8, level: 9 } },
	right: { wasp: { rate: 7, level: 10 }, carrier: { rate: 4, level: 10 }, detonator: { rate: 8, level: 9 } },
});
