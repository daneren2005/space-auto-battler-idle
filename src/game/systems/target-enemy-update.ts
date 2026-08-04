import type { ComponentSystemWorld, EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
import { SpatialIndex, TRANSFORM_X_INDEX, TRANSFORM_Y_INDEX, TRANSFORM_WIDTH_INDEX, TRANSFORM_HEIGHT_INDEX } from '@daneren2005/shared-memory-physics';
import type { Components, ComponentArrays } from '../components';
import euclideanDistance from '@/math/euclidean-distance';
import { CONTROLLER_COLOR } from '../components/controller';
import { CONTROLLED_OWNER } from '../components/controlled';
import { ATTACK_TARGET, ATTACK_SEARCH_RANGE } from '../components/attack';

// A station as the fallback needs it: where it is and whose it is.  Stations are few and every ship that has
// found nothing nearby looks at all of them, so this is a plain list rather than another index.
interface StationDatum {
	eid: number
	x: number
	y: number
	color: number
}
// Per-run scratch computed once in preRun and read by every per-entity update in the same run.
type Scratch = ComponentSystemWorld & {
	spatialIndex?: SpatialIndex
	colorByEid?: Record<number, number>
	stations?: Array<StationDatum>
};

// Assigns each ship a target: the nearest enemy (different colour) within search range, falling back to the
// nearest enemy station so idle ships always have somewhere to go.  Two library queries feed it: `collidable`
// (everything with a transform + health, i.e. every ship and station) drives the spatial index, and `stations`
// drives the fallback.
export const targetEnemyUpdate: EntityUpdateFunction<Components, Pick<ComponentArrays, 'attack' | 'transform'>> = (world, entityId, components) => {
	const scratch = world as Scratch;
	const attack = components.attack;
	const transform = components.transform;
	if(!scratch.spatialIndex || !scratch.colorByEid) {
		return;
	}

	const colorByEid = scratch.colorByEid;
	const shipColor = colorByEid[entityId];
	const x = transform[TRANSFORM_X_INDEX];
	const y = transform[TRANSFORM_Y_INDEX];
	// The index measures to an enemy's hull rather than to its centre, so the range only has to allow for this
	// ship's own half - the other side is already accounted for.  Each ship carries its own search range, so a
	// long-range type can acquire targets as far out as it can shoot.
	const reach = Math.max(transform[TRANSFORM_WIDTH_INDEX], transform[TRANSFORM_HEIGHT_INDEX]) / 2 + attack[ATTACK_SEARCH_RANGE];

	// One walk of the tree in distance order: it settles on the nearest enemy without measuring anything past it.
	const nearest = scratch.spatialIndex.findNearest(x, y, reach, other => {
		return other.entityId !== entityId && colorByEid[other.entityId] !== shipColor;
	});
	let targetEid = nearest?.entityId ?? 0;

	// Nothing nearby: head for the nearest enemy station.
	if(!targetEid && scratch.stations) {
		let nearestStation: StationDatum | null = null;
		let nearestDistance = Infinity;
		for(let station of scratch.stations) {
			if(station.color === shipColor) {
				continue;
			}

			const distance = euclideanDistance(station.x, station.y, x, y);
			if(distance < nearestDistance) {
				nearestDistance = distance;
				nearestStation = station;
			}
		}
		targetEid = nearestStation?.eid ?? 0;
	}

	attack[ATTACK_TARGET] = targetEid;
};

// Rebuilds the spatial index + colour lookup once per run, before any ship is targeted.
targetEnemyUpdate.preRun = (world, entities, queries) => {
	const scratch = world as Scratch;
	const collidable = queries.collidable ?? [];
	const stationEntities = queries.stations ?? [];

	// Station eid -> its colour, so a ship's colour can be resolved through the station that owns it.
	const stationColor: Record<number, number> = {};
	const stations: Array<StationDatum> = [];
	for(let station of stationEntities) {
		const controller = station.components.controller;
		const transform = station.components.transform;
		if(!controller || !transform) {
			continue;
		}

		stationColor[station.entityId] = controller[CONTROLLER_COLOR];
		stations.push({
			eid: station.entityId,
			x: transform[TRANSFORM_X_INDEX],
			y: transform[TRANSFORM_Y_INDEX],
			color: controller[CONTROLLER_COLOR],
		});
	}

	const colorByEid: Record<number, number> = {};
	for(let entity of collidable) {
		const controller = entity.components.controller;
		const controlled = entity.components.controlled;
		// -1 is a colour no station uses, so orphaned ships (owner already gone) match nobody.
		colorByEid[entity.entityId] = controller ? controller[CONTROLLER_COLOR]
			: controlled ? stationColor[controlled[CONTROLLED_OWNER]] ?? -1
				: -1;
	}

	scratch.colorByEid = colorByEid;
	scratch.stations = stations;
	// Everything with a place in the world goes in - the index skips anything the query turned up without a
	// transform - and which of them are actually enemies is settled by the filter each ship searches with.
	scratch.spatialIndex = new SpatialIndex(collidable);
};
