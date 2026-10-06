#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""web-video-produce :: edge-tts 批量配音 / 字幕生成器

把一份分段脚本变成一条成品音轨 + 一条与之严格对齐的字幕 + 一份时间轴清单，
供 Remotion / HTML 场景按帧对轴使用。

依赖:
    python -m venv .venv && .venv/bin/pip install edge-tts
    # 系统需要 ffmpeg / ffprobe 在 PATH 中

常用用法
--------
# 0) 查看可用中文声音
python scripts/tts_edge.py --list-voices zh

# 1) 从 JSON 脚本批量生成（推荐）
python scripts/tts_edge.py --script examples/script.sample.json \
    --outdir public/voice --voice zh-CN-YunxiNeural --rate +8% --fps 30

# 2) 从 .txt / .md 生成（空行或 "## 标题" 分段）
python scripts/tts_edge.py --script script.md --outdir public/voice

# 3) 一句话快速试听
python scripts/tts_edge.py --text "欢迎来到本期节目。" --outdir public/voice --prefix demo

产物（默认前缀 vo，写入 --outdir）
----------------------------------
    vo.mp3            拼接后的整条音轨
    vo.srt / vo.vtt   与音轨对齐的整条字幕（时间含段间静音偏移）
    manifest.json     每段的 start/end/时长/帧号，供代码对轴
    parts/*.mp3|.srt  每段中间产物（--force 可强制重生成）

脚本格式（JSON）
----------------
{
  "segments": [
    {"id": "s1", "text": "第一句。", "pause_after_ms": 400},
    {"id": "s2", "text": "第二句。", "voice": "zh-CN-YunjianNeural", "rate": "+0%"}
  ]
}
segments 里可选的逐段覆盖字段: voice / rate / pitch / volume / pause_after_ms。
纯文本输入时每段用空行分隔，或用 Markdown 标题 "## " 起新段。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import re
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

try:
    import edge_tts
except ImportError:  # pragma: no cover
    sys.exit(
        "[tts_edge] 缺少 edge-tts。请先执行:\n"
        "    python -m venv .venv && .venv/bin/pip install edge-tts\n"
        "或使用系统 pip: pip install edge-tts"
    )

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"
DEFAULT_RATE = "+0%"
DEFAULT_PITCH = "+0Hz"
DEFAULT_VOLUME = "+0%"
SILENCE_RATE = 24000
AUDIO_RATE_OUT = 48000
DEFAULT_BGM = "assets/bgm.mp3"          # 默认背景配乐（不存在则自动跳过）
DEFAULT_GAP_MS = 400                    # 段间停顿：不能无缝衔接，听着难受
DEFAULT_TAIL_MS = 600                   # 片尾留白：给音乐收尾
BGM_GAIN_DB = -18.0                     # BGM 垫在人声下面（carve 只挖人声频段，所以可以比整体闪避更响）
CARVE_LOW, CARVE_HIGH = 300, 3400       # carve 频段：人声可懂度集中在这段
CARVE_THRESHOLD, CARVE_RATIO = 0.03, 10
CARVE_ATTACK, CARVE_RELEASE = 150, 400  # ms：attack 太短会"抽气"(pumping)
LOUDNESS_PRESETS = {"social": -14.0, "podcast": -16.0, "broadcast": -23.0}
SRT_TIME = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
)


# --------------------------------------------------------------------------- #
# 基础工具
# --------------------------------------------------------------------------- #
def log(msg: str) -> None:
    print(f"[tts_edge] {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"[tts_edge] ! {msg}", file=sys.stderr, flush=True)


def ffprobe_duration(path: Path) -> float:
    """读取媒体文件时长（秒）。"""
    out = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=nw=1:nk=1", str(path),
        ],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe 失败: {out.stderr.strip()}")
    return float(out.stdout.strip())


def hhmmss(seconds: float, sep: str = ",") -> str:
    seconds = max(0.0, seconds)
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def parse_srt(text: str) -> list[tuple[float, float, str]]:
    """把 SRT 文本解析成 [(start, end, content)]。"""
    out: list[tuple[float, float, str]] = []

    def to_sec(h, m, s, ms) -> float:
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [ln for ln in block.splitlines() if ln.strip()]
        if not lines:
            continue
        idx = 0
        if re.fullmatch(r"\d+", lines[0].strip()):
            idx = 1
        if idx >= len(lines):
            continue
        m = SRT_TIME.search(lines[idx])
        if not m:
            continue
        g = m.groups()
        start = to_sec(g[0], g[1], g[2], g[3])
        end = to_sec(g[4], g[5], g[6], g[7])
        content = "\n".join(lines[idx + 1:]) or "…"
        out.append((start, end, content))
    return out


def write_srt(cues: list[tuple[float, float, str]], path: Path) -> None:
    buf = []
    for i, (start, end, content) in enumerate(cues, 1):
        buf.append(f"{i}\n{hhmmss(start)} --> {hhmmss(end)}\n{content}\n")
    path.write_text("\n".join(buf), encoding="utf-8")


def write_vtt(cues: list[tuple[float, float, str]], path: Path) -> None:
    buf = ["WEBVTT", ""]
    for start, end, content in cues:
        buf.append(f"{hhmmss(start, '.')} --> {hhmmss(end, '.')}")
        buf.append(content)
        buf.append("")
    path.write_text("\n".join(buf), encoding="utf-8")


def ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(["ffmpeg", "-y", "-v", "error", *args],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg 失败: {' '.join(args)}\n{proc.stderr.strip()}")


def make_silence(ms: int, path: Path) -> None:
    """生成 ms 毫秒静音（与 edge-tts 一致的 24kHz 单声道）。"""
    ffmpeg([
        "-f", "lavfi", "-i", f"anullsrc=r={SILENCE_RATE}:cl=mono",
        "-t", f"{ms / 1000:.3f}",
        "-c:a", "libmp3lame", "-b:a", "48k", "-ar", str(SILENCE_RATE), "-ac", "1",
        str(path),
    ])


def concat_audio(parts: list[Path], out: Path) -> None:
    """用 concat demuxer 拼接（统一重编码，避免参数不一致导致失败）。"""
    listfile = out.parent / "_concat_list.txt"
    listfile.write_text(
        "".join(f"file '{p.resolve().as_posix()}'\n" for p in parts), encoding="utf-8"
    )
    try:
        ffmpeg([
            "-f", "concat", "-safe", "0", "-i", str(listfile),
            "-c:a", "libmp3lame", "-b:a", "128k",
            "-ar", str(SILENCE_RATE), "-ac", "1", str(out),
        ])
    finally:
        listfile.unlink(missing_ok=True)


def normalize_loudness(src: Path, dst: Path, target_i: float = -16.0,
                       two_pass: bool = True) -> None:
    """EBU R128 响度归一。

    两遍法（默认）：第一遍只测量（print_format=json）拿到 measured_*，第二遍带 measured_*
    并以 linear=true 做**线性增益**，不做动态压缩 —— 单遍动态模式会二次改变音色与段间关系。
    """
    if two_pass:
        probe = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", str(src), "-af",
             f"loudnorm=I={target_i}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
            capture_output=True, text=True)
        m = re.search(r"\{[^{}]*input_i[^{}]*\}", probe.stderr or "", re.S)
        if m:
            try:
                d = json.loads(m.group(0))
                af = (f"loudnorm=I={target_i}:TP=-1.5:LRA=11:linear=true:"
                      f"measured_I={d['input_i']}:measured_TP={d['input_tp']}:"
                      f"measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:"
                      f"offset={d['target_offset']}")
                ffmpeg(["-i", str(src), "-af", af,
                        "-c:a", "libmp3lame", "-b:a", "192k",
                        "-ar", str(AUDIO_RATE_OUT), "-ac", "2", str(dst)])
                log(f"  实测 {d['input_i']} LUFS → 目标 {target_i} LUFS（线性增益，不做动态压缩）")
                return
            except (KeyError, json.JSONDecodeError) as exc:
                warn(f"两遍 loudnorm 测量解析失败（{exc}），退回单遍动态模式")
    ffmpeg([
        "-i", str(src), "-af", f"loudnorm=I={target_i}:TP=-1.5:LRA=11",
        "-c:a", "libmp3lame", "-b:a", "192k",
        "-ar", str(AUDIO_RATE_OUT), "-ac", "2", str(dst),
    ])


# --------------------------------------------------------------------------- #
# 口播稿规整：技能约束 —— 正文不写句号
# --------------------------------------------------------------------------- #
PERIODS = "。．"


def strip_periods(text: str) -> "tuple[str, int]":
    """去掉句号（。．）。

    为什么必须去掉：edge-tts 遇到句号会给一个"句末下降调 + 停顿"，
    一句话一个下降调，听感立刻变成"机器念课文"。去掉之后整段是连续语调，接近真人。
    需要断句就用逗号「，」或直接分段（段间本来就有 pause_after_ms）。
    """
    removed = sum(text.count(c) for c in PERIODS)
    out = text
    for c in PERIODS:
        out = out.replace(c, "")
    return out.strip(), removed


PUNCT_RE = re.compile(r"[\s。．，、！？；：,.!?;:—…·\-\"'“”‘’()（）\[\]【】]")


def norm_chars(text: str) -> str:
    """只保留"会被读出来的字"，用于把 WordBoundary 词块对回脚本段。"""
    return PUNCT_RE.sub("", text or "")


# --------------------------------------------------------------------------- #
# 自定义 TTS API（engine=openai / custom）—— "可以调用自己的 TTS API"
# --------------------------------------------------------------------------- #
def rate_to_speed(rate: str) -> float:
    """'+10%' -> 1.1 ，'-5%' -> 0.95 。"""
    m = re.fullmatch(r"\s*([+-]?\d+(?:\.\d+)?)\s*%?\s*", rate or "")
    return 1.0 + (float(m.group(1)) / 100.0 if m else 0.0)


def tts_http(args: argparse.Namespace, text: str) -> bytes:
    """调用 OpenAI 兼容的 /audio/speech，或用户自定义的 TTS 端点，返回音频字节。"""
    engine = getattr(args, "engine", "edge")
    key = (getattr(args, "tts_api_key", "") or os.environ.get("TTS_API_KEY")
           or os.environ.get("OPENAI_API_KEY") or "")
    if engine == "openai":
        url = args.tts_base_url.rstrip("/") + "/audio/speech"
        payload = {
            "model": args.tts_model,
            "input": text,
            "voice": args.voice,
            "response_format": args.tts_format,
            "speed": round(rate_to_speed(args.rate), 3),
        }
    else:  # custom：用户给完整 URL + JSON 模板，覆盖几乎所有厂商的差异
        if not args.tts_endpoint:
            raise RuntimeError("engine=custom 必须提供 --tts-endpoint")
        url = args.tts_endpoint
        tpl = args.tts_payload or '{"text": "{text}", "voice": "{voice}"}'
        raw = tpl.replace("{text}", json.dumps(text, ensure_ascii=False)[1:-1]) \
                 .replace("{voice}", args.voice) \
                 .replace("{model}", getattr(args, "tts_model", "")) \
                 .replace("{speed}", str(round(rate_to_speed(args.rate), 3)))
        payload = json.loads(raw)

    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    for item in getattr(args, "tts_header", []) or []:
        if "=" in item:
            k, v = item.split("=", 1)
            headers[k.strip()] = v.strip()

    req = urllib.request.Request(url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                                 headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = resp.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"TTS API HTTP {exc.code}: {body}") from exc
    if not data:
        raise RuntimeError("TTS API 返回空音频")
    return data


# --------------------------------------------------------------------------- #
# 背景配乐 + 段间停顿（两个模式共用）
# --------------------------------------------------------------------------- #
def mix_bgm(voice: Path, bgm: str, dst: Path, gain_db: float = BGM_GAIN_DB,
            duck: bool = True, carve: bool = True) -> None:
    """把 BGM 垫在人声下面。

    carve=True（默认）：**只挖掉人声占据的 300–3400Hz 频段**（Linkwitz-Riley 分频后单独压缩中频再合并），
        音乐的低频与空气感全部保留 —— 人声清楚，音乐还是音乐。
    carve=False：整体 sidechaincompress 压低（旧行为，音乐会"变瘪"）。
        实测同一条片子：低频能量 broadband -43.2dB vs carve -36.1dB（不处理是 -35.4dB）。
    """
    dur = ffprobe_duration(voice)
    fade_out_at = max(0.0, dur - 1.5)
    chain = [
        f"[0:a]aresample={AUDIO_RATE_OUT},"
        f"aformat=sample_fmts=fltp:channel_layouts=stereo[vo]",
        f"[1:a]aresample={AUDIO_RATE_OUT},"
        f"aformat=sample_fmts=fltp:channel_layouts=stereo,"
        f"volume={gain_db:.1f}dB,afade=t=in:st=0:d=1.2,"
        f"afade=t=out:st={fade_out_at:.3f}:d=1.5[bg]",
    ]
    if not duck:
        chain.append("[vo][bg]amix=inputs=2:duration=first:normalize=0[mix]")
    elif carve:
        chain += [
            f"[bg]acrossover=split={CARVE_LOW} {CARVE_HIGH}:order=4th[bl][bm][bh]",
            f"[bm][vo]sidechaincompress=threshold={CARVE_THRESHOLD}:ratio={CARVE_RATIO}:"
            f"attack={CARVE_ATTACK}:release={CARVE_RELEASE}[bmd]",
            "[bl][bmd][bh]amix=inputs=3:duration=first:normalize=0[bed]",
            "[vo][bed]amix=inputs=2:duration=first:normalize=0[mix]",
        ]
    else:
        chain.append(f"[bg][vo]sidechaincompress=threshold={CARVE_THRESHOLD}:"
                     f"ratio={CARVE_RATIO}:attack={CARVE_ATTACK}:release={CARVE_RELEASE}[bed]"
                     ";[vo][bed]amix=inputs=2:duration=first:normalize=0[mix]")
    ffmpeg(["-i", str(voice), "-stream_loop", "-1", "-i", bgm,
            "-filter_complex", ";".join(chain), "-map", "[mix]", "-t", f"{dur:.3f}",
            "-c:a", "libmp3lame", "-b:a", "192k",
            "-ar", str(AUDIO_RATE_OUT), "-ac", "2", str(dst)])


def finish_audio(args: argparse.Namespace, track: Path, audio_out: Path) -> None:
    """收尾：BGM 混音 → 响度归一。segment / whole 两个模式共用。"""
    bgm = (getattr(args, "bgm", "") or "").strip()
    if bgm and Path(bgm).exists():
        duck = getattr(args, "duck", True)
        log(f"混入背景配乐 {bgm}（{getattr(args, 'bgm_gain_db', BGM_GAIN_DB)}dB，"
            f"{'侧链闪避' if duck else '不闪避'}）…")
        mix_bgm(track, bgm, audio_out, getattr(args, "bgm_gain_db", BGM_GAIN_DB), duck,
                getattr(args, "carve", True))
        track.unlink(missing_ok=True)
    else:
        if bgm:
            warn(f"找不到 BGM「{bgm}」，本条不加背景配乐。"
                 f"放一个 mp3 到该路径即可（或用 --no-bgm 明确关闭）")
        if track.resolve() != audio_out.resolve():
            track.replace(audio_out)

    if getattr(args, "normalize", False):
        log("响度归一 …")
        norm = audio_out.with_suffix(".norm.mp3")
        target = args.loudness if args.loudness is not None else LOUDNESS_PRESETS[args.loudness_target]
        normalize_loudness(audio_out, norm, target)
        norm.replace(audio_out)


def rebuild_with_pauses(src: Path, segments: list, gap_ms: int, tail_ms: int,
                        dst: Path) -> None:
    """把整段合成的音频按段切开、段间插入真停顿、尾部留呼吸，并同步改写各段起止时间。

    切点取相邻两段之间的中点 —— 落在自然停顿里，不会切到字上。
    """
    n = len(segments)
    total = ffprobe_duration(src)
    if n == 0 or total <= 0.05:
        raise RuntimeError("整段音频为空，无法重整时间轴")

    cuts = [0.0]
    for i in range(n - 1):
        mid = (segments[i].end + segments[i + 1].start) / 2.0
        cuts.append(min(max(mid, cuts[-1] + 0.05), total - 0.05))
    cuts.append(total)

    gap = max(0, gap_ms) / 1000.0
    tail = max(0, tail_ms) / 1000.0

    chain = [f"[0:a]aresample={AUDIO_RATE_OUT},"
             f"aformat=sample_fmts=fltp:channel_layouts=stereo,"
             f"asplit={n}" + "".join(f"[in{i}]" for i in range(n))]
    seq = []
    for i in range(n):
        a, b = cuts[i], cuts[i + 1]
        if b - a < 0.05:
            raise RuntimeError(f"第 {i} 段音频过短（{b - a:.3f}s），无法切分")
        chain.append(f"[in{i}]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[p{i}]")
        seq.append(f"[p{i}]")
        if i < n - 1 and gap > 0:
            chain.append(f"anullsrc=r={AUDIO_RATE_OUT}:cl=stereo:d={gap:.3f}[g{i}]")
            seq.append(f"[g{i}]")
    if tail > 0:
        chain.append(f"anullsrc=r={AUDIO_RATE_OUT}:cl=stereo:d={tail:.3f}[gt]")
        seq.append("[gt]")
    chain.append("".join(seq) + f"concat=n={len(seq)}:v=0:a=1[out]")

    ffmpeg(["-i", str(src), "-filter_complex", ";".join(chain), "-map", "[out]",
            "-c:a", "libmp3lame", "-b:a", "192k",
            "-ar", str(AUDIO_RATE_OUT), "-ac", "2", str(dst)])

    cursor = 0.0
    for i, seg in enumerate(segments):
        rel_start = seg.start - cuts[i]
        rel_end = seg.end - cuts[i]
        seg.start = cursor + rel_start
        seg.end = cursor + rel_end
        seg.duration = seg.end - seg.start
        seg.cues = [(0.0, seg.duration, seg.text)]
        cursor += (cuts[i + 1] - cuts[i]) + (gap if i < n - 1 else tail)


# --------------------------------------------------------------------------- #
# 脚本解析
# --------------------------------------------------------------------------- #
@dataclass
class Segment:
    id: str
    text: str
    voice: str
    rate: str
    pitch: str
    volume: str
    pause_after_ms: int
    index: int = 0
    # 生成后填充
    duration: float = 0.0
    start: float = 0.0
    end: float = 0.0
    part: Path | None = None
    cues: list[tuple[float, float, str]] = field(default_factory=list)


def split_long_text(text: str, max_chars: int) -> list[str]:
    """把过长段落按标点切成 <= max_chars 的片段（edge-tts 长文本易超时）。"""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_chars:
        return [text]
    pieces = re.split(r"(?<=[。！？!?；;\n])", text)
    chunks, cur = [], ""
    for p in pieces:
        if not p:
            continue
        if len(cur) + len(p) > max_chars and cur:
            chunks.append(cur.strip())
            cur = p
        else:
            cur += p
    if cur.strip():
        chunks.append(cur.strip())
    out: list[str] = []
    for c in chunks:  # 仍超长的硬切
        while len(c) > max_chars:
            out.append(c[:max_chars])
            c = c[max_chars:]
        if c.strip():
            out.append(c)
    return out or [text]


def load_segments(path: Path, args: argparse.Namespace) -> list[Segment]:
    raw = path.read_text(encoding="utf-8")
    items: list[dict] = []
    if path.suffix.lower() == ".json":
        data = json.loads(raw)
        items = data["segments"] if isinstance(data, dict) else data
    else:
        blocks = [b.strip() for b in re.split(r"\n\s*\n", raw) if b.strip()]
        if len(blocks) == 1 and "## " in raw:  # Markdown 标题分段
            blocks = [b.strip() for b in re.split(r"^##\s+", raw, flags=re.M) if b.strip()]
        items = [{"text": b} for b in blocks]

    segs: list[Segment] = []
    n = 0
    stripped_total = 0
    keep = bool(getattr(args, "keep_punct", False))
    for it in items:
        text = str(it.get("text", "")).strip()
        if not text:
            continue
        if not keep:
            text, removed = strip_periods(text)
            stripped_total += removed
            if removed:
                it = {**it, "text": text}
        if not text:
            continue
        for chunk in split_long_text(text, args.max_chars):
            n += 1
            segs.append(Segment(
                id=str(it.get("id") or f"s{n}"),
                text=chunk,
                voice=str(it.get("voice") or args.voice),
                rate=str(it.get("rate") or args.rate),
                pitch=str(it.get("pitch") or args.pitch),
                volume=str(it.get("volume") or args.volume),
                pause_after_ms=int(it.get("pause_after_ms", args.gap_ms)),
                index=n - 1,
            ))
    if stripped_total:
        log(f"已按技能约束移除 {stripped_total} 个句号（口播稿不写句号，断句用逗号或分段）")
    return segs


# --------------------------------------------------------------------------- #
# 合成
# --------------------------------------------------------------------------- #
async def synth_one(seg: Segment, parts_dir: Path, sem: asyncio.Semaphore,
                    force: bool, args: argparse.Namespace | None = None,
                    retries: int = 4) -> None:
    engine = getattr(args, "engine", "edge") if args else "edge"
    ext = "mp3" if engine == "edge" else (getattr(args, "tts_format", "mp3") or "mp3")
    audio_path = parts_dir / f"seg_{seg.index:03d}.{ext}"
    srt_path = parts_dir / f"seg_{seg.index:03d}.srt"
    seg.part = audio_path
    if audio_path.exists() and srt_path.exists() and not force:
        seg.cues = parse_srt(srt_path.read_text(encoding="utf-8"))
        seg.duration = ffprobe_duration(audio_path)
        return

    async with sem:
        last: Exception | None = None
        for attempt in range(1, retries + 1):
            try:
                if engine != "edge":
                    # 自建 TTS API：一次请求 = 一段，时长由 ffprobe 回读，字幕按整段生成
                    data = await asyncio.to_thread(tts_http, args, seg.text)
                    audio_path.write_bytes(data)
                    srt_path.write_text("", encoding="utf-8")
                    seg.cues = []
                    seg.duration = ffprobe_duration(audio_path)
                    log(f"  ✓ [{seg.index:03d}] {seg.duration:6.2f}s  {seg.text[:26]}…  ({engine})")
                    return
                communicate = edge_tts.Communicate(
                    seg.text, seg.voice,
                    rate=seg.rate, pitch=seg.pitch, volume=seg.volume,
                )
                submaker = edge_tts.SubMaker()
                with open(audio_path, "wb") as fh:
                    async for chunk in communicate.stream():
                        if chunk["type"] == "audio":
                            fh.write(chunk["data"])
                        elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                            submaker.feed(chunk)
                srt_text = submaker.get_srt()
                if isinstance(srt_text, list):  # 兼容旧版本返回 list
                    srt_text = "\n".join(srt_text)
                srt_path.write_text(srt_text or "", encoding="utf-8")
                seg.cues = parse_srt(srt_text or "")
                seg.duration = ffprobe_duration(audio_path)
                log(f"  ✓ [{seg.index:03d}] {seg.duration:6.2f}s  {seg.text[:26]}…")
                return
            except Exception as exc:  # noqa: BLE001 - 网络抖动/限流统一重试
                last = exc
                wait = min(8.0, 0.8 * 2 ** (attempt - 1)) + random.random()
                log(f"  ! [{seg.index:03d}] 第 {attempt} 次失败: {exc}；{wait:.1f}s 后重试")
                await asyncio.sleep(wait)
        raise RuntimeError(f"第 {seg.index} 段合成失败（已重试 {retries} 次）: {last}")


async def run(args: argparse.Namespace) -> int:
    outdir = Path(args.outdir)
    parts_dir = outdir / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)

    if args.text:
        text = args.text
        if not getattr(args, "keep_punct", False):
            text, removed = strip_periods(text)
            if removed:
                log(f"已按技能约束移除 {removed} 个句号")
        segments = [Segment(
            id="s1", text=text, voice=args.voice, rate=args.rate,
            pitch=args.pitch, volume=args.volume, pause_after_ms=0, index=0,
        )]
    else:
        if not args.script:
            log("错误：需要 --script 或 --text")
            return 2
        segments = load_segments(Path(args.script), args)
        if not segments:
            log("错误：脚本中没有可合成文本")
            return 2

    if getattr(args, "mode", "segment") == "whole" and len(segments) > 1:
        if getattr(args, "engine", "edge") != "edge":
            warn(f"engine={args.engine} 拿不到词边界，整段韵律模式不可用 → 自动改用分段模式")
            args.mode = "segment"
        else:
            return await synth_whole(args, segments, outdir, parts_dir)

    log(f"共 {len(segments)} 段，声音 {args.voice}，rate={args.rate} pitch={args.pitch}")
    sem = asyncio.Semaphore(args.concurrency)
    await asyncio.gather(*[
        synth_one(s, parts_dir, sem, args.force, args) for s in segments
    ])
    segments.sort(key=lambda s: s.index)

    # 拼接：段 + 段间静音
    silence_cache: dict[int, Path] = {}
    concat_list: list[Path] = []
    cues: list[tuple[float, float, str]] = []
    cursor = 0.0
    for seg in segments:
        seg.start = cursor
        seg.end = cursor + seg.duration
        prev_end: float | None = None
        for (cs, ce, content) in seg.cues:
            cue_start = seg.start + cs
            if prev_end is not None and cue_start < prev_end:  # 同一段内字幕不重叠
                cue_start = prev_end
            cue_end = max(cue_start + 0.05, seg.start + ce)
            cues.append((cue_start, cue_end, content))
            prev_end = cue_end
        concat_list.append(seg.part)  # type: ignore[arg-type]
        cursor = seg.end
        if seg.pause_after_ms > 0:
            sil = silence_cache.get(seg.pause_after_ms)
            if sil is None:
                sil = parts_dir / f"silence_{seg.pause_after_ms}.mp3"
                if not sil.exists() or args.force:
                    make_silence(seg.pause_after_ms, sil)
                silence_cache[seg.pause_after_ms] = sil
            concat_list.append(sil)
            cursor += seg.pause_after_ms / 1000.0

    outdir.mkdir(parents=True, exist_ok=True)
    audio_out = outdir / f"{args.prefix}.mp3"
    log("拼接音轨 …")
    track = parts_dir / "voice_track.mp3"
    concat_audio(concat_list, track)
    finish_audio(args, track, audio_out)

    srt_out = outdir / f"{args.prefix}.srt"
    vtt_out = outdir / f"{args.prefix}.vtt"
    write_srt(cues, srt_out)
    write_vtt(cues, vtt_out)

    fps = args.fps
    manifest = {
        "voice": args.voice,
        "rate": args.rate,
        "fps": fps,
        "audio": audio_out.name,
        "srt": srt_out.name,
        "vtt": vtt_out.name,
        "sample_rate": SILENCE_RATE,
        "total_duration": round(ffprobe_duration(audio_out), 3),
        "segments": [
            {
                "id": s.id,
                "index": s.index,
                "text": s.text,
                "voice": s.voice,
                "start": round(s.start, 3),
                "end": round(s.end, 3),
                "duration": round(s.duration, 3),
                "start_frame": round(s.start * fps),
                "duration_frames": max(1, round(s.duration * fps)),
                "file": s.part.name if s.part else None,
            }
            for s in segments
        ],
    }
    manifest["total_frames"] = round(manifest["total_duration"] * fps)
    (outdir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    log(f"完成 → {audio_out} ({manifest['total_duration']}s, "
        f"{manifest['total_frames']} 帧 @{fps}fps)")
    log(f"字幕 → {srt_out} / {vtt_out}   时间轴 → {outdir / 'manifest.json'}")
    return 0


# --------------------------------------------------------------------------- #
# 整段韵律模式（推荐）：一次请求合成全稿，韵律连续，最接近真人
# --------------------------------------------------------------------------- #
def map_boundaries(segments: list[Segment], events: list[dict]) -> bool:
    """用 WordBoundary 词块把整段音频切回各脚本段。字符数对不上就返回 False（自动降级）。"""
    targets = [norm_chars(s.text) for s in segments]
    if any(not t for t in targets):
        return False
    cum, acc = [], 0
    for t in targets:
        acc += len(t)
        cum.append(acc)
    total_chars = acc

    starts: list[float | None] = [None] * len(segments)
    ends: list[float | None] = [None] * len(segments)
    pos = 0
    for e in events:
        t = norm_chars(str(e.get("text", "")))
        if not t:
            continue
        s0, s1 = pos, pos + len(t)
        pos = s1
        off = float(e["offset"]) / 1e7
        dur = float(e["duration"]) / 1e7
        for i in range(len(segments)):
            lo = 0 if i == 0 else cum[i - 1]
            hi = cum[i]
            if s0 < hi and s1 > lo:          # 该词块与第 i 段有交叠
                if starts[i] is None:
                    starts[i] = off
                ends[i] = off + dur

    if pos != total_chars:
        warn(f"词块字符数 {pos} 与脚本 {total_chars} 不一致，无法可靠对齐")
        return False
    if any(st is None or en is None for st, en in zip(starts, ends)):
        warn("有片段没有匹配到词块（可能是纯符号或英文缩写被改写）")
        return False

    prev_end = 0.0
    for i, seg in enumerate(segments):
        st, en = starts[i], ends[i]
        assert st is not None and en is not None
        st = max(st, prev_end)                # 保证单调，杜绝字幕重叠
        en = max(en, st + 0.12)
        if en - st > 60:
            warn(f"第 {i} 段映射时长异常（{en - st:.1f}s）")
            return False
        seg.start, seg.end = st, en
        seg.duration = en - st
        seg.cues = [(0.0, en - st, seg.text)]
        prev_end = en
    return True


async def synth_whole(args: argparse.Namespace, segments: list[Segment],
                      outdir: Path, parts_dir: Path) -> int:
    pieces = [s.text.strip() for s in segments if s.text.strip()]
    full = "，".join(pieces)
    log(f"整段韵律模式：{len(segments)} 段合并为 1 次请求（{len(full)} 字），声音 {args.voice}")

    raw = parts_dir / "whole_raw.mp3"
    events: list[dict] = []
    last_exc: Exception | None = None
    for attempt in range(1, 4):
        try:
            comm = edge_tts.Communicate(full, args.voice, rate=args.rate,
                                        pitch=args.pitch, volume=args.volume,
                                        boundary="WordBoundary")
            events = []
            with open(raw, "wb") as fh:
                async for ch in comm.stream():
                    if ch["type"] == "audio":
                        fh.write(ch["data"])
                    elif ch["type"] in ("WordBoundary", "SentenceBoundary"):
                        events.append(ch)
            break
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            wait = 0.8 * 2 ** (attempt - 1)
            log(f"  第 {attempt} 次失败: {exc}；{wait:.1f}s 后重试")
            await asyncio.sleep(wait)
    else:
        raise RuntimeError(f"整段合成失败: {last_exc}")

    if not map_boundaries(segments, events):
        warn("整段模式无法可靠对齐 → 自动退回分段模式（时间轴一定准，音质略降）")
        args.mode = "segment"
        return await run(args)

    outdir.mkdir(parents=True, exist_ok=True)
    audio_out = outdir / f"{args.prefix}.mp3"
    track = parts_dir / "voice_track.mp3"
    # 没有 BGM 时不需要给音乐留收尾空间，尾部留白自动收短
    bgm_on = bool((getattr(args, "bgm", "") or "").strip())
    tail = args.tail_ms if (bgm_on or args.tail_ms != DEFAULT_TAIL_MS) else 150
    log(f"按段插入停顿 {args.gap_ms}ms、片尾留白 {tail}ms …")
    rebuild_with_pauses(raw, segments, args.gap_ms, tail, track)
    finish_audio(args, track, audio_out)

    cues: list[tuple[float, float, str]] = []
    for seg in segments:
        cues.append((seg.start, seg.end, seg.text))

    srt_out = outdir / f"{args.prefix}.srt"
    vtt_out = outdir / f"{args.prefix}.vtt"
    write_srt(cues, srt_out)
    write_vtt(cues, vtt_out)

    fps = args.fps
    total = ffprobe_duration(audio_out)
    manifest = {
        "voice": args.voice, "rate": args.rate, "mode": "whole", "fps": fps,
        "audio": audio_out.name, "srt": srt_out.name, "vtt": vtt_out.name,
        "sample_rate": SILENCE_RATE,
        "total_duration": round(total, 3),
        "segments": [
            {"id": s.id, "index": s.index, "text": s.text, "voice": s.voice,
             "start": round(s.start, 3), "end": round(s.end, 3),
             "duration": round(s.duration, 3),
             "start_frame": round(s.start * fps),
             "duration_frames": max(1, round(s.duration * fps)),
             "file": audio_out.name}
            for s in segments
        ],
    }
    manifest["total_frames"] = round(total * fps)
    (outdir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    for i, seg in enumerate(segments):
        log(f"  ✓ [{i:03d}] {seg.start:6.2f}s +{seg.duration:5.2f}s  {seg.text[:24]}…")
    log(f"完成 → {audio_out} ({manifest['total_duration']}s, {manifest['total_frames']} 帧 @{fps}fps)")
    log(f"字幕 → {srt_out} / {vtt_out}   时间轴 → {outdir / 'manifest.json'}")
    return 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
async def list_voices(lang: str | None) -> None:
    voices = await edge_tts.list_voices()
    rows = []
    for v in voices:
        name = v["ShortName"]
        if lang and not name.lower().startswith(lang.lower()):
            continue
        rows.append((name, v.get("Gender", ""), ",".join(v.get("VoiceTag", {}).get("ContentCategories", [])[:3]),
                     ",".join(v.get("VoiceTag", {}).get("VoicePersonalities", [])[:3])))
    for r in sorted(rows):
        print(f"{r[0]:<34} {r[1]:<8} {r[2]:<22} {r[3]}")
    print(f"# 共 {len(rows)} 个声音")


def main() -> int:
    p = argparse.ArgumentParser(
        description="edge-tts 批量配音 + 字幕 + 时间轴清单",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--script", help="JSON 或 txt/md 分段脚本")
    p.add_argument("--text", help="直接合成一句话（与 --script 互斥）")
    p.add_argument("--outdir", default="public/voice", help="输出目录（默认 public/voice）")
    p.add_argument("--prefix", default="vo", help="输出文件名前缀（默认 vo）")
    p.add_argument("--voice", default=DEFAULT_VOICE, help=f"声音，默认 {DEFAULT_VOICE}")
    p.add_argument("--rate", default=DEFAULT_RATE, help="语速，如 +10%% / -15%%")
    p.add_argument("--pitch", default=DEFAULT_PITCH, help="音调，如 +2Hz / -5Hz")
    p.add_argument("--volume", default=DEFAULT_VOLUME, help="音量，如 +10%%")
    p.add_argument("--gap-ms", type=int, default=DEFAULT_GAP_MS,
                   help=f"段间停顿毫秒（默认 {DEFAULT_GAP_MS}；不能无缝衔接，听着难受）")
    p.add_argument("--tail-ms", type=int, default=DEFAULT_TAIL_MS,
                   help=f"片尾留白毫秒（默认 {DEFAULT_TAIL_MS}，给 BGM 收尾）")
    p.add_argument("--bgm", default=DEFAULT_BGM,
                   help=f"背景配乐文件（默认 {DEFAULT_BGM}；文件不存在则自动跳过）")
    p.add_argument("--no-bgm", dest="bgm", action="store_const", const="",
                   help="本条不加背景配乐")
    p.add_argument("--bgm-gain-db", type=float, default=BGM_GAIN_DB,
                   help=f"BGM 音量（默认 {BGM_GAIN_DB}dB，人声始终在上）")
    p.add_argument("--no-duck", dest="duck", action="store_false", default=True,
                   help="关闭侧链闪避（默认开：说话时音乐自动压低）")
    p.add_argument("--no-carve", dest="carve", action="store_false", default=True,
                   help=f"关闭多频段 carve，退回整体压低（默认开：只挖 {CARVE_LOW}-{CARVE_HIGH}Hz，"
                        f"音乐低频不瘪）")
    p.add_argument("--loudness-target", choices=sorted(LOUDNESS_PRESETS), default="podcast",
                   help="响度目标预设：social=-14 / podcast=-16（默认）/ broadcast=-23 LUFS")
    p.add_argument("--mode", choices=["segment", "whole"], default="whole",
                   help="segment=逐段合成（时间轴最稳）；whole=整段一次合成（韵律最自然，默认）")
    p.add_argument("--engine", choices=["edge", "openai", "custom"], default="edge",
                   help="edge=内置 edge-tts（默认免费）；openai=OpenAI 兼容 /audio/speech；custom=自定义端点")
    p.add_argument("--tts-base-url", default="https://api.openai.com/v1",
                   help="engine=openai 时的 base url")
    p.add_argument("--tts-endpoint", default="", help="engine=custom 时的完整 URL")
    p.add_argument("--tts-api-key", default="",
                   help="API Key；留空则读环境变量 TTS_API_KEY / OPENAI_API_KEY")
    p.add_argument("--tts-model", default="gpt-4o-mini-tts", help="engine=openai 时的模型名")
    p.add_argument("--tts-format", default="mp3", help="请求的音频格式（mp3/wav/opus…）")
    p.add_argument("--tts-header", action="append", default=[],
                   help="额外请求头 K=V，可重复（自建服务鉴权用）")
    p.add_argument("--tts-payload", default="",
                   help='engine=custom 的 JSON 模板，支持 {text} {voice} {model} {speed}')
    p.add_argument("--keep-punct", action="store_true",
                   help="保留句号（默认按技能约束移除，句号会让听感变成机器念课文）")
    p.add_argument("--max-chars", type=int, default=260, help="单次请求最大字符数（默认 260）")
    p.add_argument("--concurrency", type=int, default=4, help="并发数（默认 4，过高易被限流）")
    p.add_argument("--fps", type=int, default=30, help="用于生成帧号的帧率（默认 30）")
    p.add_argument("--force", action="store_true", help="忽略缓存重新生成")
    p.add_argument("--normalize", action="store_true", help="对成品音轨做 EBU R128 响度归一")
    p.add_argument("--loudness", type=float, default=None,
                   help="归一目标 LUFS（覆盖 --loudness-target）")
    p.add_argument("--list-voices", nargs="?", const="", metavar="LANG",
                   help="列出声音，可加语言前缀，如 --list-voices zh")
    args = p.parse_args()

    if args.list_voices is not None:
        asyncio.run(list_voices(args.list_voices or None))
        return 0
    try:
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
