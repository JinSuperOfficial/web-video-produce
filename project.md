# project.md · 项目交接文档

> 交接对象：接手这个仓库的工程师 / 未来的自己 / 另一个 Agent。
> 目标：读完这一份，能改代码、能排障、能扩展，不需要再问原作者。
>
> 配套文档：[`README.md`](README.md)（面向使用者）、[`SKILL.md`](SKILL.md)（面向 LLM Agent 的操作手册）。

---

## 1. 项目定位

| 项 | 内容 |
| --- | --- |
| 一句话 | 让**纯文本 LLM** 具备"写代码做视频"的能力：文本 → 配音 → 画面代码 → 逐帧渲染 → MP4 |
| 形态 | 一个 **DSH Skill**（`~/.dsh/skills/web-video-produce/`），同时是**独立可跑的项目** |
| 仓库 | https://github.com/JinSuperOfficial/web-video-produce |
| 关键卖点 | ① 纯文本 LLM 可用（不需要多模态）② Web 技术栈 ③ 默认 edge-tts 免费出声 ④ **可接自己的 TTS API** ⑤ 附带 EDL 剪辑能力 |
| 非目标 | 不做 GUI 时间线编辑器；不做自动粗剪（去静音/场景切分）；不做直播推流 |

**为什么它能被纯文本 LLM 驱动**：所有中间产物都是**可读的文本或可探测的数值** ——
脚本是 JSON、时间轴是 `manifest.json`（帧号）、渲染器输出 `ffprobe` 可读的规格、画面可用抽帧图+读图能力自检。
LLM 不需要"看见"视频，只需要读写这些文件。

---

## 2. 快速上手（3 条命令）

```bash
python3 scripts/wvp.py doctor                 # 环境 + 工程 + 成片规格，一次问清
npm install && npx remotion browser ensure    # 依赖 + 渲染用 Chrome
python3 -m venv .venv && .venv/bin/pip install edge-tts

python3 scripts/wvp.py render --out output/intro10s.mp4   # 一条命令出片（含逐步验收）
python3 scripts/vedit.py plan --edl examples/edit-plan.example.json   # 剪辑先看命令
python3 scripts/vedit.py build --edl examples/edit-plan.example.json  # 再执行 → output/edit.mp4
```

**统一入口是 `scripts/wvp.py`**（`doctor` / `render` / `timeline` 三个子命令），
它把 `check_env.sh → validate.py → tts_edge.py → remotion render → mux.sh → ffprobe`
这条固定顺序固化下来，每步都有硬性验收 —— 以前漏一步（比如忘了 `--color-space=bt709`）就会交付出错色的成片。

---

## 3. 架构总览

```
                    ┌──────────────── 生成路线 ────────────────┐
文本/主题 ──▶ script.json ──▶ tts_edge.py ──▶ vo.mp3 + vo.srt + manifest.json + words.json
   │                              │(edge-tts / 自建 TTS API)          │
   │                              └── make_bgm.py / make_sfx.py 提供免版权 BGM 与音效
   │                                                                  ▼
   └──▶ LLM 写画面代码(src/*.tsx / templates/*.html) ──▶ Remotion 逐帧渲染
                （src/motion 动作库 + src/transitions 转场层 + src/components/SfxTrack）
                                                          │
                                                          ▼
                                              output/final.mp4 (H.264+AAC)
        wvp.py render 负责串联：TTS → 时间轴校验 → 静态校验 → 渲染 → 补音轨 → 验收
        wvp.py timeline --verify-audio 负责"证明"音画真的对齐（解码音轨量词窗能量）

                    ┌──────────────── 剪辑路线 ────────────────┐
已有素材 ──▶ edit-plan.json ──▶ vedit.py: conform ──▶ assemble ──▶ finish ──▶ output/edit.mp4
             (EDL)                统一规格           转场/拼接      叠加/BGM/字幕/压缩
```

