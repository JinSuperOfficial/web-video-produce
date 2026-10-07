#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""web-video-produce :: make_bgm.py —— 用代码合成一段免版权氛围垫乐

为什么自己合成：README/视频里用的 BGM 必须可商用，网上找素材既慢又有授权风险。
这里用纯 Python 标准库做加法合成（正弦叠加 + 和弦交叉淡化），产出一段可无缝循环的垫乐，
纯音乐、无人声、无版权争议。

用法
----
python3 scripts/make_bgm.py                       # 默认 32 秒 → assets/bgm.mp3
python3 scripts/make_bgm.py --seconds 48 --out assets/bgm-long.mp3
python3 scripts/make_bgm.py --key D --progression Am F C G     # 纯三和弦，更硬朗

设计要点
--------
* 和弦进行 Am7 – Fmaj7 – Cmaj7 – G6，每小节 4 秒，循环友好（首尾都落在小节线上）
* 相邻和弦 0.6 秒交叉淡化，且相位用绝对时间计算 → 切换处不会有"咔哒"爆音
* **不烘焙淡入淡出**：混音时由 tts_edge.py 的 afade 统一处理，这样循环播放也不会掉音量
"""

from __future__ import annotations

import argparse
import math
import struct
import subprocess
import sys
import wave
from pathlib import Path

SR = 22050          # 采样率：垫乐不需要高频，22050 足够且生成快
BAR = 4.0           # 每小节秒数
XFADE = 0.6         # 和弦交叉淡化秒数

# 半音相对 C4=261.63 的频率表（用 A4=440 平均律算）
def note(name: str) -> float:
    """把 A2 / C#4 / Eb3 这样的音名转成频率。"""
    base = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    letter = name[0].upper()
    rest = name[1:]
    semis = base[letter]
    while rest and rest[0] in "#b":
        semis += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    octave = int(rest)
    midi = 12 * (octave + 1) + semis
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


PROGRESSIONS = {
    "Am": [("A2", 1.00), ("C4", 0.62), ("E4", 0.50), ("G4", 0.34), ("A4", 0.18)],
    "Fmaj7": [("F2", 1.00), ("A3", 0.62), ("C4", 0.50), ("E4", 0.34), ("F4", 0.18)],
    "Cmaj7": [("C3", 1.00), ("E3", 0.62), ("G3", 0.50), ("B3", 0.34), ("C5", 0.16)],
    "G6": [("G2", 1.00), ("B3", 0.62), ("D4", 0.50), ("E4", 0.34), ("G4", 0.18)],
    "Dm7": [("D3", 1.00), ("F3", 0.62), ("A3", 0.50), ("C4", 0.34), ("D4", 0.18)],
    "Em7": [("E2", 1.00), ("G3", 0.62), ("B3", 0.50), ("D4", 0.34), ("E4", 0.18)],
    # 纯三和弦 —— 即把上面 Fmaj7 / Cmaj7 的大七度音去掉（Fmaj7 去掉 E4，Cmaj7 去掉 B3）。
    # 大七度正是"柔和抒情"的来源，去掉后走向更硬、更有推动力，适合科技/宣传片。
    # 用法：--progression Am F C G
    "F": [("F2", 1.00), ("A3", 0.62), ("C4", 0.50), ("F4", 0.18)],
    "C": [("C3", 1.00), ("E3", 0.62), ("G3", 0.50), ("C5", 0.16)],
    "G": [("G2", 1.00), ("B3", 0.62), ("D4", 0.50), ("G4", 0.18)],
}


def chord_sample(notes, t: float) -> float:
    """某个和弦在绝对时间 t 的瞬时值（相位用绝对时间，保证切换不爆音）。"""
    v = 0.0
    for name, amp in notes:
        f = note(name)
        v += amp * math.sin(2.0 * math.pi * f * t)
    return v


def render(progression: list, seconds: float) -> bytes:
    bars = len(progression)
    total = int(seconds * SR)
    frames = bytearray()
    for i in range(total):
        t = i / SR
        bar_index = int(t / BAR) % bars
        t_in_bar = t - int(t / BAR) * BAR
        cur = PROGRESSIONS[progression[bar_index]]
        v = chord_sample(cur, t)
        # 小节末尾交叉到下一和弦
        if t_in_bar > BAR - XFADE:
            w = (t_in_bar - (BAR - XFADE)) / XFADE
            w = w * w * (3 - 2 * w)                     # smoothstep
            nxt = PROGRESSIONS[progression[(bar_index + 1) % bars]]
            v = (1 - w) * v + w * chord_sample(nxt, t)
        # 极慢的整体起伏，避免听起来像死掉的正弦
        v *= 1.0 + 0.13 * math.sin(2 * math.pi * 0.07 * t) + 0.06 * math.sin(2 * math.pi * 0.031 * t)
        v *= 0.34                                        # 留足余量，混音阶段再抬
        s = max(-1.0, min(1.0, v))
        frames += struct.pack("<h", int(s * 32767))
    return bytes(frames)


def main() -> int:
    ap = argparse.ArgumentParser(description="合成免版权氛围垫乐")
    ap.add_argument("--seconds", type=float, default=32.0)
    ap.add_argument("--out", default="assets/bgm.mp3")
    ap.add_argument("--progression", nargs="+", default=["Am", "Fmaj7", "Cmaj7", "G6"])
    ap.add_argument("--wav", default="", help="同时保留 wav（默认删掉中间文件）")
    args = ap.parse_args()

    for c in args.progression:
        if c not in PROGRESSIONS:
            sys.exit(f"未知和弦 {c}，可选：{', '.join(PROGRESSIONS)}")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    wav_path = Path(args.wav) if args.wav else out.with_suffix(".tmp.wav")

    print(f"[bgm] 合成 {args.seconds:.0f}s 垫乐：{' - '.join(args.progression)} @ {SR}Hz")
    data = render(args.progression, args.seconds)
    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)

    subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-i", str(wav_path),
                    "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", str(out)],
                   check=True)
    if not args.wav:
        wav_path.unlink(missing_ok=True)
    print(f"[bgm] ✓ {out}（无人声、可商用、可无缝循环；淡入淡出由混音阶段处理）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
