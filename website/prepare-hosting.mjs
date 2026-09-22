import { mkdtemp, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stage only public files. Never upload repo files, data, or configuration.
const source = fileURLToPath(new URL('.', import.meta.url));
const stage = await mkdtemp(join(tmpdir(), 'argumesh-website-'));
await cp(join(source, 'index.html'), join(stage, 'public', 'index.html'), { recursive: true });
await cp(join(source, 'website-assets'), join(stage, 'public', 'website-assets'), { recursive: true });
await cp(join(source, 'edge.mjs'), join(stage, 'edge.mjs'));
await writeFile(join(stage, 'wrangler.json'), JSON.stringify({
  name: 'argumesh-website',
  account_id: 'f1cdf5bc6cd4e146f642b531bd097e84',
  main: './edge.mjs',
  compatibility_date: '2026-09-13',
  workers_dev: false,
  routes: [{ pattern: 'argumesh.nekocfy.com/*', zone_name: 'nekocfy.com' }],
  assets: { directory: './public', binding: 'ASSETS', run_worker_first: true },
  services: [{ binding: 'WORKBENCH', service: 'paperidea-workbench' }],
}, null, 2));
console.log(join(stage, 'wrangler.json'));
