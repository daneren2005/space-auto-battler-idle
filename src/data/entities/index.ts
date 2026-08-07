import type { Config } from '@/game/components';
import { SHIP_TYPES, type ShipType } from '@/data/ship-types';
import { stationConfig } from './station';
import { makeShipConfig } from './ship';
import { droneConfig } from './drone';
import { projectileConfig } from './projectile';

// Every entity template, keyed by type, passed to the EntityFactory. Every buildable ship is stamped from its
// def by makeShipConfig, so the roster grows by adding a `ShipType` rather than a template file.
const shipConfigs = Object.fromEntries(
	SHIP_TYPES.map(type => [type, makeShipConfig(type)]),
) as Record<ShipType, Config>;

export const entityConfigs = {
	...shipConfigs,
	station: stationConfig,
	drone: droneConfig,
	projectile: projectileConfig,
};
