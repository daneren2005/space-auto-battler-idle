import { Component } from '@daneren2005/shared-memory-ecs';
import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// controlled: marks a ship and records the eid of the station that owns it.

// Block layout (Uint32Array, size 1).
export const CONTROLLED_OWNER = 0;

export interface ControlledComponent {
	index: number
	owner: number
}
export interface ControlledConfig {
	owner: number
}
class ControlledComponentImpl extends Component<Uint32Array> implements ControlledComponent {
	get owner() {
		return this.block[CONTROLLED_OWNER];
	}
	set owner(value: number) {
		this.block[CONTROLLED_OWNER] = value;
	}
}
export const controlledDefinition: ComponentDefinition<ControlledComponent, Uint32Array, ControlledConfig> = {
	type: Uint32Array,
	size: 1,
	loadProperties: ['owner'],
	toBlock(config) {
		return [config.owner];
	},
	attach(entity, memory, index) {
		return new ControlledComponentImpl(memory.getBlock(index), index);
	},
};
