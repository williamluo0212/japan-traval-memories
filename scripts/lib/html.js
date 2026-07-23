// 页面生成：首页 + 五个颜色页 + 调参页，全部由模板字符串产出。
// 照片元数据以 data-* 属性内联在 HTML 上，灯箱零运行时请求。

import { COLORS, COLOR_META } from './color.js';

const SITE_TITLE = '五色';
const SITE_KANA = 'ごしき';
const SITE_SUB_ZH = '无尽夏';
const SITE_SUB_JA = '終わらぬ夏';

const esc = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function exifLine(exif) {
  return [exif.camera, exif.lens, exif.focal, exif.fnumber, exif.exposure, exif.iso]
    .filter(Boolean)
    .join(' · ');
}

function head(title, prefix) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${prefix}assets/style.css">
</head>`;
}

function header(prefix, current) {
  const links = COLORS.map((c) => {
    const m = COLOR_META[c];
    const cls = c === current ? ' class="is-current"' : '';
    return `<a href="${prefix}${c}/index.html"${cls} style="--accent:${m.hex}" title="${m.zh} / ${m.kana}">${m.kanji}</a>`;
  }).join('\n      ');
  const upCls = current === 'upload' ? ' is-current' : '';
  return `<header class="site-head">
    <a class="brand" href="${prefix}index.html"><ruby>${SITE_TITLE}<rt>${SITE_KANA}</rt></ruby></a>
    <nav class="color-nav" aria-label="按颜色浏览 / 色でみる">
      ${links}
      <span class="nav-sep" aria-hidden="true"></span>
      <a href="${prefix}upload/index.html" class="nav-upload${upCls}" title="来访者投稿 / ご投稿">投稿</a>
    </nav>
  </header>`;
}

const footer = `<footer class="site-foot">${SITE_TITLE} — ${SITE_SUB_ZH}<span lang="ja">${SITE_SUB_JA}</span></footer>`;

// 每个色块挑「主题色最鲜明」的一张照片做背景：
// 彩色桶取 该色占比 ×（1 − 中性占比）最高者；灰桶取中性占比最高者
function featuredFor(color, list) {
  if (!list || list.length === 0) return null;
  const score = (e) =>
    color === 'gray' ? (e.neutralRatio || 0) : (e.pct?.[color] || 0) * (1 - (e.neutralRatio || 0));
  return list.reduce((a, b) => (score(b) > score(a) ? b : a));
}

/**
 * 首页：站名 + 副题 + 五色分屏（点击色块直达对应颜色页）
 * @param {Record<string, Array>} byColor 每色按时间升序的照片数组
 */
export function renderHome(byColor) {
  const stripes = COLORS.map((c) => {
    const m = COLOR_META[c];
    const list = byColor[c] || [];
    const feat = featuredFor(c, list);
    // background-image 必须写在行内样式：相对 URL 按页面地址解析（放进 CSS 变量的话，
    // 各浏览器对解析基准的实现不一致，会 404）
    const photoVars = feat
      ? `;background-image:linear-gradient(color-mix(in srgb, ${m.hex} 45%, transparent), color-mix(in srgb, ${m.hex} 45%, transparent)),linear-gradient(rgb(0 0 0 / 0) 55%, rgb(0 0 0 / 0.35)),url('img/thumb/${feat.hash}-t.jpg')`
      : '';
    const fg = feat ? '#F7F5F0' : m.fg;
    return `      <a class="stripe${feat ? ' st-photo' : ''}" href="${c}/index.html" style="--sc:${m.hex};--fg:${fg}${photoVars}" title="${m.zh} / ${m.kana}">
        <span class="st-label"><span class="st-kanji">${m.kanji}</span><span class="st-kana" lang="ja">${m.kana}</span></span>
        <span class="st-count">${list.length}<span class="st-unit">枚</span></span>
      </a>`;
  }).join('\n');

  return `${head(`${SITE_TITLE} ${SITE_KANA} — ${SITE_SUB_ZH}`, '')}
