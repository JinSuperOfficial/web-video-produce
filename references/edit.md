# 剪辑路线：EDL → conform → assemble → finish

对**已有素材**做裁剪、拼接、转场、水印、画幅适配、压缩，以及与代码生成的片段混合成片。
工具是 `scripts/vedit.py`（纯标准库 + ffmpeg，零第三方依赖）。

四条硬约束（标准化预处理 / 转场安全区 / 音视频成对处理 / 降级兜底）不是建议，是必须 —— 违反它们会产出黑帧、爆音、时长错乱。

---

> 工具：`scripts/vedit.py`（纯 Python 标准库 + ffmpeg/ffprobe，零第三方依赖）。
> 用途：对**已有素材**裁剪、拼接、转场、叠加水印、配 BGM/字幕、换画幅、压缩，并与代码生成的片段混合成片。

### 7.1 三阶段流水线（绝不让异构素材直接进滤镜图）

```
素材(异构)  ──conform──▶  work/part_00N.mp4  ──assemble──▶  work/timeline.mp4  ──finish──▶  output/edit.mp4
 不同分辨率/帧率/编码       统一 WxH / fps / H.264 /       裁剪+xfade+acrossfade        叠加/混音/字幕/
 有或无音轨/VFR/HDR       yuv420p / 48kHz 立体声          +concat（一条滤镜图）          响度归一/压缩
```

- **conform**：每段素材按 EDL 的 `in/out/speed` 裁好并标准化，输出时长用 `ffprobe` **回读**。
- **assemble**：用回读的真实时长算 offset，一条 `filter_complex` 完成转场与拼接，失败自动降级。
- **finish**：水印/画中画、BGM（含侧链闪避）、字幕、响度归一、目标体积压缩。

### 7.2 命令

```bash
# 0) 看素材（时长/分辨率/帧率/音轨/HDR/旋转），先 probe 再动手
python3 scripts/vedit.py probe assets/raw/*.mp4

# 1) dry-run：只打印将执行的 ffmpeg 命令与算好的 offset，不落盘
python3 scripts/vedit.py plan --edl examples/edit-plan.example.json

# 2) 真正执行（conform → assemble → finish），结束后自动 ffprobe 自检
python3 scripts/vedit.py build --edl examples/edit-plan.example.json

# 3) 只要标准化单个素材（也能给 Remotion 的 OffthreadVideo 备料）
python3 scripts/vedit.py conform --in raw.mov --out work/conform/a.mp4 --w 1920 --h 1080 --fps 30 --mode crop

# 常用开关
#   --out output/x.mp4      覆盖 EDL 的输出路径
#   --aspect vertical       竖屏 1080x1920（覆盖 EDL.aspect）
#   --force                 不吃 conform 缓存，强制重转
#   --keep-work             保留 work/ 中间产物（排查用）
#   --force-level 2|3       调试：强制走 concat filter / concat demuxer
```

npm 快捷方式：`npm run assets`（生成 demo 素材）→ `npm run edit:plan` → `npm run edit`。

### 7.3 EDL 规范（`examples/edit-plan.example.json` 可直接跑）

| 字段 | 说明 |
| --- | --- |
| `output` | `path/width/height/fps/crf/preset/vcodec/target_mb`。**宽高是整个流水线唯一规格来源** |
| `conform.mode` | `pad`（保比例加黑边，默认）/ `crop`（裁满，可配 `crop_focus`）/ `blur`（模糊垫底，竖屏最常用） |
| `aspect.preset` | `keep` / `vertical`(1080x1920) / `horizontal`(1920x1080) / `square`(1080x1080) |
| `timeline[]` | 每个片段：`id`、`src`、`in`、`out`（秒数或 `HH:MM:SS.mmm`）、`speed`(0.25~4)、`transition_out`、`audio`、`conform`、`crop_focus` |
| `timeline[].transition_out` | 转场。**推荐写语义风格** `{ "style": "soft", "duration": 0.8 }`（见下节）；也认 ffmpeg 原生名 `{ "type": "wipeleft", "duration": 0.5 }`，或者直接写字符串 `"soft"` / `"wipeleft"`。也可以写在后一段的 `transition_in` |
| `timeline[].audio` | `mode: keep / mute`、`gain_db`、`fade_in`、`fade_out`（秒） |
| `overlays[]` | `src`（png/jpg 或视频）、`position`(top-left/top-right/bottom-left/bottom-right/center)、`margin`、`width`、`opacity`、`enable`("0:00-0:09" 或任意 ffmpeg 表达式) |
| `audio_track` | `bgm`、`bgm_gain_db`、`duck`(true=侧链闪避)、`loudnorm`(-16 等 LUFS 目标) |
| `subtitles` | 烧进画面的 SRT 路径；`subtitle_style` 可覆盖 libass 样式 |

