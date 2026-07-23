// 图片处理：内容 hash、缩略图/大图生成、HEIC 的 sips 桥接、并发池。
// 输出一律 .rotate() 烘焙方向且不带 metadata —— EXIF/GPS 自动剥离。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { analyzeColor } from './color.js';

const execFileP = promisify(execFile);

const THUMB_WIDTH = 800;
const THUMB_QUALITY = 78;
const LARGE_EDGE = 2048;
const LARGE_QUALITY = 85;

// 流式内容 hash，前 10 位十六进制作为输出文件名（防同名冲突、缓存永久有效）
export function fileHash(absPath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(absPath)
      .on('data', (chunk) => h.update(chunk))
      .on('end', () => resolve(h.digest('hex').slice(0, 10)))
      .on('error', reject);
  });
}

async function outputInfo(filePath) {
  const m = await sharp(filePath).metadata();
  return { width: m.width, height: m.height };
}

/**
 * 处理单张照片：生成 thumb/large 到 cacheImgDir，做颜色分析。
 * 同一内容 hash 的输出文件已存在时跳过重新生成。
 */
// sharp 预编译二进制不含 HEVC 解码。macOS 上用系统自带 sips（原生、快）；
// 其他平台（如 CI 的 Linux）用 heic-decode（纯 wasm、无系统依赖）。
// 环境变量 FORCE_HEIC_WASM=1 可在 macOS 上强制走 wasm 路径（用于测试 CI 行为）。
const USE_SIPS = process.platform === 'darwin' && process.env.FORCE_HEIC_WASM !== '1';

async function decodeHeic(absPath) {
  if (USE_SIPS) {
    const tmp = path.join(os.tmpdir(), `goshiki-heic-${crypto.randomUUID()}.jpg`);
    await execFileP('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '95', absPath, '--out', tmp]);
    return { input: tmp, options: { limitInputPixels: false }, tmp };
  }
  const { default: heicDecode } = await import('heic-decode');
  const { width, height, data } = await heicDecode({ buffer: fs.readFileSync(absPath) });
  return {
    input: Buffer.from(data.buffer ?? data),
    options: { raw: { width, height, channels: 4 }, limitInputPixels: false },
    tmp: null,
  };
}

export async function processImage(absPath, cacheImgDir) {
  const ext = path.extname(absPath).toLowerCase();
  let input = absPath;
  let inputOptions = { limitInputPixels: false };
  let tmp = null;

  if (ext === '.heic' || ext === '.heif') {
    const decoded = await decodeHeic(absPath);
    input = decoded.input;
    inputOptions = decoded.options;
    tmp = decoded.tmp;
  }

  try {
    const hash = await fileHash(absPath); // hash 取原文件内容，与转换产物无关
    const base = sharp(input, inputOptions).rotate();

    const thumbPath = path.join(cacheImgDir, `${hash}-t.jpg`);
    const largePath = path.join(cacheImgDir, `${hash}-l.jpg`);

    let large;
    if (fs.existsSync(largePath)) {
      large = await outputInfo(largePath);
    } else {
      const info = await base
        .clone()
        .resize({ width: LARGE_EDGE, height: LARGE_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: LARGE_QUALITY, mozjpeg: true })
        .toFile(largePath);
      large = { width: info.width, height: info.height };
    }

    let thumb;
    if (fs.existsSync(thumbPath)) {
      thumb = await outputInfo(thumbPath);
    } else {
      const info = await base
        .clone()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
        .toFile(thumbPath);
      thumb = { width: info.width, height: info.height };
    }

    const colorResult = await analyzeColor(base);

    return { hash, thumb, large, colorResult };
  } finally {
    if (tmp) fs.rmSync(tmp, { force: true });
  }
}

// 简单并发池：控制内存峰值（超大全景逐张处理不爆内存）
export async function pool(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      await fn(queue.shift());
    }
  });
  await Promise.all(workers);
}
