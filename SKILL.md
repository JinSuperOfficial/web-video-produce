---
name: web-video-produce
description: 用代码做视频（Code-to-Video）与剪辑成片。当用户要求"做一条视频/生成视频/文生视频/把脚本变成视频/给文章配视频/做产品宣传片/做个动画短片/生成 MP4/配音+字幕+成片"，或要求"剪辑/裁剪/拼接/合并视频/加转场/加片头片尾/给已有视频配字幕配音/加 BGM/加水印 logo/画中画/横屏转竖屏/压缩视频/变速/批量转码"时使用。能力一：把文本变成 MP4——解析脚本分段，用 edge-tts 生成配音与字幕时间轴（含逐词时间戳），再用 Remotion / React / Three.js / GLSL / Canvas / GSAP 写视觉代码逐帧渲染，FFmpeg 合成。能力二：EDL 驱动剪辑已有素材——conform 标准化 → 裁剪/拼接/语义转场/overlay 水印/画幅适配/压缩，可与代码生成的片段混合成片。
version: 1.2.0
license: MIT
metadata:
  tags: [video, editing, remotion, react, three.js, glsl, canvas, gsap, edge-tts, tts, ffmpeg, mp4, subtitle, srt, karaoke, edl, xfade, sfx, watermark, transcode]
  stack: [HTML/CSS/JS, Canvas 2D, Three.js, WebGL/GLSL, React+TS+Remotion, GSAP, edge-tts, FFmpeg]
  entrypoints:
    cli: scripts/wvp.py
    voice: scripts/tts_edge.py
    audition: scripts/tts_audition.py
    bgm: scripts/make_bgm.py
    sfx: scripts/make_sfx.py
    validate: scripts/validate.py
    project: src/index.ts
    edit: scripts/vedit.py
    mux: scripts/mux.sh
    capture: scripts/capture_frames.mjs
    doctor: scripts/check_env.sh
  references:
    generate: references/generate.md
    audio: references/audio.md
    edit: references/edit.md
    ffmpeg: references/ffmpeg.md
    frames: references/frames.md
    motion: references/motion-transitions.md
    structure: references/structure.md
    troubleshooting: references/troubleshooting.md
  verified_on: "Linux + Node 22.22 / ffmpeg 8.0.1 / edge-tts 7.2.8 / Remotion 4.0.533"
  outputs: [MP4(H.264+AAC), SRT, VTT, words.json, PNG, PNG/JPG 序列, 剪辑成片]
---

# web-video-produce — 写代码做视频 / 剪视频

> 一句话：**生成** = 文本 → 分段脚本 → 配音与时间轴 → 视觉代码 → 逐帧渲染 → FFmpeg 合成 → MP4；
> **剪辑** = 已有素材 → conform 标准化 → EDL 时间线（裁剪/转场/叠加）→ FFmpeg 合成 → MP4。
> 你（Agent）不是"剪辑师"，你是**程序员**：视频是代码（或 EDL）的产物，每一帧都必须可复现。

---

## 0. 先做这三件事

```bash
python3 scripts/wvp.py doctor                     # ① 开工前问一次：环境 + 工程 + 已有成片规格
python3 scripts/wvp.py timeline --verify-audio    # ② 配音对好轴了吗（回到音频上实测，不靠猜）
python3 scripts/wvp.py render                     # ③ 一条命令出片：配音 → 渲染 → 合成 → 验收
```

`wvp.py` 是本技能的统一入口，只有三个子命令 —— **别再去记 check_env.sh / validate.py /
tts_edge.py / remotion render / mux.sh / ffprobe 的调用顺序**，那正是它存在的理由。

| 命令 | 做什么 | 什么时候用 |
| --- | --- | --- |
| `doctor` | 环境自检 + 静态校验 + 成片规格；`--preview 6` 还能抽帧给你看 | 开工前；出片后；报 bug 前 |
| `timeline` | 段/帧/词对齐检查；`--verify-audio` 解码音轨实测每个词窗的电平 | 配音之后、渲染之前 |
| `render` | TTS → 时间轴校验 → 静态校验 → 渲染 → 补音轨 → 验收 | 出片；`--scale 0.5 --frames 0-60` 出样片；`--batch` 批量 |

两个逃生舱：`--no-tts` 复用已有配音；`--scale 0.5 --frames 0-60` 先出 2 秒半分辨率样片。

**触发场景（生成）**：做一条视频、生成视频、文生视频、把文案/文章/脚本做成视频、宣传片、科普动画、数据可视化视频、动态海报、配音 + 字幕 + 成片、导出 MP4。

