import { describe, it, expect, beforeEach } from 'vitest';
import {
	emptyMeta,
	loadMeta,
	saveMeta,
	nodeCost,
	nodeAvailable,
	nodeMaxed,
	canBuyNode,
	buyNode,
	type Meta,
} from '../meta';
import { ASCENDANCY_NODE_DEFS } from '../ascendancy';

// The meta module reads/writes localStorage, which the node test environment lacks - stub a minimal one.
class MemoryStorage {
	private store: Record<string, string> = {};
	getItem(key: string): string | null {
		return this.store[key] ?? null;
	}
	setItem(key: string, value: string): void {
		this.store[key] = value;
	}
	removeItem(key: string): void {
		delete this.store[key];
	}
}

describe('meta persistence', () => {
	beforeEach(() => {
		(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
	});

	it('defaults to no Dark Matter, no nodes, prestige locked', () => {
		expect(loadMeta()).toEqual(emptyMeta());
	});

	it('round-trips a saved meta', () => {
		const meta: Meta = { darkMatter: 42, nodes: { salvage: 2 }, prestigeUnlocked: true };
		saveMeta(meta);
		expect(loadMeta()).toEqual(meta);
	});

	it('clamps a corrupt node level to the node\'s max and drops junk', () => {
		saveMeta({ darkMatter: -5, nodes: { salvage: 999, bogus: 3 }, prestigeUnlocked: true } as never);
		const loaded = loadMeta();
		expect(loaded.darkMatter).toBe(0);
		expect(loaded.nodes.salvage).toBe(ASCENDANCY_NODE_DEFS.salvage.maxLevel);
		expect((loaded.nodes as Record<string, number>).bogus).toBeUndefined();
	});
});

describe('node purchases', () => {
	it('prices the next level up from the current one', () => {
		const meta: Meta = { darkMatter: 1_000, nodes: {}, prestigeUnlocked: true };
		expect(nodeCost(meta, 'salvage')).toBe(ASCENDANCY_NODE_DEFS.salvage.costBase);
		const after = buyNode(meta, 'salvage');
		expect(nodeCost(after, 'salvage')).toBeGreaterThan(nodeCost(meta, 'salvage'));
	});

	it('spends Dark Matter and levels the node on a buy', () => {
		const meta: Meta = { darkMatter: 1_000, nodes: {}, prestigeUnlocked: true };
		const cost = nodeCost(meta, 'salvage');
		const after = buyNode(meta, 'salvage');
		expect(after).not.toBe(meta);
		expect(after.nodes.salvage).toBe(1);
		expect(after.darkMatter).toBe(1_000 - cost);
	});

	it('refuses a buy the player cannot afford, returning the same meta', () => {
		const meta: Meta = { darkMatter: 0, nodes: {}, prestigeUnlocked: true };
		expect(canBuyNode(meta, 'salvage')).toBe(false);
		expect(buyNode(meta, 'salvage')).toBe(meta);
	});

	it('gates a node behind its prerequisite', () => {
		const meta: Meta = { darkMatter: 1_000, nodes: {}, prestigeUnlocked: true };
		// Event Horizon needs Quartermaster 2; with nothing bought it is unavailable and unbuyable.
		expect(nodeAvailable(meta, 'eventHorizon')).toBe(false);
		expect(canBuyNode(meta, 'eventHorizon')).toBe(false);

		const ready: Meta = { darkMatter: 1_000, nodes: { quartermaster: 2 }, prestigeUnlocked: true };
		expect(nodeAvailable(ready, 'eventHorizon')).toBe(true);
		expect(canBuyNode(ready, 'eventHorizon')).toBe(true);
	});

	it('stops selling a node once it is maxed', () => {
		const maxed = ASCENDANCY_NODE_DEFS.salvage.maxLevel;
		const meta: Meta = { darkMatter: 100_000, nodes: { salvage: maxed }, prestigeUnlocked: true };
		expect(nodeMaxed(meta, 'salvage')).toBe(true);
		expect(canBuyNode(meta, 'salvage')).toBe(false);
		expect(buyNode(meta, 'salvage')).toBe(meta);
	});
});
