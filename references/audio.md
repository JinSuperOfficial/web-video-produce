# 配音与音频：edge-tts / 自建 TTS / BGM / SFX / 响度

视频长度由配音决定，所以配音是**第一步**，也是听感质量的最大变量。
这里包含：edge-tts 参数与音色选型、技能强制的"去句号 + 整段韵律"约束、
背景配乐的多频段 carve 混音、自建 TTS API 接入、浏览器回退路径、
以及音效（SFX）轨怎么卡在帧上。

---

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

### 三种接法

```bash
# A) OpenAI 兼容的 /audio/speech（OpenAI / SiliconFlow / 智谱 / 火山方舟等多数厂商）
export TTS_API_KEY=sk-xxxx          # 或 --tts-api-key
python3 scripts/tts_edge.py --script examples/script.intro10s.json --outdir public/voice \
  --engine openai --tts-base-url https://api.openai.com/v1 \
  --tts-model gpt-4o-mini-tts --voice alloy --fps 30

# B) VoiceCraft 系接口（wangwangit/tts 及其自建/分叉版本，如 JinSuperOfficial/tts-voice-magic）
python3 scripts/tts_edge.py --script examples/script.intro10s.json --outdir public/voice \
  --engine voicecraft --tts-base-url https://tts.jinsuper.cn/v1 \
  --voice zh-CN-XiaoxiaoNeural --rate +5% --tts-style newscast --fps 30

# C) 完全自定义端点（字段不一样时用 JSON 模板适配）
python3 scripts/tts_edge.py --script script.json --outdir public/voice \
  --engine custom --tts-endpoint https://your-tts.example.com/v1/synthesize \
  --tts-header "X-App-Id=my-app" \
  --tts-payload '{"text":"{text}","speaker":"{voice}","format":"mp3"}' \
  --voice my-speaker-id
```

- 模板占位符：`{text}` `{voice}` `{model}` `{speed}`；响应体直接是音频字节。
- 鉴权默认 `Authorization: Bearer <key>`，可用 `--tts-header K=V` 追加或覆盖。
- **自建引擎会自动改用分段模式**（拿不到逐词边界，整段韵律模式不可用），每段时长由 `ffprobe` 回读，时间轴依然精确；
  `words.json` 会如实写 `precision: "none"` 并附原因，**不会假装有词级精度**。
  字幕则按"一句一段"生成（时长同样是回读的真实值）—— 这是这类接口能给到的最诚实的对齐精度。

### 自己部署一份 TTS（推荐）

