// Moves local state (every apps/*/.env + all six Postgres DBs) to another machine as ONE file.
//   node scripts/migrate-local.mjs export   -> writes local-bundle.tgz (gitignored; contains secrets)
//   node scripts/migrate-local.mjs import   -> run on the new machine after `pnpm install && pnpm infra:up`
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const compose = ['compose', '-f', join(root, 'infra', 'docker-compose.yml')];
const services = ['user', 'event', 'booking', 'payment', 'ticket', 'notification'];
const bundle = join(root, 'local-bundle.tgz');
const stage = join(root, '.local-bundle');

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
};

// docker compose exec with stdin/stdout piped to/from a file (binary-safe).
const pipeDocker = (args, { stdinFile, stdoutFile }) =>
  new Promise((ok, fail) => {
    const p = spawn('docker', [...compose, 'exec', '-T', ...args], {
      stdio: [stdinFile ? 'pipe' : 'ignore', stdoutFile ? 'pipe' : 'inherit', 'inherit'],
    });
    if (stdinFile) createReadStream(stdinFile).pipe(p.stdin);
    if (stdoutFile) p.stdout.pipe(createWriteStream(stdoutFile));
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`docker ${args.join(' ')} exited ${code}`))));
  });

async function exportBundle() {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, 'db'), { recursive: true });
  for (const s of services) {
    console.log(`dump ${s}_db`);
    await pipeDocker(['postgres-' + s, 'pg_dump', '-U', 'user', '-Fc', `${s}_db`], {
      stdoutFile: join(stage, 'db', `${s}_db.dump`),
    });
  }
  for (const app of readdirSync(join(root, 'apps'))) {
    const env = join(root, 'apps', app, '.env');
    if (existsSync(env)) cpSync(env, join(stage, 'env', app, '.env'));
  }
  // Images uploaded in dev live on disk (not in the DB) when Supabase isn't configured.
  const uploads = join(root, 'apps', 'event-service', 'uploads');
  if (existsSync(uploads)) cpSync(uploads, join(stage, 'uploads', 'event-service'), { recursive: true });
  // relative paths: GNU tar reads a `D:\...` path as host:file
  run('tar', ['czf', '../local-bundle.tgz', '.'], { cwd: stage });
  rmSync(stage, { recursive: true, force: true });
  console.log(`\nDone: ${bundle}\nCopy this single file to the new machine's repo root, then: node scripts/migrate-local.mjs import`);
}

async function importBundle() {
  if (!existsSync(bundle)) throw new Error(`${bundle} not found — put it in the repo root first`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  run('tar', ['xzf', '../local-bundle.tgz'], { cwd: stage });
  const envDir = join(stage, 'env');
  for (const app of existsSync(envDir) ? readdirSync(envDir) : []) {
    cpSync(join(envDir, app, '.env'), join(root, 'apps', app, '.env'));
    console.log(`restored apps/${app}/.env`);
  }
  const up = join(stage, 'uploads', 'event-service');
  if (existsSync(up)) {
    cpSync(up, join(root, 'apps', 'event-service', 'uploads'), { recursive: true });
    console.log('restored apps/event-service/uploads');
  }
  for (const s of services) {
    console.log(`restore ${s}_db`);
    await pipeDocker(
      ['postgres-' + s, 'pg_restore', '-U', 'user', '-d', `${s}_db`, '--clean', '--if-exists', '--no-owner'],
      { stdinFile: join(stage, 'db', `${s}_db.dump`) },
    );
  }
  rmSync(stage, { recursive: true, force: true });
  await checkImages();
  console.log('\nDone. Start the services as usual (pnpm --filter ... start:dev).');
}

// Lists every locally-served image URL in event_db whose file is not on disk.
async function checkImages() {
  const sql = `select u from (
    select "bannerUrl" u from "Event" union all select "posterUrl" from "Event" union all select "organizerLogoUrl" from "Event"
    union all select unnest("galleryUrls") from "Event" union all select "avatarUrl" from "Artist" union all select "coverUrl" from "Artist"
  ) t where u like '%/media/files/%'`;
  const r = spawnSync('docker', [...compose, 'exec', '-T', 'postgres-event', 'psql', '-U', 'user', '-d', 'event_db', '-Atc', sql], { encoding: 'utf8' });
  if (r.status !== 0) return console.log('image check skipped:', r.stderr);
  const urls = r.stdout.split(/\r?\n/).filter(Boolean);
  const missing = urls.filter((u) => !existsSync(join(root, 'apps', 'event-service', 'uploads', u.split('/media/files/')[1])));
  console.log(`\nimage check: ${urls.length - missing.length}/${urls.length} files present`);
  for (const u of missing) console.log('  MISSING', u);
}

const mode = process.argv[2];
if (mode === 'export') await exportBundle();
else if (mode === 'import') await importBundle();
else {
  console.error('usage: node scripts/migrate-local.mjs export|import');
  process.exit(1);
}
