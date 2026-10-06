---
name: web-video-produce
description: 用代码做视频（Code-to-Video）与剪辑成片。当用户要求"做一条视频/生成视频/文生视频/把脚本变成视频/给文章配视频/做产品宣传片/做个动画短片/生成 MP4/配音+字幕+成片"，或要求"剪辑/裁剪/拼接/合并视频/加转场/加片头片尾/给已有视频配字幕配音/加 BGM/加水印 logo/画中画/横屏转竖屏/压缩视频/变速/批量转码"时使用。能力一：把文本变成 MP4——解析脚本分段，用 edge-tts 生成配音与字幕时间轴，再用 Remotion / React / Three.js / GLSL / Canvas / GSAP 写视觉代码逐帧渲染，FFmpeg 合成。能力二：EDL 驱动剪辑已有素材——conform 标准化 → 裁剪/拼接/xfade 转场/overlay 水印/画幅适配/压缩，可与代码生成的片段混合成片。
version: 1.1.0
license: MIT
metadata:
  tags: [video, editing, remotion, react, three.js, glsl, canvas, gsap, edge-tts, tts, ffmpeg, mp4, subtitle, srt, edl, xfade, watermark, transcode]
  stack: [HTML/CSS/JS, Canvas 2D, Three.js, WebGL/GLSL, React+TS+Remotion, GSAP, edge-tts, FFmpeg]
  entrypoints:
    voice: scripts/tts_edge.py
    audition: scripts/tts_audition.py
    bgm: scripts/make_bgm.py
    validate: scripts/validate.py
    project: src/index.ts
    edit: scripts/vedit.py
    mux: scripts/mux.sh
    capture: scripts/capture_frames.mjs
    doctor: scripts/check_env.sh
  verified_on: "Linux + Node 22.22 / ffmpeg 8.0.1 / edge-tts 7.2.8 / Remotion 4.0.533"
  outputs: [MP4(H.264+AAC), SRT, VTT, PNG, PNG 序列, 剪辑成片]
---

# web-video-produce — 写代码做视频 / 剪视频

> 一句话：**生成** = 文本 → 分段脚本 → 配音与时间轴 → 视觉代码 → 逐帧渲染 → FFmpeg 合成 → MP4；
> **剪辑** = 已有素材 → conform 标准化 → EDL 时间线（裁剪/转场/叠加）→ FFmpeg 合成 → MP4。
> 你（Agent）不是"剪辑师"，你是**程序员**：视频是代码（或 EDL）的产物，每一帧都必须可复现。

---

## 0. 何时使用

**触发场景（生成）**：做一条视频、生成视频、文生视频、把文案/文章/脚本做成视频、宣传片、科普动画、数据可视化视频、动态海报、配音 + 字幕 + 成片、导出 MP4。

**触发场景（剪辑）**：剪辑/剪一下、裁剪、截取片段、多段拼接、合并视频、加转场、加片头片尾、给已有视频配字幕/配音、加 BGM、加水印 logo、画中画、横屏转竖屏、压缩体积、变速、批量转码、把实拍素材和动画片段混成一条片。

**不适用 / 需要换方案**：

| 需求 | 处理 |
| --- | --- |
| 真人实拍（需要相机/演员） | 不属于本技能，如实说明；但**已有素材的后期剪辑属于本技能**（走 §7） |
| 只想生成单张图片 | 用生图插件（`generate_image`），不要启动整条视频流水线 |
| 想要可视化拖拽时间线 GUI | 本技能是 CLI/EDL 驱动，没有 GUI；如实说明并给出 `vedit.py plan` 的命令行方案 |
| 用户没有装 Node/FFmpeg 且拒绝安装 | 只交付"HTML 单文件 + 播放说明"，或先跑 `scripts/check_env.sh` 报告缺什么 |
| 需要 4K/60fps 长片（>10 分钟） | 先做 15 秒样片验证，再评估时间与磁盘成本，务必先跟用户确认 |

---

## 1. 核心理念（六条铁律）

1. **时间轴是唯一真相，配音先定稿。** 视频长度由配音决定，不要先写死秒数再配音。顺序永远是：脚本 → 配音 → 拿到每句的帧号 → 再写画面代码。
2. **每一帧都是纯函数 f(frame)。** 禁止 `Math.random()`、`Date.now()`、`requestAnimationFrame` 累加时间、CSS 无限动画。需要随机就用固定种子的 PRNG（Remotion 有 `random(seed)`）。
3. **先样片后全片。** 先渲 1 张静帧（`remotion still`）确认字体/构图/颜色，再渲 3 秒，最后才渲全片。渲染是最贵的一步。剪辑同理：先 `vedit.py plan` 看命令，再 `build`。
4. **音频用现成工具，画面用代码。** 不要用代码合成 TTS；不要用代码做混音。配音交给 edge-tts，编码与混音交给 FFmpeg。
5. **交付即验证。** 出片后必须用 `ffprobe` 报告时长/分辨率/编码，用抽帧图确认画面与字幕，再把路径给用户。
   渲染前后各跑一次 `python3 scripts/validate.py --out output/xxx.mp4`：一次性查确定性铁律、时间轴一致性、场景 id、素材引用、字体、成片规格与响度，有错直接非零退出。
   另：**H.264 必须显式设 bt709**（`Config.setColorSpace('bt709')` 或 `--color-space=bt709`）。不设的话 Remotion 不传 `-color_range/-colorspace`，ffmpeg 会写成 full-range `yuvj420p` + BT.601，平台转码时颜色会漂。
6. **异构素材必须先 conform，再进滤镜图。** 分辨率/帧率/编码/采样率/音轨数不一致的素材直接拼 = 黑帧、爆音、时长错乱。**剪辑四条硬约束（不可协商）**：
   - **① 标准化预处理**：拼接前一律先转码统一为同一分辨率 + 帧率 + 编码（H.264/yuv420p）+ 48kHz 立体声；无音轨的素材补静音轨。
   - **② 转场安全区**：只用 xfade 常见转场（fade/dissolve/wipeleft/wiperight/wipeup/wipedown/slide*/circle*），且 **offset 必须 = 前段累计时长 − 转场时长**；`转场时长 ≤ min(前段,后段)/2`，越界直接报错而不是硬拼。
   - **③ 音视频成对处理**：有视频 xfade 就必须有同值音频 acrossfade；否则先整段静音再全局垫 BGM。禁止硬切拼音频（爆音/断音）。
   - **④ 降级兜底**：filter_complex 失败时按 `xfade → concat filter → concat demuxer(copy) → 报错保留现场` 四级回退，并把降级结果如实写进交付说明。

**配音稿硬约束（生成路线，必须遵守）**

