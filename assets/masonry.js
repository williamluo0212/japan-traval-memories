// 瀑布流排版：按时间顺序把每张照片放进当前最短的一列，
// 消除因照片高低不齐产生的整行空白。高度用构建时写入的宽高属性估算，零回流。
// 无 JS 时回退为普通网格（CSS .grid 默认样式）。

(() => {
  const grid = document.querySelector('main.grid');
  if (!grid || grid.classList.contains('grid-empty')) return;
  const figures = Array.from(grid.querySelectorAll('.ph'));
  if (figures.length === 0) return;

  const colCount = () =>
    window.innerWidth >= 1080 ? 3 : window.innerWidth >= 640 ? 2 : 1;

  let current = 0;

  function layout() {
    const n = colCount();
    if (n === current) return;
    current = n;
    grid.querySelectorAll('.mcol').forEach((c) => c.remove());
    grid.classList.add('masonry');
    const cols = Array.from({ length: n }, () => {
      const d = document.createElement('div');
      d.className = 'mcol';
      grid.appendChild(d);
      return d;
    });
    const heights = new Array(n).fill(0);
    for (const fig of figures) {
      const img = fig.querySelector('img');
      const ratio = img.height > 0 ? img.width / img.height : 1;
      let shortest = 0;
      for (let i = 1; i < n; i++) if (heights[i] < heights[shortest]) shortest = i;
      cols[shortest].appendChild(fig);
      heights[shortest] += 1 / ratio + 0.06; // 相对高度 + 日期行
    }
  }

  layout();

  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(layout, 150);
  });
})();
