// 扫描 photos/ 目录。
// 根目录的照片 → 自动颜色归类；photos/red|blue|yellow|green|gray/ 子目录 → 强制指定颜色；
// photos/submissions/ → 访客投稿（自动归类，页面上带「投稿」标注）。

import fs from 'node:fs';
import path from 'node:path';
import { COLORS } from './color.js';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const RAW_EXTS = new Set(['.arw', '.cr2', '.cr3', '.nef', '.dng', '.raf', '.orf', '.rw2', '.pef']);

export function scanPhotos(photosDir) {
  const photos = [];
  const skippedRaw = [];
  const ignored = [];

  const visit = (dir, forcedColor, submitted = false) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const abs = path.join(dir, ent.name);
      const rel = path.relative(photosDir, abs);
      if (ent.isDirectory()) {
        if (forcedColor === null && !submitted && COLORS.includes(ent.name)) visit(abs, ent.name);
        else if (forcedColor === null && !submitted && ent.name === 'submissions') visit(abs, null, true);
        else ignored.push(rel + '/');
        continue;
      }
      const ext = path.extname(ent.name).toLowerCase();
      if (RAW_EXTS.has(ext)) {
        skippedRaw.push(rel);
        continue;
      }
      if (!IMAGE_EXTS.has(ext)) {
        ignored.push(rel);
        continue;
      }
      const stat = fs.statSync(abs);
      photos.push({
        relPath: rel,
        absPath: abs,
        forcedColor,
        submitted,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        birthtimeMs: stat.birthtimeMs,
      });
    }
  };

  visit(photosDir, null);
  return { photos, skippedRaw, ignored };
}
