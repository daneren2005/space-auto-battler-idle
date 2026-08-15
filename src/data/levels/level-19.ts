import { ascendantLevel } from './late-level';

export const level19 = ascendantLevel({
	name: 'level-19', title: 'Firestorm', nextLevel: 'level-20',
	width: 620, height: 980, margin: 120,
	left: { skiff: { rate: 8, level: 10 }, bulwark: { rate: 7, level: 10 }, detonator: { rate: 8, level: 9 } },
	center: { gunner: { rate: 8, level: 10 }, railgunLancer: { rate: 6, level: 10 }, detonator: { rate: 8, level: 9 } },
	right: { wasp: { rate: 6, level: 10 }, carrier: { rate: 4, level: 9 }, detonator: { rate: 8, level: 9 } },
});
