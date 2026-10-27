const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

const frontendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(frontendRoot, '..');
const backendRoot = path.join(projectRoot, 'backend');
const localRoot = path.join(projectRoot, '.local', 'dual-account');
const databasePath = path.join(localRoot, 'mongodb');
const backend = createRequire(path.join(backendRoot, 'package.json'));
const host = '127.0.0.1';
const ports = { frontend: 3010, api: 5001, mongo: 27028 };
const frontendUrl = `http://${host}:${ports.frontend}`;
const apiUrl = `http://${host}:${ports.api}`;
const children = new Set();
let replica;
let stopping = false;

function availablePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${host}:${port} is occupied. Stop that process before starting the local app.`)));
    server.listen(port, host, () => server.close(resolve));
  });
}

function sessionSecrets() {
  const filename = path.join(localRoot, 'session-secrets.json');
  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, JSON.stringify({
      session: randomBytes(48).toString('hex'),
      collaboration: randomBytes(48).toString('hex'),
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  const secrets = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!/^[a-f0-9]{96}$/.test(secrets.session) || !/^[a-f0-9]{96}$/.test(secrets.collaboration) || secrets.session === secrets.collaboration) {
    throw new Error(`Invalid local session secrets in ${filename}. Keep the original file to preserve existing sessions.`);
  }
  return secrets;
}

function systemEnvironment() {
  const allowed = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS|LANG|LC_ALL|TERM)$/i;
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key)));
}

function launch(label, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: 'inherit' });
  children.add(child);
  child.once('error', error => {
    console.error(`${label} failed to start: ${error.message}`);
    void shutdown(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${label} stopped (${signal || code}).`);
      void shutdown(code || 1);
    }
  });
  return child;
}

async function stopChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    // Next starts a worker process, so stop the whole tree owned by this child.
    await new Promise(resolve => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', resolve);
      killer.once('exit', resolve);
    });
  } else {
    child.kill('SIGTERM');
  }
  let timer;
  await Promise.race([closed, new Promise(resolve => { timer = setTimeout(resolve, 15000); })]);
  clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  await Promise.all([...children].map(stopChild));
  if (replica) await replica.stop({ doCleanup: false, force: false });
  console.log(`Local app stopped. Accounts and notes remain in ${databasePath}.`);
}

async function waitForApi() {
  const deadline = Date.now() + 60000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/readyz`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* The API may still be creating its indexes. */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!stopping) throw new Error('The local API did not become ready within 60 seconds.');
}

async function main() {
  await Promise.all(Object.values(ports).map(availablePort));
  if (!fs.existsSync(path.join(backendRoot, 'dist', 'server.js'))) {
    throw new Error('Build the backend first: cd ../backend && npm run build');
  }
  fs.mkdirSync(databasePath, { recursive: true });
  const secrets = sessionSecrets();
  // Reuse the installed binary; this runner never downloads MongoDB at startup.
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
  const { MongoMemoryReplSet } = backend('mongodb-memory-server');
  replica = new MongoMemoryReplSet({
    binary: { version: '8.0.16' },
    instanceOpts: [{ port: ports.mongo, dbPath: databasePath }],
    replSet: {
      count: 1,
      name: 'thyncspace-local',
      ip: host,
      storageEngine: 'wiredTiger',
      spawn: { windowsHide: true },
    },
  });
  // A persisted replica must use the same address on every run.
  const instanceOptions = replica.getInstanceOpts.bind(replica);
  replica.getInstanceOpts = (...args) => ({ ...instanceOptions(...args), portGeneration: false });
  await replica.start();
  if (stopping) {
    await replica.stop({ doCleanup: false, force: false });
    return;
  }
  const sharedEnv = {
    ...systemEnvironment(),
    NODE_ENV: 'development',
    ENVIRONMENT: 'development',
    DOTENV_CONFIG_PATH: os.devNull,
    DOTENV_CONFIG_QUIET: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  launch('API', [path.join(backendRoot, 'dist', 'server.js')], backendRoot, {
    ...sharedEnv,
    HOST: host,
    PORT: String(ports.api),
    CLIENT_URL: frontendUrl,
    MONGO_CONN: replica.getUri(),
    MONGO_AUTH_MODE: 'password',
    MONGO_DB_NAME: 'thyncspace_dual_account',
    SESSION_SECRET: secrets.session,
    COLLABORATION_SECRET: secrets.collaboration,
    REGISTRATION_ENABLED: 'true',
    REQUIRE_VERIFIED_EMAIL: 'false',
    CSRF_MODE: 'token',
    GOOGLE_AUTH_CLIENT_ID: 'local-disabled',
    GOOGLE_AUTH_CLIENT_SECRET: 'local-disabled',
    GOOGLE_CALLBACK_URL: `${apiUrl}/auth/google/callback`,
    REDIS_URL: '',
    SMTP_HOST: '',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    MAIL_FROM: '',
    TURNSTILE_SITE_KEY: '',
    TURNSTILE_SECRET_KEY: '',
    AI_ACTIONS_ENABLED: 'false',
    OPENAI_API_KEY: '',
    OPENAI_AI_MODEL: '',
  });
  await waitForApi();
  if (stopping) return;
  for (const script of ['prepare-pdf.cjs', 'prepare-ocr.cjs', 'prepare-companion.cjs']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: frontendRoot,
      env: sharedEnv,
      windowsHide: true,
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0) throw new Error(`Frontend asset preparation failed: ${script}`);
  }
  launch('Frontend', [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', host, '--port', String(ports.frontend)], frontendRoot, {
    ...sharedEnv,
    NEXT_PUBLIC_SERVER_URL: apiUrl,
  });
  console.log(`\nLocal app: ${frontendUrl}\nLocal API: ${apiUrl}\nDatabase: ${databasePath}`);
  console.log('Sign up in Chrome, then use an Incognito window for the second account. Share using usernames.');
  console.log('Press Ctrl+C to stop. Accounts, notes and local session secrets are kept for the next run.\n');
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
main().catch(async error => {
  console.error(error.message);
  await shutdown(1);
});
