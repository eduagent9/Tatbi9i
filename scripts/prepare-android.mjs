import { cp, mkdir, rm } from 'node:fs/promises';

const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'icon.svg'];
await rm('web', { recursive: true, force: true });
await mkdir('web', { recursive: true });
for (const file of files) await cp(file, `web/${file}`);
console.log('Prepared isolated Capacitor web assets in ./web');
