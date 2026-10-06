#!/usr/bin/env bash
# web-video-produce :: 生成剪辑 demo 素材（全部由 ffmpeg 合成，无版权问题）
#
# 故意做成"异构"，用来验证 vedit.py 的 conform 阶段：
#   clip_a  1280x720  25fps  有音轨
#   clip_b  1920x1080 30fps  无音轨      ← 最常见的坑
#   clip_c   640x480  24fps  有音轨、竖屏比例
#
# 用法: bash scripts/make_sample_assets.sh [输出目录，默认 assets/sample]
set -euo pipefail

OUT="${1:-assets/sample}"
mkdir -p "$OUT"

echo "▶ 生成 $OUT/clip_a.mp4 (1280x720@25, 有音轨)"
ffmpeg -v error -y \
  -f lavfi -i "testsrc2=size=1280x720:rate=25:duration=6" \
  -f lavfi -i "sine=frequency=440:duration=6" \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 48000 -ac 2 -shortest "$OUT/clip_a.mp4"

echo "▶ 生成 $OUT/clip_b.mp4 (1920x1080@30, 无音轨)"
ffmpeg -v error -y -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=5" \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an "$OUT/clip_b.mp4"

echo "▶ 生成 $OUT/clip_c.mp4 (640x480@24, 非 16:9, 有音轨)"
ffmpeg -v error -y \
  -f lavfi -i "testsrc2=size=640x480:rate=24:duration=4" \
  -f lavfi -i "sine=frequency=660:duration=4" \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 44100 -ac 1 -shortest "$OUT/clip_c.mp4"

FONT=""
for f in /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
         /usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf; do
  [ -f "$f" ] && FONT="$f" && break
done

echo "▶ 生成 $OUT/logo.png (水印，带透明通道)"
if [ -n "$FONT" ]; then
  ffmpeg -v error -y -f lavfi -i "color=c=#0e1a2b@0.0:s=360x120:d=1" -frames:v 1 \
    -vf "drawbox=x=0:y=0:w=360:h=120:color=#5eead4@0.85:t=fill,\
drawtext=fontfile=${FONT}:text='WEB-VIDEO':fontcolor=#06121f:fontsize=44:x=18:y=36" \
    "$OUT/logo.png"
else
  echo "  （没找到 DejaVu 字体，改用纯色块水印）"
  ffmpeg -v error -y -f lavfi -i "color=c=#5eead4@0.85:s=360x120" -frames:v 1 "$OUT/logo.png"
fi

echo "▶ 生成 $OUT/bgm.mp3 (8s 氛围垫乐)"
ffmpeg -v error -y \
  -f lavfi -i "sine=frequency=220:duration=8" \
  -f lavfi -i "sine=frequency=330:duration=8" \
  -filter_complex "[0:a]volume=0.20[a0];[1:a]volume=0.14[a1];\
[a0][a1]amix=inputs=2:normalize=0,afade=t=in:d=1,afade=t=out:st=7:d=1[a]" \
  -map "[a]" -c:a libmp3lame -b:a 128k "$OUT/bgm.mp3"

echo
echo "✓ demo 素材就绪："
ls -la "$OUT"
echo
echo "下一步：python3 scripts/vedit.py probe $OUT/*.mp4"