- **正文不写句号「。」**：edge-tts 遇到句号会给一个"句末下降调 + 长停顿"，一句话一个降调，听感立刻变成机器念课文。断句用逗号「，」，或者直接拆成下一段。`tts_edge.py` 默认自动剔除句号并在日志里告诉你剔了几个；确需保留时加 `--keep-punct`。
- **默认整段韵律模式**（`--mode whole`）：全部文案合并成一次请求合成，语调连续，最接近真人。分段模式（`--mode segment`）每次请求都会多出约 0.6s 尾静音，听感一顿一顿 —— 实测同一句稿：分段 8.75s vs 整段 6.98s，差的 1.8 秒全是假停顿。
- **语速 +0% ~ +5%**：超过 +10% 会明显发飘、失真。想要真人感先降速，别加特效。
- **别用引号、括号、书名号包中文**：TTS 会把它们读出来或造成怪停顿。
- **段间必须有停顿，不允许无缝衔接**：`--gap-ms` 默认 400ms（工具会在句间中点切开、插入真静音），片尾另留 `--tail-ms`（默认 600ms）给音乐收尾。连续念白听着难受，是交付事故。
- **默认加背景配乐**：`--bgm` 默认 `assets/bgm.mp3`（仓库自带、代码合成、可商用）。
  混音用**多频段 carve**而不是整体压低：先 Linkwitz-Riley 分频（300Hz / 3400Hz），只对人声频段做侧链压限，音乐的低频与空气感全部保留。实测同一条片子的低频能量：不处理 -35.4dB / 整体闪避 -43.2dB（音乐瘪掉）/ carve -36.1dB。
  片头 1.2s 淡入、片尾 1.5s 淡出；BGM 不存在会自动跳过；`--no-bgm` 整条不要音乐，`--no-carve` 退回整体压低。
- **响度用两遍 loudnorm**：第一遍只测量拿到 `measured_*`，第二遍以 `linear=true` 做线性增益（单遍动态模式会二次改变音色与段间关系）。`--loudness-target social|podcast|broadcast` = -14 / -16 / -23 LUFS。

---

## 2. 技术栈与选型

| 层 | 技术 | 什么时候用 | 备注 |
| --- | --- | --- | --- |
| 结构 | HTML / CSS / JS | 任何场景，文字排版与布局 | 最省事，浏览器即渲染器 |
| 2D 图形 | Canvas 2D | 图表、粒子、波形、数据可视化 | 命令式，注意用 `dpr` 缩放 |
| 3D | Three.js | 产品演示、空间感、模型动画 | Remotion 里用 `@remotion/three` 的 `ThreeCanvas` |
| 渲染增强 | WebGL / GLSL Shader | 流体、光效、纹理、后处理 | headless 必须 `--gl=angle` |
| 组件化 / 合成 | React + TypeScript + Remotion | **主推**：多镜头、字幕、音画同步 | 帧即状态，`useCurrentFrame()` |
| 时间线动画 | GSAP | 复杂缓动、时间线编排、批量错位 | **必须 `paused: true` + 手动 seek** |
| 配音 | edge-tts（CLI/Python） | 默认路径，快、免费、音色自然 | 也可用浏览器技能走 edge-tts.com |
| 音效/BGM | Python 生成 或 搜索免版权素材 | 转场音、氛围垫乐 | 商用务必确认授权 |
| 编码合成 | FFmpeg | 混流、混音、烧字幕、转场、压缩 | 系统已装 8.x，libx264/aac/libass 齐全 |
| **剪辑已有素材** | FFmpeg + EDL（`scripts/vedit.py`） | 裁剪、拼接、转场、水印、画幅、压缩、与生成片段混合 | 三阶段 conform → assemble → finish，见 §7 |

**默认选型（90% 的情况）**：`Remotion + React + TS + edge-tts + FFmpeg`。
**环境很轻 / 只要一个 HTML 文件**：`HTML + Canvas + GSAP`，用 Playwright 逐帧截图再交给 FFmpeg。

---

## 3. 标准工作流（生成路线）

> 如果用户给的是**已有素材**（「帮我剪一下这个视频 / 把这几段拼起来 / 加个字幕」），走 §7 剪辑模式：`probe → plan → build`，不要套用下面的生成流程。

```
Step 0 环境自检 → Step 1 脚本解析 → Step 2 配音+字幕 → Step 3 视觉代码
      → Step 4 静帧试渲 → Step 5 全片渲染 → Step 6 合成封装 → Step 7 交付自检
```

### Step 0 · 环境自检（必做，30 秒）

```bash
bash scripts/check_env.sh
```

它会检查 node / python3 / ffmpeg+libx264+aac / edge-tts / CJK 字体 / Remotion 依赖 / Chrome Headless Shell，并直接告诉你缺什么、装什么。**缺 ffmpeg 或缺 CJK 字体是最高频的两个坑。**

首次准备（在本技能目录或复制出的项目目录下执行）：

```bash
# 依赖（npm 或 pnpm 二选一；pnpm 不可用就用 npm）
npm install

# 下载 Remotion 用的 Chrome Headless Shell（约 92MB，只下一次）
npx remotion browser ensure

# edge-tts（推荐独立 venv，避免污染系统 Python）
python3 -m venv .venv && .venv/bin/pip install edge-tts
.venv/bin/edge-tts --version
```

### Step 1 · 脚本解析（把文案变成可配音的分段）

产出 `examples/script.sample.json` 这样的 JSON。**先分工，再写词**：

```json
{
  "title": "示例：60 秒产品介绍",
  "fps": 30,
  "segments": [
    { "id": "hook", "text": "如果做一条视频，只需要把想法写成代码，会怎样？", "pause_after_ms": 500 },
    { "id": "s1",   "text": "这是 web-video-produce。你描述画面，模型写代码，机器出片。", "pause_after_ms": 400 },
    { "id": "s2",   "text": "画面可以是网页、Canvas 动画，也可以是三维场景与着色器。", "pause_after_ms": 400 },
    { "id": "s3",   "text": "配音交给 edge-tts，字幕与时间轴自动生成，音画天然对齐。", "pause_after_ms": 400 },
    { "id": "cta",  "text": "写完最后一帧，交给 FFmpeg，一条 MP4 就诞生了。",
      "voice": "zh-CN-YunjianNeural", "rate": "+0%", "pause_after_ms": 0 }
  ]
}
```

写作规范（直接影响配音质量与剪辑自由度）：

- **一段一口气**：每段 ≤ 40 字（中文），一句话一个意思，段间留 `pause_after_ms` 200–600ms。
- **`id` 就是视觉切点**：`hook / s1 / s2 / cta` 这些 id 会被画面代码用来切镜头，命名要能表达内容。
- **数字与专名口语化**："15 秒" → "十五秒"，"API" → "A P I"，避免 TTS 读错。
- **不写句号「。」**（技能硬约束）：断句用逗号，或拆成新的一段。句号会带来句末降调，这是配音听起来假的最大来源。
- **无标点的长句会被读成一句**，比预期长很多；写完先跑一遍 TTS 看时长。
- 纯文本输入也支持：`.txt`/`.md` 用空行分段，或 `## ` 标题分段。

### Step 2 · 配音 + 字幕 + 时间轴（一条命令）

```bash
# 用本技能自带脚本（推荐）：批量、并发、重试、段间留白、自动拼接、字幕偏移对齐
.venv/bin/python scripts/tts_edge.py \
  --script examples/script.sample.json \
  --outdir public/voice \
  --voice zh-CN-XiaoxiaoNeural \
  --rate +8% --fps 30 --normalize
```

产物（`--outdir` 下）：

