import { stressTestLevel } from '@/data/levels/stress-test';
import { emptyCarry } from '@/data/progress';
import { WIDE_DISPLAY_WIDTH, WIDE_DISPLAY_HEIGHT } from '@/game/display';
import startGame from '@/game/start-game';

// Entry point for the /stress-test page: a scratch benchmark battle. Starts from an empty carry and never writes
// progress, so it can't disturb a run. Desktop-only (a landscape canvas).
export const game = startGame({
	level: stressTestLevel,
	carry: emptyCarry(),
	width: WIDE_DISPLAY_WIDTH,
	height: WIDE_DISPLAY_HEIGHT,
	persistProgress: false,
});
