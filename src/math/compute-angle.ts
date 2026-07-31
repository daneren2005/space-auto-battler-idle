// The heading of a velocity vector, in radians counter-clockwise from +x - which is what the physics
// transform's `angle` is measured in, and what Phaser's `rotation` (as opposed to its degree-based `angle`)
// takes for drawing.
export default function computeAngle(x: number, y: number) {
	return Math.atan2(y, x);
}
