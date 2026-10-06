#!/usr/bin/env bash
# web-video-produce :: 音视频合成 / 封装
#
# 用法:
#   bash scripts/mux.sh --video output/video_silent.mp4 --audio public/voice/vo.mp3 --out output/final.mp4
#   bash scripts/mux.sh --video v.mp4 --audio vo.mp3 --bgm bgm.mp3 --bgm-gain -18 --out final.mp4
#   bash scripts/mux.sh --video v.mp4 --audio vo.mp3 --subs public/voice/vo.srt --out final.mp4   # 烧字幕
#   bash scripts/mux.sh --video v.mp4 --audio vo.mp3 --offset 0.35 --loudnorm --out final.mp4
#
# 说明:
#   * 默认视频流直接 copy（Remotion 已经编码过），只有烧字幕时才重编码
#   * --offset 用于音频整体提前/延后（正数=延后），微调口型或片头留白
set -euo pipefail

VIDEO=""; AUDIO=""; OUT="output/final.mp4"
BGM=""; BGM_GAIN="-20"; SUBS=""; OFFSET="0"; LOUDNORM="0"; CRF="18"
FPS=""; SHORTEST="1"

while [ $# -gt 0 ]; do
  case "$1" in
    --video) VIDEO="$2"; shift 2;;
    --audio) AUDIO="$2"; shift 2;;
    --out)   OUT="$2";   shift 2;;
    --bgm)   BGM="$2";   shift 2;;
    --bgm-gain) BGM_GAIN="$2"; shift 2;;
    --subs)  SUBS="$2";  shift 2;;
    --offset) OFFSET="$2"; shift 2;;
    --loudnorm) LOUDNORM="1"; shift;;
    --crf)   CRF="$2"; shift 2;;
    --fps)   FPS="$2"; shift 2;;
    --no-shortest) SHORTEST="0"; shift;;
    -h|--help) sed -n '2,13p' "$0"; exit 0;;
    *) echo "未知参数: $1" >&2; exit 2;;
  esac
done

[ -f "$VIDEO" ] || { echo "找不到视频: $VIDEO" >&2; exit 1; }
if [ -n "$AUDIO" ]; then [ -f "$AUDIO" ] || { echo "找不到音频: $AUDIO" >&2; exit 1; }; fi
if [ -n "$BGM" ];   then [ -f "$BGM" ]   || { echo "找不到 BGM: $BGM" >&2; exit 1; }; fi
if [ -n "$SUBS" ];  then [ -f "$SUBS" ]  || { echo "找不到字幕: $SUBS" >&2; exit 1; }; fi
mkdir -p "$(dirname "$OUT")"

# ---------- 输入 ----------
inputs=(-i "$VIDEO")
next_idx=1
VO_LABEL=""; BGM_LABEL=""

if [ -n "$AUDIO" ]; then
  if [ "$OFFSET" != "0" ]; then inputs+=(-itsoffset "$OFFSET"); fi
  inputs+=(-i "$AUDIO")
  VO_LABEL="vo"
  next_idx=$((next_idx + 1))
fi

if [ -n "$BGM" ]; then
  inputs+=(-stream_loop -1 -i "$BGM")   # BGM 短于视频时循环
  BGM_LABEL="bgm"
fi

# ---------- 音频滤波器链 ----------
chain=()
if [ -n "$VO_LABEL" ]; then
  chain+=("[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[vo]")
fi
if [ -n "$BGM_LABEL" ]; then
  bgm_in=$(( next_idx ))
  chain+=("[${bgm_in}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${BGM_GAIN}dB[bgm]")
fi

if [ -n "$VO_LABEL" ] && [ -n "$BGM_LABEL" ]; then
  chain+=("[vo][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]")
  A_LABEL="mixed"
elif [ -n "$VO_LABEL" ]; then
  A_LABEL="vo"
elif [ -n "$BGM_LABEL" ]; then
  A_LABEL="bgm"
else
  A_LABEL=""
fi

if [ -n "$A_LABEL" ] && [ "$LOUDNORM" = "1" ]; then
  chain+=("[${A_LABEL}]loudnorm=I=-16:TP=-1.5:LRA=11[anorm]")
  A_LABEL="anorm"
fi

# ---------- 视频链 ----------
video_args=(-c:v copy)
if [ -n "$SUBS" ]; then
  esc=$(printf '%s' "$SUBS" | sed "s/:/\\\\:/g")
  style="FontName=Noto Sans SC,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=48"
  video_args=(-vf "subtitles='${esc}':force_style='${style}'" -c:v libx264 -preset medium -crf "$CRF" -pix_fmt yuv420p)
fi
if [ -n "$FPS" ]; then video_args+=(-r "$FPS"); fi

# ---------- 组装 ----------
cmd=(ffmpeg -hide_banner -y "${inputs[@]}")
if [ -n "$A_LABEL" ]; then
  filter=$(printf '%s;' "${chain[@]}"); filter=${filter%;}
  cmd+=(-filter_complex "$filter" -map 0:v -map "[${A_LABEL}]")
  cmd+=(-c:a aac -b:a 192k -ar 48000 -ac 2)
else
  cmd+=(-map 0:v)
fi
cmd+=("${video_args[@]}")
[ "$SHORTEST" = "1" ] && cmd+=(-shortest)
cmd+=(-movflags +faststart "$OUT")

echo "▶ ${cmd[*]}"
"${cmd[@]}"
echo "✓ 输出 $OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
