import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.cwd(), 'package.json');
const dest = join(process.cwd(), 'dist', 'package.json');

if (!existsSync(src)) {
  console.error('copy-package: no package.json in', process.cwd());
  process.exit(1);
}
if (!existsSync(join(process.cwd(), 'dist'))) {
  console.error('copy-package: no dist/ directory; run tsc first');
  process.exit(1);
}

copyFileSync(src, dest);
console.log('copy-package: wrote', dest);