| 文件 | 用途 |
| --- | --- |
| `vo.mp3` | 整条配音音轨（含段间静音，可做响度归一） |
| `vo.srt` / `vo.vtt` | 与音轨严格对齐的字幕，时间已加段偏移 |
| `manifest.json` | **画面代码的唯一时间来源**：每段的 `start_frame` / `duration_frames` |
| `parts/seg_000.mp3`、`seg_000.srt` | 单段中间产物，可单独替换某句重录 |

真实输出示例（实测 5 段共 6 秒完成合成）：

```json
{ "voice": "zh-CN-XiaoxiaoNeural", "fps": 30, "total_duration": 29.084, "total_frames": 873,
  "segments": [ { "id": "hook", "start": 0.0, "end": 4.536, "start_frame": 0, "duration_frames": 136 } ] }
```

### Step 3 · 视觉代码生成（选一条路）

| 路线 | 适合 | 入口 |
| --- | --- | --- |
| A. Remotion（推荐） | 多镜头、字幕、音画同步、要复用组件 | `src/index.ts` + `src/Root.tsx` |
| B. HTML + Canvas + GSAP | 单页动画、要交付可交互的 HTML | `templates/html-gsap/index.html` |
| C. Three.js + GLSL | 三维、着色器、粒子流体 | `src/scenes/ThreeShaderScene.tsx` |

**路线 A 的最小骨架（本技能已提供可直接跑的实现）：**

```
src/
├── index.ts        registerRoot(RemotionRoot)
├── Root.tsx        <Composition id="WebVideo" …/> + <Still id="Cover"/>
├── Main.tsx        用配音段的 id 切场景 + <Audio/> + <Subtitles/>
├── config.ts       FPS / 宽高 / 配色（改这里全局生效）
├── fonts.ts        中文字体加载（headless 必须显式加载）
├── voice.ts        读 public/voice/manifest.json，暴露 startOf/endOf/captionAt
├── components/     Backdrop.tsx（背景）、Subtitles.tsx（字幕）
└── scenes/         TitleScene.tsx / GsapScene.tsx / ThreeShaderScene.tsx
```

### Step 4 · 静帧试渲（最省的检查方式）

```bash
npx remotion still src/index.ts Cover output/cover.png     # 封面/排版
npx remotion still src/index.ts WebVideo output/f_120.png --frame=120   # 指定帧
```

**必须**用图像查看能力打开这张 PNG，确认：中文字体不是豆腐块、文字没被裁切、对比度够、颜色符合预期。发现问题改代码重渲，**不要**急着渲全片。

### Step 5 · 全片渲染

```bash
# 有声成片（<Audio> 已在 Main.tsx 里）
npx remotion render src/index.ts WebVideo output/final.mp4 \
  --codec=h264 --crf=18 --pixel-format=yuv420p --color-space=bt709 --concurrency=4

# 先出无字幕底片，再用 FFmpeg 混 BGM / 烧字幕
npx remotion render src/index.ts WebVideo output/video_silent.mp4 \
  --codec=h264 --crf=18 --pixel-format=yuv420p --color-space=bt709 --muted
```

常用参数：`--frames=0-120`（只渲一段，调试用）、`--scale=0.5`（半分辨率快速预览）、`--concurrency=1`（WebGL 场景卡顿时）、`--gl=angle`（Three.js 必须）、`--color-space=bt709`（必加）、`--log=verbose`。

### Step 6 · 合成封装

```bash
# 混 BGM + 响度归一
bash scripts/mux.sh --video output/video_silent.mp4 --audio public/voice/vo.mp3 \
  --bgm assets/bgm.mp3 --bgm-gain -20 --loudnorm --out output/final.mp4

# 烧中文字幕（libass）
bash scripts/mux.sh --video output/video_silent.mp4 --audio public/voice/vo.mp3 \
  --subs public/voice/vo.srt --out output/final.mp4
```

### Step 7 · 交付自检（必做）

```bash
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate \
  -of default=nw=1 output/final.mp4

# 抽 3 帧确认画面与字幕
ffmpeg -v error -y -ss 2  -i output/final.mp4 -frames:v 1 output/check_02.png
ffmpeg -v error -y -ss 10 -i output/final.mp4 -frames:v 1 output/check_10.png
```

然后用图像查看能力核对抽帧，最后向用户报告：**文件绝对路径、时长、分辨率、帧率、编码、字幕是否内置、配音音色**。

---

## 4. 代码示例

### 4.1 React + Remotion：组合根与音画同步

```tsx
// src/Root.tsx —— 时长由配音决定，而不是手写数字
import { Composition, Still } from 'remotion';
import { Main } from './Main';
import { voice } from './voice';
import { FPS, WIDTH, HEIGHT, TAIL_FRAMES } from './config';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="WebVideo"
    component={Main}
    durationInFrames={Math.ceil(voice.total_duration * FPS) + TAIL_FRAMES}
    fps={FPS} width={WIDTH} height={HEIGHT}
  />
);
```

```tsx
// src/Main.tsx —— 用配音段的 id 切镜头，永远和声音对齐
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { startOf, endOf, voice } from './voice';

export const Main: React.FC = () => {
  const total = Math.ceil(voice.total_duration * 30) + 45;
  const scenes = [
    { from: 0,             to: endOf('s1'),  Comp: TitleScene },
    { from: startOf('s2'), to: endOf('s3'),  Comp: GsapScene },
    { from: startOf('cta'),to: total,        Comp: ThreeShaderScene },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {scenes.map(({ from, to, Comp }, i) => (
        <Sequence key={i} from={from} durationInFrames={to - from}>
          <Comp durationInFrames={to - from} />
        </Sequence>
      ))}
      <Subtitles />
      <Audio src={staticFile(`voice/${voice.audio}`)} />
    </AbsoluteFill>
  );
};
```

**字幕组件（段级）**：直接查 manifest，不要自己算秒数。

```tsx
const current = voice.segments.find(
  (s) => frame >= s.start_frame && frame < s.start_frame + s.duration_frames
);
```

**需要逐句/逐词字幕**就解析 SRT（`public/voice/parts/seg_XXX.srt` 或整条 `vo.srt`）：

```ts
const parseSrt = (txt: string) =>
  txt.trim().split(/\n\s*\n/).map((block) => {
    const [idx, time, ...rest] = block.split('\n');
    const [a, b] = time.split('-->').map((t) => {
      const [h, m, s] = t.trim().replace(',', '.').split(':').map(Number);
      return h * 3600 + m * 60 + s;
    });
    return { start: a, end: b, text: rest.join('\n') };
  });
```

**Remotion 常见 API 速查**：`useCurrentFrame()` 当前帧、`useVideoConfig()` → `{fps,width,height,durationInFrames}`、`interpolate(v,[in],[out],{extrapolateLeft:'clamp'})`、`spring({frame,fps,config})`、`<Sequence from durationInFrames>`、`<Audio src volume startFrom>`、`staticFile('voice/vo.mp3')`、`delayRender()/continueRender()`、`random(seed)`（确定性随机）。

### 4.2 GSAP 在 Remotion 里的唯一正确用法

GSAP 默认用 `requestAnimationFrame` 自走时间 → 渲染结果不可复现。**必须 paused + seek**：

