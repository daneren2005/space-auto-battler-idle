import type { EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
import { addAtomicFloat32 } from '@daneren2005/shared-memory-objects/utils/atomic-math';
import { loadFloat32 } from '@daneren2005/shared-memory-objects/utils/float32-atomics';
import type { Components, ComponentArrays } from '../components';
import {
	HEALTH_SHIELDS, HEALTH_MAX_SHIELDS, HEALTH_TIME_TO_REGEN, HEALTH_TIME_SINCE_REGEN, HEALTH_TIME_SINCE_DAMAGE,
} from '../components/health';

// Advances each entity's health timers: the damage-cooldown clock always ticks, and shields regen one at a time.
// Physics collisions mutate the same shields + damage timer on another thread, so shared fields are
// read-modify-written with the Float32 atomic helpers.
export const updateHealthTimersUpdate: EntityUpdateFunction<Components, Pick<ComponentArrays, 'health'>> = (world, entityId, components) => {
	const health = components.health;

	// World runs in ms; the timers are in seconds.
	const elapsedTime = world.elapsedTime / 1_000;
	// Physics resets this to 0 on damage, so advance it atomically.
	addAtomicFloat32(health, HEALTH_TIME_SINCE_DAMAGE, elapsedTime, Infinity);

	// maxShields / timeToRegenerateShields are immutable config; shields is live.
	const maxShields = health[HEALTH_MAX_SHIELDS];
	if(loadFloat32(health, HEALTH_SHIELDS) < maxShields) {
		// timeSinceShieldRegeneration is only ever touched here, so no atomics.
		health[HEALTH_TIME_SINCE_REGEN] += elapsedTime;
		if(health[HEALTH_TIME_SINCE_REGEN] > health[HEALTH_TIME_TO_REGEN]) {
			// Competes with physics damage; add atomically and clamp to max in one step.
			addAtomicFloat32(health, HEALTH_SHIELDS, 1, maxShields);
			health[HEALTH_TIME_SINCE_REGEN] = 0;
		}
	}
};