**触发场景（剪辑）**：剪辑/剪一下、裁剪、截取片段、多段拼接、合并视频、加转场、加片头片尾、给已有视频配字幕/配音、加 BGM、加水印 logo、画中画、横屏转竖屏、压缩体积、变速、批量转码、把实拍素材和动画片段混成一条片。

**不适用 / 需要换方案**：

| 需求 | 处理 |
| --- | --- |
| 真人实拍（需要相机/演员） | 不属于本技能，如实说明；但**已有素材的后期剪辑属于本技能**（走 `references/edit.md`） |
| 只想生成单张图片 | 用生图插件（`generate_image`），不要启动整条视频流水线 |
| 想要可视化拖拽时间线 GUI | 本技能是 CLI/EDL 驱动，没有 GUI；如实说明并给出 `vedit.py plan` 的命令行方案 |
| 用户没有装 Node/FFmpeg 且拒绝安装 | 只交付"HTML 单文件 + 播放说明"，或先跑 `wvp.py doctor` 报告缺什么 |
| 需要 4K/60fps 长片（>10 分钟） | 先做 15 秒样片验证，再评估时间与磁盘成本，务必先跟用户确认 |

---

## 1. 核心理念（六条铁律）

1. **时间轴是唯一真相，配音先定稿。** 视频长度由配音决定，不要先写死秒数再配音。顺序永远是：脚本 → 配音 → 拿到每句的帧号 → 再写画面代码。
2. **每一帧都是纯函数 f(frame)。** 禁止 `Math.random()`、`Date.now()`、`requestAnimationFrame` 累加时间、CSS 无限动画。需要随机就用固定种子的 PRNG（Remotion 有 `random(seed)`）。
3. **先样片后全片。** 先渲 1 张静帧（`remotion still`）确认字体/构图/颜色，再渲 3 秒，最后才渲全片。渲染是最贵的一步。剪辑同理：先 `vedit.py plan` 看命令，再 `build`。
4. **音频用现成工具，画面用代码。** 不要用代码合成 TTS；不要用代码做混音。配音交给 edge-tts，编码与混音交给 FFmpeg。
5. **交付即验证。** 出片后必须用 `ffprobe` 报告时长/分辨率/编码，用抽帧图确认画面与字幕，再把路径给用户。
   `wvp.py render` 与 `doctor` 会自动跑 `scripts/validate.py --out <成片>`：一次性查确定性铁律、时间轴一致性、场景 id、素材引用、字体、成片规格与响度，有错直接非零退出。
   另：**H.264 必须显式设 bt709**（`Config.setColorSpace('bt709')` 或 `--color-space=bt709`）。不设的话 Remotion 不传 `-color_range/-colorspace`，ffmpeg 会写成 full-range `yuvj420p` + BT.601，平台转码时颜色会漂。
6. **异构素材必须先 conform，再进滤镜图。** 分辨率/帧率/编码/采样率/音轨数不一致的素材直接拼 = 黑帧、爆音、时长错乱。**剪辑四条硬约束（不可协商）**：
   - **① 标准化预处理**：拼接前一律先转码统一为同一分辨率 + 帧率 + 编码（H.264/yuv420p）+ 48kHz 立体声；无音轨的素材补静音轨。
   - **② 转场安全区**：只用 xfade 常见转场，且 **offset 必须 = 前段累计时长 − 转场时长**；`转场时长 ≤ min(前段,后段)/2`，越界直接报错而不是硬拼。
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
| 动作 / 转场 | `src/motion/` + `src/transitions/` | 进场动作、错位、数字滚动、跨切点转场 | 11 种动作 + 11 种转场，纯帧驱动，见 `references/motion-transitions.md` |
| 时间线动画 | GSAP | 复杂缓动、时间线编排、批量错位 | **必须 `paused: true` + 手动 seek** |
| 配音 | edge-tts（CLI/Python） | 默认路径，快、免费、音色自然，**唯一能产出逐词时间戳的引擎** | 也可接自己的 TTS API（`--engine voicecraft`，如 tts.jinsuper.cn）或走网页回退，见 `references/audio.md` |
| 音效 / BGM | `make_bgm.py` / `make_sfx.py` 代码合成 | 转场音、事件音、氛围垫乐 | 自研合成、可商用，不用找素材 |
| 编码合成 | FFmpeg | 混流、混音、烧字幕、转场、压缩 | 系统已装 8.x，libx264/aac/libass 齐全 |
| **剪辑已有素材** | FFmpeg + EDL（`scripts/vedit.py`） | 裁剪、拼接、语义转场、水印、画幅、压缩、与生成片段混合 | 三阶段 conform → assemble → finish |