```tsx
import gsap from 'gsap';
import { useCurrentFrame, useVideoConfig } from 'remotion';

export const GsapScene: React.FC<{ durationInFrames: number }> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  // 只构建一次时间线，单位统一"秒"
  useLayoutEffect(() => {
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(cardRefs.current, { y: 160, opacity: 0, rotate: -6 },
      { y: 0, opacity: 1, rotate: 0, duration: 0.85, ease: 'back.out(1.4)', stagger: 0.16 }, 0.35)
      .to(cardRefs.current, { y: -16, duration: 1.1, ease: 'sine.inOut', stagger: 0.1 }, 1.8);
    tlRef.current = tl;
    return () => { tl.kill(); tlRef.current = null; };
  }, []);

  // 每帧 seek 到对应位置；用 layout effect，保证截图前 DOM 已是终态
  useLayoutEffect(() => { tlRef.current?.seek(frame / fps, false); }, [frame, fps]);

  return <div>{/* … */}</div>;
};
```

同理，任何"第三方动画库"（Lottie、anime.js、Swiper 自动播放）都要遵守：**禁自走时钟，只接受帧号驱动**。

### 4.3 Three.js + GLSL（Remotion 内）

```tsx
import { ThreeCanvas } from '@remotion/three';
import * as THREE from 'three';

const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
uniforms.uTime.value = frame / fps;            // 直接改 uniform，不依赖 rAF
if (meshRef.current) meshRef.current.rotation.y = t * 0.63;

<ThreeCanvas width={width} height={height} camera={{ fov: 45, position: [0, 0, 4.2] }}>
  <mesh ref={meshRef}><icosahedronGeometry args={[1.15, 1]} />
    <meshStandardMaterial metalness={0.85} roughness={0.22} flatShading /></mesh>
  <mesh position={[0, 0, -1.6]}><planeGeometry args={[width / 90, height / 90]} />
    <shaderMaterial uniforms={uniforms} vertexShader={VERT} fragmentShader={FRAG} /></mesh>
</ThreeCanvas>
```

```glsl
// fragment：域扭曲 fbm，流体感；gl_FragColor 在 three 0.170 的 ShaderMaterial 里可用
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; } return v; }
void main(){
  vec2 p = (vUv - 0.5) * vec2(uRes.x/uRes.y, 1.0) * 2.6;
  vec2 q = vec2(fbm(p + uTime*0.35), fbm(p + vec2(5.2,1.3) - uTime*0.35));
  float n = fbm(p + 1.6*q);
  vec3 col = mix(vec3(0.03,0.05,0.11), vec3(0.10,0.55,0.52), smoothstep(0.25,0.85,n));
  gl_FragColor = vec4(col, 1.0);
}
```

**Three.js 渲染要点**：`remotion.config.ts` 里设 `Config.setChromiumOpenGlRenderer('angle')`；命令行加 `--gl=angle`；卡顿/黑屏时降级 `--gl=swangle --concurrency=1`。所有动画量都从 `uTime = frame/fps` 推出来。

### 4.4 HTML + Canvas + GSAP（轻量路线）

`templates/html-gsap/index.html` 是一个可直接打开、也符合"帧协议"的模板：

```js
const q = new URLSearchParams(location.search);
const FPS = Number(q.get('fps') ?? 30);
const FRAME = Number(q.get('frame') ?? 0);
const T = FRAME / FPS;                    // 唯一时间来源

// 确定性"随机"：整数哈希代替 Math.random()
const rand = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

const tl = gsap.timeline({ paused: true });
tl.from('#title', { y: 70, opacity: 0, duration: 0.9, ease: 'power3.out' }, 0)
  .from('.card', { y: 90, opacity: 0, stagger: 0.14 }, 0.5);
tl.seek(Math.min(T, tl.duration()), false);   // ← 只 seek，不让 GSAP 走时钟

window.__FRAME_READY__ = true;                 // 通知截图器"这一帧好了"
```

截图成片：

```bash
npm i -D playwright && npx playwright install chromium

node scripts/capture_frames.mjs \
  --html templates/html-gsap/index.html --outdir frames \
  --fps 30 --seconds 12 --width 1920 --height 1080

bash scripts/frames_to_video.sh --frames frames --fps 30 \
  --audio public/voice/vo.mp3 --out output/from_frames.mp4
```

也可直接播放录屏（牺牲确定性，画质与音画同步较差，仅应急）：浏览器 `canvas.captureStream()` + `MediaRecorder` 导出 WebM，再 `ffmpeg -i in.webm -c:v libx264 -c:a aac out.mp4`。

### 4.5 中文字体（**最容易翻车的地方**）

headless 环境经常一个 CJK 字体都没有，中文会渲染成 □□□。三选一，**必须有一步**：

```ts
// ① 首选：Remotion 官方 Google 字体（需要联网渲染，首次会拉取多份子集）
import { loadFont } from '@remotion/google-fonts/NotoSansSC';
const { fontFamily } = loadFont('normal', { weights: ['400','700','900'], subsets: ['chinese-simplified','latin'] });
export const FONT = fontFamily;

// ② 离线/更快：把 woff2 放进 public/fonts，用 @remotion/fonts 加载
import { loadFont } from '@remotion/fonts';
const { fontFamily } = loadFont({ family: 'Noto Sans SC', url: staticFile('fonts/NotoSansSC-Bold.woff2'), weight: '900' });

// ③ 组件内 CSS import（@fontsource 已装）+ delayRender 等字体就绪
import '@fontsource/noto-sans-sc/900.css';
```

> 实测提醒：`@remotion/google-fonts` 的 `loadFont` 会**预加载全部子集**（NotoSansSC 三档字重约 294 个请求，会打印 `Made 294 network requests` 警告），首次静帧渲染约 1–2 分钟。想快就用方案 ②：一个字体文件、一次请求、完全离线。
> FFmpeg 烧字幕是另一套字体系统（libass + fontconfig）：`fc-match -s 'sans-serif:lang=zh-cn'` 看它实际会用哪个字体；字体缺失时用 `fontsdir=` 指向自带字体目录。

---

## 5. AI 配音：两条路径

### 路径 A（默认）· edge-tts 命令行 / Python

**安装**

```bash
# 推荐：独立 venv（Ubuntu 24+/Debian 有 externally-managed-environment 限制，不要直接 pip install）
python3 -m venv .venv && .venv/bin/pip install edge-tts

# 也可以用 pipx / uv（如已安装）
pipx install edge-tts
uvx edge-tts --version
```

**CLI 直出音频 + 字幕（一行搞定）**

```bash
.venv/bin/edge-tts \
  --voice zh-CN-XiaoxiaoNeural \
  --rate=+8% --pitch=-2Hz --volume=+0% \
  --text "欢迎来到本期节目，今天聊聊用代码做视频。" \
  --write-media public/voice/demo.mp3 \
  --write-subtitles public/voice/demo.srt     # 后缀写 .vtt 就输出 VTT

# 从长文本文件读，并列出所有声音
.venv/bin/edge-tts -f script.txt -v zh-CN-YunxiNeural --write-media vo.mp3 --write-subtitles vo.srt
.venv/bin/edge-tts --list-voices | grep '^zh-'
```

**参数语义**

