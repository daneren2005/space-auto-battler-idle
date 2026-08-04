import { shipTestLevel } from '@/data/levels/ship-test';
import { emptyCarry } from '@/data/progress';
import { WIDE_DISPLAY_WIDTH, WIDE_DISPLAY_HEIGHT } from '@/game/display';
import startGame from '@/game/start-game';

// The entry point for the /ship-test page: a single 1v1 where both stations build a couple of every ship type, so
// each one can be seen fighting and verified.  Like the stress test it is a scratch battle - it starts from an
// empty carry and never writes the saved progress, so opening this page can't disturb a campaign run - and it uses
// the landscape canvas so the whole roster fits on screen.  Nothing on the game page links to it (it is a
// developer tool), so it is reached by opening /ship-test directly.
export const game = startGame({
	level: shipTestLevel,
	carry: emptyCarry(),
	width: WIDE_DISPLAY_WIDTH,
	height: WIDE_DISPLAY_HEIGHT,
	persistProgress: false,
});
