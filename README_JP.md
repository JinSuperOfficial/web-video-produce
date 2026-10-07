# web-video-produce · Code-to-Video

> [!WARNING]
> このドキュメントには機械翻訳が含まれている可能性があります。

<p>
<img alt="license" src="https://img.shields.io/badge/license-MIT-5eead4">
<img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-3c873a">
<img alt="ffmpeg" src="https://img.shields.io/badge/ffmpeg-%E2%89%A56-007808">
<img alt="python" src="https://img.shields.io/badge/python-%E2%89%A53.9-3776ab">
<img alt="tts" src="https://img.shields.io/badge/TTS-edge--tts%20%7C%20custom%20API-f0abfc">
</p>

## Language

## Language

| 言語 | README | Status |
| --- | --- | --- |
| 日本語 | 現在のページ | OK |
| 简体中文 | [README.md](./README.md) | OK |
| 繁體中文 | [README_ZH-HANT.md](./README_ZH-HANT.md) | OK |
| English | [README_EN.md](./README_EN.md) | OK |
| 한국어 | [README_KO.md](./README_KO.md) | IN NEED |
| Español | [README_ES.md](./README_ES.md) | IN NEED |
 OTHER  -  If you would like to add support for this language, you can submit a PR 


> **主な特徴**
> - テキストのみの LLM で動画を生成（Code-To-Video）
> - 原理：Web ベースのアーキテクチャ
> - 音声合成：デフォルトは edge-tts、独自の TTS API も接続可能（example.com/v1）

AI がコードで動画制作／編集を行う：スクリプト → 音声 → **コードを書く** → フレーム単位でレンダリング → MP4。

![code to video](docs/images/hero.jpg)

▶ **サンプル出力**（11秒、中国語ナレーション + 字幕 + 自動 BGM、すべてこのリポジトリで生成）