| 参数 | 格式 | 建议 |
| --- | --- | --- |
| `--rate` | `+10%` / `-15%` | 中文口播 +5% ~ +12% 最自然；旁白 +0% |
| `--pitch` | `+2Hz` / `-8Hz` | 男声偏低用 `-5Hz`，儿童/卡通 `+10Hz` |
| `--volume` | `+0%` / `+20%` | 一般不动，音量交给 FFmpeg `loudnorm` |
| `--voice` | `zh-CN-…Neural` | 见下表 |

**配音"太假"怎么救（按性价比排序，前三条免费且立刻见效）**

| 顺序 | 动作 | 原理 | 实测 |
| --- | --- | --- | --- |
| 1 | **去掉所有句号** | 句号 = 句末下降调 + 长停顿，一句一个降调就是"念课文" | 技能已默认强制 |
| 2 | **改用整段韵律模式** `--mode whole` | 分段合成时每个请求自带 ~0.6s 尾静音，且语调在段首重置 | 同稿 8.75s → 6.98s，1.8s 是假停顿 |
| 3 | **语速降到 +0% ~ +5%** | +10% 以上齿音与韵律都会失真 | — |
| 4 | **换音色** | 不同音色"假"的程度差很多 | `python3 scripts/tts_audition.py` 一次生成全音色对照试听 |
| 5 | **换引擎** | edge-tts 是"够用"档；要"以假乱真"必须换声源 | 见下表 |

```bash
# 一条命令生成所有中文音色的同句对照试听（含说明清单 index.md）
python3 scripts/tts_audition.py --outdir output/voice_samples --rate +5%
python3 scripts/tts_audition.py --text "你的文案，逗号断句" --voices zh-CN-YunxiNeural,zh-CN-YunjianNeural
python3 scripts/tts_audition.py --list      # 列出全部可用中文音色
```

**换引擎：什么时候该离开 edge-tts**

| 方案 | 中文自然度 | 成本 | 接入方式 | 适合 |
| --- | --- | --- | --- | --- |
| **edge-tts**（当前默认） | ★★★☆ | 免费 | 已接入 | 原型、批量、日常口播 |
| **Azure 语音服务**（同一批 Neural 声音 + SSML） | ★★★★ | 免费额度 50 万字符/月 | REST + SSML `<mstts:express-as style="cheerful">` | 想保留现有音色但让它"会说话"（加情感/角色/重音/停顿） |
| **MiniMax speech-02** | ★★★★★ | 按量付费 | HTTPS API | 中文口播最自然的一档，短视频解说首选 |
| **火山引擎（豆包）语音合成** | ★★★★★ | 按量付费 | 需签名鉴权 | 带货腔、情绪起伏大的口播 |
| **阿里云 CosyVoice / qwen-tts**（DashScope） | ★★★★☆ | 按量付费 | DashScope 原生接口 | 要音色克隆、要情绪控制 |
| **智谱 GLM TTS** | ★★★★ | 按量付费 | API Key | 已有智谱账号可直接复用 |
| **OpenAI `gpt-4o-mini-tts` / `tts-1`** | ★★★☆（中文带轻微外语腔） | 按量付费 | OpenAI 兼容接口 | 中英混说、英文为主 |
| **本地 GPT-SoVITS / CosyVoice2** | ★★★★★（可克隆你自己的声音） | 免费但需 GPU | 本地部署 + HTTP | 要"完全不像 AI"、要本人声音、可接受折腾 |
| ElevenLabs | 英文 ★★★★★ / 中文 ★★★☆ | 较贵 | API Key | 英文内容为主 |

> 剪映 / CapCut 的朗读音色确实好听，但**没有公开 API**，只能靠浏览器自动化点，不稳定，不建议作为生产路径。
> 选定之后接进来很简单：`tts_edge.py` 只需替换"文本 → 音频"这一步，时间轴/字幕/manifest 的产出逻辑完全复用。**把 API Key 给我，我可以直接接一个进来做 A/B。**

**背景配乐（默认开启）**

```bash
# 默认：自动混入 assets/bgm.mp3，侧链闪避，片头淡入 / 片尾淡出
python3 scripts/tts_edge.py --script examples/script.intro10s.json --outdir public/voice --fps 30 --normalize

# 换曲子 / 调音量 / 关掉闪避 / 整条不要音乐
python3 scripts/tts_edge.py ... --bgm assets/my-music.mp3 --bgm-gain-db -26 --no-duck
python3 scripts/tts_edge.py ... --no-bgm

# 没有合适素材？直接用代码合成一段免版权垫乐（可调和弦进行与时长）
python3 scripts/make_bgm.py --seconds 48 --progression Am Fmaj7 Cmaj7 G6 --out assets/bgm.mp3
```

> **为什么自己合成**：BGM 必须可商用。`make_bgm.py` 用纯 Python 做加法合成（正弦叠加 + 和弦交叉淡化），
> 相位用绝对时间计算所以切换处不会爆音，不烘焙淡入淡出所以可无缝循环。默认 Am7 – Fmaj7 – Cmaj7 – G6。

**换成你自己的 TTS API（"可以调用自己的 tts-api"）**

只要服务能"给文本、还音频"，就能接进来；**时间轴与字幕逻辑完全复用**，只有"文本→音频"这一步被替换。

```bash
# A) OpenAI 兼容的 /audio/speech（OpenAI / SiliconFlow / 智谱 / 火山方舟等多数厂商）
export TTS_API_KEY=sk-xxxx          # 或 --tts-api-key
python3 scripts/tts_edge.py --script examples/script.intro10s.json --outdir public/voice \
  --engine openai --tts-base-url https://api.openai.com/v1 \
  --tts-model gpt-4o-mini-tts --voice alloy --fps 30

# B) 完全自定义端点（字段不一样时用 JSON 模板适配）
python3 scripts/tts_edge.py --script script.json --outdir public/voice \
  --engine custom --tts-endpoint https://your-tts.example.com/v1/synthesize \
  --tts-header "X-App-Id=my-app" \
  --tts-payload '{"text":"{text}","speaker":"{voice}","format":"mp3"}' \
  --voice my-speaker-id
```

- 模板占位符：`{text}` `{voice}` `{model}` `{speed}`；响应体直接是音频字节。
- 鉴权默认 `Authorization: Bearer <key>`，可用 `--tts-header K=V` 追加或覆盖。
- **自建引擎会自动改用分段模式**（拿不到逐词边界，整段韵律模式不可用），每段时长由 `ffprobe` 回读，时间轴依然精确。

**Python API（要批量、要自定义时间轴时用这个）**

```python
import asyncio, edge_tts

async def synth(text, voice="zh-CN-XiaoxiaoNeural", rate="+8%", out="vo.mp3", srt="vo.srt"):
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch="+0Hz", volume="+0%")
    submaker = edge_tts.SubMaker()           # 7.x：feed() + get_srt()
    with open(out, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                submaker.feed(chunk)
    open(srt, "w", encoding="utf-8").write(submaker.get_srt())

asyncio.run(synth("第一句。第二句。"))
```

> `Communicate(..., boundary=...)` 默认 `SentenceBoundary`（一句一条字幕）；要"逐词高亮卡拉OK"就传 `boundary="WordBoundary"`，配合 `chunk["offset"]`/`chunk["duration"]`（单位 100ns）自己算时间。

**长文本分段（**必须做**）**

