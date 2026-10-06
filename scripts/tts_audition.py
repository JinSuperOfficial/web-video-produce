#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""web-video-produce :: tts_audition.py —— 同一句话，多个音色对照试听

用来回答"哪个声音更好听/更不假"，避免盲选。默认走整段韵律模式（韵律最自然）+ 自动去句号。

用法
----
# 用默认台词试听全部中文女声/男声
python3 scripts/tts_audition.py --outdir output/voice_samples

# 用自己的台词，只试几个声音
python3 scripts/tts_audition.py --text "你的文案，逗号断句" \
    --voices zh-CN-XiaoxiaoNeural,zh-CN-YunxiNeural,zh-CN-YunjianNeural

# 列出所有可用中文声音
python3 scripts/tts_audition.py --list

产物：<outdir>/<序号>_<音色短名>.mp3 + 一份带说明的 index.md
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("缺少 edge-tts：python -m venv .venv && .venv/bin/pip install edge-tts")

# 精选中文音色（本机 edge-tts --list-voices 实测存在），名字后面是听感标签
CURATED = [
    ("zh-CN-XiaoxiaoNeural", "女·温暖通用（默认首选，口播/叙事）"),
    ("zh-CN-XiaoyiNeural", "女·活泼明亮（短视频/教程）"),
    ("zh-CN-YunxiNeural", "男·阳光少年感（科技/Vlog）"),
    ("zh-CN-YunjianNeural", "男·浑厚有力（宣传片/预告）"),
    ("zh-CN-YunyangNeural", "男·专业播报（新闻/纪录片）"),
    ("zh-CN-YunxiaNeural", "男童·可爱（动画/亲子）"),
    ("zh-CN-liaoning-XiaobeiNeural", "女·东北口音（幽默/接地气）"),
    ("zh-CN-shaanxi-XiaoniNeural", "女·陕西口音（地域内容）"),
]

DEFAULT_TEXT = "用代码做视频，画面配音字幕全自动，写脚本就出片，文字变成MP4"

PERIODS = "。．"
PUNCT_RE = re.compile(r"[\s。．，、！？；：,.!?;:—…·\-—\"'“”‘’()（）\[\]【】]")


def norm(t: str) -> str:
    return PUNCT_RE.sub("", t)


def short_name(voice: str) -> str:
    return voice.replace("zh-CN-", "").replace("zh-HK-", "HK-").replace("Neural", "")


async def synth(text: str, voice: str, rate: str, pitch: str, out: Path) -> float:
    """整段一次合成（word boundary 只用来算时长，不做逐字字幕）。"""
    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="SentenceBoundary")
    size = 0
    with open(out, "wb") as fh:
        async for ch in comm.stream():
            if ch["type"] == "audio":
                fh.write(ch["data"])
                size += len(ch["data"])
    return size / 1024


async def list_voices() -> None:
    voices = await edge_tts.list_voices()
    for v in sorted(voices, key=lambda x: x["ShortName"]):
        if v["ShortName"].startswith("zh-"):
            print(f'{v["ShortName"]:<34} {v.get("Gender",""):<8} '
                  f'{",".join(v.get("VoiceTag", {}).get("VoicePersonalities", [])[:3])}')


async def main() -> int:
    ap = argparse.ArgumentParser(description="edge-tts 音色对照试听")
    ap.add_argument("--text", default=DEFAULT_TEXT)
    ap.add_argument("--outdir", default="output/voice_samples")
    ap.add_argument("--voices", default="", help="逗号分隔的音色名；留空用内置精选列表")
    ap.add_argument("--rate", default="+5%", help="语速（试听建议 +0%% ~ +8%%，太快会显假）")
    ap.add_argument("--pitch", default="+0Hz")
    ap.add_argument("--list", action="store_true", help="只列出可用中文音色")
    args = ap.parse_args()

    if args.list:
        await list_voices()
        return 0

    text = args.text
    for c in PERIODS:
        text = text.replace(c, "")
    text = text.strip()

    if args.voices:
        picked = [(v.strip(), "") for v in args.voices.split(",") if v.strip()]
    else:
        picked = CURATED

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"[audition] 台词：{text}")
    print(f"[audition] 语速 {args.rate} / 音调 {args.pitch} / 模式 整段一次合成（韵律最自然）\n")

    rows = []
    for i, (voice, note) in enumerate(picked, 1):
        out = outdir / f"{i:02d}_{short_name(voice)}.mp3"
        try:
            kb = await synth(text, voice, args.rate, args.pitch, out)
        except Exception as exc:  # noqa: BLE001
            print(f"  ✗ {voice}: {exc}")
            continue
        rows.append((out.name, voice, note, kb))
        print(f"  ✓ {out.name:<34} {kb:5.0f}KB  {note}")

    index = outdir / "index.md"
    index.write_text(
        "# 音色试听清单\n\n"
        f"台词：{text}\n\n语速：{args.rate}　音调：{args.pitch}\n\n"
        + "\n".join(f"- `{n}` — `{v}` {note}" for n, v, note, _ in rows)
        + "\n\n选中哪个，就用它跑正式配音：\n\n```bash\n"
        + f"python3 scripts/tts_edge.py --script examples/script.intro10s.json \\\n"
          f"  --outdir public/voice --voice <音色名> --rate {args.rate} --fps 30 --normalize\n```\n",
        encoding="utf-8")
    print(f"\n[audition] 共 {len(rows)} 条 → {outdir}/  （清单见 index.md）")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
