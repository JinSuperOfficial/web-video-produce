# 目录结构、注意事项与交付清单

工程怎么摆、什么东西不能提交、交付前必须逐条打勾的清单，以及几条容易踩的合规/成本注意事项。

---

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
