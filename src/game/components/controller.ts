import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// controller: a faction/station's identity and economy. `color` identifies the faction, `player` flags the
// human's. What it builds lives on the separate `hangar`. `money` is kill-reward currency, credited to whoever's
// ship gets a kill but only ever spent by the player.

// Block layout (Int32Array, size 3).
export const CONTROLLER_COLOR = 0;
export const CONTROLLER_MONEY = 1;
export const CONTROLLER_PLAYER = 2;

export interface ControllerComponent {
	index: number
	color: number
	money: number
	player: boolean
}
export interface ControllerConfig {
	color: number
	money?: number
	player?: boolean
}
export const controllerDefinition: ComponentDefinition<ControllerComponent, Int32Array, ControllerConfig> = {
	type: Int32Array,
	size: 3,
	loadProperties: ['color'],
	load(entity, memory, config) {
		const index = memory.create([
			config.color,
			config.money ?? 0,
			config.player ? 1 : 0,
		]);
		const block = memory.getBlock(index);

		return {
			index,
			get color() {
				return block[CONTROLLER_COLOR];
			},
			set color(value: number) {
				block[CONTROLLER_COLOR] = value;
			},
			get money() {
				return block[CONTROLLER_MONEY];
			},
			set money(value: number) {
				block[CONTROLLER_MONEY] = value;
			},
			get player() {
				return block[CONTROLLER_PLAYER] === 1;
			},
			set player(value: boolean) {
				block[CONTROLLER_PLAYER] = value ? 1 : 0;
			},
		};
	},
};
