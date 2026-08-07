// Level balance model: turns the levels + ship-type economy into a per-opponent picture of what each enemy
// station is worth, so progression can be tuned against numbers. Pure (no IO) and reads the live data modules;
// scripts/level-balance.ts adds file output. Per opponent it reports Fleet cost (what the player would pay to
// field the same line) and Income/s (sustained kill-reward from destroying its spawns).
import { levels as allLevels, type LevelConfig } from '@/data/levels';
import {
	SHIP_TYPES,
	SHIP_TYPE_DEFS,
	unlockCost,
	rateCost,
	levelCost,
	killReward,
	type ShipType,
	type ShipTypeDef,
} from '@/data/ship-types';

// The Skiff is the always-unlocked starter: seeded free at rate 1 / level 1, so its counters start at 0.
const SKIFF: ShipType = 'skiff';

export interface LineCost {
	unlock: number
	rateUps: number
	levelUps: number
	total: number
}

// What the player pays to build one line up to the given rate + level, replaying the roster's purchase sequence:
// a non-Skiff first pays its unlock (seeding rate 1 / level 1, counters at 1), then each extra buy at its price.
export function lineCost(type: ShipType, def: ShipTypeDef, rate: number, level: number): LineCost {
	let rateBought: number;
	let levelBought: number;
	let unlock: number;

	if(type === SKIFF) {
		unlock = 0;
		rateBought = 0;
		levelBought = 0;
	} else {
		unlock = unlockCost(def);
		// The unlock buys the first rate + level, so both counters start at 1.
		rateBought = 1;
		levelBought = 1;
	}

	// Both are at rate 1 / level 1 now, so the remaining buys carry them up to the target.
	let rateUps = 0;
	for(let current = 1; current < rate; current++) {
		rateUps += rateCost(def, rateBought);
		rateBought++;
	}

	let levelUps = 0;
	for(let current = 1; current < level; current++) {
		levelUps += levelCost(def, levelBought);
		levelBought++;
	}

	return { unlock, rateUps, levelUps, total: unlock + rateUps + levelUps };
}

export interface ShipLine {
	type: ShipType
	name: string
	rate: number
	level: number
	cost: LineCost
	incomePerSecond: number
}

export interface OpponentReport {
	color: number
	lines: Array<ShipLine>
	totalCost: number
	totalIncomePerSecond: number
}

export interface LevelReport {
	name: string
	title: string
	width: number
	height: number
	nextLevel?: string
	opponents: Array<OpponentReport>
	totalCost: number
	totalIncomePerSecond: number
}

// One station config read structurally off the level's entity config (a non-station simply has no `ships`).
interface StationConfig {
	type?: string
	player?: boolean
	color?: number
	ships?: Partial<Record<ShipType, { rate?: number, level?: number }>>
}

export function isOpponentStation(entity: StationConfig): boolean {
	return entity.type === 'station' && !entity.player;
}

export function opponentReport(station: StationConfig): OpponentReport {
	const lines: Array<ShipLine> = [];
	let totalCost = 0;
	let totalIncomePerSecond = 0;

	// Roster (declaration) order, so the report matches the upgrade UI.
	for(const type of SHIP_TYPES) {
		const configured = station.ships?.[type];
		const rate = configured?.rate ?? 0;
		if(!configured || rate <= 0) {
			continue;
		}

		const def = SHIP_TYPE_DEFS[type];
		// A built type defaults to level 1, matching the hangar's default.
		const level = configured.level ?? 1;
		const cost = lineCost(type, def, rate, level);
		const incomePerSecond = rate * killReward(def);

		lines.push({ type, name: def.name, rate, level, cost, incomePerSecond });
		totalCost += cost.total;
		totalIncomePerSecond += incomePerSecond;
	}

	return { color: station.color ?? 0, lines, totalCost, totalIncomePerSecond };
}

export function levelReport(level: LevelConfig): LevelReport {
	const opponents = (level.entities as Array<StationConfig>)
		.filter(isOpponentStation)
		.map(opponentReport);

	return {
		name: level.name,
		title: level.title,
		width: level.bounds.width,
		height: level.bounds.height,
		nextLevel: level.nextLevel,
		opponents,
		totalCost: opponents.reduce((sum, o) => sum + o.totalCost, 0),
		totalIncomePerSecond: opponents.reduce((sum, o) => sum + o.totalIncomePerSecond, 0),
	};
}