**两条路线的连接点**：Remotion 渲染出的片段可以直接写进 EDL 当普通素材（conform 会识别出它已达标并跳过重编码）；
反过来，素材也可以进 Remotion（`<OffthreadVideo>`，但必须先 conform 成 CFR）。

---

## 4. 文件地图

| 文件 | 职责 | 改它的时机 |
| --- | --- | --- |
| `SKILL.md` | **Agent 的入口/路由**：铁律、选型、CLI、以及"该读哪份 reference" | 只在"决定怎么做"的层面变了才改 |
| `references/*.md` | 按需加载的细节（generate / audio / edit / ffmpeg / frames / motion / structure / troubleshooting） | 具体做法、参数、坑，都写这里 |
| `scripts/wvp.py` | **统一 CLI**：doctor / render / timeline | 新增一个固定流程步骤时 |
| `scripts/tts_edge.py` | 配音管线：分段 → 合成 → 停顿重组 → BGM → 响度归一 → 字幕/manifest/**words** | 换 TTS 引擎、改停顿/配乐策略 |
| `scripts/make_sfx.py` | 代码合成 6 个免版权音效（转场/弹出/铺垫/重击/点击/收铃） | 想要新音效 |
| `scripts/tts_audition.py` | 同句多音色对照试听 | 几乎不用改 |
| `scripts/make_bgm.py` | 代码合成免版权垫乐 | 想换和弦进行/时长 |
| `scripts/validate.py` | **静态校验器**：确定性/时间轴/场景 id/素材/字体/成片规格与响度 | 新增了不变量就往里加一条 |
| `scripts/vedit.py` | EDL 剪辑器（probe/plan/build/conform/**transitions**） | 加转场风格、加叠加能力、改降级策略 |
| `scripts/mux.sh` | 给**已有成片**做混流/混音/烧字幕/归一 | 一次性封装需求 |
| `scripts/capture_frames.mjs` | HTML 路线的确定性逐帧截图（协议/重载双模式，png/jpeg） | 很少改 |
| `scripts/sync_skill.sh` | 把仓库同步成一份 DSH Skill（排除依赖与中间产物） | 加了顶层目录时 |
| `scripts/check_env.sh` | 环境自检（含剪辑滤镜探测） | 新增了依赖就补一行 |
| `templates/frame-protocol.js` | **帧协议 v1**：`__seek` / `__registerTimeline` / `__onSeek` | 协议升级时 |
| `src/config.ts` | 全局参数：FPS/宽高/片尾留白/配色 | 换片子规格 |
| `src/voice.ts` | 读 `public/voice/manifest.json`，暴露 `startOf/endOf/captionAt` | 时间轴契约变更时 |
| `src/motion/index.ts` | 动作库：11 种进场动作 + 错位/数字滚动/打字机/进度 | 想要新动作形态 |
| `src/transitions/index.tsx` | 转场层：11 种跨切点转场 + 入场/出场样式 | 想要新转场 |
| `src/components/SfxTrack.tsx` | 音效轨：按绝对帧或 `seg:<id>` 锚点卡帧 | 加音效事件 |
| `src/Main.tsx` | 场景编排 + 转场覆盖层 + `<Audio>` + `<SfxTrack>` | 加/减场景 |
| `src/fonts.ts` | 中文字体加载 | 换字体或改离线策略 |
| `src/scenes/*.tsx` | 四套视觉范本（标题 / GSAP 卡片 / Three+GLSL / MotionShowcase 动作转场剧场） | 换视觉风格 |
| `examples/*.json` | 分段脚本 + EDL 示例 | 改示例时 |

---

## 5. 数据契约（改这些等于改 API）

### 5.1 分段脚本 `examples/script.*.json`

```jsonc
{
  "segments": [
    { "id": "s1",                      // ★ 会被画面代码用来切场景
      "text": "用代码做视频",            // 不要写句号「。」（见 §7 不变量 6）
      "pause_after_ms": 0,             // 段后额外停顿（默认 400 由 --gap-ms 给）
      "voice": "...", "rate": "...", "pitch": "..." }   // 可选，按段覆盖
  ]
}
```

### 5.2 时间轴 `public/voice/manifest.json`

画面代码**只认这个文件**，不允许手写"大概几秒"。

```jsonc
{
  "voice": "zh-CN-XiaoxiaoNeural", "rate": "+5%", "mode": "whole",
  "fps": 30, "audio": "vo.mp3", "srt": "vo.srt",
  "total_duration": 11.544, "total_frames": 346,
  "segments": [
    { "id": "s1", "text": "用代码做视频",
      "start": 0.098, "end": 1.383, "duration": 1.285,
      "start_frame": 3, "duration_frames": 39, "file": "vo.mp3" }
  ]
}
```

### 5.3 词级时间戳 `public/voice/words.json`

**逐词**时间戳，给卡拉OK 高亮、音效卡点、逐词校对用。只有 edge-tts 引擎能产出。

```jsonc
{
  "fps": 30, "mode": "whole",
  "precision": "word",                    // 拿不到就如实写 "none" + note 说明原因
  "source": "edge-tts WordBoundary",
  "total_duration": 12.024, "total_frames": 361, "word_count": 23,
  "words": [ { "text": "画面", "start": 2.087, "end": 2.462,
               "start_frame": 63, "duration_frames": 11,
               "segment": "s2", "segment_index": 1 } ]
}
```

**关键实现**：整段韵律模式会按段切开、段间插真停顿（`rebuild_with_pauses`），
这是一个**分段平移** —— 切片内部音频一个采样都不动。所以词级时间只要落在同一个切片里，
平移量就与它所属的那句话完全一致：`remap_time()` 是**精确映射，不是估算**。
`words.json` 里的时间已经过这一步重整，可以直接用。

校验方式是回到音频上量能量，而不是看 JSON 自洽：`wvp.py timeline --verify-audio`
解码音轨、算每个词窗的 RMS，实测 23/23 落在语音上（对照：不做平移只有 19/23）。

### 5.4 剪辑计划 EDL `examples/edit-plan.example.json`

字段说明见 `SKILL.md` §7.3。要点：`output.width/height` 是整个流水线**唯一**规格来源；
`transition_out.duration` 会被硬断言校验（≤ min(前段,后段)/2）。

---

## 6. 关键设计决策（为什么这么做）

| 决策 | 原因 |
| --- | --- |
| 时长由配音决定，不写死秒数 | 写死秒数 + 后配音 = 音画不同步的必然结局 |
| 先渲静帧再渲全片 | 渲染是最贵的一步；字体/构图问题在静帧阶段就能发现 |
| GSAP 必须 `paused:true` + 每帧 `seek()` | GSAP 默认用 `requestAnimationFrame` 自走时钟，渲染不可复现 |
| 剪辑先 conform 再进滤镜图 | 异构素材直接拼接 = 黑帧/花屏/爆音/时长错乱，这是 90% 的失败来源 |
| offset 用 `ffprobe` **回读**时长算 | `-ss` 精度与容器时长有偏差，用请求值算 offset 必然漂移 |
| 转场越界直接报错而不是"尽力而为" | 宁可不做，也不产出看起来正常实则错乱的时间线 |
| 四级降级 + 明确日志 | 剪辑不可逆，用户有权知道"这条没有转场" |
| 配音默认整段一次请求 | 分段合成每段自带 ~0.6s 尾静音且语调重置，是"配音假"的主因 |
| BGM 用代码合成 | 免版权、可商用、体积可控、可无缝循环 |
| BGM 用**多频段 carve** 而非整体闪避 | 整体压低会让音乐在整个旁白期间"瘪掉"；只挖人声频段（300–3400Hz）则人声清楚、音乐还是音乐。实测低频能量：整体闪避 -43.2dB vs carve -36.1dB（不处理 -35.4dB） |
| 响度用**两遍 loudnorm**（linear=true） | 单遍动态模式会二次改变音色与段间关系；两遍法只做线性增益 |
| H.264 显式 `bt709` + `color_range tv` | 不设时 Remotion 不传色彩参数，ffmpeg 默认写成 full-range `yuvj420p` + BT.601，平台转码会漂色 |
| 校验器在渲染**前**跑 | 把"渲完 10 分钟才发现 fps 不一致"提前到 1 秒内报出来 |
| 词级时间戳用**分段平移**映射，不是重新估算 | 停顿重整本身就是分段平移；用同一个映射就能让词级时间与音频精确一致（不需要重新跑 TTS） |
| 词块要**逐词比对**稿件，不是只比总字数 | TTS 会把 "15" 读成 "十五"：总字数相同的话，只比总数会静默错位，字幕从此飘掉 |
| 自建 TTS 引擎的字幕是**一句一段**（不是留空） | 以前写空 SRT，结果是"有配音没字幕"的静默失败；按真实回读时长分句，粗但准 |
| `check_env.sh` 先把 ffmpeg 能力抓进变量再匹配 | `ffmpeg … \| grep -q` 配 `set -o pipefail` 会因 SIGPIPE(141) 误报"缺 libx264"，交互式终端不复现、被 subprocess 调用时 20/20 失败 |
| 转场在 EDL 里写**语义风格**（soft/dip/push…） | ffmpeg 有 58 种 xfade，但"该用哪种"只有几种意图；风格名稳定、带默认时长，且与 Remotion 侧同一套词汇 |
| 转场覆盖层峰值对准切点（`from = cut − D/2`） | `from = cut − D` 会让转场全在旧场景那侧播完，中间出现"两边都不在"的空帧 |
| 音效锚点支持 `seg:<id>` | 用绝对帧号写死，改配音后要回来手改；用段落锚点则自动跟随 |
| 空闲帧不返回恒等样式 | 恒等的 transform/clip-path/filter 仍会创建独立合成层并逐帧重栅格化（按原理避免，未能在本机隔离出可靠收益） |
| `wvp.py` 的 `run()` 带超时 | 实测 `mix_bgm` 的 ffmpeg 卡死过：文件停在 256KB 一动不动，因为没有超时，看起来和"正在渲染"一模一样 |
| `tts_http()` 显式设 User-Agent | Cloudflare 前置的 TTS 会 403 掉 Python 默认 UA（`error code: 1010`），而 curl 是通的 —— 不设 UA 会被误判成"接口坏了" |
| `vedit.py` 零第三方依赖 | 交接成本最低；只用 python3 标准库 + ffmpeg |

---

## 7. 不变量（改代码时别破坏）

1. **`manifest.json` 是音画同步的唯一真相** —— 画面代码不得自行推算秒数。
2. **offset 只用回读时长** —— `vedit.py` 中 `conform_segment()` 返回的 `duration` 必须来自 `ffprobe`。
3. **转场安全断言** —— `assert_transitions()` 必须在 conform 前（预检）与 conform 后（权威）各跑一次。
4. **有 xfade 必有 acrossfade** —— 音频链与视频链结构一一对应，否则爆音。
5. **降级必须可见** —— 任何 fallback 都要 `warn()` 并在交付信息里标注。
6. **口播稿不写句号** —— `tts_edge.py` 默认剔除；这是听感问题，不是排版洁癖。
7. **不修改用户原始素材** —— 中间产物一律写 `work/`，交付物写 `output/`。
8. **渲染确定性** —— 禁止 `Math.random()` / `Date.now()` / `performance.now()`（`validate.py` 会扫，注释里的示例不算）。
9. **成片色彩空间必须是 `bt709` + `color_range=tv`** —— 见 §6 决策表；`validate.py --out` 会卡这一条。
   HTML 路线的 `frames_to_video.sh` 也必须显式转 limited + 标 bt709，否则两条路线颜色不一致。
10. **第三方参考材料不进仓库、不抄内容** —— 见 §8b。
11. **确定性只认帧号** —— 画面、HTML 页面、截图器三处都遵守"画面 = f(帧号)"；HTML 侧由帧协议保证。
12. **`words.json` 的精度必须如实标注** —— 拿不到词边界就写 `precision: "none"`，不许假装有。
13. **转场覆盖层的遮挡峰值落在切点上** —— `src/Main.tsx` 里 `cuts[i].kind === scenes[i+1].enter`，两边方向必须一致。
14. **交付物只放 `output/`，中间产物只在 `work/`** —— `public/sfx` 是 `assets/sfx` 的同步副本，正本永远在 `assets/`。

---

## 8. 如何扩展

### 8.1 加一个新场景（画面）

1. 在 `src/scenes/` 新建 `XxxScene.tsx`，接收 `{ durationInFrames }`；
2. 在 `src/Main.tsx` 的 `scenes` 数组里给一个区间（用 `startOf('id')` / `endOf('id')` / `TITLE_FRAMES` 锚定）；
3. 想加新台词段 → 改 `examples/script.intro10s.json` 的 `segments`（新增 `id`），重跑 TTS。

### 8.2 加一个新 TTS 引擎

`scripts/tts_edge.py` 的 `tts_http()`：
- OpenAI 兼容 `/audio/speech` → 直接 `--engine openai`，不用改代码；
- **VoiceCraft 系**（`{input, voice, speed, pitch, style, volume}`，wangwangit/tts 那一支，
  含自建与分叉，如 `JinSuperOfficial/tts-voice-magic`）→ 直接 `--engine voicecraft`；
- 其他协议 → 优先用 `--engine custom` + `--tts-payload` 模板适配；实在不匹配再加分支（返回音频字节即可）；
- 时间轴逻辑无需改：`synth_one()` 会把每段音频交给 `ffprobe` 回读时长，
  这类引擎自动走分段模式，`words.json` 会写 `precision: "none"`。

### 8.3 加一个新转场

- **剪辑侧**：`xfade` 有 58 种，`TRANSITION_STYLES` 只是"语义 → 原生名 + 默认时长"的映射表，
  加一行就多一种风格；不写风格直接写原生名也行，`normalize_transition()` 会运行时探测白名单。
- **Remotion 侧**：在 `src/transitions/index.tsx` 的 `TransitionKind` 加一种，
  在 `enterStyle` / `exitStyle` / `TransitionOverlay` 三处各加一个 case（入场、出场、覆盖层要方向一致）；
  `src/scenes/ShowcaseScene.tsx` 会自动把它演出来（它是按 kind 列表轮播的）。

### 8.4 加一种画幅策略

`vedit.py` 的 `conform_filter()` 加一个 `mode` 分支，并在 `load_edl()` 的校验里放行。

### 8.5 接一个"自动粗剪"

留了位置没实现：`vedit.py` 可加 `auto-cut` 子命令，用 `silencedetect` 去停顿、或用 `select='gt(scene,0.3)'` 按镜头切分，产出一份 EDL 草稿再人工审。**推荐做成"生成 EDL 而不是直接出片"**，保持可审阅。

---

## 8b. 第三方参考材料政策

`ref/` 目录（若存在）是**本地只读参考**，可能受 Apache-2.0 等许可约束：

- 已在 `.gitignore` 中排除（`ref/`、`ref.tmp/`），**永不提交、永不上传**；push 前会物理删除。
- 只借鉴**思路与做法**（例如"渲染前加静态校验门""多频段压限""两遍响度归一"这类通用工程实践），
  **不复制任何文件、代码、文案、配色表或转场清单**。
- 本仓库所有实现均为自研：`validate.py` 的检查项来自本项目自己的不变量；`mix_bgm()` 的
  `acrossover` 分频图、`normalize_loudness()` 的两遍法是通用音频工程做法，代码自行编写。
- 若将来要引入任何第三方代码/素材，必须单独确认许可并在 `LICENSE`/`NOTICE` 里合规标注。

---

## 9. 已知限制与坑

| 限制 | 说明 / 绕法 |
| --- | --- |
| edge-tts 是公开演示端点 | 不是官方商用 API，可能限流/变更。商用请换有 SLA 的服务（`--engine voicecraft` / `openai` / `custom`） |
| 自建 TTS 引擎只能走分段模式 | 拿不到逐词边界，整段韵律模式不可用（工具会自动降级并提示，`words.json` 标 `precision: none`） |
| Cloudflare 前置的 TTS 会拦默认 UA | Python `urllib` 默认 UA → 403 `error code: 1010`；`tts_http()` 已带正常 UA，换 HTTP 客户端时要自己设 |
| Remotion 许可证 | 个人与 ≤3 人公司免费，更大规模商用需购买 Company License |
| 首帧字体加载慢 | `@remotion/google-fonts` 会预加载全部子集（约 294 请求）。换 `public/fonts/` + `@remotion/fonts` 可解决 |
| 后台任务里的嵌套 ffmpeg 可能卡死 | 实测 `mix_bgm` 的 ffmpeg 在后台任务沙箱里挂住过一次（文件停在 256KB）。`wvp.py run()` 已加超时；遇到"渲染很久没动静"先看日志时间戳有没有在动 |
| 渲染速度受机器负载影响很大 | 同样 361 帧：空闲时 6.5 分钟，有其他进程占 CPU 时会到 20 分钟以上。别用渲染耗时判断代码有没有变慢 |
| filtergraph 长度上限 | 段数极多时单条命令会超 shell 参数限制，需要改成分步合成（未实现，见 §8.5 备注） |
| HDR / 10bit 素材 | 只做了 8bit 转换，颜色会发灰；精确还原需先 `zscale`+`tonemap`（`references/ffmpeg.md` 第 13 条） |
| 无 GUI | 刻意为之：Agent 驱动 + `plan` 预览比拖拽更可复现 |
| Windows | 脚本是 bash + python，Windows 需 WSL 或 Git Bash |

---

## 10. 验收基线（回归测试用）

改完代码请对照这些实测值，偏差超过 1 帧就要查：

```bash
# 0) 环境与工程（应 21 通过 / 0 缺失；成片规格应 bt709+tv）
python3 scripts/wvp.py doctor

# 配音：4 段 / 45 字 / 整段韵律模式 / 停顿 400ms / 片尾 600ms / 带 BGM / 响度归一
python3 scripts/wvp.py render --no-tts --out output/intro10s.mp4     # 复用已有配音
# 或单独跑 TTS：
.venv/bin/python scripts/tts_edge.py --script examples/script.intro10s.json \
  --outdir public/voice --voice zh-CN-XiaoxiaoNeural --rate +0% --fps 30 --normalize
# 期望：vo.mp3 ≈ 12.0s / 361 帧（带 BGM 时片尾 600ms 计入）；words.json 23 词

# 时间轴与词级对齐（必须全绿）
python3 scripts/wvp.py timeline --verify-audio
# 期望：23/23 词窗落在语音上；段单调、无重叠

# 渲染
python3 scripts/wvp.py render --no-tts --out output/intro10s.mp4 --gl=angle
# 期望：361 帧 / 12.024s / 1920x1080@30 / h264+aac48k / yuv420p / bt709 / tv
#       含 2 个跨切点转场（wipeLeft / zoomPunch）+ 4 个 SFX（whoosh×2 / impact / chime）

# 静态校验（应 0 错误），成片检查（应 0 错误且 color_space=bt709 / color_range=tv）
python3 scripts/validate.py
python3 scripts/validate.py --out output/intro10s.mp4

# 剪辑：3 段异构素材（720p25有声 + 1080p30无声 + 640x480@24有声），2 个转场
npm run assets && npm run edit
# 期望：8.900s / 267 帧（若降级直拼会是 300 帧，这是判定转场是否生效的决定性证据）

# 语义转场风格（应展开成 fadeblack 0.6s + dissolve 0.8s，offset 3.4 / 6.6）
python3 scripts/vedit.py transitions
python3 scripts/vedit.py plan --edl work/edl_style_test.json

# 帧协议（HTML 路线）：确定性 + 速度
node scripts/capture_frames.mjs --html templates/html-gsap/index.html --outdir work/A --frames 0,29,59
node scripts/capture_frames.mjs --html templates/html-gsap/index.html --outdir work/B --frames 0,29,59
md5sum work/A/*.png work/B/*.png    # 期望：同帧 md5 一致，不同帧不同
node scripts/capture_frames.mjs --html templates/html-gsap/index.html --outdir work/J --seconds 2 --format jpeg
# 期望：≈10 帧/秒（png 是 1.9 帧/秒）；png 单帧截图成本 255ms，jpeg 52ms

# 自建 TTS API（实测可用；应走分段模式 + 一句一段字幕 + precision: none）
python3 scripts/tts_edge.py --script examples/script.intro10s.json --outdir work/vc/voice \
  --fps 30 --engine voicecraft --tts-base-url https://tts.jinsuper.cn/v1 \
  --voice zh-CN-XiaoxiaoNeural --rate +5% --tts-style newscast --no-bgm
# 期望：4 段分别 ~1.87/3.74/2.42/2.81s，vo.mp3 ≈ 10.85s，SRT 4 条

# 剪辑安全断言（必须报错，且必须在 conform 之前就报）
python3 scripts/vedit.py build --edl work/t/assert.json      # 2s 片段配 1.5s 转场 → 报"安全上限 1.000s"
python3 scripts/vedit.py build --edl work/t/badname.json     # 不存在的转场名 → 列出全部可用值
```

---

## 11. Roadmap（未做，欢迎接手）

- [x] ~~字幕逐词卡拉OK：`--mode whole` 已是 WordBoundary，可输出词级 SRT~~ → 已做（`words.json` + `timeline --verify-audio`）
- [x] ~~统一 CLI 入口~~ → 已做（`wvp.py doctor/render/timeline`）
- [x] ~~语义转场层~~ → 已做（`vedit.py` 的 `TRANSITION_STYLES` + `src/transitions`）
- [x] ~~音效轨~~ → 已做（`make_sfx.py` + `src/components/SfxTrack.tsx`）
- [x] ~~批量渲染~~ → 已做（`wvp.py render --batch`，注意"只对 id 驱动的场景成立"）
- [x] ~~HTML 帧协议注册表~~ → 已做（`templates/frame-protocol.js` + 双模式截图器）
- [ ] 用 `words.json` 做一个真正的卡拉OK 字幕组件（现在只有段级 `Subtitles.tsx`）
- [ ] 自动粗剪：`silencedetect` / 场景切分 → 生成 EDL 草稿（见 §8.5）
- [ ] 项目状态层：`project.json` + 分镜 status（现在 `work/` 下会累积多版产物，说不清哪版是当前）
- [ ] 英文 README + 英文 TTS 音色推荐
- [ ] GitHub Actions：PR 时跑 `wvp.py doctor` + 剪辑断言回归
- [ ] 更多视觉模板（数据可视化 / 竖屏带货 / 知识卡片）

---

## 12. 交接清单

- [x] 代码可跑（`wvp.py doctor` 全绿：21 通过 / 2 警告 / 0 缺失）
- [x] 示例可复现（§10 基线）
- [x] 依赖清单：Node ≥18、Python ≥3.9、FFmpeg ≥6（libx264/aac/libass/libmp3lame）
- [x] 生成路线零第三方 Python 依赖（`vedit.py`/`make_bgm.py`/`make_sfx.py`/`wvp.py` 纯标准库；仅 `tts_edge.py` 需要 `edge-tts`）
- [x] 无版权风险素材（BGM 与 6 个音效都由代码合成）
- [x] 文档三层：README（用户）/ SKILL.md + references（Agent）/ project.md（维护者）
- [x] `ref/` 已物理删除，`.gitignore` 保留兜底；仓库内无第三方代码
- [ ] 待补：英文 README、CI、卡拉OK 字幕组件、更多视觉模板
