// The prestige meta-record: banked Dark Matter + purchased Ascendancy nodes, plus whether Enter the Singularity has
// been offered yet. Persisted to its own localStorage key, separate from the per-run Carry (progress.ts), so a
// prestige wipes the run but never the meta. Pure functions here so the buy logic can be unit-tested.

import {
	ASCENDANCY_NODE_DEFS,
	nodeLevel,
	type AscendancyNodeId,
	type AscendancyNodes,
} from '@/data/ascendancy';

export interface Meta {
	darkMatter: number
	nodes: AscendancyNodes
	// Flipped true the first time a run reaches the prestige wall; until then the Singularity option stays hidden.
	prestigeUnlocked: boolean
}

const KEY = 'space-auto-battler-meta';

export function emptyMeta(): Meta {
	return { darkMatter: 0, nodes: {}, prestigeUnlocked: false };
}

function normalizeMeta(raw: unknown): Meta {
	if(!raw || typeof raw !== 'object') {
		return emptyMeta();
	}
	const record = raw as Partial<Meta>;
	const nodes: AscendancyNodes = {};
	if(record.nodes && typeof record.nodes === 'object') {
		for(const id of Object.keys(ASCENDANCY_NODE_DEFS) as Array<AscendancyNodeId>) {
			const level = record.nodes[id];
			if(typeof level === 'number' && level > 0) {
				nodes[id] = Math.min(Math.floor(level), ASCENDANCY_NODE_DEFS[id].maxLevel);
			}
		}
	}
	return {
		darkMatter: typeof record.darkMatter === 'number' && record.darkMatter > 0 ? record.darkMatter : 0,
		nodes,
		prestigeUnlocked: record.prestigeUnlocked === true,
	};
}

export function loadMeta(): Meta {
	try {
		const raw = localStorage.getItem(KEY);
		if(raw) {
			return normalizeMeta(JSON.parse(raw));
		}
	} catch{
		// Corrupt / unavailable storage: start with no prestige progress.
	}
	return emptyMeta();
}

export function saveMeta(meta: Meta): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(meta));
	} catch{
		// Storage unavailable (private mode, etc.): the meta just won't persist.
	}
}

// --- Node purchase logic -----------------------------------------------------------------------------------

// Dark Matter cost of the next level of a node (its price rises with each level already bought).
export function nodeCost(meta: Meta, id: AscendancyNodeId): number {
	const def = ASCENDANCY_NODE_DEFS[id];
	return Math.round(def.costBase * def.costGrowth ** nodeLevel(meta.nodes, id));
}

// Whether a node's prerequisite (if any) is met - it renders but stays unbuyable until then.
export function nodeAvailable(meta: Meta, id: AscendancyNodeId): boolean {
	const req = ASCENDANCY_NODE_DEFS[id].requires;
	return !req || nodeLevel(meta.nodes, req.node) >= req.level;
}

export function nodeMaxed(meta: Meta, id: AscendancyNodeId): boolean {
	return nodeLevel(meta.nodes, id) >= ASCENDANCY_NODE_DEFS[id].maxLevel;
}

export function canBuyNode(meta: Meta, id: AscendancyNodeId): boolean {
	return nodeAvailable(meta, id) && !nodeMaxed(meta, id) && meta.darkMatter >= nodeCost(meta, id);
}

// Returns a new Meta with the node levelled up and Dark Matter spent, or the same reference if the buy can't happen.
export function buyNode(meta: Meta, id: AscendancyNodeId): Meta {
	if(!canBuyNode(meta, id)) {
		return meta;
	}
	return {
		...meta,
		darkMatter: meta.darkMatter - nodeCost(meta, id),
		nodes: { ...meta.nodes, [id]: nodeLevel(meta.nodes, id) + 1 },
	};
}
