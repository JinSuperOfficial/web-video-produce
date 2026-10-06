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
  # 自动识别 f_00001.png / f_00001.jpg / frame0001.png / 0001.png
  # （capture_frames.mjs --format jpeg 出的是 .jpg，这里两种都要认）
  sample=$(find "$FRAMES" -maxdepth 1 \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' \) | sort | head -1)
  [ -n "$sample" ] || { echo "$FRAMES 下没有 PNG/JPG 帧" >&2; exit 1; }
  base=$(basename "$sample")
  PATTERN=$(printf '%s' "$base" | sed -E 's/[0-9]+\.(png|jpe?g)$/%05d.\1/')
  echo "自动识别帧模板: $PATTERN（首帧 $base）"
fi

mkdir -p "$(dirname "$OUT")"
# 色彩管理（和 Remotion 路线必须一致，否则两条路线的成片颜色不一样）：
#   截图器产出的是**全范围**（full range / pc）的 RGB→yuvj420p PNG/JPEG；
#   如果直接编码，ffmpeg 会写成 yuvj420p + color_range=pc + BT.601，
#   上传到平台按 BT.709 limited 解释就会偏色。
#   所以这里显式声明输入是全范围，并用 scale 转成 limited + BT.709。
cmd=(ffmpeg -hide_banner -y -framerate "$FPS" -start_number "$START"
     -color_range pc -i "$FRAMES/$PATTERN")
if [ -n "$AUDIO" ]; then
  [ -f "$AUDIO" ] || { echo "找不到音频: $AUDIO" >&2; exit 1; }
  cmd+=(-i "$AUDIO" -map 0:v -map 1:a -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest)
fi
cmd+=(-vf "scale=out_range=tv:out_color_matrix=bt709,format=yuv420p"
     -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv
     -c:v libx264 -preset slow -crf "$CRF" -movflags +faststart "$OUT")

echo "▶ ${cmd[*]}"
"${cmd[@]}"
echo "✓ 输出 $OUT"
