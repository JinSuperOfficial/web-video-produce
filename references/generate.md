# 生成路线：脚本 → 配音 → 视觉代码 → 渲染 → 成片

从一份文案开始，到 `output/final.mp4` 为止的完整流程、每一层的代码骨架、
中文字体处理，以及"先静帧后全片"的检查节奏。

先读 `SKILL.md` 的六条铁律；这里只讲怎么落地。
命令入口优先用 `python3 scripts/wvp.py render`（它会按顺序把这些步骤串起来并逐步验收）。

---

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
