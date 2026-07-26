import { stationConfig } from './station';
import { shipConfig } from './ship';

// Every entity template this game can build, keyed by type - passed straight to the EntityFactory constructor.
export const entityConfigs = {
	station: stationConfig,
	ship: shipConfig,
};
