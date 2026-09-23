import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createGateway } from './gateway.mjs';

const publicOrigin =
  process.env.PUBLIC_ORIGIN ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : '');
if (!publicOrigin)
  throw new Error('Set PUBLIC_ORIGIN or generate a Railway public domain.');
for (const key of ['DATABASE_URL', 'GEMINI_API_KEY', 'BLOB_DIRECTORY'])
  if (!process.env[key]) throw new Error(`${key} is required for deployment.`);
const port = Number(process.env.PORT || 8080);
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  [3100, 3101].includes(port)
)
  throw new Error('Invalid public PORT.');
const apiPort = 3101,
  webPort = 3100;
const children = new Set();
let stopping = false;
const server = createGateway({
  username: process.env.APP_USERNAME,
  password: process.env.APP_PASSWORD,
  publicOrigin,
  apiPort,
  webPort,
  healthy: () =>
    !stopping &&
    children.size === 3 &&
    [...children].every(
      (child) => child.exitCode === null && child.signalCode === null,
    ),
});
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server.close();
  for (const child of children) child.kill('SIGTERM');
  const timeout = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    server.closeAllConnections();
    process.exit(code);
  }, 15_000);
  Promise.all(
    [...children].map((child) =>
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : once(child, 'exit'),
    ),
  ).finally(() => {
    clearTimeout(timeout);
    server.closeAllConnections();
    process.exit(code);
  });
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
function launch(args, extraEnv = {}) {
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  children.add(child);
  child.once('error', (error) => {
    console.error('Service failed to start:', error.message);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(
        `Service exited (${code ?? signal}); restarting deployment is required.`,
      );
      stop(1);
    }
  });
  return child;
}
// Bootstrapping runs before any HTTP listener or worker can use the schema.
const bootstrap = spawn(
  process.execPath,
  ['--import', 'tsx', 'scripts/runtime/bootstrap.mts'],
  { stdio: 'inherit', env: process.env },
);
children.add(bootstrap);
const [bootstrapCode] = await once(bootstrap, 'exit');
children.delete(bootstrap);
if (bootstrapCode !== 0) process.exit(1);
if (stopping) process.exit(0);
launch(['--import', 'tsx', 'apps/api/src/server.ts'], {
  VERITY_MANAGED_RUNTIME: '1',
  API_PORT: String(apiPort),
  PUBLIC_ORIGIN: publicOrigin,
});
launch(['--import', 'tsx', 'apps/worker/src/main.ts']);
launch([
  'apps/web/node_modules/next/dist/bin/next',
  'start',
  'apps/web',
  '--hostname',
  '127.0.0.1',
  '--port',
  String(webPort),
]);
server.on('error', (error) => {
  console.error('Gateway failed:', error.message);
  stop(1);
});
server.listen(port, '0.0.0.0', () =>
  console.info(`Verity gateway listening on port ${port}.`),
);