```json
{
  "output": { "path": "output/edit.mp4", "width": 1920, "height": 1080, "fps": 30, "crf": 18 },
  "conform": { "mode": "pad" },
  "timeline": [
    { "id": "a", "src": "assets/raw/a.mov", "in": "00:00:01.000", "out": "00:00:05.000",
      "audio": { "mode": "keep", "gain_db": -6, "fade_in": 0.3 },
      "transition_out": { "type": "fade", "duration": 0.6 } },
    { "id": "b", "src": "output/seg_01.mp4", "in": 0, "out": 4.0,
      "audio": { "mode": "mute" }, "transition_out": { "type": "wipeleft", "duration": 0.5 } },
    { "id": "c", "src": "assets/raw/c.mp4", "in": 0.5, "out": 3.5, "speed": 1.5,
      "audio": { "mode": "keep", "gain_db": -4, "fade_out": 0.4 } }
  ],
  "overlays": [ { "src": "assets/logo.png", "position": "top-right", "margin": 48,
                  "width": 200, "opacity": 0.85, "enable": "0:00-0:09" } ],
  "audio_track": { "bgm": "assets/bgm.mp3", "bgm_gain_db": -22, "duck": true, "loudnorm": -16 }
}
```

### 7.3b 转场层：语义风格（别去背 58 个 xfade 名字）

ffmpeg 有 58 种 xfade，但"该用哪种"其实只有几种意图。所以 EDL 里可以写**风格名**，
由 `vedit.py` 展开成具体的 xfade + 默认时长：

```json
{ "transition_out": { "style": "dip" } }              // 黑场过渡，用预设时长 0.6s
{ "transition_out": { "style": "soft", "duration": 1.2 } }   // 想更慢就覆盖时长
{ "transition_out": "hard" }                          // 明确不要转场（硬切）
{ "transition_out": { "type": "wipebl" } }            // 也认原生名，用来做预设覆盖不到的效果
```

| 风格 | → ffmpeg | 默认 | 意图 |
| --- | --- | --- | --- |
| `hard` | （无） | — | 硬切：明确不要转场（同场景内切换） |
| `soft` | `dissolve` | 0.80s | 柔和溶解：最通用的段落切换 |
| `dip` | `fadeblack` | 0.60s | 黑场过渡：章节 / 时间跳跃 |
| `flash` | `fadewhite` | 0.35s | 白闪：能量突变，配 `impact` 音效卡点 |
| `push` | `slideleft` | 0.50s | 横向推挤：同类内容前后对比 |
| `pushv` | `slideup` | 0.50s | 竖向推挤：竖屏比横向自然 |
| `wipe` | `wipeleft` | 0.50s | 擦除：干净利落的信息切换 |
| `smooth` | `smoothleft` | 0.60s | 柔和擦除：比 wipe 更黏、更慢 |
| `diag` | `diagbr` | 0.50s | 斜向擦除：更有动势 |
| `circle` | `circleopen` | 0.60s | 圆形展开：活泼、强调 |
| `zoom` | `zoomin` | 0.50s | 变焦冲击：推向高潮 |
| `pixel` | `pixelize` | 0.50s | 像素化：科技感、故障风 |
| `blur` | `hblur` | 0.50s | 模糊过渡：梦幻、回忆 |
| `reveal` | `revealright` | 0.50s | 揭示：后一段从边缘长出来 |

```bash
python3 scripts/vedit.py transitions    # 列出风格 + 本机 ffmpeg 实际支持的 58 个原生名
```

**为什么值得用风格名**：① 意图稳定，底层实现可以换（想让 `soft` 更黏更慢，改一处即可）；
② 默认时长按意图给好了，不用每次试数字；③ 和 Remotion 侧的 `src/transitions` 用同一套词汇，
两条路线的手感一致。
风格名不存在、或本机 ffmpeg 缺这个转场时，工具会**列出可用项后报错**，不会静默换成别的。