- 单次请求建议 ≤ 260 字；超长文本会超时或截断。
- 按标点切句 → 每段独立合成 → 用 concat 拼接 → **每段时长累加得到全局偏移**，字幕时间要加上偏移。
- 本技能的 `scripts/tts_edge.py` 已经实现：自动切分、4 路并发、指数退避重试、段间静音、concat 拼接、SRT/VTT 偏移合并、`manifest.json` 帧号导出、可选 EBU R128 响度归一。

```bash
# 全部参数
.venv/bin/python scripts/tts_edge.py --help
# 逐段覆盖音色/语速：script.json 里每段可带 voice / rate / pitch / pause_after_ms
# 只重录第 3 段：删掉 public/voice/parts/seg_002.* 后重跑（默认带缓存，不重复请求）
```

**中文声音选型（本机实测 `edge-tts --list-voices` 的全部 zh 音色）**

| 音色 | 性别 | 调性 | 适合 |
| --- | --- | --- | --- |
| `zh-CN-XiaoxiaoNeural` | 女 | 温暖、通用 | **默认首选**：口播、叙事、产品介绍 |
| `zh-CN-XiaoyiNeural` | 女 | 活泼、卡通 | 短视频、教程、轻松内容 |
| `zh-CN-YunxiNeural` | 男 | 阳光少年感 | 科技、Vlog、年轻向 |
| `zh-CN-YunjianNeural` | 男 | 浑厚有力 | 预告片、体育、宣传片高潮 |
| `zh-CN-YunyangNeural` | 男 | 专业新闻播报 | 新闻、纪录片、严肃解说 |
| `zh-CN-YunxiaNeural` | 男童 | 可爱 | 动画、亲子 |
| `zh-CN-liaoning-XiaobeiNeural` | 女 | 东北口音、幽默 | 方言段子、接地气内容 |
| `zh-CN-shaanxi-XiaoniNeural` | 女 | 陕西口音、明亮 | 地域文化内容 |
| `zh-HK-HiuGaaiNeural` / `zh-HK-HiuMaanNeural` | 女 | 粤语 | 港澳内容 |
| `zh-HK-WanLungNeural` | 男 | 粤语 | 港澳内容 |
| `zh-TW-HsiaoChenNeural` / `zh-TW-HsiaoYuNeural` | 女 | 台湾国语 | 台湾市场 |
| `zh-TW-YunJheNeural` | 男 | 台湾国语 | 台湾市场 |

**推荐配方**（语速统一压到 +0% ~ +5%，配合 `--mode whole` 与去句号）：科普/商业口播 `XiaoxiaoNeural +3%`；产品发布 `YunjianNeural +0%`；新闻 `YunyangNeural +0%`；教程 `YunxiNeural +5%`；活泼短视频 `XiaoyiNeural +5%`。

### 路径 B（回退）· 用浏览器技能操作 https://edge-tts.com/zh-CN/

什么时候走这条路：
- edge-tts CLI 装不上（公司网络禁 pip / 无 Python 环境）；
- 命令行报错（403、握手失败、`Sec-MS-GEC` 相关）且升级重试无效；
- 需要该网页独有的声音、风格、试听对比或批量导出功能。

操作步骤（**用浏览器自动化技能，不要凭空猜测页面结构**）：

1. 加载浏览器技能：调用 `skill` 工具，name = `browser-skill`（用户口中的 `/browser-skills` 即此技能；它提供 `browser_*` 工具集，复用用户已登录的 Chromium）。
2. 打开页面：导航到 `https://edge-tts.com/zh-CN/`。
3. **先观察再动手**：读取页面快照/DOM，确认文本框、语音下拉、语速/音调滑杆、生成按钮、下载按钮的实际选择器与文案（页面会改版，切勿硬编码上一次的选择器）。
4. 填入**一段**文本（同一条 ≤ 260 字的规则；长文本分多次生成），选好语音与语速，点击生成。
5. 等待生成完成（监听下载事件或按钮状态变化），把音频下载到 `public/voice/parts/seg_00N.mp3`。
6. 对每段重复 4–5；全部下完后**回到命令行**：

```bash
# 用本地工具补齐时间轴与字幕（不依赖网页）
.venv/bin/python scripts/tts_edge.py --script examples/script.sample.json --outdir public/voice --force   # 若需重新合成
# 或者：已有分段 mp3 时直接拼接（把网页下载的 mp3 按序号放进 parts/，然后）
ffmpeg -y -f concat -safe 0 -i parts/list.txt -c:a libmp3lame -b:a 128k -ar 24000 -ac 1 public/voice/vo.mp3
```

7. 网页路径**拿不到 SRT** 时：**不要按字数均分**（每个字的实际时长差异极大，均分出来的字幕一定飘）。
   正确做法二选一：① 每句单独生成一个音频文件 → 时长由 `ffprobe` 回读，字幕就是"一句一段"，天然准确；
   ② 只输出整段音频 + 外挂字幕文件让用户校对，并在交付说明里写明"时间轴未经逐句对齐"。
   无论哪种，都必须在交付信息里如实标注对齐精度。
8. 若页面需要登录/验证码/下载被浏览器拦截：如实报告，不要伪造音频文件。

**降级顺序**：`edge-tts CLI` → `python -m edge_tts` → 浏览器技能走 edge-tts.com → 其他 TTS（用户提供的云 API / `pyttsx3`+`espeak-ng` 本地合成，音质较差需说明）→ **无配音模式**（只出 BGM + 内嵌字幕的视频，并告知用户）。

### 字幕格式

- `vo.srt`：给 FFmpeg 烧字幕、给播放器用（`00:00:01,443 --> 00:00:04,056`）。
- `vo.vtt`：给网页 `<track>` 用（`00:00:01.443 --> 00:00:04.056`，带 `WEBVTT` 头）。
- 两者由 `tts_edge.py` 同时产出，时间轴与音频一致；**改过配音就要重新生成，不要手改字幕时间**。
- 烧字幕需要 libass 与 CJK 字体（见 4.5）。

---

## 6. FFmpeg 合成命令手册（实测可用）

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

## 7. 剪辑模式（EDL → MP4）

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
| `timeline[].transition_out` | `{ "type": "fade / dissolve / wipeleft / …", "duration": 0.6 }`；也可写在后一段的 `transition_in` |
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

## 8. 输出目录结构规范

