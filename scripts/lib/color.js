// 主色调分类：把照片归入 红/蓝/黄/绿/灰 五桶。
// 所有可调阈值集中在下面的常量区；调参依据 `npm run build -- --report`
// 生成的 dist/_debug/colors.html 网格页。

export const COLORS = ['red', 'blue', 'yellow', 'green', 'gray'];

// 五色页采用日本传统色命名；fg 是该色块上文字的颜色（按对比度选定）
export const COLOR_META = {
  red:    { kanji: '茜',   kana: 'あかね',   zh: '红', hex: '#B7282E', fg: '#F7F5F0' },
  blue:   { kanji: '藍',   kana: 'あい',     zh: '蓝', hex: '#165E83', fg: '#F7F5F0' },
  yellow: { kanji: '山吹', kana: 'やまぶき', zh: '黄', hex: '#F8B500', fg: '#2B2B2B' },
  green:  { kanji: '松葉', kana: 'まつば',   zh: '绿', hex: '#839B5C', fg: '#F7F5F0' },
  gray:   { kanji: '鼠',   kana: 'ねずみ',   zh: '灰', hex: '#949495', fg: '#2B2B2B' },
};

// ---- 可调参数 ----
const SAMPLE_SIZE = 64;          // 缩小到 64×64 采样
const NEUTRAL_SAT = 0.18;        // 饱和度低于此值归中性（灰）
const NEUTRAL_L_LOW = 0.12;      // 明度极暗归中性
const NEUTRAL_L_HIGH = 0.93;     // 明度极亮归中性
const GRAY_NEUTRAL_RATIO = 0.72; // 中性像素占比超过此值 → 整图归灰
const GRAY_MIN_COLOR_WEIGHT = 0.04; // 彩色总权重/像素数低于此值 → 整图归灰
const LOW_CONFIDENCE = 0.45;     // 最高桶占彩色得分比低于此值 → 标记低置信度

// 色相区间（度）。紫/品红在 315° 切开：蓝紫（紫藤、绣球）归蓝，品红/樱花粉归红。
// 红的上界取 25°，确保鸟居/神社的朱色（约 10–25°）归红。
function hueBucket(h) {
  if (h < 25 || h >= 315) return 'red';
  if (h < 70) return 'yellow';   // 含橙——落日、银杏、灯笼暖光，与「山吹」（金橙色）自洽
  if (h < 170) return 'green';
  return 'blue';                 // 含青与蓝紫——「藍」的语感本就涵盖青
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

/**
 * 对一个 sharp 实例做主色调分析。
 * @returns {{ color: string, pct: Record<string, number>, neutralRatio: number,
 *             lowConfidence: boolean, avgColor: string }}
 */
export async function analyzeColor(sharpImage) {
  const { data, info } = await sharpImage
    .clone()
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const scores = { red: 0, yellow: 0, green: 0, blue: 0 };
  let neutral = 0;
  let sumR = 0, sumG = 0, sumB = 0;
  const pixels = info.width * info.height;

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    sumR += r; sumG += g; sumB += b;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < NEUTRAL_SAT || l < NEUTRAL_L_LOW || l > NEUTRAL_L_HIGH) {
      neutral++;
      continue;
    }
    scores[hueBucket(h)] += s; // 饱和度加权
  }

  const toHex = (v) => Math.round(v / pixels).toString(16).padStart(2, '0');
  const avgColor = `#${toHex(sumR)}${toHex(sumG)}${toHex(sumB)}`;

  const neutralRatio = neutral / pixels;
  const totalColor = scores.red + scores.yellow + scores.green + scores.blue;

  const pct = {};
  for (const k of Object.keys(scores)) {
    pct[k] = totalColor > 0 ? scores[k] / totalColor : 0;
  }

  if (neutralRatio > GRAY_NEUTRAL_RATIO || totalColor / pixels < GRAY_MIN_COLOR_WEIGHT) {
    return { color: 'gray', pct, neutralRatio, lowConfidence: false, avgColor };
  }

  let best = 'red';
  for (const k of Object.keys(scores)) {
    if (scores[k] > scores[best]) best = k;
  }
  return {
    color: best,
    pct,
    neutralRatio,
    lowConfidence: pct[best] < LOW_CONFIDENCE,
    avgColor,
  };
}
