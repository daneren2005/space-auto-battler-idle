import type { Config } from '@/game/components';
import { SHIP_TYPES, type ShipType } from '@/data/ship-types';
import { stationConfig } from './station';
import { makeShipConfig } from './ship';
import { droneConfig } from './drone';
import { projectileConfig } from './projectile';

// Every entity template this game can build, keyed by type - passed straight to the EntityFactory constructor.
// The station, the Carrier's drone and the projectile are one-off templates; every buildable ship type is stamped
// out of its catalog entry by makeShipConfig, so the roster grows by adding a `ShipType` (data/ship-types.ts)
// rather than a template file.
const shipConfigs = Object.fromEntries(
	SHIP_TYPES.map(type => [type, makeShipConfig(type)]),
) as Record<ShipType, Config>;

export const entityConfigs = {
	...shipConfigs,
	station: stationConfig,
	drone: droneConfig,
	projectile: projectileConfig,
};
