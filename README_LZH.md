# web-video-produce · 以碼成影
<p>
<img alt="license" src="https://img.shields.io/badge/license-MIT-5eead4">
<img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-3c873a">
<img alt="ffmpeg" src="https://img.shields.io/badge/ffmpeg-%E2%89%A56-007808">
<img alt="python" src="https://img.shields.io/badge/python-%E2%89%A53.9-3776ab">
<img alt="tts" src="https://img.shields.io/badge/TTS-edge--tts%20%7C%20%E8%87%AA%E5%BB%BA%20API-f0abfc">
</p>

## Language

| Language | README | Status |
| --- | --- | --- |
| 简体中文 | [README.md](./README.md) | OK |
| 繁體中文 | [README_ZH-HANT.md](./README_ZH-HANT.md) | OK |
| English | [README_EN.md](./README_EN.md) | OK |
| 日本語 | [README_JA.md](./README_JA.md) | IN NEED |
| 한국어 | [README_KO.md](./README_KO.md) | IN NEED |
| Español | [README_ES.md](./README_ES.md) | IN NEED |
| 文言 | 當前位置 | JUST A JOKE |
 OTHER  -  If you would like to add support for this language, you can submit PR

> [!WARNING]
> 此篇為戲作，技術內容以[简体中文版](./README.md)為準。

> **要略**
> - 使純文之 LLM 能作影（Code-To-Video）
> - 其理：以 Web 為架
> - 配音：預設 edge-tts，亦可自接 TTS API（example.url/v1）

使 AI 以碼成影／剪輯成片：腳本 → 配音 → **寫碼** → 逐格渲染 → MP4。

![code to video](docs/images/hero.jpg)

▶ **示例成片**（十一秒，中文配音 + 字幕 + 自動配樂，皆出於本倉）