实测（把示例 EDL 的前两个转场换成风格名）：

```
[vedit] 时间轴：3 段，2 个转场，预计成片 00:00:08.600（8.600s）
[vedit] ▶ ffmpeg … -filter_complex
  '[0:v][1:v]xfade=transition=fadeblack:duration=0.600:offset=3.400[v1];
   [v1][2:v]xfade=transition=dissolve:duration=0.800:offset=6.600[v2]; …
```

offset 依旧严格按"前段累计 − 转场时长"算：`4.0−0.6=3.4`，`(4.0−0.6)+4.0−0.8=6.6`。

### 7.4 四条硬约束在代码里的落地

**① 标准化预处理（conform，拼接前强制）**

```bash
ffmpeg -y -ss 1.000 -i in.mov -t 4.000 -vf "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p,setpts=(PTS-STARTPTS)/1.0" -af "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo" -c:v libx264 -preset medium -crf 18 -g 60 -keyint_min 60 -sc_threshold 0 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -ac 2 -vsync cfr -movflags +faststart work/part_000.mp4
```

- **无音轨素材自动补静音轨**（`-f lavfi -i anullsrc=r=48000:cl=stereo`）——这是"有的片段有声音、有的没有"时拼接不崩的关键。
- `-g 60 -sc_threshold 0`：每 2 秒一个关键帧，后续裁切更快、Remotion 抽帧更稳。
- conform 结束**必须 ffprobe 回读真实时长**，offset 只用回读值（`-ss` 精度、容器时长与实际帧数会有差异）。
- 素材已达标（同分辨率/帧率/有音轨）时直接跳过重编码，不浪费一次转码。

**② 转场安全区（assemble）**

```
offset_k = Σ_{i≤k} 前段真实时长 − Σ_{i≤k} 转场时长      # 即 offset = 前段累计 − 本次转场
[0:v][1:v]xfade=transition=fade:duration=0.600:offset=3.400[v1];
[v1][2:v]xfade=transition=wipeleft:duration=0.500:offset=6.900[v2]
```

工具会**在 conform 之前先用请求时长做一次预检，conform 之后再断言一次**：

- `转场时长 ≤ min(前段, 后段) / 2` → 越界直接报错并给出安全上限，**绝不产出错乱时间线**；
- `offset > 0` 且严格递增；
- 转场名走白名单 + `ffmpeg -h filter=xfade` 运行时探测（本机 **58 种**可用），写错名字会列出全部可用值；
- 正式编码前先跑一遍 `-t 0.5 -f null -` 的 **preflight** 校验滤镜图，失败立刻降级而不是跑一半才炸。

**③ 音视频成对处理**

- 有 `xfade` 必有同值 `acrossfade=d=<同值>:c1=tri:c2=tri`，链式结构一一对应；
- 没转场的相邻段用 `concat` 滤镜（不是裸拼接 audio）；
- 所有音频节点统一 `aresample=48000` + `fltp` 立体声，段内用 `afade` 收边，段间用 `acrossfade` 过渡，杜绝爆音/断音；
- 也可显式选择"全静音再垫 BGM"：EDL 里把每段 `audio.mode` 设 `mute` + `audio_track.bgm`；
- BGM 默认 `sidechaincompress` 侧链闪避（人声一说话就把 BGM 压下去）；
- 最后统一 `loudnorm=I=-16:TP=-1.5:LRA=11`，避免忽大忽小。

**④ 四级降级兜底**

| 级别 | 方案 | 结果 |
| --- | --- | --- |
| 1 | `filter_complex` + xfade/acrossfade | 有转场（首选） |
| 2 | `filter_complex` + concat | 无转场，但仍是一次滤镜拼接 |
| 3 | `concat demuxer` + `-c copy` | 无转场，秒级直拼（conform 已统一参数，必然成立） |
| 4 | 报错 + 保留 `work/` | 打印完整命令交给人排查 |

每次降级都会打印原因，并在交付信息里标注 `⚠ 降级`。**降级必须如实告诉用户"这条成片没有转场"**，不要含糊过去。

### 7.5 混合成片：已有素材 + 代码生成片段