export function levelReports(levels: Array<LevelConfig> = allLevels): Array<LevelReport> {
	return levels.map(levelReport);
}

// --- Markdown rendering -------------------------------------------------------------------------------------

function money(value: number): string {
	// Round defensively so a future fractional cost curve still prints cleanly.
	return '$' + Math.round(value).toLocaleString('en-US');
}

function amount(value: number): string {
	return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function hexColor(value: number): string {
	return '#' + value.toString(16).padStart(6, '0');
}

function renderOpponent(opponent: OpponentReport, label: string): Array<string> {
	const out: Array<string> = [];
	out.push(`### Opponent${label} (color ${hexColor(opponent.color)})`);
	out.push('');
	out.push('| Ship | Rate/s | Level | Unlock | Rate ups | Level ups | Fleet cost | Income/s |');
	out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
	for(const line of opponent.lines) {
		out.push(
			`| ${line.name} | ${amount(line.rate)} | ${line.level} | ${money(line.cost.unlock)} | ` +
			`${money(line.cost.rateUps)} | ${money(line.cost.levelUps)} | ${money(line.cost.total)} | ` +
			`${amount(line.incomePerSecond)} |`,
		);
	}
	out.push(
		`| **Total** | | | | | | **${money(opponent.totalCost)}** | **${amount(opponent.totalIncomePerSecond)}** |`,
	);
	out.push('');
	if(opponent.totalIncomePerSecond > 0) {
		const payback = opponent.totalCost / opponent.totalIncomePerSecond;
		out.push(
			`Payback: ${payback.toFixed(1)}s of clearing this station's spawns to earn back its ` +
			`${money(opponent.totalCost)} fleet cost.`,
		);
		out.push('');
	}
	return out;
}

function renderLevel(report: LevelReport): Array<string> {
	const out: Array<string> = [];
	out.push(`## ${report.name} - ${report.title}`);
	out.push('');
	out.push(`- Field: ${report.width} x ${report.height}`);
	if(report.nextLevel) {
		out.push(`- Advances to: \`${report.nextLevel}\``);
	}
	out.push('');

	if(report.opponents.length === 0) {
		out.push('_No opponent stations._');
		out.push('');
		return out;
	}

	report.opponents.forEach((opponent, index) => {
		const label = report.opponents.length > 1 ? ` #${index + 1}` : '';
		out.push(...renderOpponent(opponent, label));
	});

	if(report.opponents.length > 1) {
		out.push('### Level total');
		out.push('');
		out.push(`- Fleet cost (all opponents): **${money(report.totalCost)}**`);
		out.push(`- Income: **${amount(report.totalIncomePerSecond)}/s**`);
		out.push('');
	}

	return out;
}

export function buildMarkdown(levels: Array<LevelConfig> = allLevels): string {
	const out: Array<string> = [];
	out.push('# Level Balance Report');
	out.push('');
	out.push(
		'_Generated by `npm run report:balance` from `src/data/levels` and `src/data/ship-types`. ' +
		'Re-run after tweaking ship costs, kill rewards, or a level\'s roster._',
	);
	out.push('');
	out.push('**Fleet cost** is what the player would pay through the roster upgrade economy to build the same');
	out.push('line: the unlock (everything but the always-free Skiff) plus each rate upgrade from 1 to its rate and');
	out.push('each level upgrade from 1 to its level, priced with the live cost curves.');
	out.push('');
	out.push('**Income/s** is the sustained kill-reward income from destroying everything the station spawns: each');
	out.push('ship is worth its type\'s kill reward, launched at `rate` per second, so income = sum of rate x reward.');
	out.push('Destroying the station itself pays a one-off bounty equal to whatever of its fleet is alive at that');
	out.push('moment (see physics-update `stationWorth`), so it is not a fixed figure and is left out of the rate.');
	out.push('');

	for(const report of levelReports(levels)) {
		out.push(...renderLevel(report));
	}

	return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