[![示例成片封面](docs/images/sample-cover.jpg)](https://www.bilibili.com/video/BV11tpw63Eoh)

- B 站：[BV11tpw63Eoh](https://www.bilibili.com/video/BV11tpw63Eoh)
- 原始文件：[`docs/sample-intro.mp4`](docs/sample-intro.mp4)

一 **DSH Skill**（亦可獨立而跑）：以「寫一段腳本 → 出一條帶配音、字幕、背景音樂之 MP4」為事，化為 LLM 可自了之碼務。
（本欲多為，然時不我與，token 亦不足矣）

不倚剪輯之器，亦不需多模之型 —— **純文 LLM 即可用之**：讀文、寫碼、行令、觀 `ffprobe` 之出、抽格自檢。

---

## 目錄

- [核心理念](#核心理念)
- [兩能](#兩能)
- [速起](#速起)
- [工作流](#工作流)
- [技術棧](#技術棧)
- [配音：預設 edge-tts，亦可易之以己](#配音預設-edge-tts亦可易之以己)
- [剪輯之道（EDL 驅動）](#剪輯之道edl-驅動)
- [目錄結構](#目錄結構)
- [Q & A](#常見問題)
- [許可](#license)

---

## 核心理念

影者，非「剪」而出，乃**碼算而成**也。故與 LLM 相宜：

1. **時間軸者，唯一之真** —— 影之長短，配音定之。序恆為：腳本 → 配音 → 取每句之格號 → 乃寫畫面之碼。
2. **每格皆純函 f(frame)** —— 禁用 `Math.random()`、`Date.now()`、`requestAnimationFrame` 累時。渲染必可復現。
3. **先樣後全** —— 先渲一靜格以定字體／構圖，次渲三秒，終乃渲全片。
4. **音者，付諸專業之器** —— 不以碼合 TTS，不以碼混音。edge-tts 出聲，FFmpeg 收尾。
5. **交付即驗** —— 出片之後，以 `ffprobe` 報其規格，抽格觀其畫面，乃付諸用戶。

## 兩能

| 能 | 入 | 為 | 出 |
| --- | --- | --- | --- |
| **生成** | 一段文案／一題 | 分段 → 配音+字幕時間軸 → 寫視覺之碼 → 逐格渲染 → 合成 | `output/final.mp4` |
| **剪輯** | 已有之材（己之／人之所與） | EDL 宣告式時間線 → conform 標準化 → 裁／轉場／水印／畫幅／壓 | `output/edit.mp4` |

二道可混：Remotion 所生動畫之片，可如常材寫入剪輯時間線。

## 速起

**macOS / Linux（Bash，亦適用於 Windows 之 Git Bash / WSL）**

```bash
git clone https://github.com/JinSuperOfficial/web-video-produce.git
cd web-video-produce

# 1) 行自檢，環境自檢/工程校驗/成片規格
python3 scripts/wvp.py doctor

# 2) 依賴
npm install                     # 或他
npx remotion browser ensure     # 下 Chrome Headless Shell
python3 -m venv .venv && .venv/bin/pip install edge-tts
# 載虛擬環境，下依賴(Edge-TTS)

# 3) 出片：配音 → 時間軸校 → 靜態校 → 渲染 → 補音軌 → 驗收
python3 scripts/wvp.py render --out output/intro10s.mp4
#    先出 2 秒半解析樣片更省時：--scale 0.5 --frames 0-60
#    復用已有配音：--no-tts

# 4) 校時間軸：段/格/詞可齊否（--verify-audio 會解音軌實測）
python3 scripts/wvp.py timeline --words
python3 scripts/wvp.py timeline --verify-audio

# 5) 剪輯之道：先觀令，乃動手
python3 scripts/vedit.py transitions                        # 不知用何轉場時
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json
python3 scripts/vedit.py build --edl examples/edit-plan.example.json
```

**Windows PowerShell**

```powershell
git clone https://github.com/JinSuperOfficial/web-video-produce.git
cd web-video-produce

# 1) 行自檢，環境自檢/工程校驗/成片規格
python .\scripts\wvp.py doctor

# 2) 依賴
npm install                     # 或他
npx remotion browser ensure     # 下 Chrome Headless Shell
python -m venv .venv
.venv\Scripts\pip.exe install edge-tts
# 載虛擬環境，下依賴(Edge-TTS)

# 3) 出片：配音 → 時間軸校 → 靜態校 → 渲染 → 補音軌 → 驗收
python .\scripts\wvp.py render --out output\intro10s.mp4
#    先出 2 秒半解析樣片更省時：--scale 0.5 --frames 0-60
#    復用已有配音：--no-tts

# 4) 校時間軸：段/格/詞可齊否（--verify-audio 會解音軌實測）
python .\scripts\wvp.py timeline --words
python .\scripts\wvp.py timeline --verify-audio

# 5) 剪輯之道：先觀令，乃動手
python .\scripts\vedit.py transitions                        # 不知用何轉場時
python .\scripts\vedit.py plan  --edl examples\edit-plan.example.json
python .\scripts\vedit.py build --edl examples\edit-plan.example.json
```

`wvp.py` 者，本項之統一門也，僅三子令（`doctor` / `render` / `timeline`）。

**環境所需**：
1. Node ≥ 18
2. Python ≥ 3.9
3. FFmpeg ≥ 6（需 `libx264` / `aac` / `libass`）
4. Windows / macOS / Linux 皆可

## 工作流

![pipeline](docs/images/pipeline.jpg)

```
文 → 分段腳本(JSON) → edge-tts 配音 + 字幕 + 格號時間軸 + 逐詞時戳
                              ↓
            Remotion / React / Three.js / Canvas 寫畫面
         （motion 動作庫 + transitions 轉場層 + SFX 音效軌）
                              ↓
                  逐格渲染 → FFmpeg 合成 → MP4
```

配音一步出四物，乃一切之錨：

| 產物 | 用 |
| --- | --- |
| `vo.mp3` | 整條配音軌（含段間停頓與背景配樂） |
| `vo.srt` / `vo.vtt` | 與音軌嚴齊之字幕（按標斷句，緊貼真聲） |
| `manifest.json` | **每句台詞之起止格號** —— 畫面之碼唯認此，不認「約幾秒」 |
| `words.json` | **逐詞時戳** —— 卡拉OK 高亮、音效卡點、逐詞校對 |

## 技術棧

![stack](docs/images/stack.jpg)

| 層 | 技 | 用於 |
| --- | --- | --- |
| 結構 | HTML / CSS / JavaScript | 網頁即畫布 |
| 2D 圖 | Canvas 2D | 圖表、粒子、波形、數據可視化 |
| 3D | Three.js（`@remotion/three`） | 產品演示、空間感、模型動畫 |
| 渲染增 | WebGL / GLSL Shader | 流體、光效、紋理、後處理 |
| 組件與合成 | React + TypeScript + **Remotion** | 多鏡頭、字幕、音畫同步（主推） |
| 時間線動畫 | GSAP | 複雜緩動與時間線編排 |
| 配音 | **edge-tts**（預設）/ 自建 TTS API | 語音合成 |
| 編碼合成 | FFmpeg | 混流、混音、燒字幕、轉場、剪輯 |

## 配音：預設 edge-tts，亦可易之以己

![voice](docs/images/voice.jpg)

### 預設：edge-tts（免費，開箱可用）

```bash
# 列全部中文音色
.venv/bin/python scripts/tts_edge.py --list-voices zh

# 選音色：同一句話，多音色對照試聽，不盲選
.venv/bin/python scripts/tts_audition.py --outdir output/voice_samples --rate +5%

# 正式生成（預設整段韻律模式 + 自動加背景配樂 + 段間停頓）
.venv/bin/python scripts/tts_edge.py \
  --script examples/script.intro10s.json \
  --outdir public/voice \
  --voice zh-CN-XiaoxiaoNeural --rate +5% --fps 30 --normalize
```

內置 14 中文音色（`zh-CN-*` / `zh-HK-*` / `zh-TW-*`），常用者：

| 音色 | 聽感 | 場景 |
| --- | --- | --- |
| `zh-CN-XiaoxiaoNeural` | 女·溫暖通用 | 口播、敘事（預設） |
| `zh-CN-YunxiNeural` | 男·陽光少年感 | 科技、Vlog |
| `zh-CN-YunjianNeural` | 男·渾厚有力 | 宣傳片、預告 |
| `zh-CN-YunyangNeural` | 男·專業播報 | 新聞、紀錄片 |
| `zh-CN-XiaoyiNeural` | 女·活潑明亮 | 短視頻、教程 |

### 三硬約（踩過之坑，已寫入碼）

| 約 | 因 | 實測 |
| --- | --- | --- |
| **稿不寫句號「。」** | 句號觸「句末下降調 + 長停頓」，一句一降調 = 機器念課文。工具會**自動剔除**並於日誌告爾剔幾 | — |
| **整段韻律模式**（預設） | 分段合成時**每請自帶約 0.6s 尾靜音**，語調亦於段首重置，聽感一頓一頓 | 同稿：分段 8.75s → 整段 6.98s，差之 1.8 秒**皆假停頓** |
| **語速 +0% ~ +5%** | 逾 +10% 明顯發飄、齒音重 | — |

停頓與配樂預設即開：**段間 400ms 真停頓**（非無縫銜接）、**片尾 600ms 呼吸**、**BGM 側鏈閃避**（一說話音樂自壓低）。

> 背景樂乃 `scripts/make_bgm.py` 以碼合成（正弦加法合成 + 和弦交叉淡化），**免版權、可商用、可無縫循環**。欲易則丟一 mp3 於 `assets/bgm.mp3`。
>
> 混音用**多頻段 carve** 而非整體壓低：先 Linkwitz-Riley 分頻（300Hz / 3400Hz），唯於人聲頻段作側鏈壓限。
> 實測同片低頻能量——不處理 −35.4dB / 整體閃避 −43.2dB（音樂瘪掉）/ carve −36.1dB（**音樂保住矣**）。
> 響度用兩遍 `loudnorm`（線性增益），`--loudness-target social|podcast|broadcast` = −14 / −16 / −23 LUFS。

### 易之以己之 TTS API

但爾之服能「予文、還音」，即可接入 —— 語音合成之時與字幕之理全然復用。

**A. OpenAI 相容之 `/audio/speech`**（OpenAI、SiliconFlow、智譜、火山方舟等多數廠皆行此形）
(本地者未試，然概率亦可行……)
```bash
export TTS_API_KEY=sk-xxxx        # 或 --tts-api-key

.venv/bin/python scripts/tts_edge.py --script examples/script.intro10s.json \
  --outdir public/voice \
  --engine openai \
  --tts-base-url https://api.openai.com/v1 \
  --tts-model gpt-4o-mini-tts \
  --voice alloy \
  --bgm assets/bgm.mp3
```

**B. VoiceCraft 系接口**（`POST /v1/audio/speech`，字段 `input` / `voice` / `speed` / `pitch` / `style` / `volume`）

此出於開源項目 [JinSuperOfficial/tts-voice-magic](https://github.com/JinSuperOfficial/tts-voice-magic)
原 tts 項目作者見該 tts 倉上游（VoiceCraft，基於微軟 Edge TTS，可一鍵部署於 Cloudflare Workers）。較 A 多一 `style`
情感／角色之參（`general` / `newscast` / `cheerful` / `serious` / `gentle` …）。

```bash
# 自部署一份（推薦）：https://github.com/JinSuperOfficial/tts-voice-magic
# 或用已部署之實例（本機實測可用）
.venv/bin/python scripts/tts_edge.py --script examples/script.intro10s.json \
  --outdir public/voice --fps 30 \
  --engine voicecraft \
  --tts-base-url https://tts.jinsuper.cn/v1 \
  --voice zh-CN-XiaoxiaoNeural \
  --rate +5% --tts-style newscast
```
> [!WARNING]
> 一實測之坑：Cloudflare 前置之站會攔 Python 預設之 User-Agent
> （`Python-urllib/3.x` → `HTTP 403 error code: 1010`），而 `curl` 通。
> 腳本已預設帶正常 UA，故開箱可用；易他 HTTP 客戶端時當自設 UA。

**C. 全然自訂端點**（各家字段不一時，用 JSON 模板適配）

```bash
.venv/bin/python scripts/tts_edge.py --script script.json --outdir public/voice \
  --engine custom \
  --tts-endpoint https://your-tts.example.com/v1/synthesize \
  --tts-header "X-App-Id=my-app" \
  --tts-payload '{"text":"{text}","speaker":"{voice}","format":"mp3"}' \
  --voice my-speaker-id
```

模板中可用 `{text}` `{voice}` `{model}` `{speed}` 佔位符；響應體直為音頻字節即可。

> 自建引擎拿不到逐詞邊界，故自動改用分段模式（每段一請）—— 時間軸由 `ffprobe` 回讀，依然精確；
> 字幕按「一句一段」生成，`words.json` 如實標 `precision: "none"`，不假裝有逐詞精度。

## 剪輯之道（EDL 驅動）

> [!NOTE]
> Experimental

![editing](docs/images/editing.jpg)

以一份 JSON 述時間線，工具生成 FFmpeg 令而執行。**三階段流水線**，絕不將異構之材直餵入濾鏡圖：

```
素材(異構) ──conform──▶ 統一規格 ──assemble──▶ 時間線 ──finish──▶ output/edit.mp4
  分辨率/幀率/音軌不一     裁剪+xfade+acrossfade      疊加/混音/字幕/壓縮
```

```bash
# 先觀令，乃動手（剪輯不可逆，勿盲跑）
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json
python3 scripts/vedit.py build --edl examples/edit-plan.example.json

# 橫屏 → 豎屏（模糊墊底，短視頻常用）
python3 scripts/vedit.py build --edl examples/edit-plan.example.json --aspect vertical
```

能：裁 / 多段拼接 / **xfade 轉場**（58 種，與音 acrossfade 成對）/ 水印與畫中畫 / 三畫幅適配（pad·crop·blur）/ 目標體積壓 / 與 Remotion 所生之片混合成片。

四硬約：

1. **先 conform 再拼** —— 分辨率/幀率/編碼/採樣率/音軌數統一，無音軌自動補靜音；
2. **offset = 前段累計時 − 轉場時**，且 `轉場時 ≤ min(前段,後段)/2`，越界直報錯；
3. **音視成對** —— 有 xfade 必有同值 acrossfade，杜絕爆音斷音；
4. **四級降級兜底** —— `xfade → concat filter → concat demuxer(copy) → 報錯保留現場`，降級則明告爾。

## 目錄結構

```
web-video-produce/
├─ SKILL.md                 # ★ Agent 技能主文（LLM 讀此足矣）
├─ project.md               # ★ 項目交接文（架 / 決 / 擴點）
├─ scripts/
│   ├─ tts_edge.py          # 配音 + 字幕 + 格號時間軸（edge-tts / 自建 API / BGM / 停頓）
│   ├─ tts_audition.py      # 同句多音色對照試聽
│   ├─ make_bgm.py          # 碼合成免版權 BGM
│   ├─ validate.py          # 靜態校驗器（渲染前後各跑一次）
│   ├─ vedit.py             # EDL 剪輯器（probe / plan / build / conform）
│   ├─ mux.sh               # 混流 / 混音 / 燒字幕 / 響度歸一
│   ├─ capture_frames.mjs   # HTML 頁確定逐格截圖（Playwright）
│   ├─ frames_to_video.sh   # PNG 序 → MP4
│   ├─ make_sample_assets.sh# 生異構 demo 材
│   └─ check_env.sh         # 環境自檢
├─ src/                     # Remotion 工程（Root / Main / 字幕 / 三套場景）
├─ templates/html-gsap/     # 格協議 + Canvas2D + GSAP 模板
├─ examples/                # 分段腳本 + EDL 示例
├─ assets/                  # 材（bgm / logo / raw）
├─ public/voice/            # 所生之配音與時間軸（gitignore）
└─ output/                  # 交付之目
```

## 渲染前先自檢

```bash
python3 scripts/validate.py                      # 源 + 時間軸：1 秒內出
python3 scripts/validate.py --out output/final.mp4   # 再加成片規格、色彩空間、響度
python3 scripts/validate.py --json               # Agent 友好
```

其所檢：確定性鐵律（`Math.random`/`Date.now`/自走動畫）、`manifest.json ↔ config.ts` 之 fps 與時長一、
場景 id 是否皆在配音腳本、`staticFile` 與 EDL 所引之材是否存、中文字體是否載、
成片之像素格式 / **色彩空間 bt709** / 色彩範圍 tv / 峰值 / 平均音量 / 整體 LUFS。

> 此校驗器曾捉一真問：Remotion 預設不傳色彩參數，成片會寫為 full-range `yuvj420p` + BT.601，
> 上傳平台轉碼時色會漂。今 `remotion.config.ts` 固 `Config.setColorSpace('bt709')`。

## 常見問題

<details>
<summary><b>中文渲成豆腐塊 □□□</b></summary>

headless 之境常一 CJK 字體皆無。`SKILL.md` §4.5 予三解，薦以 woff2 置 `public/fonts/` 用 `@remotion/fonts` 載（一檔、一請、全然離線）。
</details>

<details>
<summary><b>渲染甚緩</b></summary>

預設用 `@remotion/google-fonts` 會於首渲預載全部字體子集（約 294 請，1-2 分鐘）。易以自帶字體檔即可大提速。另先 `--scale=0.5` 出樣片，確無虞乃渲全片。
</details>

<details>
<summary><b>配音聽之甚假</b></summary>

見上文[三硬約](#三硬約踩過之坑已寫入碼)。工具已預設助爾為之：去句號、整段韻律、降速、加停頓、配 BGM。猶不滿則易引擎（Azure SSML / MiniMax / 火山 / 本地 GPT-SoVITS 克隆）。
</details>

<details>
<summary><b>拼接後花屏 / 轉場處黑格 / 聲音爆</b></summary>

材參不一。`vedit.py` 會強先 conform；手工拼時務統一分辨率、幀率、像素格式、採樣率，且**有 xfade 即須有 acrossfade**。
</details>

## License

[MIT](LICENSE) © JinSuperOfficial

內置 BGM 由 `scripts/make_bgm.py` 碼合成，無第三方材，可商用。edge-tts 所呼乃微軟 Edge「大聲朗讀」之公開端，**非官方商用 API**，或限流或變；商用關鍵之場景請易以有 SLA 之服。
