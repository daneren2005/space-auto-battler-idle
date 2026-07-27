import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// controller: a faction/station.  `color` identifies the faction and `player` flags the one faction the
// human controls.  `openShips` is a bank of ship slots the station spends to spawn ships (a dead ship
// returns its slot to its owner).  `money` is a separate kill-reward currency - credited to whichever
// faction's ship gets a kill, but only ever spent by the player - used to buy upgrades.  `upgrades` /
// `shieldUpgrades` count how many of each upgrade type have been bought so the next one can cost
// exponentially more.  `shipShields` is the maxShields every ship this faction spawns is given (raised by a
// shield upgrade).

// Block layout (Int32Array, size 7).
export const CONTROLLER_COLOR = 0;
export const CONTROLLER_OPEN_SHIPS = 1;
export const CONTROLLER_MONEY = 2;
export const CONTROLLER_PLAYER = 3;
export const CONTROLLER_UPGRADES = 4;
export const CONTROLLER_SHIELD_UPGRADES = 5;
export const CONTROLLER_SHIP_SHIELDS = 6;

export interface ControllerComponent {
	index: number
	color: number
	openShips: number
	money: number
	player: boolean
	upgrades: number
	shieldUpgrades: number
	shipShields: number
}
export interface ControllerConfig {
	color: number
	player?: boolean
	openShips?: number
	shipShields?: number
}
export interface ControllerSerialization {
	openShips?: number
	money?: number
	upgrades?: number
	shieldUpgrades?: number
	shipShields?: number
}
export const controllerDefinition: ComponentDefinition<ControllerComponent, Int32Array, ControllerConfig, ControllerSerialization> = {
	type: Int32Array,
	size: 7,
	loadProperties: ['color'],
	load(entity, memory, config) {
		const index = memory.create([
			config.color,
			config.openShips ?? 0,
			config.money ?? 0,
			config.player ? 1 : 0,
			config.upgrades ?? 0,
			config.shieldUpgrades ?? 0,
			config.shipShields ?? 0,
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
			get openShips() {
				return block[CONTROLLER_OPEN_SHIPS];
			},
			set openShips(value: number) {
				block[CONTROLLER_OPEN_SHIPS] = value;
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
			get upgrades() {
				return block[CONTROLLER_UPGRADES];
			},
			set upgrades(value: number) {
				block[CONTROLLER_UPGRADES] = value;
			},
			get shieldUpgrades() {
				return block[CONTROLLER_SHIELD_UPGRADES];
			},
			set shieldUpgrades(value: number) {
				block[CONTROLLER_SHIELD_UPGRADES] = value;
			},
			get shipShields() {
				return block[CONTROLLER_SHIP_SHIELDS];
			},
			set shipShields(value: number) {
				block[CONTROLLER_SHIP_SHIELDS] = value;
			},
		};
	},
	save(component) {
		return {
			openShips: component.openShips,
			money: component.money,
			upgrades: component.upgrades,
			shieldUpgrades: component.shieldUpgrades,
			shipShields: component.shipShields,
		};
	},
};
