<template>
	<div class="home">
		<div class="list">
			<div style="color: red">mainThread: {{ maxUpdateTime.toFixed(2) }} ({{ avgUpdateTime.toFixed(2) }} avg) ms</div>
			<div v-for="system in systemUpdates" :key="system.name">{{ system.name }}: {{ system.max.toFixed(2) }} ({{ system.avg.toFixed(2) }} avg) ms</div>
			<div></div>
			<div>Memory: {{ memory }}</div>
		</div>

		<div id="phaser-container"/>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, Ref } from 'vue';
import Phaser from 'phaser';
import { levels, firstLevel } from '@/data/levels';
import { loadProgress } from '@/data/progress';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from './display';
import GameWorld from './entities/game-world';
import GameScene from './game-scene';
import UIScene from './ui-scene';
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

	// Resume at the saved level with the upgrades / money carried over from earlier levels.
	const progress = loadProgress();
	const level = levels[progress.levelIndex] ?? firstLevel;

	game = new Phaser.Game({
		type: Phaser.AUTO,
		// Fixed canvas resolution: the game camera zooms to fit the level's world into it, so the UI stays a
		// constant size no matter how big or small the level's bounds are.
		width: DISPLAY_WIDTH,
		height: DISPLAY_HEIGHT,
		parent: 'phaser-container',
		backgroundColor: '#05070f',
		scale: {
			mode: Phaser.Scale.FIT,
			autoCenter: Phaser.Scale.CENTER_BOTH,
		},
		scene: [
			new GameScene({
				world,
				level,
				carry: progress.carry,
				onStats,
			}),
			new UIScene(),
		],
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
</script>

<style scoped>
.list {
	margin-bottom: 0.5em;
}
.station-list {
	margin-left: 0.5em;
}
/* Give Phaser's parent a determinate size.  With Scale.FIT and an auto-sized parent the canvas and its
   container feed back into each other and the canvas grows every resize; a fixed box breaks that loop. */
#phaser-container {
	width: 100%;
	height: 80vh;
}
</style>