```
project/
├─ SKILL.md                  # 本文件
├─ package.json              # Remotion 项目与 npm scripts（含 edit / edit:plan）
├─ remotion.config.ts        # 渲染配置（angle / 并发 / 超时）
├─ tsconfig.json
├─ examples/
│   ├─ script.sample.json    # 生成路线：分段脚本（配音与画面的共同输入）
│   └─ edit-plan.example.json# 剪辑路线：EDL 剪辑计划（timeline / overlays / audio_track）
├─ scripts/
│   ├─ tts_edge.py           # 批量配音 + SRT/VTT + manifest.json（帧号时间轴）
│   ├─ tts_audition.py       # ★ 同句多音色对照试听，选声音别再盲选
│   ├─ make_bgm.py           # ★ 代码合成免版权背景配乐（可商用、可无缝循环）
│   ├─ validate.py           # ★ 静态校验器：确定性/时间轴/素材/字体/成片规格与响度
│   ├─ vedit.py              # ★ 剪辑器：probe / plan / build / conform（EDL → MP4）
│   ├─ mux.sh                # 混流/混音/烧字幕/响度归一
│   ├─ frames_to_video.sh    # PNG 序列 → MP4
│   ├─ capture_frames.mjs    # HTML 页面确定性逐帧截图（Playwright）
│   ├─ make_sample_assets.sh # 生成异构 demo 素材（剪辑用）
│   └─ check_env.sh          # 环境自检（含剪辑滤镜能力探测）
├─ templates/
│   └─ html-gsap/index.html  # 帧协议 + Canvas2D + GSAP 模板
├─ src/
│   ├─ index.ts  Root.tsx  Main.tsx  Cover.tsx
│   ├─ config.ts  fonts.ts  voice.ts
│   ├─ components/  Backdrop.tsx  Subtitles.tsx
│   └─ scenes/      TitleScene.tsx  GsapScene.tsx  ThreeShaderScene.tsx
├─ assets/                   # ★ 素材区（剪辑的来源）
│   ├─ raw/                  # 用户原始素材，只读，绝不覆盖
│   ├─ sample/               # demo：clip_a/b/c.mp4 + logo.png + bgm.mp3
│   ├─ logo.png  bgm.mp3     # 成片用的水印与垫乐
│   └─ sfx/                  # 音效
├─ public/
│   ├─ voice/
│   │   ├─ vo.mp3  vo.srt  vo.vtt  manifest.json
│   │   └─ parts/seg_000.mp3  seg_000.srt  …
│   └─ fonts/                # 离线中文字体（可选但推荐）
├─ work/                     # ★ 剪辑中间产物（part_00N.mp4 / timeline.mp4），交付前可删
├─ frames/                   # 可选：逐帧 PNG 中间产物（很大，交付前可删）
└─ output/                   # 交付目录
    ├─ final.mp4             # 生成路线成片（H.264 + AAC + faststart）
    ├─ edit.mp4              # 剪辑路线成片
    ├─ final.srt             # 外挂字幕（可选）```

**命名约定**：`vo.mp3` = voice over；`video_silent.mp4` = 无音底片；`final.mp4` = 交付成片；`manifest.json` = 时间轴清单。**交付物只放 `output/`，中间产物不要混进去。**

**新建项目**（把技能资产复制出去）：

```bash
mkdir -p my-video && cp -r "$SKILL_DIR"/{scripts,templates,examples,src,package.json,tsconfig.json,remotion.config.ts} my-video/
cd my-video && npm install && npx remotion browser ensure && bash scripts/check_env.sh
```

---

## 9. 故障排查与回退策略

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 中文渲染成 □□□ | headless 无 CJK 字体 | 见 4.5：`@remotion/google-fonts` 或 `public/fonts` + `@remotion/fonts` |
| 首帧字体不对、后面正常 | 字体未就绪就截图 | `delayRender()` / `loadFont()` 卡住首帧；不要用 `font-display: swap` |
| FFmpeg 报 `Unknown encoder 'libx264'` | 精简版 ffmpeg | 换完整版，或临时 `-c:v mpeg4`（体积大、兼容差） |
| FFmpeg 烧字幕报错/豆腐块 | libass 缺字体 | `fontsdir=` + `FontName=` 对齐；或改用 `drawtext` + `fontfile=` |
| Remotion 报找不到 Chrome | 未下载 Headless Shell | `npx remotion browser ensure`；离线环境设 `REMOTION_CHROME_EXECUTABLE` 指向系统 Chromium |
| 渲染卡在 0% | WebGL/字体 `delayRender` 未释放 | 检查 `continueRender` 是否被调用；调大 `Config.setDelayRenderTimeoutInMilliseconds` |
| Three.js 场景全黑 | headless 无 GPU | `--gl=angle`；仍黑则 `--gl=swangle --concurrency=1` |
| 渲染极慢 | 帧多 / 并发低 / 分辨率高 | 先 `--scale=0.5` 试片；调 `--concurrency`（CPU 核数级）；减少 3D 与模糊特效 |
| **配音听起来很假/像念课文** | 句号带来的句末降调 | 去掉所有「。」（技能已默认强制）；断句改用逗号 |
| **配音一顿一顿、句子之间空很久** | 分段合成：每个请求自带约 0.6s 尾静音，且语调在段首重置 | 用 `--mode whole`（默认）整段一次合成；同稿 8.75s → 6.98s |
| **配音发飘、齿音重** | 语速太快 | `--rate` 压到 +0% ~ +5% |
| **上传后颜色发灰/偏色** | 成片是 full-range `yuvj420p` + BT.601 | 渲染加 `--color-space=bt709`；`validate.py --out` 会直接报出来 |
| **音乐在人声下「瘪掉」** | 用了整体侧链闪避 | 默认已是多频段 carve（只挖 300–3400Hz）；别手动加 `--no-carve` |
| **BGM 盖过人声 / 忽大忽小** | 没做闪避或音量过高 | 默认已开 `sidechaincompress` 闪避；再不行调 `--bgm-gain-db -26` |
| **BGM 结尾被硬切** | 没有留收尾空间 | 保持 `--tail-ms` ≥ 600（默认），混音会做 1.5s 淡出 |
| **自建 TTS 报 401/403** | 鉴权头不对 | 用 `--tts-header "Authorization=Bearer xxx"` 显式覆盖 |
| **自建 TTS 整段模式失效** | 该引擎没有词边界 | 预期行为：自动降级为分段模式，日志会说明 |
| **不知道选哪个音色** | 盲选 | `python3 scripts/tts_audition.py` 生成同句全音色对照 |
| edge-tts 403 / 握手失败 | 端点限流或版本旧 | 升级 edge-tts；降低 `--concurrency`；加重试；换网络/代理 `--proxy`；仍失败走路径 B |
| edge-tts 长文本截断 | 单次请求过长 | 分段 ≤260 字（`tts_edge.py` 已内置自动切分） |
| 字幕与语音错位 | 手工改过音频/字幕 | 重新跑 `tts_edge.py`，以 `manifest.json` 为准 |
| 音画不同步 | 采样率/帧率不一致 | 统一 48kHz、统一 FPS；用 `-itsoffset` 微调 |
| 音频忽大忽小 | 分段合成未归一 | `--normalize` 或 FFmpeg `loudnorm=I=-16:TP=-1.5` |
| 渲染结果每次不一样 | 用了随机/真实时间 | 改 `random(seed)`、去掉 `Date.now()`/`performance.now()` |
| 磁盘爆掉 | `frames/` 是 GB 级 | 交付前删 `frames/`，或直接用 Remotion 不落帧 |
| 内网无法访问 npm/pypi | 企业网络 | 配镜像源；或走"HTML 单文件 + 用户本地录屏"的降级交付 |
| **剪辑**：拼接处黑帧/花屏 | 素材参数不一致，没 conform | 必须先过 conform（分辨率/帧率/pix_fmt/SAR 统一）；`vedit.py` 默认强制 conform |
| **剪辑**：转场处时长错乱、音画漂移 | offset 用了"请求时长"而不是真实时长 | offset 必须用 `ffprobe` 回读时长算：`offset = 前段累计 − 转场时长`；越界时工具会直接报错 |
| **剪辑**：拼接处"啪"的爆音/断音 | 音轨硬切，或采样率不一致 | 有 xfade 就要有同值 acrossfade；统一 48kHz/fltp/立体声；段内加 30ms `afade` |
| **剪辑**：有的片段没声音导致拼接失败 | 素材无音轨，各段流数不一致 | conform 自动补 `anullsrc` 静音轨；手动拼时用 `-f lavfi -i anullsrc=r=48000:cl=stereo` |
| **剪辑**：成片时长比预期长 | BGM 用了 `-stream_loop -1` 把尾部撑长 | 输出加 `-t <时间线时长>` 封口（`vedit.py` 已内置） |
| **剪辑**：VFR 录屏（手机/录屏软件）抽帧抖动 | 可变帧率没转 CFR | conform 用 `fps=30 -vsync cfr`；进 Remotion 前也必须先 conform |
| **剪辑**：手机竖拍素材方向不对 | 旋转元数据 | 让 ffmpeg 自动 autorotate 烘焙进像素，conform 后元数据归零 |
| **剪辑**：HDR 素材成片发灰 | 10bit/HDR 直接转 8bit | 先 `zscale=t=linear,tonemap=hable,zscale=t=bt709...` 再进流水线（见 §6 第 13 条） |
| **剪辑**：`filter_complex` 报参数不匹配 | 滤镜图里混了不同尺寸/像素格式 | 走四级降级（`--force-level 2/3` 验证）；先看 `vedit.py plan` 打印的命令 |
| **剪辑**：水印"闪一下就没了" | 视频叠加没重置时间基 | 叠加前加 `setpts=PTS-STARTPTS`（图片会循环、视频不会） |
| **剪辑**：`-map "[0:a]"` 报 label 不存在 | filter 标签写成了输入流名 | filter 输出写 `[label]`，直接引用输入流写 `0:a`，两者不能混 |
| **剪辑**：命令太长被 shell 拒绝 | 段数太多，filtergraph 超长 | 拆成"两两合成分步 + 中间文件"，不要拼一条巨长命令 |

