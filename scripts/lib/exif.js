// EXIF 提取。只 pick 需要的字段——GPS 相关字段从源头不请求，绝不进入 manifest。

import exifr from 'exifr';

const PICK = [
  'Make', 'Model', 'LensModel',
  'FocalLength', 'FNumber', 'ExposureTime', 'ISO',
  'DateTimeOriginal', 'CreateDate',
];

const pad = (n) => String(n).padStart(2, '0');

function formatDateTime(d) {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(d) {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function formatExposure(t) {
  if (!Number.isFinite(t) || t <= 0) return null;
  if (t >= 1) return `${Number(t.toFixed(1))}s`;
  return `1/${Math.round(1 / t)}s`;
}

function formatFNumber(f) {
  if (!Number.isFinite(f) || f <= 0) return null;
  return `f/${Number.isInteger(f) ? f : f.toFixed(1)}`;
}

function formatFocal(mm) {
  if (!Number.isFinite(mm) || mm <= 0) return null;
  return `${Math.round(mm)}mm`;
}

// 机身名去重：Make "SONY" + Model "ILCE-7M4" → "SONY ILCE-7M4"；
// Make "Canon" + Model "Canon EOS R5" → "Canon EOS R5"。
function cameraName(make, model) {
  const mk = (make || '').trim();
  const md = (model || '').trim();
  if (!md) return mk || null;
  if (!mk) return md;
  const brand = mk.split(/\s+/)[0].toLowerCase();
  if (md.toLowerCase().includes(brand)) return md;
  return `${mk.split(/\s+/)[0]} ${md}`;
}

/**
 * @param {string} absPath
 * @param {{ mtimeMs: number, birthtimeMs: number }} stat
 */
export async function readExif(absPath, stat) {
  let raw = null;
  try {
    raw = await exifr.parse(absPath, { pick: PICK });
  } catch {
    raw = null; // 无 EXIF（截图、PNG 等）属正常情况
  }
  raw = raw || {};

  let taken = null;
  let timeSource = 'exif';
  if (raw.DateTimeOriginal instanceof Date && !isNaN(raw.DateTimeOriginal)) {
    taken = raw.DateTimeOriginal;
  } else if (raw.CreateDate instanceof Date && !isNaN(raw.CreateDate)) {
    taken = raw.CreateDate;
  } else {
    // 文件时间回退：取 birthtime 与 mtime 中较早者（拷贝文件常把 birthtime 刷新为当下）
    taken = new Date(Math.min(stat.birthtimeMs || Infinity, stat.mtimeMs));
    timeSource = 'file';
  }

  return {
    camera: cameraName(raw.Make, raw.Model),
    lens: (raw.LensModel || '').trim() || null,
    focal: formatFocal(raw.FocalLength),
    fnumber: formatFNumber(raw.FNumber),
    exposure: formatExposure(raw.ExposureTime),
    iso: Number.isFinite(raw.ISO) ? `ISO ${raw.ISO}` : null,
    takenAtMs: taken.getTime(),
    takenAtText: formatDateTime(taken),
    dateText: formatDate(taken),
    timeSource,
  };
}
