import { duplicatedRuns, duplicatedLineCount } from './rendererDrift';
const runs = duplicatedRuns();
console.log('runs:', runs.length, 'lines:', duplicatedLineCount());
for (const r of runs) console.log('  ', String(r.lines).padStart(3), r.file.padEnd(24), r.starts);
