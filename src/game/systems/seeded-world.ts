import Rand from 'rand-seed';
import type { CustomSystemWorld } from './game-entity-worker-system';

// A per-run world with the worker's persistent seeded RNG merged in
export interface SeededWorld extends CustomSystemWorld {
	rand: Rand
}

export interface SeedInitData {
	seed: number
}

// updateFunction.init hook: build the RNG once from the seed the main thread sent
export function seedRand(data: unknown): { rand: Rand } {
	const { seed } = data as SeedInitData;
	return { rand: new Rand(String(seed)) };
}
