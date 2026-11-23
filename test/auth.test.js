const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

let processHandle;
let baseUrl;
let tempDir;
let cookie;

before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dameisha-auth-'));
  const serverPath = path.join(__dirname, '..', 'server.js');
  processHandle = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: '0', USER_DATA_FILE: path.join(tempDir, 'users.json') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = await new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('Server did not start')), 5000);
    processHandle.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const match = buffer.match(/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    processHandle.once('error', reject);
    processHandle.stderr.on('data', chunk => { buffer += chunk.toString(); });
  });
  baseUrl = `http://127.0.0.1:${output}`;
});

after(async () => {
  if (processHandle && processHandle.exitCode === null) processHandle.kill();
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

async function post(endpoint, body, headers = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  return { response, data: await response.json() };
}

test('registration validates input and rejects duplicate usernames', async () => {
  const mismatch = await post('/api/register', { username: 'coast-user', password: 'password-123', confirmPassword: 'different' });
  assert.equal(mismatch.response.status, 400);
  const first = await post('/api/register', { username: 'coast-user', password: 'password-123', confirmPassword: 'password-123' });
  assert.equal(first.response.status, 201);
  const duplicate = await post('/api/register', { username: 'COAST-USER', password: 'password-123', confirmPassword: 'password-123' });
  assert.equal(duplicate.response.status, 409);
  const users = JSON.parse(await fs.readFile(path.join(tempDir, 'users.json'), 'utf8'));
  assert.equal(users.length, 1);
  assert.notEqual(users[0].hash, 'password-123');
});

test('login distinguishes unknown users and wrong passwords, then creates a session', async () => {
  const missing = await post('/api/login', { username: 'unknown-user', password: 'password-123' });
  assert.equal(missing.response.status, 404);
  assert.equal(missing.data.error, '用户不存在');
  const wrong = await post('/api/login', { username: 'coast-user', password: 'wrong-password' });
  assert.equal(wrong.response.status, 401);
  assert.equal(wrong.data.error, '登录失败，请检查密码');
  const valid = await post('/api/login', { username: 'coast-user', password: 'password-123' });
  assert.equal(valid.response.status, 200);
  cookie = valid.response.headers.get('set-cookie').split(';')[0];
  assert.match(valid.response.headers.get('set-cookie'), /HttpOnly/);
  const me = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: cookie } });
  assert.deepEqual((await me.json()).user, { username: 'coast-user' });
});

test('logout clears the session and serves the existing home page', async () => {
  const result = await post('/api/logout', {}, { Cookie: cookie });
  assert.equal(result.response.status, 200);
  const me = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: cookie } });
  assert.equal((await me.json()).user, null);
  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /spotGrid/);
});
