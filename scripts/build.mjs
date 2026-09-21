import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';

const source = 'atta';
const dist = 'dist';
const allowed = new Set(['.html','.css','.js','.json','.webmanifest','.png','.jpg','.jpeg','.webp','.svg','.ico']);

async function validate(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${path}`);
    if (entry.isDirectory()) { await validate(path); continue; }
    if (!allowed.has(extname(path))) throw new Error(`Unexpected ATTA build asset: ${path}`);
  }
}
for (const required of ['index.html','styles.css','app.js','manifest.webmanifest']) {
  await readFile(join(source, required));
}
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(source, dist, { recursive: true });
await validate(dist);
console.log('Built ATTA! Golden Path prototype.');
