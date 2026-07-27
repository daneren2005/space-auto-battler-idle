// The game renders into a fixed-resolution canvas (this size), independent of how big a level's world bounds
// are.  Scale.FIT then fits that canvas into the page.  The GameScene's camera zooms to fit the level's bounds
// inside this canvas (a small level zooms in, a big level zooms out), so changing a level's size never changes
// the size of the HUD/menus drawn by the UIScene - they are always laid out against these dimensions.
export const DISPLAY_WIDTH = 1280;
export const DISPLAY_HEIGHT = 720;