<body class="page-home">
  <a class="corner-upload" href="upload/index.html" title="来访者投稿 / ご投稿">投稿</a>
  <main class="home">
    <header class="home-head">
      <h1 class="site-title"><ruby>${SITE_TITLE}<rt>${SITE_KANA}</rt></ruby></h1>
      <p class="site-sub">${SITE_SUB_ZH}<span lang="ja">${SITE_SUB_JA}</span></p>
    </header>
    <nav class="stripes" aria-label="按颜色进入 / 色から入る">
${stripes}
    </nav>
  </main>
</body>
</html>
`;
}

/**
 * 颜色页：左侧竖排标题 + 时间升序照片网格 + 灯箱
 */
export function renderColorPage(color, entries) {
  const m = COLOR_META[color];
  const prefix = '../';

  const figures = entries.map((e, i) => {
    const line = exifLine(e.exif);
    const note = e.exif.timeSource === 'file' ? '<span class="cap-note" title="※ 文件时间 / ファイル日時">※</span>' : '';
    const subBadge = e.submitted ? '<span class="cap-sub" title="来访者投稿 / ご投稿">投稿</span>' : '';
    return `      <figure class="ph">
        <a class="ph-link" href="#p=${e.hash}" data-id="${e.hash}" data-idx="${i}" data-sub="${e.submitted ? 1 : 0}"
           data-large="${prefix}img/large/${e.hash}-l.jpg" data-w="${e.large.width}" data-h="${e.large.height}"
           data-exif="${esc(line)}" data-date="${esc(e.exif.takenAtText)}" data-timesource="${e.exif.timeSource}">
          <img src="${prefix}img/thumb/${e.hash}-t.jpg" width="${e.thumb.width}" height="${e.thumb.height}"
               alt="${esc(e.exif.dateText)} 摄" loading="lazy"
               style="aspect-ratio:${e.thumb.width} / ${e.thumb.height};background:${e.avgColor}">
        </a>
        <figcaption>${esc(e.exif.dateText)}${note}${subBadge}</figcaption>
      </figure>`;
  }).join('\n');

  const main = entries.length > 0
    ? `<main class="grid">\n${figures}\n    </main>`
    : `<main class="grid grid-empty"><p class="empty">暂无照片<span lang="ja">まだ写真がありません</span></p></main>`;

  return `${head(`${m.kanji} ${m.kana} · ${m.zh} — ${SITE_TITLE}`, prefix)}
<body class="page-color" data-color="${color}" style="--accent:${m.hex}">
  ${header(prefix, color)}
  <aside class="vertical-title" aria-hidden="true">
    <span class="vt-kanji">${m.kanji}</span><span class="vt-kana" lang="ja">${m.kana}</span>
  </aside>
  ${main}
  ${footer}
  <dialog id="lightbox" class="lightbox" aria-label="照片查看 / 写真ビューア">
    <button class="lb-close" aria-label="关闭 / 閉じる">×</button>
    <button class="lb-prev" aria-label="上一张 / 前へ">‹</button>
    <button class="lb-next" aria-label="下一张 / 次へ">›</button>
    <figure class="lb-body">
      <img class="lb-img" alt="">
      <figcaption class="lb-meta">
        <span class="lb-exif"></span>
        <span class="lb-date"></span>
      </figcaption>
    </figure>
  </dialog>
  <script src="${prefix}assets/masonry.js" defer></script>
  <script src="${prefix}assets/lightbox.js" defer></script>
