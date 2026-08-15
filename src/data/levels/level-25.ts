import { ascendantLevel } from './late-level';

export const level25 = ascendantLevel({
	name: 'level-25', title: 'Last Light', nextLevel: 'level-26',
	width: 710, height: 1080, margin: 135,
	left: { skiff: { rate: 9, level: 11 }, bulwark: { rate: 8, level: 11 }, detonator: { rate: 9, level: 9 } },
	center: { gunner: { rate: 9, level: 11 }, railgunLancer: { rate: 7, level: 11 }, detonator: { rate: 9, level: 9 } },
	right: { wasp: { rate: 7, level: 11 }, carrier: { rate: 4, level: 10 }, detonator: { rate: 9, level: 9 } },
});
