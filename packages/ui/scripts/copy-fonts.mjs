// Copie les polices vendorisées (src/styles/fonts) à côté de la CSS compilée
// (dist/fonts), pour que les url('./fonts/…') de dist/veriterra.css résolvent
// et que le bundle design-sync embarque ses woff2.
import { cp, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const from = new URL('src/styles/fonts/', root);
const to = new URL('dist/fonts/', root);

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log('[ui] copied src/styles/fonts → dist/fonts');
