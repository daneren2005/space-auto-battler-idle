import { Component } from '@daneren2005/shared-memory-ecs';
import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// controller: a faction/station's identity and economy. `color` identifies the faction, `player` flags the
// human's. What it builds lives on the separate `hangar`. `money` is kill-reward currency, credited to whoever's
// ship gets a kill but only ever spent by the player. `moneyMultiplier` is the Salvage prestige bonus (see
// ascendancy.ts): the main thread stamps the player's, the physics worker scales each credit by it.

// Block layout (Int32Array, size 4).
export const CONTROLLER_COLOR = 0;
export const CONTROLLER_MONEY = 1;
export const CONTROLLER_PLAYER = 2;
export const CONTROLLER_MONEY_MULT = 3;

// moneyMultiplier is a float stored fixed-point (x1000) so it fits the Int32 block; 1000 = no bonus.
export const CONTROLLER_MULT_SCALE = 1000;

export interface ControllerComponent {
	index: number
	color: number
	money: number
	player: boolean
	moneyMultiplier: number
}
export interface ControllerConfig {
	color: number
	money?: number
	player?: boolean
}
class ControllerComponentImpl extends Component<Int32Array> implements ControllerComponent {
	get color() {
		return this.block[CONTROLLER_COLOR];
	}
	set color(value: number) {
		this.block[CONTROLLER_COLOR] = value;
	}
	get money() {
		return this.block[CONTROLLER_MONEY];
	}
	set money(value: number) {
		this.block[CONTROLLER_MONEY] = value;
	}
	get player() {
		return this.block[CONTROLLER_PLAYER] === 1;
	}
	set player(value: boolean) {
		this.block[CONTROLLER_PLAYER] = value ? 1 : 0;
	}
	get moneyMultiplier() {
		return this.block[CONTROLLER_MONEY_MULT] / CONTROLLER_MULT_SCALE;
	}
	set moneyMultiplier(value: number) {
		this.block[CONTROLLER_MONEY_MULT] = Math.round(value * CONTROLLER_MULT_SCALE);
	}
}
export const controllerDefinition: ComponentDefinition<ControllerComponent, Int32Array, ControllerConfig> = {
	type: Int32Array,
	size: 4,
	loadProperties: ['color'],
	toBlock(config) {
		return [
			config.color,
			config.money ?? 0,
			config.player ? 1 : 0,
			CONTROLLER_MULT_SCALE,
		];
	},
	attach(entity, memory, index) {
		return new ControllerComponentImpl(memory.getBlock(index), index);
	},
};
