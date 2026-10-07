# web-video-produce · Code-to-Video

> [!WARNING]
> 本文件可能包含機器翻譯內容。

<p>
<img alt="license" src="https://img.shields.io/badge/license-MIT-5eead4">
<img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-3c873a">
<img alt="ffmpeg" src="https://img.shields.io/badge/ffmpeg-%E2%89%A56-007808">
<img alt="python" src="https://img.shields.io/badge/python-%E2%89%A53.9-3776ab">
<img alt="tts" src="https://img.shields.io/badge/TTS-edge--tts%20%7C%20custom%20API-f0abfc">
</p>

## Language

| Language | README | Status |
| --- | --- | --- |
| 繁體中文 | 當前位置 | OK |
| 简体中文 | [README.md](./README.md) | OK |
| English | [README_EN.md](./README_EN.md) | OK |
| 日本語 | [README_JA.md](./README_JA.md) | IN NEED |
| 한국어 | [README_KO.md](./README_KO.md) | IN NEED |
| Español | [README_ES.md](./README_ES.md) | IN NEED |
 OTHER  -  If you would like to add support for this language, you can submit a PR


> **核心特色**
> - 讓純文字 LLM 生成影片（Code-To-Video）
> - 原理：使用 Web 架構
> - 配音：預設 edge-tts，也可接入你自己的 TTS API（example.com/v1）

讓 AI 用程式碼做影片／剪輯成片：腳本 → 配音 → **寫程式碼** → 逐格渲染 → MP4。

![code to video](docs/images/hero.jpg)

▶ **範例成品**（11 秒，中文配音 + 字幕 + 自動配樂，全部由本倉庫生成）

