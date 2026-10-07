# web-video-produce · 코드로 영상 만들기
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
| 한국어 | 현재 위치 | OK |
| 简体中文 | [README.md](./README.md) | OK |
| 繁體中文 | [README_ZH-HANT.md](./README_ZH-HANT.md) | OK |
| English | [README_EN.md](./README_EN.md) | OK |
| 日本語 | [README_JA.md](./README_JA.md) | IN NEED |
| Español | [README_ES.md](./README_ES.md) | IN NEED |
OTHER  -  이 언어에 대한 지원을 추가하고 싶다면 PR을 제출해 주세요

> **핵심 기능**
> - 텍스트 전용 LLM으로 영상 생성(Code-To-Video)
> - 원리: Web 아키텍처 사용
> - 더빙: 기본 edge-tts, 자체 TTS API 호출 가능(example.url/v1)

AI가 코드로 영상 제작/편집: 스크립트 → 더빙 → **코드 작성** → 프레임별 렌더링 → MP4.

![code to video](docs/images/hero.jpg)

▶ **샘플 영상**(11초, 중국어 더빙 + 자막 + 자동 배경 음악, 모두 이 저장소에서 생성)

[![샘플 영상 커버](docs/images/sample-cover.jpg)](https://www.bilibili.com/video/BV11tpw63Eoh)

- Bilibili: [BV11tpw63Eoh](https://www.bilibili.com/video/BV11tpw63Eoh)
- 원본 파일: [`docs/sample-intro.mp4`](docs/sample-intro.mp4)

하나의 **DSH Skill**(독립 실행 가능한 프로젝트이기도 함): "스크립트 작성 → 더빙, 자막, 배경 음악이 포함된 MP4 출력"이라는 작업을 LLM이 자율적으로 완료할 수 있는 코드 작업으로 만듭니다.
(사실 더 하고 싶었지만 시간이 없었고, 토큰도 부족했습니다)

편집 소프트웨어에 의존하지 않으며, 멀티모달 모델도 필요하지 않습니다 — **텍스트 전용 LLM이면 사용 가능**: 텍스트 읽기, 코드 작성, 명령 실행, `ffprobe` 출력 확인, 프레임 추출 자체 점검

---

## 목차

- [핵심 이념](#핵심-이념)
- [두 가지 능력](#두-가지-능력)
- [빠른 시작](#빠른-시작)
- [워크플로](#워크플로)
- [기술 스택](#기술-스택)
- [더빙: 기본 edge-tts, 자체 TTS로 교체 가능](#더빙-기본-edge-tts-자체-tts로-교체-가능)
- [편집 모드(EDL 기반)](#편집-모드edl-기반)
- [디렉토리 구조](#디렉토리-구조)
- [Q & A](#자주-묻는-질문)
- [라이선스](#license)

---

## 핵심 이념

영상은 "자르는" 것이 아니라 **코드로 계산하는** 것입니다. 따라서 LLM에 자연스럽게 적합합니다:

1. **타임라인이 유일한 진실** — 영상 길이는 더빙으로 결정됩니다. 순서는 항상: 스크립트 → 더빙 → 각 문장의 프레임 번호 확보 → 그다음 화면 코드 작성.
2. **모든 프레임은 순수 함수 f(frame)** — `Math.random()`, `Date.now()`, `requestAnimationFrame`으로 시간을 누적하는 것을 금지합니다. 렌더링은 재현 가능해야 합니다.
3. **먼저 샘플, 나중에 전체** — 먼저 정지 프레임 1장으로 폰트/구도를 확인하고, 그다음 3초를 렌더링하고, 마지막에 전체를 렌더링합니다.
4. **오디오는 전문 도구에 맡김** — TTS를 코드로 합성하지 않고, 믹싱을 코드로 하지 않습니다. edge-tts가 소리를 내고, FFmpeg가 마무리합니다.
5. **납품 즉 검증** — 출력 후 `ffprobe`로 사양을 보고하고, 프레임을 추출해 화면을 확인한 뒤 사용자에게 전달합니다.

## 두 가지 능력

| 능력 | 입력 | 하는 일 | 출력 |
| --- | --- | --- | --- |
| **생성** | 문안 / 주제 | 분할 → 더빙+자막 타임라인 → 비주얼 코드 작성 → 프레임별 렌더링 → 합성 | `output/final.mp4` |
| **편집** | 기존 소재(내 것/남의 것) | EDL 선언형 타임라인 → conform 표준화 → 자르기/전환/워터마크/화면비/압축 | `output/edit.mp4` |

두 경로는 혼합 가능: Remotion으로 생성한 애니메이션 클립을 일반 소재처럼 편집 타임라인에 넣을 수 있습니다.

## 빠른 시작

**macOS / Linux(Bash, Windows의 Git Bash / WSL에서도 사용 가능)**

```bash
git clone https://github.com/JinSuperOfficial/web-video-produce.git
cd web-video-produce

# 1) 자체 점검 실행: 환경 자체 점검/프로젝트 검증/출력 사양
python3 scripts/wvp.py doctor

# 2) 의존성
npm install                     # 또는 기타
npx remotion browser ensure     # Chrome Headless Shell 다운로드
python3 -m venv .venv && .venv/bin/pip install edge-tts
# 가상 환경 로드, 의존성 다운로드(Edge-TTS)

# 3) 출력: 더빙 → 타임라인 검증 → 정적 검증 → 렌더링 → 오디오 트랙 추가 → 검수
python3 scripts/wvp.py render --out output/intro10s.mp4
#    먼저 2초 반해상도 샘플 출력이 더 시간 절약: --scale 0.5 --frames 0-60
#    기존 더빙 재사용: --no-tts

# 4) 타임라인 확인: 세그먼트/프레임/단어 정렬 여부(--verify-audio는 오디오 트랙을 디코딩하여 실측)
python3 scripts/wvp.py timeline --words
python3 scripts/wvp.py timeline --verify-audio

# 5) 편집 경로: 먼저 명령 확인 후 실행
python3 scripts/vedit.py transitions                        # 어떤 전환을 사용할지 모를 때
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json
python3 scripts/vedit.py build --edl examples/edit-plan.example.json
```

**Windows PowerShell**

```powershell
git clone https://github.com/JinSuperOfficial/web-video-produce.git
cd web-video-produce

# 1) 자체 점검 실행: 환경 자체 점검/프로젝트 검증/출력 사양
python .\scripts\wvp.py doctor

# 2) 의존성
npm install                     # 또는 기타
npx remotion browser ensure     # Chrome Headless Shell 다운로드
python -m venv .venv
.venv\Scripts\pip.exe install edge-tts
# 가상 환경 로드, 의존성 다운로드(Edge-TTS)

# 3) 출력: 더빙 → 타임라인 검증 → 정적 검증 → 렌더링 → 오디오 트랙 추가 → 검수
python .\scripts\wvp.py render --out output\intro10s.mp4
#    먼저 2초 반해상도 샘플 출력이 더 시간 절약: --scale 0.5 --frames 0-60
#    기존 더빙 재사용: --no-tts

# 4) 타임라인 확인: 세그먼트/프레임/단어 정렬 여부(--verify-audio는 오디오 트랙을 디코딩하여 실측)
python .\scripts\wvp.py timeline --words
python .\scripts\wvp.py timeline --verify-audio

# 5) 편집 경로: 먼저 명령 확인 후 실행
python .\scripts\vedit.py transitions                        # 어떤 전환을 사용할지 모를 때
python .\scripts\vedit.py plan  --edl examples\edit-plan.example.json
python .\scripts\vedit.py build --edl examples\edit-plan.example.json
```

`wvp.py`는 이 프로젝트의 통합 진입점이며, 하위 명령은 세 개뿐입니다(`doctor` / `render` / `timeline`).

**환경 요구사항**:
1. Node ≥ 18
2. Python ≥ 3.9
3. FFmpeg ≥ 6(`libx264` / `aac` / `libass` 필요)
4. Windows / macOS / Linux 모두 가능

## 워크플로

![pipeline](docs/images/pipeline.jpg)

```
텍스트 → 분할 스크립트(JSON) → edge-tts 더빙 + 자막 + 프레임 번호 타임라인 + 단어별 타임스탬프
                              ↓
            Remotion / React / Three.js / Canvas로 화면 작성
         (motion 액션 라이브러리 + transitions 전환 레이어 + SFX 효과음 트랙)
                              ↓
                  프레임 렌더링 → FFmpeg 합성 → MP4
```

더빙 단계에서는 네 가지가 생성되며, 이것이 모든 것의 기준점입니다:

| 산출물 | 용도 |
| --- | --- |
| `vo.mp3` | 전체 더빙 트랙(세그먼트 간 휴지와 배경 음악 포함) |
| `vo.srt` / `vo.vtt` | 오디오 트랙과 엄격히 정렬된 자막(문장 부호로 분할, 실제 음성에 밀착) |
| `manifest.json` | **각 대사의 시작/끝 프레임 번호** — 화면 코드는 이것만 신뢰하고 "대략 몇 초"는 신뢰하지 않음 |
| `words.json` | **단어별 타임스탬프** — 노래방 하이라이트, 효과음 싱크, 단어별 교정 |

## 기술 스택

![stack](docs/images/stack.jpg)

| 계층 | 기술 | 사용처 |
| --- | --- | --- |
| 구조 | HTML / CSS / JavaScript | 웹 페이지가 캔버스 |
| 2D 그래픽 | Canvas 2D | 차트, 파티클, 파형, 데이터 시각화 |
| 3D | Three.js(`@remotion/three`) | 제품 데모, 공간감, 모델 애니메이션 |
| 렌더링 강화 | WebGL / GLSL Shader | 유체, 광효과, 텍스처, 후처리 |
| 컴포넌트화와 합성 | React + TypeScript + **Remotion** | 멀티 숏, 자막, 음화면 동기(주력) |
| 타임라인 애니메이션 | GSAP | 복잡한 이징과 타임라인 편성 |
| 더빙 | **edge-tts**(기본) / 자체 TTS API | 음성 합성 |
| 인코딩 합성 | FFmpeg | 믹싱, 오디오 믹스, 자막 굽기, 전환, 편집 |

## 더빙: 기본 edge-tts, 자체 TTS로 교체 가능

![voice](docs/images/voice.jpg)

### 기본: edge-tts(무료, 바로 사용 가능)

```bash
# 모든 중국어 음색 나열
.venv/bin/python scripts/tts_edge.py --list-voices zh

# 음색 선택: 같은 문장을 여러 음색으로 비교 청취, 맹목적으로 선택하지 않음
.venv/bin/python scripts/tts_audition.py --outdir output/voice_samples --rate +5%

# 정식 생성(기본 전체 구간 운율 모드 + 자동 배경 음악 + 세그먼트 간 휴지)
.venv/bin/python scripts/tts_edge.py \
  --script examples/script.intro10s.json \
  --outdir public/voice \
  --voice zh-CN-XiaoxiaoNeural --rate +5% --fps 30 --normalize
```

중국어 음색 14개 내장(`zh-CN-*` / `zh-HK-*` / `zh-TW-*`), 자주 쓰는 것:

| 음색 | 청감 | 장면 |
| --- | --- | --- |
| `zh-CN-XiaoxiaoNeural` | 여성·따뜻한 범용 | 내레이션, 서사(기본) |
| `zh-CN-YunxiNeural` | 남성·밝은 소년 느낌 | 테크, Vlog |
| `zh-CN-YunjianNeural` | 남성·깊고 힘 있음 | 홍보 영상, 예고편 |
| `zh-CN-YunyangNeural` | 남성·전문 아나운서 | 뉴스, 다큐멘터리 |
| `zh-CN-XiaoyiNeural` | 여성·활발하고 밝음 | 숏폼, 튜토리얼 |

### 세 가지 하드 제약(겪은 함정, 코드에 반영됨)

| 제약 | 원인 | 실측 |
| --- | --- | --- |
| **원고에 마침표「。」를 쓰지 않기** | 마침표는 "문장 끝 하강조 + 긴 휴지"를 유발하여 문장마다 하강조 = 기계가 교과서를 읽는 느낌. 도구가 **자동 제거**하고 로그에 몇 개 제거했는지 알려줌 | — |
| **전체 구간 운율 모드**(기본) | 세그먼트별 합성 시 **요청마다 약 0.6초 꼬리 무음이 포함**되고, 억양도 세그먼트 시작마다 리셋되어 끊겨 들림 | 같은 원고: 세그먼트 8.75s → 전체 6.98s, 차이 1.8초는 **전부 가짜 휴지** |
| **속도 +0% ~ +5%** | +10%를 넘으면明显하게 떠 보이고 치찰음이 강함 | — |

휴지와 배경 음악은 기본 활성화: **세그먼트 간 400ms 실제 휴지**(무缝 연결 아님), **엔딩 600ms 호흡**, **BGM 사이드체인 더킹**(말하면 음악 자동으로 낮아짐).

> 배경 음악은 `scripts/make_bgm.py`가 코드로 합성합니다(사인파 가산 합성 + 코드 크로스페이드). **저작권 무료, 상업적 사용 가능, 심리스 루프 가능**. 교체하려면 mp3를 `assets/bgm.mp3`에 넣으면 됩니다.
>
> 믹싱은 전체를 낮추는 대신 **멀티밴드 carve**를 사용: 먼저 Linkwitz-Riley 크로스오버(300Hz / 3400Hz), 보컬 대역에만 사이드체인 컴프레션 적용.
> 같은 영상에서 저역 에너지 실측 — 미처리 −35.4dB / 전체 더킹 −43.2dB(음악이 죽음) / carve −36.1dB(**음악이 살아남음**).
> 라우드니스는 `loudnorm`을 두 번 사용(선형 게인), `--loudness-target social|podcast|broadcast` = −14 / −16 / −23 LUFS.

### 자체 TTS API로 교체

서비스가 "텍스트를 주면 오디오를 돌려주는" 형태라면 연결할 수 있습니다 — 음성 합성의 시간과 자막 로직은 완전히 재사용됩니다.

**A. OpenAI 호환 `/audio/speech`**(OpenAI, SiliconFlow, Zhipu, Volcano Ark 등 대부분 업체가 이 형태)
(로컬은 테스트하지 않았지만, 아마 될 것입니다......)
```bash
export TTS_API_KEY=sk-xxxx        # 또는 --tts-api-key

.venv/bin/python scripts/tts_edge.py --script examples/script.intro10s.json \
  --outdir public/voice \
  --engine openai \
  --tts-base-url https://api.openai.com/v1 \
  --tts-model gpt-4o-mini-tts \
  --voice alloy \
  --bgm assets/bgm.mp3
```

**B. VoiceCraft 계열 인터페이스**(`POST /v1/audio/speech`, 필드 `input` / `voice` / `speed` / `pitch` / `style` / `volume`)

이것은 오픈소스 프로젝트 [JinSuperOfficial/tts-voice-magic](https://github.com/JinSuperOfficial/tts-voice-magic)에서 왔습니다.
원 TTS 프로젝트 작성자는 해당 TTS 저장소 업스트림을 참고(VoiceCraft, Microsoft Edge TTS 기반, Cloudflare Workers에 원클릭 배포 가능). A보다 `style` 감정/캐릭터 파라미터가 하나 더 있습니다(`general` / `newscast` / `cheerful` / `serious` / `gentle` …).

```bash
# 직접 배포(권장): https://github.com/JinSuperOfficial/tts-voice-magic
# 또는 이미 배포된 인스턴스 사용(로컬 실측 가능)
.venv/bin/python scripts/tts_edge.py --script examples/script.intro10s.json \
  --outdir public/voice --fps 30 \
  --engine voicecraft \
  --tts-base-url https://tts.jinsuper.cn/v1 \
  --voice zh-CN-XiaoxiaoNeural \
  --rate +5% --tts-style newscast
```
> [!WARNING]
> 실측으로 겪은 함정: Cloudflare가 앞에 있는 사이트는 Python 기본 User-Agent를 차단합니다
> (`Python-urllib/3.x` → `HTTP 403 error code: 1010`), 반면 `curl`은 통과합니다.
> 스크립트는 기본적으로 정상 UA를 보내므로 바로 사용 가능; 다른 HTTP 클라이언트로 바꾸면 UA를 직접 설정해야 합니다.

**C. 완전 사용자 정의 엔드포인트**(업체마다 필드가 다를 때 JSON 템플릿으로 적응)

```bash
.venv/bin/python scripts/tts_edge.py --script script.json --outdir public/voice \
  --engine custom \
  --tts-endpoint https://your-tts.example.com/v1/synthesize \
  --tts-header "X-App-Id=my-app" \
  --tts-payload '{"text":"{text}","speaker":"{voice}","format":"mp3"}' \
  --voice my-speaker-id
```

템플릿에서 `{text}` `{voice}` `{model}` `{speed}` 자리 표시자를 사용할 수 있습니다; 응답 본문이 바로 오디오 바이트이면 됩니다.

> 자체 엔진은 단어별 경계를 얻을 수 없으므로 자동으로 세그먼트 모드로 전환됩니다(세그먼트마다 한 번 요청) — 타임라인은 `ffprobe`로 다시 읽어 여전히 정확합니다;
> 자막은 "한 문장 한 세그먼트"로 생성되고, `words.json`은 `precision: "none"`으로 사실대로 표시하며 단어별 정밀도가 있는 척하지 않습니다.

## 편집 모드(EDL 기반)

> [!NOTE]
> Experimental

![editing](docs/images/editing.jpg)

JSON 한 부로 타임라인을 설명하면, 도구가 FFmpeg 명령을 생성하고 실행합니다. **3단계 파이프라인**, 이기종 소재를 필터 그래프에 직접 넣지 않습니다:

```
소재(이기종) ──conform──▶ 통일 규격 ──assemble──▶ 타임라인 ──finish──▶ output/edit.mp4
  해상도/프레임률/오디오 불일치     자르기+xfade+acrossfade      오버레이/믹스/자막/압축
```

```bash
# 먼저 명령 확인 후 실행(편집은 되돌릴 수 없으니 맹목적으로 실행하지 않기)
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json
python3 scripts/vedit.py build --edl examples/edit-plan.example.json

# 가로 → 세로(블러 배경, 숏폼에서 자주 사용)
python3 scripts/vedit.py build --edl examples/edit-plan.example.json --aspect vertical
```

기능: 자르기 / 다중 세그먼트 연결 / **xfade 전환**(58종, 오디오 acrossfade와 쌍) / 워터마크와 PIP / 세 가지 화면비 적응(pad·crop·blur) / 목표 용량 압축 / Remotion 생성 클립과 혼합 출력.

네 가지 하드 제약:

1. **먼저 conform 후 연결** — 해상도/프레임률/코덱/샘플레이트/오디오 트랙 수 통일, 오디오 트랙 없으면 자동 무음 추가;
2. **offset = 이전 세그먼트 누적 길이 − 전환 길이**, 그리고 `전환 길이 ≤ min(이전,다음)/2`, 범위를 벗어나면 즉시 오류;
3. **오디오와 비디오 쌍 처리** — xfade가 있으면 반드시 같은 값의 acrossfade,爆音/断音 방지;
4. **4단계 폴백** — `xfade → concat filter → concat demuxer(copy) → 오류 시 현장 보존`, 폴백하면 명확히 알려줌.

## 디렉토리 구조

```
web-video-produce/
├─ SKILL.md                 # ★ Agent 스킬 메인 문서(LLM은 이것만 읽으면 됨)
├─ project.md               # ★ 프로젝트 인수인계 문서(아키텍처 / 결정 / 확장점)
├─ scripts/
│   ├─ tts_edge.py          # 더빙 + 자막 + 프레임 번호 타임라인(edge-tts / 자체 API / BGM / 휴지)
│   ├─ tts_audition.py      # 같은 문장 다중 음색 비교 청취
│   ├─ make_bgm.py          # 코드 합성 저작권 무료 BGM
│   ├─ validate.py          # 정적 검증기(렌더링 전후 각 1회 실행)
│   ├─ vedit.py             # EDL 편집기(probe / plan / build / conform)
│   ├─ mux.sh               # 믹싱 / 오디오 믹스 / 자막 굽기 / 라우드니스 정규화
│   ├─ capture_frames.mjs   # HTML 페이지 결정론적 프레임별 스크린샷(Playwright)
│   ├─ frames_to_video.sh   # PNG 시퀀스 → MP4
│   ├─ make_sample_assets.sh# 이기종 demo 소재 생성
│   └─ check_env.sh         # 환경 자체 점검
├─ src/                     # Remotion 프로젝트(Root / Main / 자막 / 세 가지 장면)
├─ templates/html-gsap/     # 프레임 프로토콜 + Canvas2D + GSAP 템플릿
├─ examples/                # 분할 스크립트 + EDL 예시
├─ assets/                  # 소재(bgm / logo / raw)
├─ public/voice/            # 생성된 더빙과 타임라인(gitignore)
└─ output/                  # 납품 디렉토리
```

## 렌더링 전 자체 점검

```bash
python3 scripts/validate.py                      # 소스 + 타임라인: 1초 이내 결과
python3 scripts/validate.py --out output/final.mp4   # 출력 사양, 색 공간, 라우드니스 추가
python3 scripts/validate.py --json               # Agent 친화적
```

검사 항목: 결정론 철칙(`Math.random`/`Date.now`/자동 진행 애니메이션), `manifest.json ↔ config.ts`의 fps와 길이 일관성,
장면 id가 모두 더빙 스크립트에 있는지, `staticFile`과 EDL이 참조하는 소재가 존재하는지, 중국어 폰트가 로드되었는지,
출력의 픽셀 포맷 / **색 공간 bt709** / 색 범위 tv / 피크 / 평균 볼륨 / 전체 LUFS.

> 이 검증기가 실제 문제를 하나 잡았습니다: Remotion은 기본적으로 색 파라미터를 전달하지 않아 출력이 full-range `yuvj420p` + BT.601로 기록되고,
> 플랫폼에서 트랜스코딩할 때 색이 틀어집니다. 현재 `remotion.config.ts`에서 `Config.setColorSpace('bt709')`로 고정했습니다.

## 자주 묻는 질문

<details>
<summary><b>중국어가 두부 블록 □□□으로 렌더링됨</b></summary>

headless 환경에는 CJK 폰트가 하나도 없는 경우가 많습니다. `SKILL.md` §4.5에 세 가지 해결법이 있으며, woff2를 `public/fonts/`에 넣고 `@remotion/fonts`로 로드하는 것을 권장합니다(파일 하나, 요청 한 번, 완전 오프라인).
</details>

<details>
<summary><b>렌더링이 느림</b></summary>

기본 `@remotion/google-fonts`는 첫 렌더링 시 모든 폰트 서브셋을 미리 로드합니다(약 294개 요청, 1-2분). 자체 폰트 파일로 바꾸면 크게 빨라집니다. 또한 먼저 `--scale=0.5`로 샘플을 출력하고, 문제가 없으면 전체를 렌더링하세요.
</details>

<details>
<summary><b>더빙이 부자연스러움</b></summary>

위의 [세 가지 하드 제약](#세-가지-하드-제약겪은-함정-코드에-반영됨)을 참고하세요. 도구가 기본적으로 해줍니다: 마침표 제거, 전체 구간 운율, 속도 낮춤, 휴지 추가, BGM 추가. 그래도 불만족스러우면 엔진을 바꾸세요(Azure SSML / MiniMax / Volcano / 로컬 GPT-SoVITS 클론).
</details>

<details>
<summary><b>연결 후 화면 깨짐 / 전환 지점 검은 프레임 / 소리 폭발</b></summary>

소재 파라미터가 일치하지 않습니다. `vedit.py`는 강제로 먼저 conform합니다; 수동으로 연결할 때는 반드시 해상도, 프레임률, 픽셀 포맷, 샘플레이트를 통일하고, **xfade가 있으면 acrossfade도 있어야 합니다**.
</details>

## License

[MIT](LICENSE) © JinSuperOfficial

내장 BGM은 `scripts/make_bgm.py`가 코드로 합성하며, 제3자 소재가 없고 상업적 사용이 가능합니다. edge-tts는 Microsoft Edge "소리 내어 읽기"의 공개 엔드포인트를 호출하며, **공식 상업용 API가 아닙니다**, 속도 제한이나 변경이 있을 수 있습니다; 상업적으로 중요한 장면에서는 SLA가 있는 서비스로 교체하세요.