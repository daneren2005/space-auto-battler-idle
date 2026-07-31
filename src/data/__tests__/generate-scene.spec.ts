import { describe, it, expect } from 'vitest';
import generateScene from '../generate-scene';

describe('generateScene', () => {
	it('creates the requested number of stations within the given bounds', () => {
		let scene = generateScene({ stations: 5, shipsPerSecond: 20, width: 800, height: 600 });

		expect(scene.entities).toHaveLength(5);
		expect(scene.bounds).toEqual({ width: 800, height: 600 });

		scene.entities.forEach(entity => {
			expect(entity.type).toBe('station');
			expect(entity.shipsPerSecond).toBe(20);
			expect(entity.x).toBeGreaterThanOrEqual(0);
			expect(entity.x).toBeLessThanOrEqual(800);
			expect(entity.y).toBeGreaterThanOrEqual(0);
			expect(entity.y).toBeLessThanOrEqual(600);
		});
	});

	it('defaults to no stations when none are requested', () => {
		let scene = generateScene({ width: 100, height: 100 });
		expect(scene.entities).toHaveLength(0);
	});
});
