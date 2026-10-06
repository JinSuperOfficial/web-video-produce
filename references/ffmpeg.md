# FFmpeg 命令手册（实测可用）

能直接抄的命令集合：混流、混音、烧字幕、转场、变速、水印、HDR 转 SDR、PNG 序列成片。
每条都在本机验证过。剪辑路线请先看 `edit.md`（那里有更高层的 EDL 用法）。

---

```bash
# 0) 先确认能力
ffmpeg -hide_banner -encoders | grep -E "libx264| aac |libmp3lame"
ffmpeg -hide_banner -filters  | grep -E " subtitles |xfade|amix|sidechaincompress|loudnorm|drawtext"

# 1) 视频 + 配音（视频流直接 copy，秒级完成）
ffmpeg -y -i output/video_silent.mp4 -i public/voice/vo.mp3 \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest \
  -movflags +faststart output/final.mp4

# 2) 有 BGM：循环 + 压低音量 + 混音 + 响度归一
ffmpeg -y -i output/video_silent.mp4 -i public/voice/vo.mp3 -stream_loop -1 -i assets/bgm.mp3 \
  -filter_complex "[1:a]aresample=48000,volume=1.0[vo];[2:a]aresample=48000,volume=-20dB[bgm];\
[vo][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed];[mixed]loudnorm=I=-16:TP=-1.5:LRA=11[aout]" \
  -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart output/final.mp4

# 3) 高级：人声说话时自动把 BGM 压下去（侧链压缩）
ffmpeg -y -i vo.mp3 -stream_loop -1 -i bgm.mp3 -i video.mp4 -filter_complex \
  "[1:a]volume=-14dB[bg];[bg][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked];\
[0:a][ducked]amix=inputs=2:duration=first:normalize=0[a]" \
  -map 2:v -map "[a]" -c:v copy -c:a aac -shortest output/final.mp4

# 4) 烧中文字幕（libass；字体缺失时加 fontsdir）
ffmpeg -y -i output/video_silent.mp4 -vf \
  "subtitles=public/voice/vo.srt:fontsdir=public/fonts:force_style='FontName=Noto Sans SC,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=1,MarginV=48'" \
  -i public/voice/vo.mp3 -map 0:v -map 1:a -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -shortest output/final.mp4

# 5) PNG 序列 → MP4（HTML/Canvas 路线）
ffmpeg -y -framerate 30 -i frames/f_%05d.png -i public/voice/vo.mp3 \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest -movflags +faststart output/from_frames.mp4

# 6) 两段视频交叉溶解转场
ffmpeg -y -i a.mp4 -i b.mp4 -filter_complex \
  "[0:v][1:v]xfade=transition=fade:duration=0.8:offset=4.2[v]" -map "[v]" -c:v libx264 -crf 18 out.mp4

# 7) 同参数片段拼接（保持编码参数一致才不会花屏）
printf "file 'a.mp4'\nfile 'b.mp4'\n" > list.txt
ffmpeg -y -f concat -safe 0 -i list.txt -c copy merged.mp4

# 8) 压缩体积 / 出竖屏版本 / 出预览图
ffmpeg -y -i final.mp4 -c:v libx264 -crf 24 -preset slow -vf "scale=1080:-2" -c:a aac -b:a 128k small.mp4
ffmpeg -y -i final.mp4 -vf "crop=ih*9/16:ih,scale=1080:1920" -c:a copy vertical.mp4
ffmpeg -y -ss 3 -i final.mp4 -frames:v 1 -q:v 2 output/thumbnail.jpg
```

# 9) 两段视频"视频+音频"成对交叉淡化（转场不爆音的写法）
#    视频 xfade 与音频 acrossfade 必须同值、同链式结构
ffmpeg -y -i a.mp4 -i b.mp4 -filter_complex \
  "[0:v][1:v]xfade=transition=fade:duration=0.6:offset=4.4[v];\
[0:a][1:a]acrossfade=d=0.6:c1=tri:c2=tri[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k out.mp4

# 10) 水印/画中画：图片叠加 + 时间区间控制（enable 用 between(t,a,b)）
ffmpeg -y -i base.mp4 -i logo.png -filter_complex \
  "[1:v]scale=200:-1,format=rgba,colorchannelmixer=aa=0.85[ov];\
[0:v][ov]overlay=W-w-48:48:enable='between(t,0,9)'[v]" \
  -map "[v]" -map 0:a -c:v libx264 -crf 18 -c:a copy -shortest out.mp4

# 11) 变速（视频 setpts + 音频 atempo，两者必须同时改，否则音画不同步）
ffmpeg -y -i in.mp4 -filter_complex \
  "[0:v]setpts=PTS/1.5[v];[0:a]atempo=1.5[a]" -map "[v]" -map "[a]" \
  -c:v libx264 -crf 18 -c:a aac out.mp4
# 倍率 >2 或 <0.5 时 atempo 要串联：atempo=2.0,atempo=2.0 ⇒ 4 倍速

# 12) 自动去黑边 / 检测可用转场名
ffmpeg -hide_banner -i in.mp4 -vf cropdetect=limit=24:round=2:reset=0 -f null - 2>&1 | tail -5
ffmpeg -hide_banner -h filter=xfade | grep -E "^ +[a-z]+ +-?[0-9]+ +\.\." | head -20

# 13) HDR / 10bit 素材转 SDR（否则成片发灰）
ffmpeg -y -i hdr.mov -vf "zscale=t=linear:npl=100,format=gbrpf32le,\
zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p" \
  -c:v libx264 -crf 18 -c:a aac sdr.mp4
```

**concat filter vs concat demuxer 怎么选？**

| | `concat` 滤镜（filter_complex） | `concat` demuxer |
| --- | --- | --- |
| 输入参数 | 可以不一致（滤镜内自动对齐像素格式/采样率），但仍建议先 conform | **必须完全一致**，否则花屏/爆音/失败 |
| 速度 | 必须重编码，慢 | `-c copy` 秒级 |
| 能加转场 | 能（与 xfade 混用） | 不能 |
| 适用 | 拼接 + 转场 + 叠加的主路径 | 标准化之后的"兜底直拼" |
| 命令 | `[0:v][1:v]concat=n=2:v=1:a=0[v]` | `ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4` |

**`-ss` 放哪？** 放 `-i` **前面**＝快速定位（现代 ffmpeg 会自动解码丢弃到精确位置，推荐）；放 `-i` **后面**＝逐帧解码，慢但绝对精确。剪辑截取统一用前者。

**字幕烧不进去？** 90% 是字体问题：`fc-match -s 'sans-serif:lang=zh-cn'` 看实际字体，或加 `fontsdir=` 指向自带 `.ttf/.otf` 目录；SRT 路径里的冒号要转义成 `\:`。

**音画不同步？** 统一采样率（`-ar 48000`）与帧率；用 `-itsoffset` 微调；避免中途 `-c:a copy` 混用不同采样率。

---