**通用回退阶梯**：`缩小规模（半分辨率/3 秒样片）` → `换更简单的技术路线（Remotion → HTML+截图）` → `去掉最贵的特性（3D/模糊/粒子）` → `降级配音（网页路径/无配音）` → `如实说明并交付部分成品`。**永远不要假装成功，也不要编造文件路径。**

---

## 10. 重要注意事项

1. **Remotion 许可证**：个人与 ≤3 人的公司免费；更大规模商用需要购买 Company License。交付给企业用户时提示这一点。
2. **edge-tts 的性质**：走的是微软 Edge「大声朗读」的公开端点，**不是**官方商用 API，可能限流或随时变更；大批量或商业关键场景建议换 Azure Speech / 火山 / 阿里云等有 SLA 的服务，并在交付说明里标注。
3. **素材版权**：BGM、音效、图片、字体都要可商用。不要从视频网站抓取音视频。字体注意授权（Noto/Source Han 为 OFL，可商用）。
4. **隐私**：参考图、文本会发送到第三方服务（edge-tts 端点 / 浏览器站点）。用户数据敏感时先询问是否允许联网。
5. **成本与时间**：渲染是 CPU 密集型。1080p30 的 1 分钟片子，简单 2D 约 1–3 分钟，3D/着色器可能 10 分钟以上。**开工前先告诉用户预计耗时，先出样片。**
6. **确定性优先于炫技**：能复现的普通画面 > 不可复现的惊艳画面。任何"每次都不一样"的效果都会让返工变成灾难。
7. **磁盘**：1920×1080 PNG 序列约 2–4MB/帧，30fps 一分钟就是 5GB+。优先直接渲染 MP4，不要落帧。
8. **交付要说清楚**：文件绝对路径、时长、分辨率、帧率、编码、配音音色、字幕是否内嵌；有降级/估算的地方必须明确标注。
9. **不要越权**：用户只说"做视频"时，先给 10 秒样片或封面确认方向，再投入全片；不要一上来渲 5 分钟成片。
10. **中文排版**：中文不用空格断词，行高建议 1.4–1.6；正文 ≥40px（1080p），字幕 ≥42px；避免一行超过 20 个汉字。
11. **先修「假」再谈换引擎。** 去句号 + 整段模式 + 降速能解决大部分「配音假」；仍不满意再换 Azure SSML / MiniMax / 火山 / 本地克隆（见 §5）。换引擎只替换「文本→音频」这一步，时间轴与字幕逻辑全部复用。
12. **剪辑不要动用户原始素材。** 所有中间产物写 `work/`，成片写 `output/`；原始素材只读。交付前可删 `work/`。
13. **剪辑先 `plan` 再 `build`。** 剪辑是不可逆操作（会覆盖输出文件），先看打印出来的命令与 offset 数值，确认无误再执行。
14. **降级要如实说。** 走到 level 2/3 说明这条成片**没有转场**；走到"无配音模式"说明**没有配音**。含糊其辞等于交付事故。

---

## 11. 交付清单（Checklist）

- [ ] `bash scripts/check_env.sh` 全绿（或已知缺失项已向用户说明）
- [ ] 脚本分段 JSON 已确认（分段合理、口播顺畅、id 语义清晰）
- [ ] `manifest.json` 存在，`fps` 与 `src/config.ts` 一致
- [ ] `vo.mp3` + `vo.srt` + `vo.vtt` 已生成，字幕时间与音频对齐
- [ ] 静帧自检通过（中文不是豆腐块、无裁切、对比度足够）
- [ ] 画面无随机/真实时间依赖（grep `Math.random`、`Date.now`、`performance.now`）
- [ ] 全片渲染完成，`output/final.mp4` 存在
- [ ] `python3 scripts/validate.py --out <成片>` 通过（0 错误）
- [ ] `ffprobe` 报告的时长/分辨率/帧率/编码符合预期，且 `color_space=bt709`、`color_range=tv`
- [ ] 抽 2–3 帧用图像能力核对过画面与字幕
- [ ] 音量正常（无爆音、无忽大忽小），BGM 未盖过人声
- [ ] 已向用户报告：路径、规格、音色、字幕状态、任何降级说明

**剪辑路线（`vedit.py build`）额外检查：**

- [ ] 素材已 `probe` 过（确认分辨率/帧率/有无音轨/HDR/旋转）
- [ ] `plan` 打印的 offset 已手工核对一遍（前段累计 − 转场时长）
- [ ] conform 产物时长来自 ffprobe 回读，不是 EDL 里写的数字
- [ ] 无音轨素材已自动补静音轨（`anullsrc`），各段音轨数一致
- [ ] 成片时长 == Σ段时长 − Σ转场时长（±1 帧）
- [ ] 转场处抽帧无黑帧/闪白；`--force-level 2/3` 未被动用过（用了就要标注降级）
- [ ] `volumedetect` 无爆音（max 不接近 0dB）、无静音（mean 不低于 -35dB）
- [ ] 水印位置/不透明度、字幕未被裁切、竖屏无拉伸
- [ ] 用户原始素材未被修改，`work/` 已按需清理
