import { stressTestLevel } from '@/data/levels/stress-test';
import { emptyCarry } from '@/data/progress';
import { WIDE_DISPLAY_WIDTH, WIDE_DISPLAY_HEIGHT } from '@/game/display';
import startGame from '@/game/start-game';

// The entry point for the /stress-test page: ten factions each launching a hundred ships a second on a wide map,
// to see what the engine does as the ship count climbs into the thousands.  It is a scratch battle, not part of
// the campaign - it always
// starts from an empty carry and never writes the saved progress, so opening this page can't disturb a run.  It
// is desktop-only by design (a landscape canvas), which is why nothing on the game page links to it.
export const game = startGame({
	level: stressTestLevel,
	carry: emptyCarry(),
	width: WIDE_DISPLAY_WIDTH,
	height: WIDE_DISPLAY_HEIGHT,
	persistProgress: false,
});
