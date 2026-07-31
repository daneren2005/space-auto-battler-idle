// Who collides with whom, in the `collideCategory` / `collideMask` bits shared-memory-physics filters on.
//
// Collision is per faction rather than per entity type: everything one controller owns - its station and every
// ship it spawns - collides as that faction's single category bit, and accepts every bit except its own.  So a
// faction's own ships fly straight through each other and through their home station, and run into anything
// belonging to anyone else.  Ships inherit their station's category + mask as they spawn (see spawnShipUpdate),
// so a faction only ever has to be given a number here, on its station.
//
// Faction numbering matches factionColor's, so faction 0 - the player in a hand-authored level - collides as
// category 1, faction 1 as 2, faction 2 as 4, and so on.

// One bit per faction in a 32 bit field, so this is how many factions can ever be told apart.  Past it two
// factions would share a bit and stop colliding with each other, which is why it throws rather than wrapping
// the way factionColor does with its palette.
export const MAX_FACTIONS = 32;

// The category bit a faction collides as.
export function factionCategory(faction: number): number {
	if(!Number.isInteger(faction) || faction < 0 || faction >= MAX_FACTIONS) {
		throw new Error(`Faction must be an integer between 0 and ${MAX_FACTIONS - 1}, got ${faction}`);
	}

	return 1 << faction;
}

// The pair of body config props a faction's station is loaded with: it collides as its own bit and with every
// bit but its own.  Spread into a station's entity config alongside its colour.
export function factionCollision(faction: number): { collideCategory: number, collideMask: number } {
	const collideCategory = factionCategory(faction);
	// Stored in a Uint32Array, so keep the complement unsigned rather than handing over a negative number.
	return { collideCategory, collideMask: ~collideCategory >>> 0 };
}
