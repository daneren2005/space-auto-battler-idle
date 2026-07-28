import type { GameStats } from './game-scene';

// Render the live engine/debug stats snapshot into the plain multi-line string shown by the in-game debug
// overlay (toggled with the backtick key).  Kept as a pure, Phaser-free function so the formatting is
// unit-testable on its own.
export default function formatStats(stats: GameStats): string {
	const lines: Array<string> = [];
	lines.push(`mainThread: ${stats.maxUpdateTime.toFixed(2)} (${stats.avgUpdateTime.toFixed(2)} avg) ms`);
	stats.systemUpdates.forEach(system => {
		lines.push(`${system.name}: ${system.max.toFixed(2)} (${system.avg.toFixed(2)} avg) ms`);
	});
	lines.push('');
	lines.push(`Entities: ${stats.totalCount} (${stats.stationsCount} stations, ${stats.shipsCount} ships)`);
	lines.push(`Memory: ${stats.memory}`);
	return lines.join('\n');
}
