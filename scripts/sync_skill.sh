#!/usr/bin/env bash
# web-video-produce :: 把本仓库同步成一份 DSH Skill
#
# 用途：仓库（独立可跑的项目）与 Skill（~/.dsh/skills/web-video-produce/）是同一份代码的
# 两种形态。改完仓库后跑一次这个脚本，Skill 侧就是最新的。
#
# 用法:
#   bash scripts/sync_skill.sh                 # 同步到 ~/.dsh/skills/web-video-produce
#   bash scripts/sync_skill.sh /path/to/skill  # 同步到指定目录
#   DRY=1 bash scripts/sync_skill.sh           # 只打印会做什么
#
# 不拷的东西：依赖/虚拟环境/中间产物/成片（这些都能重跑出来）、docs 图片（Skill 用不到）。
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="${1:-$HOME/.dsh/skills/web-video-produce}"
DRY="${DRY:-0}"

# 顶层条目白名单
ITEMS=(
  SKILL.md README.md LICENSE project.md
  package.json tsconfig.json remotion.config.ts
  references scripts src templates examples assets
)
# 目录内排除
#   注意：rsync 的 --exclude 模式是**相对于每个被同步的子目录**的（这里逐个子目录同步），
#   所以写 'sample/*.mp4' 而不是 'assets/sample/*.mp4' —— 后者永远匹配不上，
#   结果是 7MB 的 demo 素材被静静地拷进 Skill（踩过）。
#   assets/sample/*.mp4 —— demo 素材，用 `npm run assets` 现场生成即可
EXCLUDES=(--exclude 'node_modules' --exclude '.venv' --exclude '__pycache__' \
          --exclude 'work' --exclude 'frames' --exclude 'output' \
          --exclude '*.log' --exclude '.git' --exclude 'public' \
          --exclude 'raw' --exclude 'sample/*.mp4' --exclude 'sample/*.mp3' )

echo "源:   $SRC"
echo "目标: $DST"
if [ "$DRY" = "1" ]; then
  echo "(DRY=1，只列出将要同步的顶层条目)"
  for i in "${ITEMS[@]}"; do [ -e "$SRC/$i" ] && echo "  $i"; done
  exit 0
fi

mkdir -p "$DST"
for i in "${ITEMS[@]}"; do
  [ -e "$SRC/$i" ] || continue
  if [ -d "$SRC/$i" ]; then
    mkdir -p "$DST/$i"
    # --delete-excluded：**连被排除的文件也从目标里删掉**。
    # 不加这个开关的话，rsync 会"保护"目标里已存在但被排除的文件 ——
    # 于是上一次同步留下的 assets/sample/*.mp4（7MB+）永远清不掉，Skill 目录越同步越大。
    rsync -a --delete --delete-excluded "${EXCLUDES[@]}" "$SRC/$i/" "$DST/$i/"
  else
    cp -p "$SRC/$i" "$DST/$i"
  fi
done

n=$(find "$DST" -type f | wc -l)
echo "✓ 同步完成：$n 个文件 / $(du -sh "$DST" | cut -f1)"
echo "  自检: python3 $DST/scripts/wvp.py doctor"
