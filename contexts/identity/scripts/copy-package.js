import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
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
// eslint-disable-next-line no-console
console.log('copy-package: wrote', dest);

// Also copy SQL migration files from /migrations into dist/migrations so
// the temporary `migrate` handler bundled with this context can find them
// under `process.env.LAMBDA_TASK_ROOT/migrations/` when the Lambda runs.
const repoMigrationsDir = join(process.cwd(), '..', '..', 'migrations');
const distMigrationsDir = join(process.cwd(), 'dist', 'migrations');
if (existsSync(repoMigrationsDir)) {
  mkdirSync(distMigrationsDir, { recursive: true });
  for (const file of readdirSync(repoMigrationsDir).filter((f) => f.endsWith('.sql'))) {
    copyFileSync(join(repoMigrationsDir, file), join(distMigrationsDir, file));
  }
  // eslint-disable-next-line no-console
  console.log('copy-package: copied', readdirSync(repoMigrationsDir).filter((f) => f.endsWith('.sql')).length, 'migration file(s) to', distMigrationsDir);
} else {
  console.error('copy-package: repo migrations dir not found at', repoMigrationsDir);
}

