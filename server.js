const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.USER_DATA_FILE || path.join(__dirname, 'data', 'users.json');
const SESSION_COOKIE = 'dameisha_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();
let writes = Promise.resolve();

const pages = new Set(['index.html', 'login.html', 'register.html', 'profile.html', 'auth.css', 'auth.js', 'supabase.js']);
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

function cookieOptions(maxAge = SESSION_TTL / 1000) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readSession(request) {
  const cookie = request.headers.cookie || '';
  const token = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const session = token && sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

async function readUsers() {
  try {
    const contents = await fs.readFile(DATA_FILE, 'utf8');
    const users = JSON.parse(contents);
    return Array.isArray(users) ? users : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveUsers(users) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true, mode: 0o700 });
  const tempFile = `${DATA_FILE}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(users, null, 2), { mode: 0o600 });
  await fs.rename(tempFile, DATA_FILE);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 10_000) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

async function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = await scrypt(password, salt, 64);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, Buffer.from(user.salt, 'hex'));
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}

function createSession(response, username) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL });
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; ${cookieOptions()}`);
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/config') {
    return sendJson(response, 200, {
      url: process.env.SUPABASE_URL || '',
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || ''
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/me') {
    const session = readSession(request);
    return sendJson(response, 200, { user: session ? { username: session.username } : null });
  }

  if (request.method === 'POST' && url.pathname === '/api/register') {
    const body = await readBody(request);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
    if (!username) return sendJson(response, 400, { error: '请输入用户名' });
    if (username.length > 32) return sendJson(response, 400, { error: '用户名不能超过 32 个字符' });
    if (!password) return sendJson(response, 400, { error: '请输入密码' });
    if (password.length < 8) return sendJson(response, 400, { error: '密码至少需要 8 个字符' });
    if (password.length > 128) return sendJson(response, 400, { error: '密码不能超过 128 个字符' });
    if (password !== confirmPassword) return sendJson(response, 400, { error: '两次输入的密码不一致' });

    const operation = writes.then(async () => {
      const users = await readUsers();
      if (users.some(user => user.username.toLocaleLowerCase() === username.toLocaleLowerCase())) return false;
      const passwordData = await hashPassword(password);
      users.push({ username, ...passwordData, createdAt: new Date().toISOString() });
      await saveUsers(users);
      return true;
    });
    writes = operation.catch(() => {});
    if (!await operation) return sendJson(response, 409, { error: '用户名已存在' });
    return sendJson(response, 201, { message: '注册成功，请登录' });
  }

  if (request.method === 'POST' && url.pathname === '/api/login') {
    const body = await readBody(request);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) return sendJson(response, 400, { error: '请输入用户名和密码' });
    const users = await readUsers();
    const user = users.find(item => item.username.toLocaleLowerCase() === username.toLocaleLowerCase());
    if (!user) return sendJson(response, 404, { error: '用户不存在' });
    if (!await verifyPassword(password, user)) return sendJson(response, 401, { error: '登录失败，请检查密码' });
    createSession(response, user.username);
    return sendJson(response, 200, { user: { username: user.username } });
  }

  if (request.method === 'POST' && url.pathname === '/api/logout') {
    const session = readSession(request);
    if (session) sessions.delete(session.token);
    return sendJson(response, 200, { message: '已退出登录' }, { 'Set-Cookie': `${SESSION_COOKIE}=; ${cookieOptions(0)}` });
  }

  return sendJson(response, 404, { error: '接口不存在' });
}

function serveStatic(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('Bad Request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  if (pathname.startsWith('/jingdian/')) {
    const assetRoot = path.join(__dirname, 'jingdian');
    const filePath = path.resolve(__dirname, `.${pathname}`);
    if (!filePath.startsWith(`${assetRoot}${path.sep}`)) {
      response.writeHead(404).end('Not Found');
      return;
    }
    fs.readFile(filePath).then(contents => {
      response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      response.end(contents);
    }).catch(() => response.writeHead(404).end('Not Found'));
    return;
  }
  const filename = path.basename(pathname);
  if (!pages.has(filename) || filename !== pathname.slice(1)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
    return;
  }
  const filePath = path.join(__dirname, filename);
  fs.readFile(filePath).then(contents => {
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filename)], 'X-Content-Type-Options': 'nosniff' });
    response.end(contents);
  }).catch(() => response.writeHead(404).end('Not Found'));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
    else serveStatic(request, response, url);
  } catch (error) {
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : '服务暂时不可用' });
    else response.destroy();
  }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => process.stdout.write(`玩转大梅沙本地服务已启动：http://127.0.0.1:${server.address().port}\n`));
}

module.exports = { server, sessions };
