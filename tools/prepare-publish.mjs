// Crea la cartella pubblica/ con i soli file dell'app, pronta da caricare: npm run pubblica

import { cpSync, rmSync, writeFileSync } from 'node:fs';

const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'vendor'];
const out = new URL('../pubblica/', import.meta.url);

rmSync(out, { recursive: true, force: true });
for (const file of FILES) {
  cpSync(new URL(`../${file}`, import.meta.url), new URL(file, out), { recursive: true });
}
writeFileSync(new URL('.nojekyll', out), ''); // GitHub Pages: serve i file così come sono

console.log('Cartella pubblica/ pronta: trascinala su https://app.netlify.com/drop');
