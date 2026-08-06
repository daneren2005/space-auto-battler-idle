// Writes the level balance report to a file (and stdout).  All the computation lives in the pure, unit-tested
// src/data/level-balance module; this wrapper just adds the file IO so the report can be regenerated on demand.
//
// Run with `npm run report:balance`.  Pass an output path to write somewhere other than the default
// plans/level-balance.md, or `-` to print to stdout only.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildMarkdown } from '@/data/level-balance';

const report = buildMarkdown();

const outArg = process.argv[2];
const defaultOut = fileURLToPath(new URL('../docs/level-balance.md', import.meta.url));

if(outArg === '-') {
	process.stdout.write(report);
} else {
	const outPath = outArg ?? defaultOut;
	writeFileSync(outPath, report);
	process.stdout.write(report);
	process.stderr.write(`\nWrote ${outPath}\n`);
}
