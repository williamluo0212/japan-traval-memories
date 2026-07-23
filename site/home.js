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
})();
