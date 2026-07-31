import type { TimingStats } from '@daneren2005/shared-memory-ecs';
import type { GameStats } from './game-scene';

// Every timing in the panel reads the same way: the worst case over the reporting window with the average in
// brackets behind it.  The two summary lines spell the bracket out, since they have no column header to say so.
function format(stats: TimingStats, label = ''): string {
	return `${stats.max.toFixed(2)} (${stats.avg.toFixed(2)}${label})`;
}

// Render the live engine/debug stats snapshot into the plain multi-line string shown by the in-game debug
// overlay (toggled with the backtick key).  Kept as a pure, Phaser-free function so the formatting is
// unit-testable on its own.
export default function formatStats(stats: GameStats): string {
	const timing = stats.timing;
	const lines: Array<string> = [];
	lines.push(`fps: ${stats.fps.toFixed(1)}`);
	lines.push(`mainThread: ${format(timing.update, ' avg')} ms`);
	// What handling the workers' events cost this thread, every system added together.  Same units as the line
	// above, so the two together are what running the world costs the main thread.
	lines.push(`events: ${format(timing.events, ' avg')} ms`);
	// Each system then breaks down into the run on its own worker and the events that run reported back, both as
	// max (avg) over the reporting window.
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
