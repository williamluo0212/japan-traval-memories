// 投稿页交互：拖拽/选择 → 本地校验 → 预览 → 提交到 Cloudflare Worker。
// Turnstile 人机验证的 token 由挂在表单里的部件自动注入（cf-turnstile-response）。

(() => {
  const form = document.getElementById('up-form');
  if (!form) return;

  const drop = document.getElementById('drop');
  const fileInput = document.getElementById('up-file');
  const preview = document.getElementById('up-preview');
  const btn = form.querySelector('.up-btn');
  const msg = document.getElementById('up-msg');

  const MAX_BYTES = 20 * 1024 * 1024;
  const OK_TYPES = /\.(jpe?g|png|webp|heic)$/i;

  let picked = null;

  const say = (text, isError = false) => {
    msg.textContent = text;
    msg.classList.toggle('is-error', isError);
  };

  function accept(file) {
    if (!file) return;
    if (!OK_TYPES.test(file.name)) {
      say('仅支持 JPEG / PNG / WebP / HEIC / JPEG・PNG・WebP・HEICのみ', true);
      return;
    }
    if (file.size > MAX_BYTES) {
      say('文件超过 20MB，请压缩后再试 / 20MBを超えています', true);
      return;
    }
    picked = file;
    btn.disabled = false;
    say('');
    // HEIC 多数浏览器无法预览，显示文件名即可
    if (/\.heic$/i.test(file.name)) {
      preview.hidden = true;
      drop.classList.add('has-file');
      drop.querySelector('.drop-hint').textContent = file.name;
    } else {
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
      drop.classList.add('has-file');
    }
  }

  fileInput.addEventListener('change', () => accept(fileInput.files[0]));

  ['dragover', 'dragenter'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('is-over');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
    }),
  );
  drop.addEventListener('drop', (e) => accept(e.dataTransfer.files[0]));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!picked) return;
    const data = new FormData(form);
    data.set('file', picked, picked.name);
    btn.disabled = true;
    say('提交中… / 送信中…');
    try {
      const res = await fetch(form.dataset.worker, { method: 'POST', body: data });
      const out = await res.json().catch(() => ({}));
      if (res.ok) {
        say(out.message || '已收到，审核通过后即会展示。谢谢分享 / 受け付けました。ありがとうございます');
        form.reset();
        picked = null;
        preview.hidden = true;
        drop.classList.remove('has-file');
      } else {
        say(out.message || '提交失败，请稍后再试 / 送信できませんでした', true);
        btn.disabled = false;
      }
    } catch {
      say('网络错误，请稍后再试 / ネットワークエラー', true);
      btn.disabled = false;
    }
    if (window.turnstile) window.turnstile.reset();
  });
})();
