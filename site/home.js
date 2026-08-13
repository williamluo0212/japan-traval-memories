// 首页动效（移动端）：色带入场依次浮现；点击色带先舒展再跳转。
// 桌面端保持悬停展开 + 即点即走；系统设置了"减弱动态效果"时全部跳过。

(() => {
  const stripes = Array.from(document.querySelectorAll('.stripe'));
  if (stripes.length === 0) return;

  const mobile = matchMedia('(max-width: 760px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  if (mobile.matches && !reduced.matches) {
    document.body.classList.add('anim-in');
  }

  let leaving = false;

  // 复位：清除「展开中」的类与 leaving 锁。
  // iOS Safari 从子页面退回首页时会从 bfcache 恢复页面，JS 状态（leaving=true、
  // .opening/.is-opening 类）被原样冻结，导致回来后再点其他色带被 leaving 拦下。
  function reset() {
    leaving = false;
    const s = document.querySelector('.stripes');
    if (s) s.classList.remove('opening');
    stripes.forEach((a) => a.classList.remove('is-opening'));
  }

  stripes.forEach((a) => {
    a.addEventListener('click', (ev) => {
      if (!mobile.matches || reduced.matches) return; // 桌面端不拦截
      ev.preventDefault();
      if (leaving) return;
      leaving = true;
      a.closest('.stripes').classList.add('opening');
      a.classList.add('is-opening');
      setTimeout(() => {
        location.href = a.href;
      }, 640);
    });
  });

  // bfcache 恢复时复位（persisted=true 表示页面来自缓存而非首次加载）
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) reset();
  });
})();