</body>
</html>
`;
}

/**
 * 投稿页 /upload/：访客上传照片 → Cloudflare Worker → GitHub PR → 摄影师审核。
 * upload.config.json 未填 workerUrl / turnstileSiteKey 时显示「准备中」。
 */
export function renderUpload(config) {
  const prefix = '../';
  const ready = Boolean(config?.workerUrl && config?.turnstileSiteKey);

  const form = ready
    ? `    <form id="up-form" class="up-form" data-worker="${esc(config.workerUrl)}">
      <label class="drop" id="drop">
        <input type="file" id="up-file" accept=".jpg,.jpeg,.png,.webp,.heic" hidden>
        <img id="up-preview" class="up-preview" alt="" hidden>
        <span class="drop-hint">拖拽或点击选择照片<span lang="ja">ドラッグまたはクリックで選択</span></span>
        <span class="drop-sub">JPEG / PNG / WebP / HEIC · 20MB 以内</span>
      </label>
      <div class="cf-turnstile" data-sitekey="${esc(config.turnstileSiteKey)}"></div>
      <button type="submit" class="up-btn" disabled>提交<span lang="ja">送信</span></button>
      <p id="up-msg" class="up-msg" role="status"></p>
    </form>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <script src="${prefix}assets/upload.js" defer></script>`
    : `    <p class="empty">投稿受付准备中<span lang="ja">投稿受付は準備中です</span></p>`;

  return `${head(`投稿 · ご投稿 — ${SITE_TITLE}`, prefix)}
<body class="page-upload">
  ${header(prefix, 'upload')}
  <main class="upload">
    <h1 class="up-title"><ruby>投稿<rt>とうこう</rt></ruby></h1>
    <p class="up-sub">把你在日本拍下的一张照片交给我们<span lang="ja">あなたの日本の一枚をどうぞ</span></p>
${form}
    <p class="up-note">照片将经摄影师确认后，按主色调进入对应颜色的页面<span lang="ja">確認ののち、色のページに掲載されます</span></p>
  </main>
  ${footer}
</body>
</html>
`;
}

/**
 * 调参页 dist/_debug/colors.html：全部照片的分类结果网格，人工扫一眼即可发现误分类
 */
export function renderReport(entries) {
  const prefix = '../';
  const cells = entries.map((e) => {
    const bars = ['red', 'yellow', 'green', 'blue'].map((c) => {
      const p = Math.round((e.pct[c] || 0) * 100);
      return `<div class="bar"><i style="width:${p}%;background:${COLOR_META[c].hex}"></i><b>${COLOR_META[c].zh} ${p}%</b></div>`;
    }).join('');
    const badge = (c) => `<b style="color:${COLOR_META[c].hex}">${COLOR_META[c].kanji}·${COLOR_META[c].zh}</b>`;
    const flags = [
      e.forced ? '<i class="flag">手动指定</i>' : '',
      e.lowConfidence ? '<i class="flag warn">低置信度</i>' : '',
    ].join('');
    return `<div class="cell">
      <img src="${prefix}img/thumb/${e.hash}-t.jpg" loading="lazy" style="background:${e.avgColor}">
      <p>最终 ${badge(e.finalColor)} ｜ 自动 ${badge(e.autoColor)} ${flags}</p>
      <p>中性 ${Math.round(e.neutralRatio * 100)}%</p>
      ${bars}
      <p class="path">${esc(e.relPath)}</p>
    </div>`;
  }).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>颜色分类调参 — ${SITE_TITLE}</title>
<style>
body{font:13px/1.6 -apple-system,'PingFang SC',sans-serif;margin:24px;background:#fafafa;color:#333}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}
.cell{background:#fff;border:1px solid #e5e5e5;padding:10px}
.cell img{width:100%;height:160px;object-fit:cover;display:block}
.cell p{margin:6px 0 2px}
.bar{position:relative;height:14px;background:#f0f0f0;margin:2px 0}
.bar i{position:absolute;inset:0 auto 0 0;display:block}
.bar b{position:relative;font-weight:400;font-size:11px;padding-left:4px}
.flag{font-style:normal;font-size:11px;border:1px solid #999;padding:0 4px;margin-left:6px}
.flag.warn{color:#b00;border-color:#b00}
.path{color:#999;font-size:11px;word-break:break-all}
</style>
</head>
<body>
<h1>颜色分类调参（${entries.length} 张）</h1>
<p>误分类的照片：把它拖进 photos/red|blue|yellow|green|gray/ 子文件夹即可手动指定颜色。</p>
<div class="grid">
${cells}
</div>
</body>
</html>
`;
}