[`JinSuperOfficial/tts-voice-magic`](https://github.com/JinSuperOfficial/tts-voice-magic)（VoiceCraft）
是基于微软 Edge TTS 的开源 TTS/STT 平台，**一键部署到 Cloudflare Workers**，免费、无需注册：

1. 打开仓库，点 "Deploy to Cloudflare Workers"；
2. 得到 `https://<你的名字>.workers.dev`；
3. 接口就是 OpenAI 风格的 `POST /v1/audio/speech`：

```bash
curl -X POST "https://<你的名字>.workers.dev/v1/audio/speech" \
  -H "Content-Type: application/json" \
  -d '{"input":"你好，这是一个测试","voice":"zh-CN-XiaoxiaoNeural","speed":1.0,"style":"general"}' \
  --output speech.mp3
```

请求体字段：`input`（文本）、`voice`、`speed`（0.5~2.0）、`pitch`（-50~50）、`volume`、`style`。
`style` 是这套接口独有的一档能力，可选：
`general` / `assistant` / `chat` / `customerservice` / `newscast` / `affectionate` /
`calm` / `cheerful` / `gentle` / `lyrical` / `serious`。

```bash
# 用本技能接进来（--tts-style 就是上面的 style）
python3 scripts/tts_edge.py --script script.json --outdir public/voice \
  --engine voicecraft --tts-base-url https://<你的名字>.workers.dev/v1 \
  --voice zh-CN-YunjianNeural --rate +0% --tts-style serious
```

不想自己部署的话，可以直接用已经部署好的实例（本机实测可用）：
`--tts-base-url https://tts.jinsuper.cn/v1`

### 踩过的坑：Cloudflare 会 403 掉 Python 的默认 UA

**症状**：同一个接口，`curl` 能返回音频（HTTP 200），但脚本报
`TTS API HTTP 403: error code: 1010`。

**原因**：Cloudflare 前置的站点（Workers 部署的都属于此类）会按 User-Agent 做 bot 特征检查，
Python 的 `urllib` 默认 UA `Python-urllib/3.x` 被拦。

**实测矩阵**（同一端点、同一个请求体）：

| User-Agent | 结果 |
| --- | --- |
| `curl/8.5.0` | 200 |
| `web-video-produce/1.2` | **200** |
| `Mozilla/5.0 … Chrome/131` | 200 |
| `Python-urllib/3.14` | **403（error code 1010）** |

`tts_edge.py` 已经默认带一个正常的工具 UA，所以开箱可用；换成别的 HTTP 客户端
（requests / httpx / Node fetch）时记得也设 UA，否则会误判成"接口坏了"。
确实需要自定义时用 `--tts-header "User-Agent=..."` 覆盖。

### 顺带一个能力：STT（语音转文字）

同一套服务还有 `POST /v1/audio/transcriptions`（multipart，字段 `file`，可选 `token`，
走硅基流动的 `FunAudioLLM/SenseVoiceSmall`）。做视频时有一个实实在在的用处：
**给没有字幕的已有素材生成字幕**，再交给 `vedit.py` 的 `subtitles` 字段烧进画面。
注意它返回的是整段文本（不是逐句时间戳），所以仍需按"一句一段"或人工校对时间轴。

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

**逐词时间戳（`words.json`，默认产出）**

`tts_edge.py` 默认向 edge-tts 要 `WordBoundary`（词边界）而不是句边界，于是除了 SRT，
还会多产出一份**逐词**时间戳：

```json
{ "fps": 30, "precision": "word", "source": "edge-tts WordBoundary",
  "word_count": 23, "total_duration": 11.574,
  "words": [ { "text": "画面", "start": 2.087, "end": 2.462, "start_frame": 63,
               "duration_frames": 11, "segment": "s2", "segment_index": 1 } ] }
```

用它可以做：**卡拉OK 逐词高亮**、音效精确卡点、逐词校对、把某个词和画面对齐。

关键实现点（值得知道，否则会踩）：

- **词级时间戳走的是与音频完全相同的"分段平移"映射**。整段韵律模式会按段切分、段间插真停顿
  （`rebuild_with_pauses`），这个过程是"切片平移、片内音频一个采样都不动"，
  所以词级时间只要落在同一个切片里，平移量就与它所属的那句话完全一致 —— 是**精确映射，不是估算**。
- **逐词比对而不是只比总字数**。TTS 会把 "15" 读成 "十五"、把 "API" 读成 "A P I"：
  这类改写如果恰好总字数相同，只比总数就会静默错位，字幕从此飘掉。
  所以脚本要求每个词块与稿件对应位置**逐字相等**，否则宁可整段退化成一条字幕并警告。
- 拿不到词边界时（自建 TTS API，或 `--no-words`），`words.json` 里 `precision` 会写 `"none"`
  并附原因，**不会假装有词级精度**。
- 顺带的好处：SRT 现在按标点聚句，且**紧贴真实语音**（不再从段落起点空等到终点）。
  实测同一条 4 段稿：字幕从"每段一整条"变成 3+2 条按逗号断开的短句，起止时间贴着波形。

自查（这是唯一可信的验证方式 —— 回到音频上量能量，而不是看 JSON 自洽）：

```bash
python3 scripts/wvp.py timeline --verify-audio
# 实测输出：解码 11.57s @ 8000Hz，词窗中位电平 -23.5 dBFS（静音阈值 -45.5）
#          词窗落在语音上：23/23
# 对照组（故意不做平移、用原始时间）：只有 19/23 落在语音上，4 个词掉进 -80~-120dB 的静音里
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

### 路径 B（回退）· 用浏览器技能操作网页 TTS

什么时候走这条路：
- edge-tts CLI 装不上（公司网络禁 pip / 无 Python 环境）；
- 命令行报错（403、握手失败、`Sec-MS-GEC` 相关）且升级重试无效；
- 需要网页独有的能力：**SSML 情感/角色风格**、图形化试听对比、批量导出。

两个可用站点，**它们底层都是同一套微软 Edge TTS 服务**，所以音色和 CLI 完全一样 ——
走网页**不会**让配音"更真"，只是换了入口：

| 站点 | 特点 | 注意 |
| --- | --- | --- |
| `https://edge-tts.com/zh-CN/` | 老牌演示站，界面简单 | 无 SSML |
| `https://tts.jinsuper.cn/` | VoiceCraft（[`JinSuperOfficial/tts-voice-magic`](https://github.com/JinSuperOfficial/tts-voice-magic)）。90+ 音色、**支持 SSML 输入**、style 下拉（Assistant / Chat / Newscast / Cheerful / Gentle / Serious…）、语速与音调滑杆、TTS + STT | **同一个实例也有 API**，能直接接进流水线（见上文 `--engine voicecraft`），比走浏览器自动化稳定得多 |
| 自己部署的实例 | 上面那个仓库一键部署到 Cloudflare Workers，得到自己的域名 | 推荐：不依赖别人的公开演示站，也不会被限流 |

**该站点真正的两个价值**：

1. **SSML**。它接受 `<mstts:express-as style="cheerful">` 这类 SSML 标签，这是 edge-tts CLI
   （只接受纯文本）拿不到的：同样的音色可以指定情感、角色与停顿。
   注意 SSML 里的 `<break time="400ms"/>` 也能做停顿 —— 本技能的 `tts_edge.py` 是用"段间插真静音"
   实现的同一件事，两者不要叠加，否则停顿会翻倍。
2. **自建**。`docker` 部署一份自己的实例，就不用依赖别人的公开演示站，也不会被限流。
   自建后**先去看仓库文档确认有没有 HTTP 接口**，有的话可以直接当自建 TTS 接进来：
   ```bash
   python3 scripts/tts_edge.py --script script.json --outdir public/voice \
     --engine custom --tts-endpoint http://localhost:8000/api/tts \
     --tts-payload '{"text":"{text}","voice":"{voice}"}'
   ```
   （端点与字段名以该项目的实际文档为准，不要照抄上面这行。）

操作步骤（**用浏览器自动化技能，不要凭空猜测页面结构**）：

1. 加载浏览器技能：调用 `skill` 工具，name = `browser-skill`（用户口中的 `/browser-skills` 即此技能；它提供 `browser_*` 工具集，复用用户已登录的 Chromium）。
2. 打开页面：`https://tts.jinsuper.cn/`（VoiceCraft）或 `https://edge-tts.com/zh-CN/`。
   **先确认有没有 API**：VoiceCraft 实例提供 `POST /v1/audio/speech`，用 `--engine voicecraft`
   直接调比走浏览器稳得多；浏览器路径只留给「API 也不通」的情况。
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

**降级顺序**：`edge-tts CLI` → `python -m edge_tts` → 自己的 TTS API（`--engine voicecraft` / `openai` / `custom`，例如 `https://tts.jinsuper.cn/v1`）→ 浏览器技能走 tts.jinsuper.cn / edge-tts.com → 其他 TTS（用户提供的云 API / `pyttsx3`+`espeak-ng` 本地合成，音质较差需说明）→ **无配音模式**（只出 BGM + 内嵌字幕的视频，并告知用户）。

### 字幕格式

- `vo.srt`：给 FFmpeg 烧字幕、给播放器用（`00:00:01,443 --> 00:00:04,056`）。
- `vo.vtt`：给网页 `<track>` 用（`00:00:01.443 --> 00:00:04.056`，带 `WEBVTT` 头）。
- `words.json`：逐词时间戳，给卡拉OK 高亮与音效卡点用（见上）。
- 三者由 `tts_edge.py` 同时产出，时间轴与音频一致；**改过配音就要重新生成，不要手改字幕时间**。
- 烧字幕需要 libass 与 CJK 字体（见 `generate.md` 的中文字体一节）。

---

## 6. 音效（SFX）轨

BGM 是"氛围"，音效是"事件"。**事件必须卡在帧上** —— 转场音早 2 帧就散了，晚 2 帧就砸空了。

### 合成素材（不用去找免版权音效）

```bash
python3 scripts/make_sfx.py                 # 6 个音效写进 assets/sfx/（已存在则跳过）
python3 scripts/make_sfx.py --list          # 看清单与用途
python3 scripts/make_sfx.py --force --seed 999
```

| 文件 | 时长 | 用途 | 听感 |
| --- | --- | --- | --- |
| `whoosh.mp3` | 0.45s | 转场/场景切换 | 带通噪声上下扫频，首尾能量低 |
| `pop.mp3` | 0.12s | 元素弹出/卡片出现 | 音高从 1214Hz 快速滑到 278Hz，干脆 |
| `riser.mp3` | 1.60s | 悬念铺垫/推向高潮 | 频谱重心 599→1388→4632Hz，单调上升 |
| `impact.mp3` | 0.90s | 重击/落地/标题砸下 | 低频 thump 87→39Hz + 噪声瞬态 + 房间尾巴 |
| `click.mp3` | 0.06s | UI 点击/强调 | 36ms 后数字静音，居中无尾音 |
| `chime.mp3` | 1.40s | 成功/收尾/logo 亮相 | 11 个非谐泛音叠成铃感，自然衰减 |

全部是纯 Python 加法合成（无第三方依赖，ffmpeg 只负责 wav→mp3），
同 seed 连跑两次 **mp3 字节与解码 PCM 都完全一致**；峰值都在 -2.0 ~ -3.4 dBFS（不削波）。

### 卡帧（Remotion 侧，`src/components/SfxTrack.tsx`）

```tsx
import { SfxTrack, cue } from './components/SfxTrack';

const sfx = [
  cue('transition', midStart, { offsetFrames: -4 }),  // 绝对帧号：转场音提前 4 帧起
  cue('impact', 'seg:cta'),                           // 段落锚点：自动跟随配音起始帧
  cue('chime', total - 42),
];
<SfxTrack cues={sfx} />
```

- 两种锚点：**绝对帧号**（片头片尾这种写死的位置）与 **`seg:<段id>`**（自动解析成该段起始帧）。
  用后者，重录配音后不用回来改数字 —— 这是 SFX 与时间轴唯一的耦合点。
- `SFX_PRESETS` 已经把每种音效的默认音量调好了（转场 0.32、落地 0.5…）。
  **现场音效最常见的错误是"全都 1.0"**，结果人声被盖住、转场像砸锅。宁可小一点。
- SFX 素材在 `assets/sfx/`，但 Remotion 的 `staticFile()` 只能读 `public/` ——
  `wvp.py render` 会**自动同步** `assets/sfx/*` → `public/sfx/`（增量，大小/时间戳相同就跳过）。
  手动渲染时记得先跑一次同步，否则会报素材缺失。

### 音量与响度的关系

音效会让整体响度上升。加完 SFX 后重新跑 `python3 scripts/wvp.py doctor`：
`validate --out` 会报出实测 `integrated LUFS / max / mean`，落在 -24 ~ -12 LUFS 才算正常。
如果加了音效后峰值贴到 -0.5dB 以内，说明某个音效太响（先调 `volume`，不要靠 `loudnorm` 硬压）。


---
