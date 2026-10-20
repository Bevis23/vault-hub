#!/usr/bin/env bash
# Vault Workbench - 构建 src/ → main.js，再同步到你的 Obsidian 插件目录
#
# 用法：
#   bash sync.sh              构建 + 同步
#   bash sync.sh --no-build   只同步（不重跑 build.js）
#
# 目标目录从环境变量 VWB_VAULT_DIR 读取；没设置的话会尝试读 .dev-local.sh
# （那个文件是 gitignore 的，里面写你自己的库路径，不会泄露到 GitHub）。
#   export VWB_VAULT_DIR="/你的库/.obsidian/plugins/vault-workbench"
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$VWB_VAULT_DIR" ] && [ -f "$HERE/.dev-local.sh" ]; then
  # shellcheck disable=SC1091
  . "$HERE/.dev-local.sh"
fi

if [ -z "$VWB_VAULT_DIR" ]; then
  echo "还没告诉我要同步到哪儿。请二选一："
  echo "  1) export VWB_VAULT_DIR=\"/你的库/.obsidian/plugins/vault-workbench\""
  echo "  2) 复制 .dev-local.sh 并在里面填上你的路径（该文件不会提交到 GitHub）"
  exit 1
fi

if [ "$1" != "--no-build" ]; then
  (cd "$HERE" && node build.js)
fi

mkdir -p "$VWB_VAULT_DIR"
cp "$HERE/main.js"       "$VWB_VAULT_DIR/main.js"
cp "$HERE/manifest.json" "$VWB_VAULT_DIR/manifest.json"
cp "$HERE/styles.css"    "$VWB_VAULT_DIR/styles.css"
echo "Synced -> $VWB_VAULT_DIR"
echo "Now press Ctrl+R inside Obsidian."
