import { levels, firstLevel } from '@/data/levels';
import { loadProgress } from '@/data/progress';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '@/game/display';
import startGame from '@/game/start-game';

// Campaign entry point: resume at the saved level with carried upgrades / money.
const progress = loadProgress();

export const game = startGame({
	level: levels[progress.levelIndex] ?? firstLevel,
	carry: progress.carry,
	width: DISPLAY_WIDTH,
	height: DISPLAY_HEIGHT,
});
