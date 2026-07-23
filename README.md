[README.md](https://github.com/user-attachments/files/30295798/README.md)
# 五色（ごしき）— 日本旅拍作品集网站

按 红・蓝・黄・绿・灰 五种主色调分页展示照片的静态网站。
照片自动按拍摄时间排序，点开大图可以看到拍摄参数（从 EXIF 读取）。

## 日常使用（就这两步）

1. **双击「启动网站.command」** —— 浏览器会自动打开网站。
2. **把照片拖进 `photos/` 文件夹** —— 几秒后页面自动刷新，新照片出现在对应颜色的页面里。

就这么简单。颜色归类、时间排序、缩略图、拍摄参数，全部自动完成。

## 照片被分错颜色了？

把那张照片从 `photos/` 拖进对应颜色的子文件夹即可强制指定：

```
photos/red/     → 茜（红）
photos/blue/    → 藍（蓝）
photos/yellow/  → 山吹（黄）
photos/green/   → 松葉（绿）
photos/gray/    → 鼠（灰）
```

想批量检查归类结果：在终端运行 `npm run report`，然后打开
`dist/_debug/colors.html`，所有照片的归类结果一目了然。

## 需要知道的细节

- **支持的格式**：JPEG、PNG、WebP、HEIC（iPhone 照片可直接拖入）。
  RAW 文件（ARW/CR3/NEF 等）会被跳过并提示——请放入后期导出的 JPEG。
- **隐私**：网站里的图片会自动剥离全部 EXIF（包括 GPS 位置信息）。
  拍摄参数只显示机身、镜头、焦距、光圈、快门、ISO 和时间。
- **没有 EXIF 的照片**（截图、聊天软件传的图）：正常展示，时间用文件时间
  代替（页面上标 ※），参数处显示「参数缺失 / データなし」。
- **删除照片**：直接从 `photos/` 删掉文件即可，网站会同步移除。
- **目前 `photos/` 里是一批示例照片**，可以整批删掉换成你自己的作品。

## 以后想发布上线

`dist/` 文件夹就是完整的网站（纯静态、自包含），把它拖到
Vercel / Netlify，或推到 GitHub Pages 即可上线。
发布前在终端运行一次：

```
npm run build
```

## 技术备忘（给未来的维护者）

- Node.js 在项目内 `.node/` 目录（v24 LTS，无需系统安装）；依赖仅 sharp + exifr。
- `npm run dev`：构建 + 本地服务器 + 监听 photos/ 自动重建刷新。
- 昂贵产物（缩略图）缓存在 `.cache/`，`dist/` 可随时整删重建。
- 颜色算法与全部阈值在 `scripts/lib/color.js` 顶部常量区。
- HEIC 解码依赖 macOS 自带的 `sips`（sharp 预编译包不含 HEVC 解码）；
  若未来改用 CI 构建需换 libheif 方案。