[![サンプル出力カバー](docs/images/sample-cover.jpg)](https://www.bilibili.com/video/BV11tpw63Eoh)

- Bilibili：[BV11tpw63Eoh](https://www.bilibili.com/video/BV11tpw63Eoh)
- 元ファイル：[`docs/sample-intro.mp4`](docs/sample-intro.mp4)

**DSH Skill**（単体で実行可能なプロジェクトでもあります）：「スクリプトを書く → ナレーション、字幕、BGM 付きの MP4 を出力する」という作業を、LLM が自律的に完了できるコーディングタスクに変えます。
（作者はもっとやりたかったのですが、時間とトークンが足りませんでした。）

動画編集ソフトに依存せず、マルチモーダルモデルも不要 —— **テキストのみの LLM で使えます**：テキストを読み、コードを書き、コマンドを実行し、`ffprobe` の出力を確認し、フレームを抽出して自己検証します。

---

## 目次

- [コアコンセプト](#コアコンセプト)
- [2つの能力](#2つの能力)
- [クイックスタート](#クイックスタート)
- [ワークフロー](#ワークフロー)
- [技術スタック](#技術スタック)
- [TTS: edge-tts または独自のAPI](#tts-edge-tts-または独自のapi)
- [編集モード（EDL 駆動）](#編集モードedl-駆動)
- [プロジェクト構成](#プロジェクト構成)
- [FAQ](#faq)
- [ライセンス](#ライセンス)

---

## コアコンセプト

動画は「切って」作るものではなく、**コードで計算して**作るものです。だからこそ LLM に最適です：

1. **タイムラインが唯一の真実** —— 動画の長さはナレーションで決まります。順序は常に：スクリプト → ナレーション → 各セリフのフレーム番号を取得 → 映像コードを書く。
2. **すべてのフレームは純粋関数 f(frame)** —— `Math.random()`、`Date.now()`、`requestAnimationFrame` による時間の累積は禁止。レンダリングは再現可能でなければなりません。
3. **まずサンプル、次に全体** —— まず 1 枚の静止画でフォント／構図を確認し、次に 3 秒をレンダリングし、最後に全体をレンダリングします。
4. **音声は専門ツールに任せる** —— TTS をコードで合成しない、ミキシングをコードで行わない。edge-tts が音を出し、FFmpeg が仕上げます。
5. **納品即検証** —— 出力後、`ffprobe` で仕様を報告し、フレームを抽出して映像を確認してからユーザーに渡します。

## 2つの能力

| 能力 | 入力 | 行うこと | 出力 |
| --- | --- | --- | --- |
| **生成** | テキスト／トピック | 分割 → ナレーション+字幕タイムライン → 映像コードを書く → フレーム単位レンダリング → 合成 | `output/final.mp4` |
| **編集** | 既存素材（自分／他人のもの） | EDL 宣言的タイムライン → conform 正規化 → トリム／トランジション／ウォーターマーク／アスペクト／圧縮 | `output/edit.mp4` |

2つのルートは混合可能：Remotion で生成したアニメーションクリップを、通常の素材と同じように編集タイムラインに書き込めます。

## クイックスタート

**macOS / Linux（Bash、Windows の Git Bash / WSL でも動作）**

```bash
git clone https://github.com/JinSuperOfficial/web-video-produce.git
cd web-video-produce

# 1) セルフチェック実行：環境 / プロジェクト検証 / 出力仕様
python3 scripts/wvp.py doctor

# 2) 依存関係
npm install                     # またはその他
npx remotion browser ensure     # Chrome Headless Shell をダウンロード
python3 -m venv .venv && .venv/bin/pip install edge-tts
# 仮想環境を有効化し、依存関係をインストール（Edge-TTS）

# 3) 出力：ナレーション → タイムライン検証 → 静的検証 → レンダリング → 音声多重化 → 検収
python3 scripts/wvp.py render --out output/intro10s.mp4
#    まず 2 秒の半解像度サンプルを出力すると時短：--scale 0.5 --frames 0-60
#    既存のナレーションを再利用：--no-tts

# 4) タイムライン検証：セグメント／フレーム／単語の整合性（--verify-audio は音声トラックをデコードして実測）
python3 scripts/wvp.py timeline --words
python3 scripts/wvp.py timeline --verify-audio

# 5) 編集ルート：まずコマンドを確認してから実行
python3 scripts/vedit.py transitions                        # どのトランジションを使うか迷ったとき
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json
python3 scripts/vedit.py build --edl examples/edit-plan.example.json
```

**Windows PowerShell**

```powershell
git clone https://github.com/JinSuperOfficial/web-video-produce.git
cd web-video-produce

# 1) セルフチェック実行：環境 / プロジェクト検証 / 出力仕様
python .\scripts\wvp.py doctor

# 2) 依存関係
npm install                     # またはその他
npx remotion browser ensure     # Chrome Headless Shell をダウンロード
python -m venv .venv
.venv\Scripts\pip.exe install edge-tts
# 仮想環境を有効化し、依存関係をインストール（Edge-TTS）

# 3) 出力：ナレーション → タイムライン検証 → 静的検証 → レンダリング → 音声多重化 → 検収
python .\scripts\wvp.py render --out output\intro10s.mp4
#    まず 2 秒の半解像度サンプルを出力すると時短：--scale 0.5 --frames 0-60
#    既存のナレーションを再利用：--no-tts

# 4) タイムライン検証：セグメント／フレーム／単語の整合性（--verify-audio は音声トラックをデコードして実測）
python .\scripts\wvp.py timeline --words
python .\scripts\wvp.py timeline --verify-audio

# 5) 編集ルート：まずコマンドを確認してから実行
python .\scripts\vedit.py transitions                        # どのトランジションを使うか迷ったとき
python .\scripts\vedit.py plan  --edl examples\edit-plan.example.json
python .\scripts\vedit.py build --edl examples\edit-plan.example.json
```

`wvp.py` はこのプロジェクトの統一エントリポイントで、サブコマンドは 3 つだけです（`doctor` / `render` / `timeline`）。

**動作環境**：
1. Node ≥ 18
2. Python ≥ 3.9
3. FFmpeg ≥ 6（`libx264` / `aac` / `libass` が必要）
4. Windows / macOS / Linux すべて対応

## ワークフロー

![pipeline](docs/images/pipeline.jpg)

```
テキスト → 分割スクリプト（JSON）→ edge-tts ナレーション + 字幕 + フレーム番号タイムライン + 単語単位タイムスタンプ
                              ↓
            Remotion / React / Three.js / Canvas で映像を描画
         （motion ライブラリ + transitions レイヤー + SFX トラック）
                              ↓
                  フレームレンダリング → FFmpeg 合成 → MP4
```

ナレーションのステップでは 4 つのものが生成され、それらがすべての基点となります：

| 生成物 | 用途 |
| --- | --- |
| `vo.mp3` | ナレーション全体のトラック（セグメント間の無音と BGM を含む） |
| `vo.srt` / `vo.vtt` | 音声トラックに厳密に同期した字幕（句読点で分割、実際の発話に密着） |
| `manifest.json` | **各セリフの開始／終了フレーム番号** —— 映像コードはこれだけを信頼し、「だいたい何秒」は信頼しない |
| `words.json` | **単語単位のタイムスタンプ** —— カラオケハイライト、効果音の同期、単語単位の校正 |

## 技術スタック

![stack](docs/images/stack.jpg)

| 層 | 技術 | 用途 |
| --- | --- | --- |
| 構造 | HTML / CSS / JavaScript | Web ページがキャンバス |
| 2D グラフィックス | Canvas 2D | チャート、パーティクル、波形、データ可視化 |
| 3D | Three.js（`@remotion/three`） | 製品デモ、空間表現、モデルアニメーション |
| レンダリング強化 | WebGL / GLSL Shader | 流体、光効果、テクスチャ、ポストプロセス |
| コンポーネント化と合成 | React + TypeScript + **Remotion** | マルチショット、字幕、音声同期（推奨） |
| タイムラインアニメーション | GSAP | 複雑なイージングとタイムライン編成 |
| 音声合成 | **edge-tts**（デフォルト）/ カスタム TTS API | 音声合成 |
| エンコードと多重化 | FFmpeg | 多重化、ミキシング、字幕焼き込み、トランジション、編集 |

## TTS: edge-tts または独自のAPI

![voice](docs/images/voice.jpg)

### デフォルト：edge-tts（無料、すぐに使える）

```bash
# 中国語の音声をすべて一覧表示
.venv/bin/python scripts/tts_edge.py --list-voices zh

# 音声選択：同じ文を複数の音声で試聴し、盲目的に選ばない
.venv/bin/python scripts/tts_audition.py --outdir output/voice_samples --rate +5%

# 正式生成（デフォルトはセグメント全体の韻律モード + 自動 BGM + セグメント間ポーズ）
.venv/bin/python scripts/tts_edge.py \
  --script examples/script.intro10s.json \
  --outdir public/voice \
  --voice zh-CN-XiaoxiaoNeural --rate +5% --fps 30 --normalize
```

中国語音声 14 種類を内蔵（`zh-CN-*` / `zh-HK-*` / `zh-TW-*`）、よく使うもの：

| 音声 | 特徴 | シーン |
| --- | --- | --- |
| `zh-CN-XiaoxiaoNeural` | 女性・温かみのある汎用 | ナレーション、ストーリーテリング（デフォルト） |
| `zh-CN-YunxiNeural` | 男性・爽やかで若々しい | テック、Vlog |
| `zh-CN-YunjianNeural` | 男性・深みのある力強い声 | プロモーション、予告編 |
| `zh-CN-YunyangNeural` | 男性・プロのアナウンサー | ニュース、ドキュメンタリー |
| `zh-CN-XiaoyiNeural` | 女性・活発で明るい | ショート動画、チュートリアル |

### 3つの厳守事項（ハマった落とし穴、コードに組み込み済み）

| 制約 | 理由 | 実測 |
| --- | --- | --- |
| **原稿に句点「。」を書かない** | 句点は「文末の下降調 + 長いポーズ」を引き起こし、1文ごとに下降調 = ロボットが教科書を読む感じになる。ツールが**自動削除**し、ログで削除した数を知らせる | — |
| **セグメント全体の韻律モード**（デフォルト） | セグメントごとの合成では**リクエストごとに約 0.6 秒の末尾無音が付き**、イントネーションもセグメント先頭でリセットされるため、聞きづらくなる | 同じ原稿：セグメント分割 8.75s → 全体 6.98s、差の 1.8 秒は**すべて偽のポーズ** |
| **話速 +0% 〜 +5%** | +10% を超えると明らかに浮つき、歯擦音が強くなる | — |

ポーズと BGM はデフォルトで有効：**セグメント間 400ms の実際のポーズ**（シームレスではない）、**末尾 600ms の呼吸**、**BGM サイドチェーン・ダッキング**（話すと音楽が自動的に下がる）。

> BGM は `scripts/make_bgm.py` がコードで合成しています（正弦波加算合成 + コードクロスフェード）。**著作権フリー、商用利用可、シームレスループ可能**。変更したい場合は mp3 を `assets/bgm.mp3` に置くだけ。
>
> ミキシングは全体を下げるのではなく**マルチバンド carve** を使用：まず Linkwitz-Riley クロスオーバー（300Hz / 3400Hz）、ボーカル帯域のみにサイドチェーンコンプレッションを適用。
> 同じ動画での低域エネルギー実測 —— 未処理 −35.4dB / 全体ダッキング −43.2dB（音楽が萎む）/ carve −36.1dB（**音楽が保たれる**）。
> ラウドネスは `loudnorm` を2回適用（リニアゲイン）、`--loudness-target social|podcast|broadcast` = −14 / −16 / −23 LUFS。

### 独自の TTS API を接続する

サービスが「テキストを受け取り、音声を返す」ものであれば接続できます —— 音声合成のタイミングと字幕ロジックは完全に再利用されます。

**A. OpenAI 互換の `/audio/speech`**（OpenAI、SiliconFlow、智譜、火山方舟など多くのベンダーがこの形状）
（ローカルのものは未検証ですが、おそらく動作します。）

```bash
export TTS_API_KEY=sk-xxxx        # または --tts-api-key

.venv/bin/python scripts/tts_edge.py --script examples/script.intro10s.json \
  --outdir public/voice \
  --engine openai \
  --tts-base-url https://api.openai.com/v1 \
  --tts-model gpt-4o-mini-tts \
  --voice alloy \
  --bgm assets/bgm.mp3
```

**B. VoiceCraft 系 API**（`POST /v1/audio/speech`、フィールド `input` / `voice` / `speed` / `pitch` / `style` / `volume`）

これはオープンソースプロジェクト [JinSuperOfficial/tts-voice-magic](https://github.com/JinSuperOfficial/tts-voice-magic) に由来します。
元の TTS プロジェクトの作者はその TTS リポジトリの上流にいます（VoiceCraft、Microsoft Edge TTS ベース、Cloudflare Workers へのワンクリックデプロイ可能）。A に加えて `style` 感情／キャラクターパラメータがあります（`general` / `newscast` / `cheerful` / `serious` / `gentle` …）。

```bash
# 自分でデプロイする（推奨）：https://github.com/JinSuperOfficial/tts-voice-magic
# または既にデプロイ済みのインスタンスを使用（ローカルで検証済み）
.venv/bin/python scripts/tts_edge.py --script examples/script.intro10s.json \
  --outdir public/voice --fps 30 \
  --engine voicecraft \
  --tts-base-url https://tts.jinsuper.cn/v1 \
  --voice zh-CN-XiaoxiaoNeural \
  --rate +5% --tts-style newscast
```

> [!WARNING]
> テストでハマった落とし穴：Cloudflare を前置したサイトは Python のデフォルト User-Agent をブロックします
> （`Python-urllib/3.x` → `HTTP 403 error code: 1010`）。一方 `curl` は通ります。
> スクリプトはデフォルトで正常な UA を送信するため、すぐに使えます。別の HTTP クライアントに変更する場合は UA を自分で設定してください。

**C. 完全カスタムエンドポイント**（ベンダーごとにフィールドが異なる場合、JSON テンプレートで適応）

```bash
.venv/bin/python scripts/tts_edge.py --script script.json --outdir public/voice \
  --engine custom \
  --tts-endpoint https://your-tts.example.com/v1/synthesize \
  --tts-header "X-App-Id=my-app" \
  --tts-payload '{"text":"{text}","speaker":"{voice}","format":"mp3"}' \
  --voice my-speaker-id
```

テンプレートで使用可能なプレースホルダー：`{text}` `{voice}` `{model}` `{speed}`。レスポンスボディは生の音声バイトで問題ありません。

> セルフホストエンジンは単語境界を提供できないため、自動的にセグメントモードに切り替わります（セグメントごとに1リクエスト）—— タイムラインは `ffprobe` で読み戻され、正確なままです。
> 字幕は「1文1セグメント」で生成され、`words.json` は `precision: "none"` と正直にマークし、単語単位の精度があるふりをしません。

## 編集モード（EDL 駆動）

> [!NOTE]
> Experimental

![editing](docs/images/editing.jpg)

JSON でタイムラインを記述し、ツールが FFmpeg コマンドを生成して実行します。**3段階パイプライン**で、異種素材を直接フィルターグラフに投入しません：

```
素材（異種） ──conform──▶ 統一仕様 ──assemble──▶ タイムライン ──finish──▶ output/edit.mp4
  解像度／fps／音声が異なる     トリム+xfade+acrossfade      オーバーレイ／ミックス／字幕／圧縮
```

```bash
# まずコマンドを確認してから実行（編集は不可逆、盲目的に実行しない）
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json
python3 scripts/vedit.py build --edl examples/edit-plan.example.json

# 横長 → 縦長（ぼかし背景、ショート動画でよく使用）
python3 scripts/vedit.py build --edl examples/edit-plan.example.json --aspect vertical
```

機能：トリム / マルチセグメント連結 / **xfade トランジション**（58種、音声の acrossfade とペア）/ ウォーターマークとピクチャーインピクチャー / 3つのアスペクト適応（pad·crop·blur）/ 目標サイズ圧縮 / Remotion 生成クリップとの混合。

4つの厳守事項：

1. **連結前に conform** —— 解像度／fps／コーデック／サンプルレート／音声トラック数を統一、音声トラックがなければ自動で無音を追加；
2. **offset = 前セグメントの累積時間 − トランジション時間**、かつ `トランジション時間 ≤ min(前, 後)/2`、範囲外は即エラー；
3. **音声と映像をペアで処理** —— xfade があれば同じ値の acrossfade が必須、ノイズや音切れを防ぐ；
4. **4段階フォールバック** —— `xfade → concat filter → concat demuxer(copy) → エラーで現場保存`、フォールバックした場合は明確に通知。

## プロジェクト構成

```
web-video-produce/
├─ SKILL.md                 # ★ Agent スキルメインドキュメント（LLM はこれを読めば十分）
├─ project.md               # ★ プロジェクト引き継ぎドキュメント（アーキテクチャ / 決定 / 拡張ポイント）
├─ scripts/
│   ├─ tts_edge.py          # ナレーション + 字幕 + フレーム番号タイムライン（edge-tts / カスタム API / BGM / ポーズ）
│   ├─ tts_audition.py      # 同じ文を複数音声で試聴
│   ├─ make_bgm.py          # コード合成の著作権フリー BGM
│   ├─ validate.py          # 静的バリデータ（レンダリング前後に各1回実行）
│   ├─ vedit.py             # EDL エディタ（probe / plan / build / conform）
│   ├─ mux.sh               # 多重化 / ミックス / 字幕焼き込み / ラウドネス正規化
│   ├─ capture_frames.mjs   # HTML ページの決定論的フレーム単位スクリーンショット（Playwright）
│   ├─ frames_to_video.sh   # PNG シーケンス → MP4
│   ├─ make_sample_assets.sh# 異種デモ素材を生成
│   └─ check_env.sh         # 環境セルフチェック
├─ src/                     # Remotion プロジェクト（Root / Main / 字幕 / 3つのシーンセット）
├─ templates/html-gsap/     # フレームプロトコル + Canvas2D + GSAP テンプレート
├─ examples/                # 分割スクリプト + EDL サンプル
├─ assets/                  # 素材（bgm / logo / raw）
├─ public/voice/            # 生成されたナレーションとタイムライン（gitignore）
└─ output/                  # 納品ディレクトリ
```

## レンダリング前の検証

```bash
python3 scripts/validate.py                      # ソース + タイムライン：1秒以内に結果
python3 scripts/validate.py --out output/final.mp4   # 出力仕様、色空間、ラウドネスも追加
python3 scripts/validate.py --json               # Agent フレンドリー
```

チェック内容：決定論的ルール（`Math.random`/`Date.now`/自動進行アニメーション）、`manifest.json ↔ config.ts` の fps と長さの一貫性、
すべてのシーン ID がナレーションスクリプトに存在するか、`staticFile` と EDL が参照する素材が存在するか、中国語フォントが読み込まれているか、
出力のピクセルフォーマット / **色空間 bt709** / 色範囲 tv / ピーク / 平均音量 / 全体 LUFS。

> このバリデータは実際の問題を1つ発見しました：Remotion はデフォルトで色パラメータを渡さないため、出力が full-range `yuvj420p` + BT.601 で書き出され、
> プラットフォームでトランスコードされると色がずれます。現在は `remotion.config.ts` で `Config.setColorSpace('bt709')` を固定しています。

## FAQ

<details>
<summary><b>中国語が豆腐ブロック □□□ になる</b></summary>

headless 環境では CJK フォントがまったくないことがよくあります。`SKILL.md` §4.5 に3つの解決策があり、推奨は woff2 を `public/fonts/` に置き、`@remotion/fonts` で読み込む方法です（1ファイル、1リクエスト、完全オフライン）。
</details>

<details>
<summary><b>レンダリングが遅い</b></summary>

デフォルトの `@remotion/google-fonts` は初回レンダリング時にすべてのフォントサブセットをプリロードします（約294リクエスト、1〜2分）。自前のフォントファイルに変えると大幅に高速化されます。また、まず `--scale=0.5` でサンプルを出力し、問題なければ全体をレンダリングしてください。
</details>

<details>
<summary><b>ナレーションが不自然に聞こえる</b></summary>

上記の[3つの厳守事項](#3つの厳守事項ハマった落とし穴コードに組み込み済み)を参照。ツールはデフォルトで以下を行います：句点削除、セグメント全体の韻律、速度低下、ポーズ追加、BGM 追加。それでも不満ならエンジンを変更してください（Azure SSML / MiniMax / 火山 / ローカル GPT-SoVITS クローン）。
</details>

<details>
<summary><b>連結後に画面が乱れる / トランジションで黒フレーム / 音が割れる</b></summary>

素材パラメータの不一致です。`vedit.py` は強制的に conform します。手動で連結する場合は、解像度、fps、ピクセルフォーマット、サンプルレートを必ず統一し、**xfade があれば acrossfade も必須**です。
</details>

## ライセンス

[MIT](LICENSE) © JinSuperOfficial

内蔵 BGM は `scripts/make_bgm.py` がコードで合成しており、サードパーティ素材はなく、商用利用可能です。edge-tts は Microsoft Edge「Read Aloud」の公開エンドポイントを呼び出しており、**公式の商用 API ではありません**。レート制限や変更の可能性があります。重要な商用シーンでは SLA のあるサービスに切り替えてください。