**默认选型（90% 的情况）**：`Remotion + React + TS + edge-tts + FFmpeg`。
**环境很轻 / 只要一个 HTML 文件**：`HTML + Canvas + GSAP` + 帧协议，见 `references/frames.md`。

---

## 3. 按需加载（不要让全部内容一次进上下文）

SKILL.md 只保留"决定怎么做"的部分（铁律、选型、CLI）。真正干活的细节在 `references/` 下，
**按当前任务读对应的那一份**：

| 你在做什么 | 读这一份 | 里面有什么 |
| --- | --- | --- |
| 从文案生成一条片子 | [`references/generate.md`](references/generate.md) | 7 步工作流、脚本 JSON 规范、Remotion/GSAP/Three.js/Canvas 代码骨架、中文字体三种方案 |
| 配音、选音色、BGM、音效、响度 | [`references/audio.md`](references/audio.md) | edge-tts 全参数与音色表、"配音假"的五档救法、逐词时间戳 words.json、自建 TTS API、网页回退路径 |
| 剪已有素材（裁剪/拼接/转场/水印/画幅/压缩） | [`references/edit.md`](references/edit.md) | EDL 规范、三阶段流水线、四条硬约束的代码落地、语义转场风格表、混合成片 |
| 抄 FFmpeg 命令 | [`references/ffmpeg.md`](references/ffmpeg.md) | 13 条实测命令、concat 滤镜 vs demuxer、`-ss` 位置、字幕烧制 |
| 用 HTML/Canvas 路线 + 逐帧截图 | [`references/frames.md`](references/frames.md) | 帧协议 v1 API、截图器参数与实测速度、确定性自检、帧序列成片的色彩处理 |
| 写画面代码要动作/转场 | [`references/motion-transitions.md`](references/motion-transitions.md) | 22 种动作/转场的形态表、API、摆放不变式、5 个已踩的坑 |
| 摆工程目录 / 交付前打勾 | [`references/structure.md`](references/structure.md) | 目录规范、注意事项（许可证/版权/成本）、交付清单 |
| 出问题了 | [`references/troubleshooting.md`](references/troubleshooting.md) | 40+ 条症状 → 原因 → 处理，最后一节是通用回退阶梯 |

---

## 4. 最小可跑流程（TL;DR）

```bash
# 0) 环境与依赖（首次）
npm install && npx remotion browser ensure
python3 -m venv .venv && .venv/bin/pip install edge-tts

# 1) 自检
python3 scripts/wvp.py doctor

# 2) 写脚本（不写句号、每段 ≤40 字、id 语义化）→ examples/script.intro10s.json

# 3) 出片（配音 + 渲染 + 合成 + 验收，一条命令）
python3 scripts/wvp.py render --out output/final.mp4

# 4) 检查时间轴与词级对齐
python3 scripts/wvp.py timeline --words
python3 scripts/wvp.py timeline --verify-audio

# 5) 剪辑已有素材
python3 scripts/vedit.py probe assets/raw/*.mp4
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json   # 先看命令
python3 scripts/vedit.py build --edl examples/edit-plan.example.json   # 再执行
python3 scripts/vedit.py transitions                                   # 不知道用哪种转场时
```

**交付时必须报告**：文件绝对路径、时长、分辨率、帧率、编码、配音音色、字幕是否内嵌、
以及任何降级（没转场 / 没配音 / 时间轴未经逐句对齐）。

---

## 5. 交付清单（详细版见 `references/structure.md`）

- [ ] `python3 scripts/wvp.py doctor` 全绿（或已知缺失项已向用户说明）
- [ ] 脚本分段 JSON 已确认；`manifest.json` 的 `fps` 与 `src/config.ts` 一致
- [ ] `python3 scripts/wvp.py timeline --verify-audio` 通过（词窗落在语音上）
- [ ] 静帧自检通过（中文不是豆腐块、无裁切、对比度足够）
- [ ] `wvp.py render` 第 4 步验收通过：`color_space=bt709`、`color_range=tv`、无爆音、响度在 -24~-12 LUFS
- [ ] 抽 2–3 帧用图像能力核对过画面与字幕
- [ ] 剪辑路线额外：`plan` 的 offset 手工核对过、成片时长 == Σ段 − Σ转场（±1 帧）、无降级
- [ ] 已向用户报告：路径、规格、音色、字幕状态、任何降级说明
