// Who collides with whom, in the `collideCategory` / `collideMask` bits shared-memory-physics filters on.
// Collision is per faction: everything a controller owns collides as its single category bit and accepts every
// bit but its own, so a faction's own ships pass through each other and hit anyone else's. Ships inherit their
// station's category + mask on spawn. Faction numbering matches factionColor's (faction 0 -> bit 1, etc).

// One bit per faction in a 32-bit field. Past it two factions would share a bit and stop colliding, so it throws.
export const MAX_FACTIONS = 32;

// The category bit a faction collides as.
export function factionCategory(faction: number): number {
	if(!Number.isInteger(faction) || faction < 0 || faction >= MAX_FACTIONS) {
		throw new Error(`Faction must be an integer between 0 and ${MAX_FACTIONS - 1}, got ${faction}`);
	}

	return 1 << faction;
}

// The body config props a faction's station loads with. Spread into a station's config alongside its colour.
export function factionCollision(faction: number): { collideCategory: number, collideMask: number } {
	const collideCategory = factionCategory(faction);
	// Stored in a Uint32Array, so keep the complement unsigned.
	return { collideCategory, collideMask: ~collideCategory >>> 0 };
}
