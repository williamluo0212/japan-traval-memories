// 本地预览：构建 → http 伺服 dist/ → 监听 photos/ 与 site/ → 增量重建 → SSE 自动刷新。
// 「一步上传」的闭环：拖照片进 photos/，数秒后浏览器自动出现新照片。

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PHOTOS = path.join(ROOT, 'photos');
const SITE = path.join(ROOT, 'site');

const BASE_PORT = Number(process.env.PORT) || 4321;
const DEBOUNCE_MS = 500;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

// SSE 客户端脚本：伺服 HTML 时动态注入，dist 本身保持纯净可部署
const SSE_SNIPPET = `<script>(()=>{new EventSource('/__events').addEventListener('reload',()=>location.reload())})();</script>`;

const sseClients = new Set();

function serve(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/__events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // 解析路径并防目录穿越
  let filePath = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let stat = null;
  try {
    stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = fs.statSync(filePath);
    }
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — 未找到 / 見つかりません');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  if (ext === '.html') {
    const html = fs.readFileSync(filePath, 'utf8').replace('</body>', `${SSE_SNIPPET}</body>`);
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' }).end(html);
  } else {
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache', 'Content-Length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  }
}

function broadcastReload() {
  for (const res of sseClients) res.write('event: reload\ndata: 1\n\n');
}

// 防抖 + 防并发的重建
let timer = null;
let building = false;
let queued = false;

async function rebuild() {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  try {
    await build();
    broadcastReload();
  } catch (err) {
    console.error('构建出错：', err.message);
  } finally {
    building = false;
    if (queued) {
      queued = false;
      rebuild();
    }
  }
}

function onChange(what) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`· 检测到${what}变化，重新构建…`);
    rebuild();
  }, DEBOUNCE_MS);
}

async function main() {
  console.log('首次构建…');
  await build();

  fs.watch(PHOTOS, { recursive: true }, () => onChange('照片'));
  fs.watch(SITE, { recursive: true }, () => onChange('样式'));

  const server = http.createServer(serve);
  // 心跳防止代理断开 SSE
  setInterval(() => {
    for (const res of sseClients) res.write(': ping\n\n');
  }, 30000).unref();

  const listen = (port, attempt = 0) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempt < 10) listen(port + 1, attempt + 1);
      else throw err;
    });
    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log('');
      console.log(`  ▷ 本地预览：${url}`);
      console.log('  把照片拖进 photos/ 文件夹，页面会自动刷新出现新照片。');
      console.log('  想手动指定颜色：把照片拖进 photos/red|blue|yellow|green|gray/ 即可。');
      console.log('');
      // 双击「启动网站.command」时自动打开浏览器
      if (process.env.OPEN_BROWSER === '1') {
        import('node:child_process').then(({ spawn }) => {
          spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
        });
      }
    });
  };
  listen(BASE_PORT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
