import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// controller: a faction/station.  `color` identifies the faction and `player` flags the one faction the
// human controls.  `shipsPerSecond` is the rate the station launches ships at - there is no cap on how many
// it may have flying, so a faction's fleet is only ever limited by how fast its ships die.  `spawnProgress`
// is the fraction of the next ship the station has banked so far, carried between runs (see
// spawn-ship-update).  `money` is a separate kill-reward currency - credited to whichever faction's ship gets
// a kill, but only ever spent by the player - used to buy upgrades.  `upgrades` / `shieldUpgrades` count how
// many of each upgrade type have been bought so the next one can cost exponentially more.  `shipShields` is
// the maxShields every ship this faction spawns is given (raised by a shield upgrade).

// Block layout (Int32Array, size 8).
export const CONTROLLER_COLOR = 0;
export const CONTROLLER_SHIPS_PER_SECOND = 1;
export const CONTROLLER_MONEY = 2;
export const CONTROLLER_PLAYER = 3;
export const CONTROLLER_UPGRADES = 4;
export const CONTROLLER_SHIELD_UPGRADES = 5;
export const CONTROLLER_SHIP_SHIELDS = 6;
export const CONTROLLER_SPAWN_PROGRESS = 7;

export interface ControllerComponent {
	index: number
	color: number
	shipsPerSecond: number
	money: number
	player: boolean
	upgrades: number
	shieldUpgrades: number
	shipShields: number
}
export interface ControllerConfig {
	color: number
	player?: boolean
	shipsPerSecond?: number
	shipShields?: number
}
export interface ControllerSerialization {
	shipsPerSecond?: number
	money?: number
	upgrades?: number
	shieldUpgrades?: number
	shipShields?: number
}
export const controllerDefinition: ComponentDefinition<ControllerComponent, Int32Array, ControllerConfig, ControllerSerialization> = {
	type: Int32Array,
	size: 8,
	loadProperties: ['color'],
	load(entity, memory, config) {
		const index = memory.create([
			config.color,
			config.shipsPerSecond ?? 0,
			config.money ?? 0,
			config.player ? 1 : 0,
			config.upgrades ?? 0,
			config.shieldUpgrades ?? 0,
			config.shipShields ?? 0,
			// A fresh station has banked nothing, so its first ship is a full interval away.
			0,
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
			get shipsPerSecond() {
				return block[CONTROLLER_SHIPS_PER_SECOND];
			},
			set shipsPerSecond(value: number) {
				block[CONTROLLER_SHIPS_PER_SECOND] = value;
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
	// spawnProgress is deliberately left out: it is at most a fraction of one ship of banked time, so there is
	// nothing worth carrying across a save.
	save(component) {
		return {
			shipsPerSecond: component.shipsPerSecond,
			money: component.money,
			upgrades: component.upgrades,
			shieldUpgrades: component.shieldUpgrades,
			shipShields: component.shipShields,
		};
	},
};