| 方向 | 适用 | 做法 |
| --- | --- | --- |
| **A · 剪辑器为主** | 素材为主、动画为辅 | 先用 Remotion 把动画段渲成 `output/seg_01.mp4`（本身就是 CFR/30fps/yuv420p），再写进 EDL 当普通素材。conform 检测到达标会**直接跳过重编码** |
| **B · Remotion 为主** | 动画为主、素材做插入镜头 | 素材放进 `public/footage/`，在 Remotion 里用 `<OffthreadVideo>` |

```tsx
import { OffthreadVideo, staticFile, Sequence, AbsoluteFill } from 'remotion';

<Sequence from={90} durationInFrames={150}>
  <AbsoluteFill>
    <OffthreadVideo
      src={staticFile('footage/interview.mp4')}
      trimBefore={90}      // 从源素材第 90 帧开始（旧名 startFrom 已废弃）
      trimAfter={240}      // 到第 240 帧结束（旧名 endAt 已废弃）
      playbackRate={1}
      volume={0.8}
    />
  </AbsoluteFill>
</Sequence>
```

> 已核对本机 Remotion 4.0.533 的类型定义：可用 prop 为 `trimBefore / trimAfter / playbackRate / volume / muted / transparent / toneMapped / pauseWhenBuffering`。
> **素材进 Remotion 前先 conform**：VFR 录屏、缺关键帧会让 `OffthreadVideo` 抽帧抖动/花屏 —— 复用 `python3 scripts/vedit.py conform --in …` 即可闭环。

**判断规则：素材为主 → 方向 A；代码为主 → 方向 B。**

### 7.6 画幅适配与水印

| 策略 | 效果 | 适用 |
| --- | --- | --- |
| `pad` | 保比例 + 黑边 | 横屏素材进横屏项目，不想裁掉内容 |
| `crop` | 裁满画面（可指定重心） | 竖屏化时保住主体，配 `crop_focus: top/center/bottom` |
| `blur` | 模糊放大垫底 + 原画面居中 | **短视频竖屏首选**，不丢内容也不留黑边 |

```bash
# 横屏 → 竖屏（模糊垫底）
python3 scripts/vedit.py build --edl examples/edit-plan.example.json --aspect vertical

# 先看自动裁切框，再决定 crop_focus
ffmpeg -hide_banner -i in.mp4 -vf cropdetect=limit=24:round=2:reset=0 -f null - 2>&1 | tail -3
```

水印/画中画（`overlays`）：图片和视频都支持，`position` 五档 + `margin` + `width` + `opacity` + `enable` 时间段控制。视频画中画会先 `setpts=PTS-STARTPTS` 再叠加，避免时间基错位导致"闪一下就没了"。

### 7.7 压缩与批量

```bash
# CRF 主导（推荐，质量稳定）：crf 18 近无损 / 23 常规 / 26~28 体积优先
# 目标体积（EDL: output.target_mb）→ 工具自动换算：
#   视频码率(kbps) ≈ 目标MB × 8192 ÷ 时长s − 音频192kbps，并加 -maxrate/-bufsize 约束峰值
# 出口统一 -movflags +faststart（网页秒开）
```

批量时**逐个 EDL 先 `plan` 再 `build`**，并发不要超过 CPU 核数；`work/` 目录按任务分开（`--work work/task01`）避免互相覆盖。

### 7.8 剪辑的验收（实测基线）

用 `assets/sample/` 三段**故意异构**的素材（1280x720@25 有声 / 1920x1080@30 无声 / 640x480@24 有声）跑示例 EDL：

```bash
npm run assets && npm run edit
# 实测：Σ段 10.0s − Σ转场 1.1s = 8.9s → 成片 8.900s / 267 帧 / 1920x1080@30 / 5.94MB
#      音频 mean -17.3dB、max -7.7dB（无爆音、无静音）
# 帧数是决定性证据：若降级成直拼会是 300 帧（10.0s），267 帧说明转场确实生效
```

必须做的检查：

1. `ffprobe` 时长 == `Σ段时长 − Σ转场时长`（±1 帧）；
2. 转场时刻抽帧（起始、中点、结束前 2 帧）确认没有黑帧/闪白；
3. 音量检查：`ffmpeg -i out.mp4 -af volumedetect -f null -`，`max_volume` 不能接近 0dB，`mean_volume` 不能低于 -35dB；
4. 抽帧确认水印位置、字幕不被裁切、竖屏没有拉伸变形。

---
