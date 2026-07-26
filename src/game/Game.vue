<template>
	<div class="home">
		<div class="list">
			<div style="color: red">mainThread: {{ maxUpdateTime.toFixed(2) }} ({{ avgUpdateTime.toFixed(2) }} avg) ms</div>
			<div v-for="system in systemUpdates" :key="system.name">{{ system.name }}: {{ system.max.toFixed(2) }} ({{ system.avg.toFixed(2) }} avg) ms</div>
			<div></div>
			<div>Memory: {{ memory }}</div>
			<p/>

			<div>Entities: {{ stationsCount }} stations and {{ shipsCount }} ships ({{ totalCount }})</div>
			<span class="station-list" v-for="station in stationShips" :key="station.color" :style="{ color: station.displayColor }">{{ '#' + station.color.toString(16) }}: {{ station.ships }}</span>
			<div><button @click="addShips">Add Ships</button></div>
		</div>

		<div id="phaser-container"/>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, Ref } from 'vue';
import Phaser from 'phaser';
import GameWorld from './entities/game-world';
import GameScene from './game-scene';
import type { GameStats, StationShipStat, SystemStat } from './game-scene';

let world: GameWorld;
const maxUpdateTime = ref(0);
const avgUpdateTime = ref(0);
const memory = ref('');
const stationsCount = ref(0);
const shipsCount = ref(0);
const totalCount = ref(0);
const stationShips = ref([]) as Ref<Array<StationShipStat>>;
const systemUpdates = ref([]) as Ref<Array<SystemStat>>;

let game: Phaser.Game | null;
onMounted(() => {
	world = new GameWorld();

	const width = window.innerWidth / 3 * 2;
	const height = window.innerHeight / 3 * 2;

	game = new Phaser.Game({
		type: Phaser.AUTO,
		width,
		height,
		parent: 'phaser-container',
		scene: new GameScene({
			world,
			width,
			height,
			onStats,
		}),
	});
});
onBeforeUnmount(() => {
	if(game) {
		game.destroy(false);
		game = null;
	}
	if(world) {
		world.destroy();
	}
});

// Mirror the scene's stat snapshot into reactive refs so the template updates.
function onStats(stats: GameStats) {
	maxUpdateTime.value = stats.maxUpdateTime;
	avgUpdateTime.value = stats.avgUpdateTime;
	memory.value = stats.memory;
	stationsCount.value = stats.stationsCount;
	shipsCount.value = stats.shipsCount;
	totalCount.value = stats.totalCount;
	stationShips.value = stats.stationShips;
	systemUpdates.value = stats.systemUpdates;
}

function addShips() {
	world.entities.forEach(entity => {
		if(entity.components.controller) {
			entity.components.controller.money += 10;
		}
	});
}
</script>

<style scoped>
.list {
	margin-bottom: 0.5em;
}
.station-list {
	margin-left: 0.5em;
}
</style>
