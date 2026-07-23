// 灯箱：原生 <dialog>（自带 ESC 关闭与焦点管理）。
// 照片参数全部来自构建时内联的 data-* 属性，零运行时请求。

(() => {
  const dialog = document.getElementById('lightbox');
  if (!dialog) return;
  // 按构建时的时间序号排序——瀑布流会移动 DOM 节点，文档顺序不再等于时间顺序
  const links = Array.from(document.querySelectorAll('.ph-link'))
    .sort((a, b) => Number(a.dataset.idx) - Number(b.dataset.idx));
  if (links.length === 0) return;

  const img = dialog.querySelector('.lb-img');
  const exifEl = dialog.querySelector('.lb-exif');
  const dateEl = dialog.querySelector('.lb-date');

  const NO_EXIF = '参数缺失 / データなし';
  const FILE_TIME_NOTE = '※ 文件时间 / ファイル日時';

  let index = -1;

  function preload(i) {
    if (i >= 0 && i < links.length) {
      new Image().src = links[i].dataset.large;
    }
  }

  function show(i) {
    if (i < 0 || i >= links.length) return;
    index = i;
    const d = links[i].dataset;
    img.src = d.large;
    img.width = Number(d.w);
    img.height = Number(d.h);
    img.alt = `${d.date} 摄`;
    exifEl.textContent = d.exif || NO_EXIF;
    let dateText = d.timesource === 'file' ? `${d.date}　${FILE_TIME_NOTE}` : d.date;
    if (d.sub === '1') dateText += '　· 来访者投稿 / ご投稿';
    dateEl.textContent = dateText;
    if (!dialog.open) {
      dialog.showModal();
      // showModal 会把焦点给关闭按钮并显示焦点框，鼠标打开时视觉突兀；
      // 键盘用户按 Tab 仍会回到弹窗内（modal 特性），可安全移开
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    history.replaceState(null, '', `#p=${d.id}`);
    preload(i - 1);
    preload(i + 1);
  }

  // 清理逻辑幂等：既挂在原生 close 事件上，也由 closeLb 显式调用
  //（个别内嵌浏览器不触发 dialog 的原生 close/cancel 事件）
  function cleanup() {
    img.removeAttribute('src');
    history.replaceState(null, '', location.pathname + location.search);
  }

  function closeLb() {
    if (dialog.open) dialog.close();
    cleanup();
  }

  dialog.addEventListener('close', cleanup);

  links.forEach((a, i) => {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      show(i);
    });
  });

  dialog.querySelector('.lb-close').addEventListener('click', closeLb);
  dialog.querySelector('.lb-prev').addEventListener('click', () => show(index - 1));
  dialog.querySelector('.lb-next').addEventListener('click', () => show(index + 1));

  // 点击照片以外的空白处关闭
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog || ev.target.classList.contains('lb-body')) closeLb();
  });

  window.addEventListener('keydown', (ev) => {
    if (!dialog.open) return;
    if (ev.key === 'ArrowLeft') show(index - 1);
    else if (ev.key === 'ArrowRight') show(index + 1);
    else if (ev.key === 'Escape') closeLb();
  });

  // 触摸滑动切换
  let touchX = null;
  let touchY = null;
  dialog.addEventListener('touchstart', (ev) => {
    touchX = ev.touches[0].clientX;
    touchY = ev.touches[0].clientY;
  }, { passive: true });
  dialog.addEventListener('touchend', (ev) => {
    if (touchX === null) return;
    const dx = ev.changedTouches[0].clientX - touchX;
    const dy = ev.changedTouches[0].clientY - touchY;
    touchX = touchY = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      show(dx < 0 ? index + 1 : index - 1);
    }
  }, { passive: true });

  // URL hash 直达：#p=<hash> 支持刷新定位与分享
  const m = location.hash.match(/^#p=([0-9a-f]+)$/);
  if (m) {
    const i = links.findIndex((a) => a.dataset.id === m[1]);
    if (i >= 0) show(i);
  }
})();
