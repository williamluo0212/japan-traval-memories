# 五色（ごしき）— 无尽夏

[![build-and-deploy](https://github.com/williamluo0212/japan-traval-memories/actions/workflows/deploy.yml/badge.svg)](https://github.com/williamluo0212/japan-traval-memories/actions/workflows/deploy.yml)

**🔗 线上网站：https://williamluo0212.github.io/japan-traval-memories/**

按 **茜（红）・藍（蓝）・山吹（黄）・松葉（绿）・鼠（灰）** 五种日本传统色分页展示的
日本旅拍摄影作品集。日式极简设计，简体中文・日本語双语。

## ✦ 特色

- **五色分页**：每张照片按主色调自动归入五色之一（HSL 色相分析，饱和度加权）
- **时间为序**：页面内按 EXIF 拍摄时间升序，瀑布流排版
- **拍摄参数**：点开大图显示机身・镜头・焦距・光圈・快门・ISO・时间（构建期从 EXIF 提取）
- **访客投稿**：任何访客可在「投稿」页上传照片，经站主审核后自动上线（带「投稿」标注）
- **隐私**：发布的图片自动剥离全部 EXIF（含 GPS 位置信息）
- **全自动流水线**：照片进仓库 → GitHub Actions 构建（缩略图、归色、页面生成）→ 发布 Pages

## 站主日常操作

| 想做的事 | 操作 |
|---|---|
| 加照片 | 把照片放进 `photos/`，提交推送（本地预览：双击「启动网站.command」）|
| 删照片 | 从 `photos/` 删除后推送，或直接在 GitHub 网页上删（记得之后 `git pull` 同步）|
| 纠正颜色归类 | 把照片拖进 `photos/red|blue|yellow|green|gray/` 强制指定 |
| 批量检查归类 | `npm run report` → 打开 `dist/_debug/colors.html` |
| 审核投稿 | 收到 PR 邮件 → Files changed 预览 → **Merge**=通过 / **Close**=拒绝 |

## 访客投稿链路

```
访客上传（/upload 页）→ Turnstile 人机验证
  → Cloudflare Worker（大小/文件头/来源校验）→ 自动开 Pull Request
  → 站主审核合并 → Actions 自动构建发布
```

防护：20MB 上限、按文件头识别真实格式、来源域名检查、人机验证、可选每 IP 限频。
任何照片都必须经站主合并才会上线。首次配置见 `docs/投稿功能配置指南.md`。

## 本地开发

```bash
export PATH="$PWD/.node/bin:$PATH"   # Node 在项目内 .node/，无需系统安装
npm run dev      # 构建 + 本地预览 + 监听 photos/ 自动热重建
npm run build    # 产出 dist/（纯静态、自包含）
npm run report   # 额外生成颜色分类调参页
```

```
photos/          照片源（root=自动归类，五色子目录=强制指定，submissions/=访客投稿）
scripts/         构建管线（扫描→EXIF→归色→缩略图→页面生成，增量缓存）
site/            前端源（样式、灯箱、瀑布流、首页动效、上传页交互）
workers/         Cloudflare Worker（投稿接收）
.github/         Actions 构建发布工作流
```

技术要点：仅 3 个运行时依赖（sharp / exifr / heic-decode）；HEIC 解码 macOS 用
`sips`、CI 用 wasm；输出文件名为内容 hash；`.cache/` 存昂贵产物，`dist/` 可随时整删重建。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 更新预告

- 网站主页面背景更新
- 审核功能自动化
- 上线英文版
- 英文版ui适配
- 8月11日入职了，摆了。。。无限期暂停更新

---

设计语言：生成り色底・明朝体・縦書き・余白。五色取自日本传统色：
茜 <sub>あかね</sub>・藍 <sub>あい</sub>・山吹 <sub>やまぶき</sub>・松葉 <sub>まつば</sub>・鼠 <sub>ねずみ</sub>。

*Built with [Claude Code](https://claude.com/claude-code)*
