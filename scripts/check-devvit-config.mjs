// Validates devvit.json with the same parser the Devvit CLI uses
// (@devvit/shared-types/schemas/config-file.v1.js), then checks that every
// /internal endpoint it names is actually mounted by the server.
import { readFileSync, existsSync } from 'node:fs';
import { parseAppConfig } from '@devvit/shared-types/schemas/config-file.v1.js';
import { validateConfig } from '@devvit/cli/util/project.js';

const raw = readFileSync('devvit.json', 'utf8');
const config = parseAppConfig(raw, false); // throws on any schema error
const missing = validateConfig(config, existsSync, 'Static');
if (missing.length) throw new Error('missing build output: ' + missing.join(', '));

const json = JSON.parse(raw);
const endpoints = [
  ...json.menu.items.map((i) => i.endpoint),
  ...Object.values(json.scheduler.tasks).map((t) => t.endpoint),
  ...Object.values(json.triggers),
  ...Object.values(json.forms ?? {}),
];
const src = ['menu', 'scheduler', 'triggers']
  .map((f) => readFileSync(`src/server/routes/${f}.ts`, 'utf8'))
  .join('\n');
for (const e of endpoints) {
  const [, , group, route] = e.split('/');
  if (!src.includes(`${group === 'triggers' ? 'triggers' : group}.post('/${route}'`))
    throw new Error(`endpoint ${e} has no handler`);
}
console.log(`devvit.json OK: name=${config.name}, ${endpoints.length} endpoints all handled:`);
for (const e of endpoints) console.log('  ' + e);
console.log('permissions', JSON.stringify(json.permissions));
console.log('scheduler', JSON.stringify(json.scheduler));
