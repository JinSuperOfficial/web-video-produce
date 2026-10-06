# HTML / Canvas 路线的帧协议

不依赖 Remotion 的轻量路线：**一个 HTML 文件 + 帧协议 + 逐帧截图 + FFmpeg 成片**。
适合"环境很轻 / 只想交付一个能打开的网页动画 / 不想装 Remotion"的场景。

这条路唯一的契约是一句话：

> **画面 = f(帧号)。给同一个帧号，必须得到同一张图。**

只要页面满足这条，任何截图器（本技能的 `capture_frames.mjs`，或你自己写的）都能确定性驱动它，
渲染结果可复现、可返工。

---

## 1. 帧协议 v1（`templates/frame-protocol.js`）

引入这个文件后，页面获得三个全局函数：

| API | 作用 |
| --- | --- |
| `__registerTimeline(name, tl)` | 注册一条"可 seek"的时间线。任何带 `.seek(秒, suppressEvents)` 的对象都行（GSAP timeline 天然满足）。注册时会立刻同步到当前帧，避免空白帧 |
| `__onSeek(fn)` | 注册自己的重绘函数 `fn(frame, t秒)`。Canvas 2D / 手写渲染用这个 |
| `__seek(frame)` | **截图器唯一需要调用的入口**。把画面推到第 frame 帧，返回 Promise，resolve 时表示"已经合成到屏幕上" |

另有 `window.__wvp`（状态，含 `fps` / `frame` / `durationInFrames` / `timelines`）与
`window.__frameInfo()`（调试用）。

页面侧写法（`templates/html-gsap/index.html` 是完整可跑的示例）：

```html
<script src="../frame-protocol.js"></script>   <!-- 必须最先加载 -->
<script>
  // ① 第三方动画库：paused 时间线，交给协议去 seek
  const tl = gsap.timeline({ paused: true });
  tl.from('#title', { y: 70, opacity: 0, duration: 0.9 }, 0)
    .from('.card',  { y: 90, opacity: 0, stagger: 0.14 }, 0.5);
  __registerTimeline('cards', tl);

  // ② 自己的绘制：注册成钩子，参数是 (帧号, 秒)
  __onSeek((frame, t) => drawBackdrop(frame, t));

  // ③ 首次渲染（直接用浏览器打开时也能看到画面）
  window.__seek(window.__wvp.frame);
</script>
```

**协议里的 `requestAnimationFrame` 只用来等浏览器合成，不用来推进动画时间。**
这个区分就是全部确定性的来源：用 rAF 累加时间 → 每次渲染结果都不同；用帧号推导 → 可复现。

### 写页面时的三条禁令

1. 不用 `Math.random()` / `Date.now()` / `performance.now()` 决定画面。
   要"随机"就用整数哈希：
   `const rand = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };`
2. 不用 CSS `animation` / `transition` 做主要动效 —— 它们无法被 seek。
   截图器会加 `animations: 'disabled'` 兜底，但那只是"冻在某个状态"，不是你要的那一帧。
3. 不用动画库的自动播放（Lottie / Swiper / anime.js 的 autoplay 都要关掉，改成手动 seek）。

---

## 2. 逐帧截图（`scripts/capture_frames.mjs`）

```bash
# 常用：整片逐帧（默认 png 无损）
node scripts/capture_frames.mjs --html templates/html-gsap/index.html \
  --outdir frames --fps 30 --seconds 12 --width 1920 --height 1080

# 快 5 倍：出 jpeg 中间帧（后面还要过一遍 H.264，肉眼看不出差别）
node scripts/capture_frames.mjs --html page.html --outdir frames --seconds 12 \
  --format jpeg --quality 92

# 调试构图：只截几帧，秒级反馈
node scripts/capture_frames.mjs --html page.html --outdir out --frames 0,30,60

# 老页面（没实现协议）：每帧重新加载
node scripts/capture_frames.mjs --html legacy.html --outdir frames --mode reload
```

| 参数 | 说明 |
| --- | --- |
| `--html` / `--url` | 本地文件或开发服务器地址 |
| `--mode` | `auto`（默认，检测到 `window.__wvp` 就走 protocol）/ `protocol` / `reload` |
| `--format` | `png`（默认，无损）/ `jpeg`（快 5 倍、体积 1/6） |
| `--frames` | 只截指定帧，如 `0,30,60`（调试构图用，别为看一帧渲全片） |
| `--executable` | 指定浏览器二进制；不填会自动复用 Remotion 下载的 chrome-headless-shell |

