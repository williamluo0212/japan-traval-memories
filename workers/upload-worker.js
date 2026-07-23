// 投稿接收 Worker：校验 → Turnstile 人机验证 → 在 GitHub 仓库开一个 PR。
// 摄影师在 GitHub 里合并 PR = 审核通过（自动触发构建发布），关闭 = 拒绝。
//
// 需要配置（Cloudflare 控制台 → Worker → Settings）：
//   Secrets（加密）：GITHUB_TOKEN（细粒度 PAT，仅本仓库 Contents+Pull requests 读写）
//                    TURNSTILE_SECRET（Turnstile 的 Secret Key）
//   Variables（明文）：REPO = "williamluo0212/japan-traval-memories"
//                      ALLOWED_ORIGIN = "https://williamluo0212.github.io"
//   可选绑定：KV 命名空间绑定为 RATE（启用后每 IP 每天限 5 次投稿）

const MAX_BYTES = 20 * 1024 * 1024;
const DAILY_LIMIT = 5;

// 按文件头（magic bytes）识别真实格式，不信任扩展名
function sniff(bytes) {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'heic'; // ISO-BMFF ftyp
  return null;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function json(status, ok, message, origin) {
  return new Response(JSON.stringify({ ok, message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
    },
  });
}

async function gh(env, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'goshiki-upload-worker',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    if (request.method !== 'POST') return json(405, false, 'Method not allowed', origin);

    const reqOrigin = request.headers.get('Origin');
    if (env.ALLOWED_ORIGIN && reqOrigin && reqOrigin !== env.ALLOWED_ORIGIN) {
      return json(403, false, '来源不允许 / 許可されていないオリジン', origin);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // 可选的每 IP 限频（绑定 KV 命名空间 RATE 后生效）
    if (env.RATE) {
      const key = `up:${ip}:${new Date().toISOString().slice(0, 10)}`;
      const used = Number((await env.RATE.get(key)) || 0);
      if (used >= DAILY_LIMIT) {
        return json(429, false, '今天的投稿次数已达上限，请明天再来 / 本日の上限に達しました', origin);
      }
      await env.RATE.put(key, String(used + 1), { expirationTtl: 86400 });
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return json(400, false, '请求格式错误', origin);
    }

    // Turnstile 人机验证
    const token = form.get('cf-turnstile-response');
    if (!token) return json(400, false, '请先完成人机验证 / 認証を完了してください', origin);
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    }).then((r) => r.json());
    if (!verify.success) return json(403, false, '人机验证未通过 / 認証に失敗しました', origin);

    const file = form.get('file');
    if (!(file instanceof File)) return json(400, false, '未收到文件', origin);
    if (file.size > MAX_BYTES) return json(413, false, '文件超过 20MB / 20MBを超えています', origin);
    if (file.size < 1024) return json(400, false, '文件过小，疑似无效', origin);

    const buf = await file.arrayBuffer();
    const ext = sniff(new Uint8Array(buf.slice(0, 16)));
    if (!ext) return json(415, false, '仅支持 JPEG / PNG / WebP / HEIC', origin);

    // 文件名：时间戳 + 随机段 + 清洗后的原名，防冲突防注入
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const rand = crypto.randomUUID().slice(0, 6);
    const safeBase = (file.name || 'photo')
      .replace(/\.[^.]*$/, '')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 40) || 'photo';
    const path = `photos/submissions/${stamp}-${rand}-${safeBase}.${ext}`;

    try {
      const repo = `/repos/${env.REPO}`;
      const ref = await gh(env, 'GET', `${repo}/git/ref/heads/main`);
      const baseSha = ref.object.sha;
      const baseCommit = await gh(env, 'GET', `${repo}/git/commits/${baseSha}`);
      const blob = await gh(env, 'POST', `${repo}/git/blobs`, {
        content: toBase64(buf),
        encoding: 'base64',
      });
      const tree = await gh(env, 'POST', `${repo}/git/trees`, {
        base_tree: baseCommit.tree.sha,
        tree: [{ path, mode: '100644', type: 'blob', sha: blob.sha }],
      });
      const commit = await gh(env, 'POST', `${repo}/git/commits`, {
        message: `投稿: ${path.split('/').pop()}`,
        tree: tree.sha,
        parents: [baseSha],
      });
      const branch = `submission-${stamp}-${rand}`;
      await gh(env, 'POST', `${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
      await gh(env, 'POST', `${repo}/pulls`, {
        title: `📷 来访者投稿 ${stamp.slice(0, 8)}`,
        head: branch,
        base: 'main',
        body: [
          '有一张新的来访者投稿照片，请在 Files changed 里预览：',
          '',
          '- **合并（Merge）** = 审核通过，网站将自动重建并展示',
          '- **关闭（Close）** = 拒绝，照片不会出现在网站上',
          '',
          `原始文件名：\`${file.name || '未知'}\`｜大小：${(file.size / 1024 / 1024).toFixed(1)}MB｜格式：${ext.toUpperCase()}`,
        ].join('\n'),
      });
    } catch (err) {
      console.error(err.message);
      return json(502, false, '暂时无法接收投稿，请稍后再试 / 一時的に受付できません', origin);
    }

    return json(200, true, '已收到，审核通过后即会展示。谢谢分享 / 受け付けました。ありがとうございます', origin);
  },
};
