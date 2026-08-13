// 构建主入口：扫描 → 增量判定 → EXIF/缩略图/颜色（仅新照片）→ 生成页面。
// 昂贵产物存 .cache/，构建时硬链接进 dist/ —— dist 可随时整删重建而不重新缩图。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanPhotos } from './lib/scan.js';
import { readExif } from './lib/exif.js';
import { processImage, pool } from './lib/thumbs.js';
import { COLORS, COLOR_META } from './lib/color.js';
import { renderHome, renderColorPage, renderReport, renderUpload } from './lib/html.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS = path.join(ROOT, 'photos');
const CACHE = path.join(ROOT, '.cache');
const CACHE_IMG = path.join(CACHE, 'img');
const MANIFEST = path.join(CACHE, 'manifest.json');
const DIST = path.join(ROOT, 'dist');
const SITE = path.join(ROOT, 'site');

const CONCURRENCY = 4;

export async function build({ report = false, quiet = false } = {}) {
  const t0 = Date.now();
  const log = quiet ? () => {} : console.log;

  for (const c of COLORS) fs.mkdirSync(path.join(PHOTOS, c), { recursive: true });
  fs.mkdirSync(path.join(PHOTOS, 'submissions'), { recursive: true });
  fs.mkdirSync(CACHE_IMG, { recursive: true });
  fs.mkdirSync(path.join(DIST, 'img', 'thumb'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'img', 'large'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });

  const { photos, skippedRaw, ignored } = scanPhotos(PHOTOS);

  // 输出格式变更（如 JPEG → AVIF）时递增此版本，使旧缓存整体失效重建
  const CACHE_VERSION = 2;
  let manifest = { version: CACHE_VERSION, photos: {} };
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch { /* 首次构建无缓存 */ }
  if (manifest.version !== CACHE_VERSION) {
    manifest = { version: CACHE_VERSION, photos: {} };
  }

  // 增量判定：key = size + mtime，命中直接复用缓存条目
  const next = {};
  const toProcess = [];
  for (const p of photos) {
    const key = `${p.size}:${Math.round(p.mtimeMs)}`;
    const prev = manifest.photos[p.relPath];
    if (prev && prev.key === key) {
      next[p.relPath] = { ...prev, forcedColor: p.forcedColor, submitted: p.submitted };
    } else {
      toProcess.push({ p, key });
    }
  }

  // 昂贵路径：只对新增/修改的照片执行；单张失败绝不中断整次构建
  const failures = [];
  await pool(toProcess, CONCURRENCY, async ({ p, key }) => {
    try {
      const exif = await readExif(p.absPath, p);
      const img = await processImage(p.absPath, CACHE_IMG);
      next[p.relPath] = {
        key,
        hash: img.hash,
        thumb: img.thumb,
        large: img.large,
        exif,
        autoColor: img.colorResult.color,
        pct: img.colorResult.pct,
        neutralRatio: img.colorResult.neutralRatio,
        lowConfidence: img.colorResult.lowConfidence,
        avgColor: img.colorResult.avgColor,
        forcedColor: p.forcedColor,
        submitted: p.submitted,
      };
    } catch (err) {
      failures.push(`${p.relPath}：${err.message}`);
    }
  });

  const entries = Object.entries(next).map(([relPath, e]) => ({
    relPath,
    ...e,
    finalColor: e.forcedColor || e.autoColor,
    forced: Boolean(e.forcedColor),
  }));

  // 重复照片提示（内容完全相同的两份）
  const byHash = new Map();
  for (const e of entries) {
    if (!byHash.has(e.hash)) byHash.set(e.hash, []);
    byHash.get(e.hash).push(e.relPath);
  }
  const duplicates = [...byHash.values()].filter((v) => v.length > 1);

  // 分桶 → 桶内按拍摄时间升序
  const byColor = {};
  for (const c of COLORS) byColor[c] = [];
  for (const e of entries) byColor[e.finalColor].push(e);
  for (const c of COLORS) {
    byColor[c].sort((a, b) => a.exif.takenAtMs - b.exif.takenAtMs || a.relPath.localeCompare(b.relPath));
  }

  // 孤儿清理：已删除照片的缓存图
  const wanted = new Set(entries.flatMap((e) => [`${e.hash}-t.avif`, `${e.hash}-l.avif`]));
  for (const f of fs.readdirSync(CACHE_IMG)) {
    if (!wanted.has(f)) fs.rmSync(path.join(CACHE_IMG, f), { force: true });
  }

  // dist 图片 = 缓存图的硬链接（缓存文件名是内容 hash，inode 稳定，链接可安全复用）
  const syncLinks = (kind, suffix) => {
    const dir = path.join(DIST, 'img', kind);
    const want = new Set(entries.map((e) => `${e.hash}${suffix}`));
    for (const f of fs.readdirSync(dir)) {
      if (!want.has(f)) fs.rmSync(path.join(dir, f), { force: true });
    }
    for (const name of want) {
      const dst = path.join(dir, name);
      if (!fs.existsSync(dst)) fs.linkSync(path.join(CACHE_IMG, name), dst);
    }
  };
  syncLinks('thumb', '-t.avif');
  syncLinks('large', '-l.avif');

  // 前端资源 + 页面
  for (const f of fs.readdirSync(SITE)) {
    fs.copyFileSync(path.join(SITE, f), path.join(DIST, 'assets', f));
  }
  fs.writeFileSync(path.join(DIST, 'index.html'), renderHome(byColor));
  for (const c of COLORS) {
    fs.mkdirSync(path.join(DIST, c), { recursive: true });
    fs.writeFileSync(path.join(DIST, c, 'index.html'), renderColorPage(c, byColor[c]));
  }
  // 投稿页：upload.config.json 填好 Worker 地址和 Turnstile key 后才开放表单
  let uploadConfig = null;
  try {
    uploadConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'upload.config.json'), 'utf8'));
  } catch { /* 未配置时页面显示「准备中」 */ }
  fs.mkdirSync(path.join(DIST, 'upload'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'upload', 'index.html'), renderUpload(uploadConfig));
  if (report) {
    fs.mkdirSync(path.join(DIST, '_debug'), { recursive: true });
    const sorted = [...entries].sort(
      (a, b) => Number(b.lowConfidence) - Number(a.lowConfidence) || a.finalColor.localeCompare(b.finalColor),
    );
    fs.writeFileSync(path.join(DIST, '_debug', 'colors.html'), renderReport(sorted));
  }

  fs.writeFileSync(MANIFEST, JSON.stringify({ version: CACHE_VERSION, photos: next }));

  // 构建日志（写给摄影师看）
  const processed = toProcess.length - failures.length;
  const cached = photos.length - toProcess.length;
  const lowConf = entries.filter((e) => e.lowConfidence && !e.forced);
  log(`✓ 构建完成（${((Date.now() - t0) / 1000).toFixed(1)}s）：共 ${entries.length} 张｜新处理 ${processed} 张｜缓存命中 ${cached} 张`);
  log(`  ${COLORS.map((c) => `${COLOR_META[c].kanji}${COLOR_META[c].zh} ${byColor[c].length}`).join('｜')}`);
  if (lowConf.length > 0) {
    log(`  ⚠ ${lowConf.length} 张颜色归类置信度较低，建议核对（不满意可拖进对应颜色文件夹）：`);
    for (const e of lowConf) log(`    - ${e.relPath} → ${COLOR_META[e.finalColor].zh}`);
  }
  if (skippedRaw.length > 0) {
    log(`  ⚠ 跳过 ${skippedRaw.length} 个 RAW 文件（RAW 直出不代表你的后期意图，请放入导出后的 JPEG）：`);
    for (const f of skippedRaw) log(`    - ${f}`);
  }
  for (const d of duplicates) log(`  ⚠ 内容完全相同的照片放了多份：${d.join('、')}`);
  for (const f of failures) log(`  ✗ 处理失败：${f}`);
  if (ignored.length > 0) log(`  · 已忽略非照片文件/目录：${ignored.join('、')}`);
  if (report) log(`  · 调参页：dist/_debug/colors.html`);

  return { total: entries.length, processed, cached, failures };
}

// CLI 入口（也可被 dev.js 作为模块调用）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build({ report: process.argv.includes('--report') }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