[![範例成品封面](docs/images/sample-cover.jpg)](https://www.bilibili.com/video/BV11tpw63Eoh)

- Bilibili：[BV11tpw63Eoh](https://www.bilibili.com/video/BV11tpw63Eoh)
- 原始檔案：[`docs/sample-intro.mp4`](docs/sample-intro.mp4)

一個 **DSH Skill**（也是可獨立執行的專案）：把「寫一段腳本 → 產出帶配音、字幕、背景音樂的 MP4」這件事，變成 LLM 可以自主完成的程式碼任務。
（作者原本想做得更多，但時間和 token 都不夠了。）

它不依賴任何剪輯軟體，也不需要多模態模型 —— **純文字 LLM 就能用**：讀文字、寫程式碼、跑指令、看 `ffprobe` 輸出、抽格自我檢查。

---

## 目錄

- [核心理念](#核心理念)
- [兩項能力](#兩項能力)
- [快速開始](#快速開始)
- [工作流程](#工作流程)
- [技術棧](#技術棧)
- [配音：預設 edge-tts，也可換成你自己的](#配音預設-edge-tts也可換成你自己的)
- [剪輯模式（EDL 驅動）](#剪輯模式edl-驅動)
- [專案結構](#專案結構)
- [常見問題](#常見問題)
- [授權條款](#授權條款)

---

## 核心理念

影片不是「剪」出來的，是**用程式碼算出來的**。因此它天生適合 LLM：

1. **時間軸是唯一真相** —— 影片長度由配音決定。順序永遠是：腳本 → 配音 → 取得每句的影格編號 → 再寫畫面程式碼。
2. **每一格都是純函式 f(frame)** —— 禁止 `Math.random()`、`Date.now()`、用 `requestAnimationFrame` 累加時間。渲染必須可重現。
3. **先做樣片，再做全片** —— 先渲染 1 張靜態影格確認字型／構圖，再渲染 3 秒，最後才渲染全片。
4. **音訊交給專業工具** —— 不用程式碼合成 TTS，不用程式碼做混音。edge-tts 出聲，FFmpeg 收尾。
5. **交付即驗證** —— 出片後用 `ffprobe` 回報規格、抽格檢查畫面，再交給使用者。

## 兩項能力

| 能力 | 輸入 | 做什麼 | 輸出 |
| --- | --- | --- | --- |
| **生成** | 一段文案／一個主題 | 分段 → 配音+字幕時間軸 → 寫視覺程式碼 → 逐格渲染 → 合成 | `output/final.mp4` |
| **剪輯** | 現有素材（自己的／別人給的） | EDL 宣告式時間軸 → conform 標準化 → 裁剪／轉場／浮水印／畫幅／壓縮 | `output/edit.mp4` |

兩條路線可以混合：Remotion 生成的動畫片段，可以像一般素材一樣寫進剪輯時間軸。

## 快速開始

**macOS / Linux（Bash，也適用於 Windows 的 Git Bash / WSL）**

```bash
git clone https://github.com/JinSuperOfficial/web-video-produce.git
cd web-video-produce

# 1) 執行自我檢查：環境 / 專案驗證 / 成品規格
python3 scripts/wvp.py doctor

# 2) 相依套件
npm install                     # 或其他
npx remotion browser ensure     # 下載 Chrome Headless Shell
python3 -m venv .venv && .venv/bin/pip install edge-tts
# 載入虛擬環境，安裝相依套件（Edge-TTS）

# 3) 出片：配音 → 時間軸檢查 → 靜態檢查 → 渲染 → 補音軌 → 驗收
python3 scripts/wvp.py render --out output/intro10s.mp4
#    先出 2 秒半解析度樣片更省時間：--scale 0.5 --frames 0-60
#    重複使用既有配音：--no-tts

# 4) 檢查時間軸：段／影格／詞是否對齊（--verify-audio 會解碼音軌實測）
python3 scripts/wvp.py timeline --words
python3 scripts/wvp.py timeline --verify-audio

# 5) 剪輯路線：先看指令，再動手
python3 scripts/vedit.py transitions                        # 不知道用哪種轉場時
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json
python3 scripts/vedit.py build --edl examples/edit-plan.example.json
```

**Windows PowerShell**

```powershell
git clone https://github.com/JinSuperOfficial/web-video-produce.git
cd web-video-produce

# 1) 執行自我檢查：環境 / 專案驗證 / 成品規格
python .\scripts\wvp.py doctor

# 2) 相依套件
npm install                     # 或其他
npx remotion browser ensure     # 下載 Chrome Headless Shell
python -m venv .venv
.venv\Scripts\pip.exe install edge-tts
# 載入虛擬環境，安裝相依套件（Edge-TTS）

# 3) 出片：配音 → 時間軸檢查 → 靜態檢查 → 渲染 → 補音軌 → 驗收
python .\scripts\wvp.py render --out output\intro10s.mp4
#    先出 2 秒半解析度樣片更省時間：--scale 0.5 --frames 0-60
#    重複使用既有配音：--no-tts

# 4) 檢查時間軸：段／影格／詞是否對齊（--verify-audio 會解碼音軌實測）
python .\scripts\wvp.py timeline --words
python .\scripts\wvp.py timeline --verify-audio

# 5) 剪輯路線：先看指令，再動手
python .\scripts\vedit.py transitions                        # 不知道用哪種轉場時
python .\scripts\vedit.py plan  --edl examples\edit-plan.example.json
python .\scripts\vedit.py build --edl examples\edit-plan.example.json
```

`wvp.py` 是本專案的統一入口，只有三個子指令（`doctor` / `render` / `timeline`）。

**環境需求**：
1. Node ≥ 18
2. Python ≥ 3.9
3. FFmpeg ≥ 6（需要 `libx264` / `aac` / `libass`）
4. Windows / macOS / Linux 皆可

## 工作流程

![pipeline](docs/images/pipeline.jpg)

```
文字 → 分段腳本（JSON）→ edge-tts 配音 + 字幕 + 影格編號時間軸 + 逐詞時間戳
                              ↓
            Remotion / React / Three.js / Canvas 寫畫面
         （motion 動作庫 + transitions 轉場層 + SFX 音效軌）
                              ↓
                  逐格渲染 → FFmpeg 合成 → MP4
```

配音這一步會產出四樣東西，它們是一切的錨點：

| 產物 | 用途 |
| --- | --- |
| `vo.mp3` | 整條配音軌（含段間停頓與背景配樂） |
| `vo.srt` / `vo.vtt` | 與音軌嚴格對齊的字幕（按標點斷句，緊貼真實語音） |
| `manifest.json` | **每句台詞的起訖影格編號** —— 畫面程式碼只認它，不認「大概幾秒」 |
| `words.json` | **逐詞時間戳** —— 卡拉OK 高亮、音效卡點、逐詞校對 |

## 技術棧

![stack](docs/images/stack.jpg)

| 層 | 技術 | 用在哪 |
| --- | --- | --- |
| 結構 | HTML / CSS / JavaScript | 網頁即畫布 |
| 2D 圖形 | Canvas 2D | 圖表、粒子、波形、資料視覺化 |
| 3D | Three.js（`@remotion/three`） | 產品展示、空間感、模型動畫 |
| 渲染增強 | WebGL / GLSL Shader | 流體、光效、紋理、後處理 |
| 元件化與合成 | React + TypeScript + **Remotion** | 多鏡頭、字幕、音畫同步（主推） |
| 時間軸動畫 | GSAP | 複雜緩動與時間軸編排 |
| 配音 | **edge-tts**（預設）/ 自訂 TTS API | 語音合成 |
| 編碼合成 | FFmpeg | 混流、混音、燒字幕、轉場、剪輯 |

## 配音：預設 edge-tts，也可換成你自己的

![voice](docs/images/voice.jpg)

### 預設：edge-tts（免費，開箱可用）

```bash
# 列出全部中文音色
.venv/bin/python scripts/tts_edge.py --list-voices zh

# 選音色：同一句話，多音色對照試聽，不盲選
.venv/bin/python scripts/tts_audition.py --outdir output/voice_samples --rate +5%

# 正式生成（預設整段韻律模式 + 自動加背景配樂 + 段間停頓）
.venv/bin/python scripts/tts_edge.py \
  --script examples/script.intro10s.json \
  --outdir public/voice \
  --voice zh-CN-XiaoxiaoNeural --rate +5% --fps 30 --normalize
```

內建 14 個中文音色（`zh-CN-*` / `zh-HK-*` / `zh-TW-*`），常用幾個：

| 音色 | 聽感 | 場景 |
| --- | --- | --- |
| `zh-CN-XiaoxiaoNeural` | 女·溫暖通用 | 口播、敘事（預設） |
| `zh-CN-YunxiNeural` | 男·陽光少年感 | 科技、Vlog |
| `zh-CN-YunjianNeural` | 男·渾厚有力 | 宣傳片、預告 |
| `zh-CN-YunyangNeural` | 男·專業播報 | 新聞、紀錄片 |
| `zh-CN-XiaoyiNeural` | 女·活潑明亮 | 短影片、教學 |

### 三條硬限制（踩過的坑，已寫進程式碼）

| 限制 | 原因 | 實測 |
| --- | --- | --- |
| **稿子不寫句號「。」** | 句號觸發「句末下降調 + 長停頓」，一句一個降調 = 機器念課文。工具會**自動移除**並在日誌告訴你移除了幾個 | — |
| **整段韻律模式**（預設） | 分段合成時**每次請求自帶約 0.6 秒尾靜音**，語調還在段首重置，聽感一頓一頓 | 同稿：分段 8.75s → 整段 6.98s，差的 1.8 秒**全是假停頓** |
| **語速 +0% ~ +5%** | 超過 +10% 明顯發飄、齒音重 | — |

停頓與配樂預設就開：**段間 400ms 真停頓**（不是無縫銜接）、**片尾 600ms 呼吸**、**BGM 側鏈閃避**（一說話音樂自動壓低）。

> 背景音樂是 `scripts/make_bgm.py` 用程式碼合成的（正弦加法合成 + 和弦交叉淡化），**免版權、可商用、可無縫循環**。想換就丟一個 mp3 到 `assets/bgm.mp3`。
>
> 混音用**多頻段 carve** 而不是整體壓低：先 Linkwitz-Riley 分頻（300Hz / 3400Hz），只對人聲頻段做側鏈壓限。
> 實測同一條片子低頻能量——不處理 −35.4dB / 整體閃避 −43.2dB（音樂瘪掉）/ carve −36.1dB（**音樂保住了**）。
> 響度用兩遍 `loudnorm`（線性增益），`--loudness-target social|podcast|broadcast` = −14 / −16 / −23 LUFS。

### 換成你自己的 TTS API

只要你的服務能「給文字、還音訊」，就能接進來 —— 語音合成的時間與字幕邏輯完全重複使用。

**A. OpenAI 相容的 `/audio/speech`**（OpenAI、SiliconFlow、智譜、火山方舟等多數廠商都行這個形狀）
（本地的沒試過，但機率也行。）

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

**B. VoiceCraft 系介面**（`POST /v1/audio/speech`，欄位 `input` / `voice` / `speed` / `pitch` / `style` / `volume`）

這個來自開源專案 [JinSuperOfficial/tts-voice-magic](https://github.com/JinSuperOfficial/tts-voice-magic)。
原始 TTS 專案作者見該 TTS 倉庫上游（VoiceCraft，基於微軟 Edge TTS，可一鍵部署到 Cloudflare Workers）。它比 A 多一個 `style` 情感／角色參數（`general` / `newscast` / `cheerful` / `serious` / `gentle` …）。

```bash
# 自己部署一份（推薦）：https://github.com/JinSuperOfficial/tts-voice-magic
# 或直接用已經部署好的實例（本機實測可用）
.venv/bin/python scripts/tts_edge.py --script examples/script.intro10s.json \
  --outdir public/voice --fps 30 \
  --engine voicecraft \
  --tts-base-url https://tts.jinsuper.cn/v1 \
  --voice zh-CN-XiaoxiaoNeural \
  --rate +5% --tts-style newscast
```

> [!WARNING]
> 一個實測踩到的坑：Cloudflare 前置的站點會攔掉 Python 預設的 User-Agent
> （`Python-urllib/3.x` → `HTTP 403 error code: 1010`），而 `curl` 是通的。
> 腳本已預設帶正常 UA，所以開箱可用；換別的 HTTP 客戶端時要自己設 UA。

**C. 完全自訂端點**（各家欄位不一樣時，用 JSON 模板適配）

```bash
.venv/bin/python scripts/tts_edge.py --script script.json --outdir public/voice \
  --engine custom \
  --tts-endpoint https://your-tts.example.com/v1/synthesize \
  --tts-header "X-App-Id=my-app" \
  --tts-payload '{"text":"{text}","speaker":"{voice}","format":"mp3"}' \
  --voice my-speaker-id
```

模板裡可用 `{text}` `{voice}` `{model}` `{speed}` 佔位符；回應主體直接是音訊位元組即可。

> 自建引擎拿不到逐詞邊界，因此會自動改用分段模式（每段一次請求）—— 時間軸由 `ffprobe` 回讀，依然精確；
> 字幕按「一句一段」生成，`words.json` 如實標註 `precision: "none"`，不假裝有逐詞精度。

## 剪輯模式（EDL 驅動）

> [!NOTE]
> Experimental

![editing](docs/images/editing.jpg)

用一份 JSON 描述時間軸，工具生成 FFmpeg 指令並執行。**三階段流水線**，絕不把異構素材直接餵進濾鏡圖：

```
素材（異構） ──conform──▶ 統一規格 ──assemble──▶ 時間軸 ──finish──▶ output/edit.mp4
  解析度／影格率／音軌不一     裁剪+xfade+acrossfade      疊加／混音／字幕／壓縮
```

```bash
# 先看指令，再動手（剪輯不可逆，別盲跑）
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json
python3 scripts/vedit.py build --edl examples/edit-plan.example.json

# 橫屏 → 直屏（模糊墊底，短影片常用）
python3 scripts/vedit.py build --edl examples/edit-plan.example.json --aspect vertical
```

能力：裁剪／多段拼接／**xfade 轉場**（58 種，與音訊 acrossfade 成對）／浮水印與子母畫面／三種畫幅適配（pad·crop·blur）／目標體積壓縮／與 Remotion 生成的片段混合成片。

四條硬限制：

1. **先 conform 再拼** —— 解析度／影格率／編碼／取樣率／音軌數統一，無音軌自動補靜音；
2. **offset = 前段累計時長 − 轉場時長**，且 `轉場時長 ≤ min(前段,後段)/2`，越界直接報錯；
3. **音視訊成對處理** —— 有 xfade 必有同值 acrossfade，杜絕爆音斷音；
4. **四級降級兜底** —— `xfade → concat filter → concat demuxer(copy) → 報錯保留現場`，降級了會明確告訴你。

## 專案結構

```
web-video-produce/
├─ SKILL.md                 # ★ Agent 技能主文件（LLM 讀這個就夠了）
├─ project.md               # ★ 專案交接文件（架構 / 決策 / 擴充點）
├─ scripts/
│   ├─ tts_edge.py          # 配音 + 字幕 + 影格編號時間軸（edge-tts / 自訂 API / BGM / 停頓）
│   ├─ tts_audition.py      # 同句多音色對照試聽
│   ├─ make_bgm.py          # 程式碼合成免版權 BGM
│   ├─ validate.py          # 靜態驗證器（渲染前後各跑一次）
│   ├─ vedit.py             # EDL 剪輯器（probe / plan / build / conform）
│   ├─ mux.sh               # 混流 / 混音 / 燒字幕 / 響度正規化
│   ├─ capture_frames.mjs   # HTML 頁面確定性逐格截圖（Playwright）
│   ├─ frames_to_video.sh   # PNG 序列 → MP4
│   ├─ make_sample_assets.sh# 生成異構 demo 素材
│   └─ check_env.sh         # 環境自我檢查
├─ src/                     # Remotion 專案（Root / Main / 字幕 / 三套場景）
├─ templates/html-gsap/     # 影格協定 + Canvas2D + GSAP 模板
├─ examples/                # 分段腳本 + EDL 範例
├─ assets/                  # 素材（bgm / logo / raw）
├─ public/voice/            # 生成的配音與時間軸（gitignore）
└─ output/                  # 交付目錄
```

## 渲染前先自我檢查

```bash
python3 scripts/validate.py                      # 原始碼 + 時間軸：1 秒內出結果
python3 scripts/validate.py --out output/final.mp4   # 再加上成品規格、色彩空間、響度
python3 scripts/validate.py --json               # Agent 友善
```

它檢查：確定性鐵律（`Math.random`/`Date.now`/自走動畫）、`manifest.json ↔ config.ts` 的 fps 與時長一致性、
場景 id 是否都在配音腳本裡、`staticFile` 與 EDL 引用的素材是否存在、中文字型是否載入、
成品的像素格式 / **色彩空間 bt709** / 色彩範圍 tv / 峰值 / 平均音量 / 整體 LUFS。

> 這個驗證器抓到過一個真問題：Remotion 預設不傳色彩參數，成品會寫成 full-range `yuvj420p` + BT.601，
> 上傳到平台轉碼時顏色會漂。現在 `remotion.config.ts` 固定 `Config.setColorSpace('bt709')`。

## 常見問題

<details>
<summary><b>中文渲染成豆腐塊 □□□</b></summary>

headless 環境常常一個 CJK 字型都沒有。`SKILL.md` §4.5 給了三種解法，推薦把 woff2 放進 `public/fonts/` 用 `@remotion/fonts` 載入（一個檔案、一次請求、完全離線）。
</details>

<details>
<summary><b>渲染很慢</b></summary>

預設用 `@remotion/google-fonts` 會在首次渲染預載入全部字型子集（約 294 個請求，1-2 分鐘）。換成自帶字型檔案即可大幅加速。另外先 `--scale=0.5` 出樣片，確認沒問題再渲全片。
</details>

<details>
<summary><b>配音聽起來很假</b></summary>

見上文的[三條硬限制](#三條硬限制踩過的坑已寫進程式碼)。工具已經預設幫你做了：去句號、整段韻律、降速、加停頓、配 BGM。仍不滿意就換引擎（Azure SSML / MiniMax / 火山 / 本地 GPT-SoVITS 克隆）。
</details>

<details>
<summary><b>拼接後花屏 / 轉場處黑格 / 聲音爆掉</b></summary>

素材參數不一致。`vedit.py` 會強制先 conform；手工拼時務必統一解析度、影格率、像素格式、取樣率，並且**有 xfade 就要有 acrossfade**。
</details>

## 授權條款

[MIT](LICENSE) © JinSuperOfficial

內建 BGM 由 `scripts/make_bgm.py` 程式碼合成，無第三方素材，可商用。edge-tts 呼叫的是微軟 Edge「大聲朗讀」的公開端點，**不是官方商用 API**，可能限流或變更；商用關鍵場景請換成有 SLA 的服務。