### 实测数据（1280×720，本机 headless-shell）

| 项目 | 实测 | 说明 |
| --- | --- | --- |
| `screenshot`（png） | **255 ms/帧** | 真正的瓶颈是 CDP 截图的 PNG 编码 |
| `screenshot`（jpeg q92） | **52 ms/帧** | ⇒ 整片 5 倍速，`--format jpeg` 是最有效的一档优化 |
| `__seek` | 41 ms/帧 | 其中 32ms 是等两层 rAF 合成，12ms 才是页面重绘 |
| protocol 整片（png） | 1.9 帧/秒 | 60 帧 / 32.1s |
| protocol 整片（jpeg） | **10.0 帧/秒** | 60 帧 / 6.0s |
| reload 整片（png） | 1.8 帧/秒 | 60 帧 / 16.5s（本地文件，加载很便宜） |

**结论要说清楚**：protocol 相比 reload 在**本地文件**上速度几乎一样，它的价值不在速度，而在于
① 页面只解析一次（重页面、开发服务器、WebGL 上下文不用每帧重建）；
② 不会每帧闪一次字体；
③ 截图器不需要知道动画库是什么（只要实现协议）。
**真正能提速的是输出格式**（jpeg 5 倍）。

### 依赖

```bash
npm i -D playwright        # 自带 Chromium（约 150MB），最省事
npm i -D playwright-core   # 只有驱动库；本仓库已装，会自动复用 Remotion 的 chrome-headless-shell
```

装了 `playwright` 就优先用它；只有 `playwright-core` 时会去找
`node_modules/.remotion/chrome-headless-shell/...`，所以**不需要再下一份浏览器**。

### 确定性自检（改完页面必须做一次）

```bash
# 同一个帧截两次，md5 必须完全一致
node scripts/capture_frames.mjs --html page.html --outdir work/A --frames 0,29,59
node scripts/capture_frames.mjs --html page.html --outdir work/B --frames 0,29,59
md5sum work/A/*.png work/B/*.png
```

本机实测：同帧两次 md5 完全一致；不同帧 md5 必然不同（说明画面确实在动）。
**同帧两次不一致就先去修页面，不要往下渲** —— 否则后面每一次返工都是灾难。

---

## 3. 帧序列 → MP4（`scripts/frames_to_video.sh`）

```bash
bash scripts/frames_to_video.sh --frames frames --fps 30 \
  --audio public/voice/vo.mp3 --out output/from_frames.mp4
```

帧模板（`f_%05d.png` / `f_%05d.jpg` / 自定义）自动识别，png 与 jpg 都支持。

**色彩管理（必须和 Remotion 路线一致，否则两条路线的成片颜色不一样）**：
截出来的是**全范围**（full range / pc）画面，直接编码的话 ffmpeg 会写成
`yuvj420p + color_range=pc + BT.601`，上传平台按 BT.709 limited 解释就会偏色。
所以脚本显式声明输入是全范围，并用 `scale` 转成 limited + BT.709 后编码。

实测（直接读**存储的原始 Y 平面字节**，不做任何范围转换）：

| | 原始 Y 均值 | 范围 | 标记 |
| --- | --- | --- | --- |
| 源 JPEG（全范围） | 12.92 | [0,116] | — |
| 修复前 mp4 | 12.93 | [0,119] | `yuvj420p` / `pc` / `bt470bg` |
| 修复后 mp4 | **25.77** | [11,119] | `yuv420p` / `tv` / `bt709` |

理论值 `16 + 12.92 × 219/255 = 27.1`，与实测 25.77 吻合 —— 数据确实存成了 limited。

**一个容易搞错的点**：full→limited 是 [0,255]→[16,235] 的**严格重映射，不会削波**，
不要误以为"暗部会被压成纯黑"。代价是暗部的量化精度：把成片按 limited 展开回 RGB，
与源帧的逐像素偏差约 1.4/255；画面越暗相对误差越大，但绝对偏差仍然肉眼不可见。
