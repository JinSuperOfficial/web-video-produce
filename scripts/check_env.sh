#!/usr/bin/env bash
# web-video-produce :: 环境自检
# 用法: bash scripts/check_env.sh
set -uo pipefail

pass=0; warn=0; fail=0
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; pass=$((pass+1)); }
warnf(){ printf "  \033[33m!\033[0m %s\n" "$1"; warn=$((warn+1)); }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$1"; fail=$((fail+1)); }
have() { command -v "$1" >/dev/null 2>&1; }

echo "== 1. 运行时 =="
have node   && ok "node $(node -v)"        || bad "node 未安装（Remotion 必需）"
have npm    && ok "npm $(npm -v)"          || warnf "npm 未安装"
have python3 && ok "python3 $(python3 -V 2>&1 | awk '{print $2}')" || bad "python3 未安装（edge-tts 必需）"

echo "== 2. 音视频工具 =="
if have ffmpeg; then
  ok "ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}')"
  ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264 && ok "libx264 可用" || warnf "无 libx264，改用 -c:v mpeg4 或安装完整版 ffmpeg"
  ffmpeg -hide_banner -encoders 2>/dev/null | grep -q " aac "   && ok "aac 编码器可用" || warnf "无 aac 编码器"
  ffmpeg -hide_banner -filters  2>/dev/null | grep -q " subtitles " && ok "libass 字幕滤镜可用" || warnf "无 subtitles 滤镜，烧字幕请改用 drawtext"
else
  bad "ffmpeg 未安装（合成/编码必需）"
fi
have ffprobe && ok "ffprobe 可用" || warnf "ffprobe 未安装（读取时长需要）"

echo "== 2b. 剪辑能力（vedit.py 需要） =="
if have ffmpeg; then
  miss=""
  for f in xfade acrossfade concat overlay scale crop pad setpts atempo format; do
    ffmpeg -hide_banner -filters 2>/dev/null | grep -qE "^ *[.TSC]+ +${f} " || miss="$miss $f"
  done
  if [ -z "$miss" ]; then
    n=$(ffmpeg -hide_banner -h filter=xfade 2>/dev/null | grep -cE "^ +[a-z]+ +-?[0-9]+ +\.\.")
    ok "剪辑核心滤镜齐全（xfade 提供 $((n-1)) 种转场）"
  else
    bad "缺剪辑滤镜:$miss"
    warnf "缺少 xfade → 无法做转场（vedit.py 会自动降级为无转场直拼）"
    warnf "缺少 acrossfade → 拼接处会有爆音/断音"
  fi
  for f in zoompan cropdetect silencedetect tonemap zscale drawtext; do
    ffmpeg -hide_banner -filters 2>/dev/null | grep -qE "^ *[.TSC]+ +${f} " \
      && ok "进阶滤镜 $f 可用" || warnf "无 $f（对应的高级功能不可用）"
  done
  ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libmp3lame && ok "libmp3lame 可用（BGM/配音）" || warnf "无 libmp3lame"
else
  warnf "ffmpeg 缺失，跳过剪辑能力检查"
fi

echo "== 3. AI 配音 =="
if have edge-tts; then ok "edge-tts $(edge-tts --version 2>&1 | tail -1)"
elif [ -x ".venv/bin/edge-tts" ]; then ok "edge-tts (venv) $(.venv/bin/edge-tts --version 2>&1 | tail -1)"
elif python3 -c "import edge_tts" 2>/dev/null; then ok "edge-tts (python 模块已装)"
else warnf "edge-tts 未安装 → python3 -m venv .venv && .venv/bin/pip install edge-tts（或改用浏览器技能走 edge-tts.com）"
fi

echo "== 4. 中文字体 =="
if fc-list :lang=zh 2>/dev/null | grep -q .; then
  ok "系统有 CJK 字体: $(fc-list :lang=zh 2>/dev/null | head -1 | sed 's/.*: //')"
else
  warnf "系统无 CJK 字体：必须在代码里打包/加载中文字体，否则输出豆腐块"
fi
command -v fc-match >/dev/null 2>&1 && warnf "libass 烧字幕实际会用到: $(fc-match -s 'sans-serif:lang=zh-cn' 2>/dev/null | head -1)"

echo "== 5. Remotion / 渲染依赖 =="
if [ -f node_modules/remotion/package.json ]; then
  ok "remotion $(node -p "require('./node_modules/remotion/package.json').version")"
else
  warnf "未安装依赖 → npm install 或 pnpm install"
fi
if [ -x "$(find node_modules/.remotion -name chrome-headless-shell -type f 2>/dev/null | head -1)" ] 2>/dev/null; then
  ok "Chrome Headless Shell 已就绪"
else
  warnf "Chrome Headless Shell 未下载 → npx remotion browser ensure"
fi

echo "== 6. 关键产物 =="
[ -f public/voice/manifest.json ] && ok "配音时间轴 public/voice/manifest.json" \
  || warnf "还没有配音 → python scripts/tts_edge.py --script examples/script.sample.json"

echo
printf "结果: \033[32m%d 通过\033[0m, \033[33m%d 警告\033[0m, \033[31m%d 缺失\033[0m\n" "$pass" "$warn" "$fail"
exit 0
