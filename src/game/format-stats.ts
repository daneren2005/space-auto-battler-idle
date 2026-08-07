import type { TimingStats } from '@daneren2005/shared-memory-ecs';
import type { GameStats } from './game-scene';

// max over the reporting window, average in brackets behind it.
function format(stats: TimingStats, label = ''): string {
	return `${stats.max.toFixed(2)} (${stats.avg.toFixed(2)}${label})`;
}

// Pure, Phaser-free so the formatting is unit-testable.
export default function formatStats(stats: GameStats): string {
	const timing = stats.timing;
	const lines: Array<string> = [];
	lines.push(`fps: ${stats.fps.toFixed(1)}`);
	lines.push(`mainThread: ${format(timing.update, ' avg')} ms`);
	// Cost of handling the workers' events on this thread, all systems summed.
	lines.push(`events: ${format(timing.events, ' avg')} ms`);
	// Each system splits into its worker run and the events that run reported back.
	if(timing.systems.length) {
		lines.push('');
		lines.push('worker | main, max (avg) ms');
	}
	timing.systems.forEach(system => {
		lines.push(`${system.name.replace('System', '')}: ${format(system.run)} | ${format(system.events)}`);
	});
	lines.push('');
	lines.push(`Entities: ${stats.totalCount} (${stats.stationsCount} stations, ${stats.shipsCount} ships)`);
	lines.push(`Memory: ${stats.memory}`);
	return lines.join('\n');
}
