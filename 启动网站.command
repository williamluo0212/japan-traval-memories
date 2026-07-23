#!/bin/zsh
# 双击这个文件即可启动网站（会自动打开浏览器）。
# 关闭：在弹出的终端窗口里按 Ctrl+C，或直接关掉终端窗口。
cd "$(dirname "$0")"
export PATH="$PWD/.node/bin:$PATH"
export OPEN_BROWSER=1
node scripts/dev.js
