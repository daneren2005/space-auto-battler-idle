import { shipTestLevel } from '@/data/levels/ship-test';
import { emptyCarry } from '@/data/progress';
import { WIDE_DISPLAY_WIDTH, WIDE_DISPLAY_HEIGHT } from '@/game/display';
import startGame from '@/game/start-game';

// Entry point for the /ship-test page: a 1v1 showcasing every ship type. A scratch battle (empty carry, no
// progress written) on the landscape canvas so the whole roster fits.
export const game = startGame({
	level: shipTestLevel,
	carry: emptyCarry(),
	width: WIDE_DISPLAY_WIDTH,
	height: WIDE_DISPLAY_HEIGHT,
	persistProgress: false,
});
