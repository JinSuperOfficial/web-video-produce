#!/usr/bin/env bash
# web-video-produce :: PNG 序列 → MP4（不走 Remotion 的轻量路径）
#
# 用法:
#   bash scripts/frames_to_video.sh --frames frames --fps 30 --out output/from_frames.mp4
#   bash scripts/frames_to_video.sh --frames frames --fps 30 --audio public/voice/vo.mp3 --out output/from_frames.mp4
set -euo pipefail

FRAMES="frames"; FPS="30"; OUT="output/from_frames.mp4"; AUDIO=""; PATTERN=""; CRF="18"; START="0"

while [ $# -gt 0 ]; do
  case "$1" in
    --frames) FRAMES="$2"; shift 2;;
    --fps)    FPS="$2"; shift 2;;
    --out)    OUT="$2"; shift 2;;
    --audio)  AUDIO="$2"; shift 2;;
    --pattern) PATTERN="$2"; shift 2;;
    --crf)    CRF="$2"; shift 2;;
    --start-number) START="$2"; shift 2;;
    -h|--help) sed -n '2,6p' "$0"; exit 0;;
    *) echo "未知参数: $1" >&2; exit 2;;
  esac
done

[ -d "$FRAMES" ] || { echo "找不到帧目录: $FRAMES" >&2; exit 1; }
if [ -z "$PATTERN" ]; then
  # 自动识别 f_00001.png / frame0001.png / 0001.png
  sample=$(find "$FRAMES" -maxdepth 1 -name '*.png' | sort | head -1)
  [ -n "$sample" ] || { echo "$FRAMES 下没有 PNG" >&2; exit 1; }
  base=$(basename "$sample")
  PATTERN=$(printf '%s' "$base" | sed -E 's/[0-9]+\.png$/%05d.png/')
  echo "自动识别帧模板: $PATTERN（首帧 $base）"
fi

mkdir -p "$(dirname "$OUT")"
cmd=(ffmpeg -hide_banner -y -framerate "$FPS" -start_number "$START" -i "$FRAMES/$PATTERN")
if [ -n "$AUDIO" ]; then
  [ -f "$AUDIO" ] || { echo "找不到音频: $AUDIO" >&2; exit 1; }
  cmd+=(-i "$AUDIO" -map 0:v -map 1:a -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest)
fi
cmd+=(-c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -movflags +faststart "$OUT")

echo "▶ ${cmd[*]}"
"${cmd[@]}"
echo "✓ 输出 $OUT"
