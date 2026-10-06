# 故障排查与回退策略

按症状查：中文豆腐块、渲染卡住、颜色漂、配音假、音画不同步、剪辑爆音、体积失控……
每条都给了原因和具体处理动作，最后是通用回退阶梯。

---

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
