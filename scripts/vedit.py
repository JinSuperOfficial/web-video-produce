#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""web-video-produce :: vedit.py —— EDL 驱动的视频剪辑器（纯 FFmpeg，零第三方依赖）

设计：三阶段流水线，绝不把异构素材直接喂进 xfade 滤镜图。

    素材(异构) ──conform──▶ work/conform/part_00N.mp4 ──assemble──▶ 时间线 ──finish──▶ output/edit.mp4
       统一 分辨率/帧率/编码/采样率/音轨数            裁剪+转场+拼接      叠加/混音/字幕/压缩

子命令
------
    python3 scripts/vedit.py probe   assets/sample/*.mp4
    python3 scripts/vedit.py plan    --edl examples/edit-plan.example.json
    python3 scripts/vedit.py build   --edl examples/edit-plan.example.json
    python3 scripts/vedit.py conform --in a.mov --out work/conform/a.mp4 --w 1920 --h 1080 --fps 30

关键不变量（改代码时别破坏）
--------------------------
1. 所有 offset 只用 ffprobe **回读的真实时长**计算，不用 EDL 里请求的时长。
2. 转场硬断言：duration <= min(前段, 后段) / 2，且 offset 严格递增；不满足直接报错。
3. 视频 xfade 必须配同值音频 acrossfade，链式结构一一对应。
4. 失败按 4 级回退：xfade → concat filter → concat demuxer(copy) → 报错保留中间产物。
"""

from __future__ import annotations

import argparse
import json
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

# --------------------------------------------------------------------------- #
# 常量
# --------------------------------------------------------------------------- #
DEFAULT_W, DEFAULT_H, DEFAULT_FPS = 1920, 1080, 30
DEFAULT_CRF, DEFAULT_PRESET = 18, "medium"
AUDIO_RATE = 48000
INTERMEDIATE_CRF, INTERMEDIATE_PRESET = 14, "veryfast"

# xfade 常见安全转场（其余以 ffmpeg 运行时探测为准）
PREFERRED_TRANSITIONS = [
    "fade", "dissolve", "wipeleft", "wiperight", "wipeup", "wipedown",
    "slideleft", "slideright", "slideup", "slidedown",
    "circleopen", "circleclose", "radial", "smoothleft", "smoothright",
    "pixelize", "distance", "fadeblack", "fadewhite",
]

def sub_style(height: int) -> str:
    """烧字幕样式：字号随画面高度缩放（竖屏 1080x1920 用 22 会太小）。"""
    size = max(20, round(height / 48))
    return (
        f"FontName=Noto Sans SC,FontSize={size},PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=48"
    )

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def log(msg: str) -> None:
    print(f"[vedit] {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"[vedit] ! {msg}", file=sys.stderr, flush=True)


def die(msg: str, code: int = 1) -> None:
    print(f"[vedit] ✗ {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


# --------------------------------------------------------------------------- #
# 基础工具
# --------------------------------------------------------------------------- #
def which_or_die(name: str) -> str:
    p = shutil.which(name)
    if not p:
        die(f"找不到 {name}，请先安装 FFmpeg（apt install ffmpeg / brew install ffmpeg）")
    return p


def run(cmd: list, dry: bool = False, quiet: bool = False) -> subprocess.CompletedProcess:
    printable = shlex.join(str(c) for c in cmd)
    if dry:
        log("▶ " + printable)
        return subprocess.CompletedProcess(cmd, 0, "", "")
    if not quiet:
        log("▶ " + printable)
    proc = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if proc.returncode != 0:
        warn(f"命令失败 (exit {proc.returncode})")
        tail = "\n".join((proc.stderr or "").strip().splitlines()[-12:])
        if tail:
            print(tail, file=sys.stderr, flush=True)
    return proc


def parse_time(value, default=None):
    """接受 12.5 / '12.5' / '00:00:12.500' / '01:02:03'。"""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return default
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return float(s)
    parts = s.split(":")
    try:
        if len(parts) == 3:
            h, m, sec = parts
        elif len(parts) == 2:
            h, m, sec = 0, parts[0], parts[1]
        else:
            raise ValueError
        return int(h) * 3600 + int(m) * 60 + float(sec)
    except ValueError:
        die(f"看不懂的时间格式: {value!r}（应为秒数或 HH:MM:SS.mmm）")
    return None


def fmt_time(sec: float) -> str:
    sec = max(0.0, sec)
    m, s = divmod(sec, 60)
    h, m = divmod(int(m), 60)
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def escape_filter_path(p: str) -> str:
    """filtergraph 内路径转义（只用于 subtitles= 这类内联参数）。"""
    out = str(p).replace("\\", "\\\\")
    for ch in (":", "'", ",", ";", "[", "]", "="):
        out = out.replace(ch, "\\" + ch)
    return out


def require_file(p: str) -> Path:
    path = Path(p)
    if not path.exists():
        die(f"找不到文件: {p}")
    return path


# --------------------------------------------------------------------------- #
# ffprobe
# --------------------------------------------------------------------------- #
def probe(path: str) -> dict:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        die(f"ffprobe 读取失败: {path}\n{proc.stderr.strip()}")
    data = json.loads(proc.stdout or "{}")
    streams = data.get("streams", [])
    fmt = data.get("format", {})

    v = next((s for s in streams if s.get("codec_type") == "video"
              and s.get("disposition", {}).get("attached_pic", 0) != 1), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)

    def ratio(x: str) -> float:
        try:
            num, den = x.split("/")
            return float(num) / float(den) if float(den) else 0.0
        except Exception:
            return 0.0

    fps = 0.0
    if v:
        fps = ratio(v.get("avg_frame_rate") or "0") or ratio(v.get("r_frame_rate") or "0")

    duration = float(fmt.get("duration") or 0.0)
    if not duration and v and v.get("duration"):
        duration = float(v["duration"])

    rotation = 0
    if v:
        for sd in v.get("side_data_list", []) or []:
            if "rotation" in sd:
                rotation = int(float(sd["rotation"]))
        if not rotation:
            rotation = int(float((v.get("tags") or {}).get("rotate", 0) or 0))

    pix_fmt = (v or {}).get("pix_fmt", "")
    transfer = (v or {}).get("color_transfer", "") or ""
    is_hdr = bool(re.search(r"10le|12le|10be", pix_fmt)) or transfer in ("smpte2084", "arib-std-b67")

    return {
        "path": str(path),
        "duration": round(duration, 3),
        "size": int(fmt.get("size") or 0),
        "format": fmt.get("format_name", ""),
        "width": int((v or {}).get("width") or 0),
        "height": int((v or {}).get("height") or 0),
        "fps": round(fps, 3),
        "vcodec": (v or {}).get("codec_name", ""),
        "pix_fmt": pix_fmt,
        "has_video": v is not None,
        "has_audio": a is not None,
        "acodec": (a or {}).get("codec_name", ""),
        "sample_rate": int((a or {}).get("sample_rate") or 0),
        "channels": int((a or {}).get("channels") or 0),
        "rotation": rotation,
        "is_hdr": is_hdr,
    }


def probe_duration(path: str) -> float:
    return probe(path)["duration"]


# --------------------------------------------------------------------------- #
# 能力探测
# --------------------------------------------------------------------------- #
def available_transitions() -> set:
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-h", "filter=xfade"],
                          capture_output=True, text=True)
    # 形如： "     fade            0            ..FV....... fade transition"
    found = set(re.findall(r"^\s{5,}(\w+)\s+-?\d+\s+\.\.", proc.stdout or "", re.M))
    found.discard("custom")
    return found


def has_encoder(name: str) -> bool:
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True)
    return re.search(rf"\s{re.escape(name)}\s", proc.stdout or "") is not None


def pick_video_encoder(requested: str = "auto") -> str:
    if requested and requested != "auto":
        return requested
    if has_encoder("libx264"):
        return "libx264"
    warn("没有 libx264，回退到 mpeg4（体积大、兼容性差）")
    return "mpeg4"


# --------------------------------------------------------------------------- #
# conform：把任意素材标准化成统一规格的 part
# --------------------------------------------------------------------------- #
def conform_filter(w: int, h: int, fps: int, mode: str, speed: float,
                   crop_focus: str = "center") -> str:
    """conform 的视频滤镜链。mode: pad | crop | blur。"""
    if mode == "crop":
        anchor = {"top": "0", "center": "(ih-oh)/2", "bottom": "ih-oh"}.get(crop_focus, "(ih-oh)/2")
        geometry = (
            f"scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h}:(iw-ow)/2:{anchor}"
        )
        return f"fps={fps},{geometry},setsar=1,format=yuv420p,setpts=(PTS-STARTPTS)/{speed}"
    if mode == "blur":
        return (
            f"fps={fps},split=2[__bg][__fg];"
            f"[__bg]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
            f"boxblur=40:2[__bgb];"
            f"[__fg]scale={w}:{h}:force_original_aspect_ratio=decrease[__fgs];"
            f"[__bgb][__fgs]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p,"
            f"setpts=(PTS-STARTPTS)/{speed}"
        )
    geometry = (
        f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
        f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black"
    )
    return f"fps={fps},{geometry},setsar=1,format=yuv420p,setpts=(PTS-STARTPTS)/{speed}"


def atempo_chain(speed: float) -> str:
    """atempo 单级范围 0.5~2.0，超出就拆成多级。"""
    if abs(speed - 1.0) < 1e-6:
        return ""
    parts, remaining = [], speed
    while remaining > 2.0:
        parts.append("atempo=2.0")
        remaining /= 2.0
    while remaining < 0.5:
        parts.append("atempo=0.5")
        remaining /= 0.5
    parts.append(f"atempo={remaining:.6f}")
    return ",".join(parts)


def conform_segment(seg: dict, out_cfg: dict, work: Path, idx: int,
                    dry: bool, force: bool) -> dict:
    """把一个 EDL timeline 条目做成 work/part_00N.mp4，返回真实元数据。"""
    src = require_file(seg["src"])
    info = probe(str(src))
    if not info["has_video"]:
        die(f"{seg['src']} 没有视频流，不能作为剪辑素材")

    w, h, fps = out_cfg["width"], out_cfg["height"], out_cfg["fps"]
    start = parse_time(seg.get("in"), 0.0) or 0.0
    end = parse_time(seg.get("out"), None)
    if end is None:
        end = info["duration"]
    if end <= start:
        die(f"[{seg.get('id', idx)}] out({end}) 必须大于 in({start})")
    if end > info["duration"] + 0.05:
        warn(f"[{seg.get('id', idx)}] out={end:.3f}s 超过素材时长 {info['duration']:.3f}s，已按素材末尾截断")
        end = info["duration"]
    speed = float(seg.get("speed", 1.0))
    if not 0.25 <= speed <= 4.0:
        die(f"[{seg.get('id', idx)}] speed={speed} 超出支持范围 0.25~4.0")

    out_dur = (end - start) / speed
    mode = seg.get("conform") or out_cfg["conform_mode"]
    focus = seg.get("crop_focus", "center")

    dst = work / f"part_{idx:03d}.mp4"
    vf = conform_filter(w, h, fps, mode, speed, focus)

    af_parts = [f"aresample={AUDIO_RATE}",
                "aformat=sample_fmts=fltp:channel_layouts=stereo"]
    at = atempo_chain(speed)
    if at:
        af_parts.append(at)
    audio = seg.get("audio") or {}
    fade_in = float(audio.get("fade_in", 0) or 0)
    fade_out = float(audio.get("fade_out", 0) or 0)
    if fade_in > 0:
        af_parts.append(f"afade=t=in:st=0:d={fade_in:.3f}")
    if fade_out > 0:
        af_parts.append(f"afade=t=out:st={max(0.0, out_dur - fade_out):.3f}:d={fade_out:.3f}")
    if audio.get("mode") == "mute":
        af_parts.append("volume=0")
    elif audio.get("gain_db"):
        af_parts.append(f"volume={float(audio['gain_db'])}dB")
    af = ",".join(af_parts)

    if dst.exists() and not force:  # 复用缓存，避免重复转码
        meta = probe(str(dst))
        if abs(meta["duration"] - out_dur) < 0.08 and meta["width"] == w and meta["height"] == h:
            log(f"  = [{idx:03d}] 复用缓存 {dst.name} ({meta['duration']:.3f}s)")
            return {"index": idx, "id": seg.get("id", f"s{idx}"), "path": str(dst),
                    "duration": meta["duration"], "audio": True, "cached": True}

    cmd = ["ffmpeg", "-hide_banner", "-y"]
    if start > 0:
        cmd += ["-ss", f"{start:.3f}"]
    cmd += ["-i", str(src)]
    if not info["has_audio"]:
        # 无音轨素材补一条静音，保证每段音轨数一致（转场/拼接的前提）
        cmd += ["-f", "lavfi", "-i", f"anullsrc=r={AUDIO_RATE}:cl=stereo"]
        cmd += ["-t", f"{out_dur:.3f}", "-vf", vf,
                "-filter_complex", f"[1:a]{af}[aout]", "-map", "0:v", "-map", "[aout]"]
    else:
        cmd += ["-t", f"{out_dur:.3f}", "-vf", vf, "-af", af]
    if info["is_hdr"]:
        warn(f"[{seg.get('id', idx)}] 检测到 HDR/10bit 素材，conform 只做 8bit 转换，颜色可能发灰；"
             f"精确还原请先跑 tonemap（见 SKILL.md §7）")
    cmd += ["-c:v", pick_video_encoder(out_cfg.get("vcodec", "auto")),
            "-preset", out_cfg["preset"], "-crf", str(out_cfg["crf"]),
            "-g", str(int(fps * 2)), "-keyint_min", str(int(fps * 2)), "-sc_threshold", "0",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-ar", str(AUDIO_RATE), "-ac", "2",
            "-vsync", "cfr", "-movflags", "+faststart", str(dst)]

    proc = run(cmd, dry=dry)
    if proc.returncode != 0 and not dry:
        die(f"[{seg.get('id', idx)}] conform 失败")
    if dry:
        return {"index": idx, "id": seg.get("id", f"s{idx}"), "path": str(dst),
                "duration": round(out_dur, 3), "audio": True, "cached": False}

    real = probe(str(dst))
    if real["duration"] <= 0:
        die(f"[{seg.get('id', idx)}] conform 产物时长为 0，素材可能损坏")
    # 关键：offset 只用这个回读值
    return {"index": idx, "id": seg.get("id", f"s{idx}"), "path": str(dst),
            "duration": real["duration"], "audio": True, "cached": False}


# --------------------------------------------------------------------------- #
# assemble
# --------------------------------------------------------------------------- #
def requested_part(seg: dict, idx: int) -> dict:
    """按 EDL 请求值估算某段成片时长（不编码），用于 conform 之前的安全预检。"""
    info = probe(str(require_file(seg["src"])))
    start = parse_time(seg.get("in"), 0.0) or 0.0
    end = parse_time(seg.get("out"), None)
    if end is None:
        end = info["duration"]
    end = min(end, info["duration"])
    speed = float(seg.get("speed", 1.0)) or 1.0
    return {"index": idx, "id": seg.get("id", f"s{idx}"),
            "duration": max(0.0, (end - start) / speed), "path": "", "audio": True}


def normalize_transition(raw, allow: set):
    if not raw:
        return None
    if isinstance(raw, str):
        raw = {"type": raw}
    ttype = str(raw.get("type", "fade")).strip()
    dur = float(raw.get("duration", 0.5))
    if dur <= 0:
        die(f"转场时长必须 > 0（收到 {dur}）")
    if ttype not in allow:
        die(f"不支持的转场 '{ttype}'。可用：{', '.join(sorted(allow))}")
    return {"type": ttype, "duration": dur}


def assert_transitions(parts: list, transitions: list) -> None:
    """转场安全区硬断言：不合格直接报错，绝不产出错乱时间线。"""
    for i, t in enumerate(transitions):
        if not t:
            continue
        a, b = parts[i]["duration"], parts[i + 1]["duration"]
        safe = min(a, b) / 2.0
        if t["duration"] > safe + 1e-6:
            die(
                f"转场 #{i + 1} ({t['type']} {t['duration']}s) 太长：前段 {a:.3f}s / 后段 {b:.3f}s，"
                f"安全上限 {safe:.3f}s（= min(前,后)/2）。请改小 duration 或加长片段。"
            )


def build_assemble_graph(parts: list, transitions: list, level: int):
    """返回 (video_graph, audio_graph, total_duration, out_v_label, out_a_label)。"""
    n = len(parts)
    vg, ag = [], []

    if n == 1:
        return "", "", parts[0]["duration"], "0:v", "0:a"

    if level >= 2:  # 全部硬拼，一条 concat
        vg.append("".join(f"[{i}:v]" for i in range(n)) + f"concat=n={n}:v=1:a=0[vout]")
        ag.append("".join(f"[{i}:a]" for i in range(n)) + f"concat=n={n}:v=0:a=1[aout]")
        return ";".join(vg), ";".join(ag), sum(p["duration"] for p in parts), "vout", "aout"

    acc_v, acc_a = "[0:v]", "[0:a]"
    acc_dur = parts[0]["duration"]
    for i in range(1, n):
        t = transitions[i - 1]
        if t:
            D = t["duration"]
            off = acc_dur - D
            if off <= 0:
                die(f"转场 #{i} 的 offset 计算出 {off:.3f}s（<=0）：前段太短或转场太长")
            vg.append(f"{acc_v}[{i}:v]xfade=transition={t['type']}:duration={D:.3f}:offset={off:.3f}[v{i}]")
            ag.append(f"{acc_a}[{i}:a]acrossfade=d={D:.3f}:c1=tri:c2=tri[a{i}]")
            acc_v, acc_a = f"[v{i}]", f"[a{i}]"
            acc_dur = acc_dur + parts[i]["duration"] - D
        else:
            vg.append(f"{acc_v}[{i}:v]concat=n=2:v=1:a=0[v{i}]")
            ag.append(f"{acc_a}[{i}:a]concat=n=2:v=0:a=1[a{i}]")
            acc_v, acc_a = f"[v{i}]", f"[a{i}]"
            acc_dur += parts[i]["duration"]
    vg.append(f"{acc_v}format=yuv420p[vout]")
    ag.append(f"{acc_a}aformat=sample_fmts=fltp:channel_layouts=stereo[aout]")
    return ";".join(vg), ";".join(ag), acc_dur, "vout", "aout"


# --------------------------------------------------------------------------- #
# finish：叠加 / BGM / 字幕 / 响度 / 压缩
# --------------------------------------------------------------------------- #
def parse_enable(raw: str) -> str:
    """把 "0:00-0:09" / "1.5-4" 这类时间区间转成 ffmpeg 的 between(t,a,b)；
    已经是表达式（含 t、between 等）就原样透传。"""
    s = str(raw).strip()
    m = re.fullmatch(r"([\d:.]+)\s*-\s*([\d:.]+)", s)
    if m:
        a = parse_time(m.group(1), 0.0) or 0.0
        b = parse_time(m.group(2), 0.0) or 0.0
        return f"between(t,{a:.3f},{b:.3f})"
    return s


def build_overlay_filter(overlays: list, first_input: int):
    chunks, cur = [], "0:v"
    for k, ov in enumerate(overlays):
        src = require_file(ov["src"])
        idx = first_input + k
        pos = ov.get("position", "top-right")
        margin = int(ov.get("margin", 48))
        width = ov.get("width")
        opacity = float(ov.get("opacity", 1.0))
        enable = parse_enable(ov["enable"]) if ov.get("enable") else None
        label = f"ov{k}"
        is_image = src.suffix.lower() in IMAGE_EXT
        scale = f"scale={int(width)}:-1," if width else ""
        if is_image:
            chunks.append(f"[{idx}:v]{scale}format=rgba,colorchannelmixer=aa={opacity:.3f}[{label}]")
        else:
            chunks.append(f"[{idx}:v]{scale}setpts=PTS-STARTPTS,format=yuva420p,"
                          f"colorchannelmixer=aa={opacity:.3f}[{label}]")
        xy = {
            "top-left": f"{margin}:{margin}",
            "top-right": f"W-w-{margin}:{margin}",
            "bottom-left": f"{margin}:H-h-{margin}",
            "bottom-right": f"W-w-{margin}:H-h-{margin}",
            "center": "(W-w)/2:(H-h)/2",
        }.get(pos)
        if xy is None:
            die(f"未知的 overlay position: {pos}（可用 top-left/top-right/bottom-left/bottom-right/center）")
        opt = f":enable='{enable}'" if enable else ""
        chunks.append(f"[{cur}][{label}]overlay={xy}{opt}:format=auto[vov{k}]")
        cur = f"vov{k}"
    return chunks, cur


def build_finish(timeline_path: str, edl: dict, out_cfg: dict,
                 total_duration: float = 0.0) -> list:
    inputs = ["-i", timeline_path]
    next_idx = 1
    vchunks, achunks = [], []
    v_label, a_label = "0:v", "0:a"

    overlays = edl.get("overlays") or []
    if overlays:
        vchunks, v_label = build_overlay_filter(overlays, next_idx)
        for ov in overlays:
            inputs += ["-i", str(Path(ov["src"]))]
            next_idx += 1

    track = edl.get("audio_track") or {}
    bgm = track.get("bgm")
    if bgm:
        require_file(bgm)
        bgm_gain = float(track.get("bgm_gain_db", -20))
        duck = bool(track.get("duck", True))
        inputs += ["-stream_loop", "-1", "-i", str(Path(bgm))]
        bi = next_idx
        next_idx += 1
        achunks.append(f"[{bi}:a]aresample={AUDIO_RATE},"
                       f"aformat=sample_fmts=fltp:channel_layouts=stereo,"
                       f"volume={bgm_gain}dB[bgmraw]")
        if duck:
            achunks.append(f"[bgmraw][{a_label}]"
                           f"sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[bgmduck]")
            achunks.append(f"[{a_label}][bgmduck]amix=inputs=2:duration=first:normalize=0[amixed]")
        else:
            achunks.append(f"[{a_label}][bgmraw]amix=inputs=2:duration=first:normalize=0[amixed]")
        a_label = "amixed"

    loud = track.get("loudnorm")
    if loud:
        achunks.append(f"[{a_label}]loudnorm=I={float(loud)}:TP=-1.5:LRA=11[aloud]")
        a_label = "aloud"

    subs = edl.get("subtitles")
    if subs:
        require_file(subs)
        style = edl.get("subtitle_style") or sub_style(out_cfg["height"])
        vchunks.append(f"[{v_label}]subtitles='{escape_filter_path(str(subs))}':"
                       f"force_style='{style}'[vsub]")
        v_label = "vsub"

    vchunks.append(f"[{v_label}]format=yuv420p[vout]")
    v_label = "vout"
    if achunks or a_label != "0:a":
        achunks.append(f"[{a_label}]aresample={AUDIO_RATE},"
                       f"aformat=sample_fmts=fltp:channel_layouts=stereo[aout]")
        a_label = "aout"

    graph = ";".join(vchunks + achunks)

    def map_arg(label: str) -> str:
        """filter 输出的标签要写 [label]，直接引用输入流则写 0:a —— 两者不能混。"""
        return label if re.fullmatch(r"\d+:[va]", label) else f"[{label}]"

    cmd = ["ffmpeg", "-hide_banner", "-y"] + inputs
    cmd += ["-filter_complex", graph, "-map", map_arg(v_label), "-map", map_arg(a_label)]

    cmd += ["-c:v", pick_video_encoder(out_cfg.get("vcodec", "auto")),
            "-preset", out_cfg["preset"], "-crf", str(out_cfg["crf"]),
            "-pix_fmt", "yuv420p", "-g", str(int(out_cfg["fps"] * 2))]
    target_mb = out_cfg.get("target_mb")
    if target_mb:
        dur = max(1.0, total_duration or probe_duration(timeline_path))
        v_kbps = max(300, int(float(target_mb) * 8192 / dur - 192))
        cmd += ["-b:v", f"{v_kbps}k", "-maxrate", f"{int(v_kbps * 1.5)}k",
                "-bufsize", f"{int(v_kbps * 3)}k"]
        log(f"  目标体积 {target_mb}MB / {dur:.1f}s → 视频码率约 {v_kbps}kbps")
    cmd += ["-c:a", "aac", "-b:a", "192k", "-ar", str(AUDIO_RATE), "-ac", "2"]
    if bgm:
        # BGM 用了 -stream_loop -1（无限输入），必须显式按时间线时长封口，
        # 否则某些容器会把成片时长拉长到 BGM 的循环点。
        cmd += ["-t", f"{(total_duration or probe_duration(timeline_path)):.3f}"]
    cmd += ["-movflags", "+faststart", str(out_cfg["path"])]
    return cmd


# --------------------------------------------------------------------------- #
# EDL
# --------------------------------------------------------------------------- #
def load_edl(path: str, cli_aspect, cli_out) -> dict:
    edl_path = require_file(path)
    try:
        edl = json.loads(edl_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        die(f"EDL 不是合法 JSON: {exc}")
    if not edl.get("timeline"):
        die("EDL 缺少 timeline 数组")

    out = edl.setdefault("output", {})
    out.setdefault("path", "output/edit.mp4")
    if cli_out:
        out["path"] = cli_out
    out.setdefault("width", DEFAULT_W)
    out.setdefault("height", DEFAULT_H)
    out.setdefault("fps", DEFAULT_FPS)
    out.setdefault("crf", DEFAULT_CRF)
    out.setdefault("preset", DEFAULT_PRESET)
    out.setdefault("vcodec", "auto")
    out["width"] = int(out["width"])
    out["height"] = int(out["height"])
    out["fps"] = int(out["fps"])

    aspect = (cli_aspect or (edl.get("aspect") or {}).get("preset") or "keep").lower()
    presets = {
        "vertical": (1080, 1920), "portrait": (1080, 1920), "9:16": (1080, 1920),
        "horizontal": (1920, 1080), "landscape": (1920, 1080), "16:9": (1920, 1080),
        "square": (1080, 1080), "1:1": (1080, 1080),
    }
    if aspect in presets:
        out["width"], out["height"] = presets[aspect]
    elif aspect not in ("keep", ""):
        die(f"未知画幅预设 '{aspect}'，可用：keep / vertical / horizontal / square")

    conf = edl.setdefault("conform", {})
    mode = (conf.get("mode") or "pad").lower()
    if mode not in ("pad", "crop", "blur"):
        die(f"未知的 conform.mode '{mode}'，可用：pad / crop / blur")
    conf["mode"] = mode
    out["conform_mode"] = mode
    edl["subtitles"] = edl.get("subtitles") or out.get("subtitles")
    return edl


def transitions_of(segments: list, allow: set) -> list:
    """transitions[i] = segments[i] 与 segments[i+1] 之间的转场。"""
    trans = []
    for i in range(len(segments) - 1):
        t = normalize_transition(segments[i].get("transition_out"), allow)
        if t is None:
            t = normalize_transition(segments[i + 1].get("transition_in"), allow)
        trans.append(t)
    if segments[-1].get("transition_out"):
        warn("最后一段的 transition_out 会被忽略（后面没有片段了）")
    return trans


# --------------------------------------------------------------------------- #
# 子命令
# --------------------------------------------------------------------------- #
def cmd_probe(args) -> int:
    for p in args.files:
        info = probe(p)
        print(f"\n■ {p}")
        print(f"  时长 {info['duration']:.3f}s   体积 {info['size'] / 1024:.0f}KB   容器 {info['format']}")
        print(f"  视频 {info['vcodec']} {info['width']}x{info['height']} @{info['fps']:.3f}fps "
              f"{info['pix_fmt']}{'  HDR/10bit' if info['is_hdr'] else ''}")
        if info["rotation"]:
            print(f"  旋转元数据 {info['rotation']}°（ffmpeg 会自动烘焙进像素）")
        if info["has_audio"]:
            print(f"  音频 {info['acodec']} {info['sample_rate']}Hz {info['channels']}ch")
        else:
            print("  音频 无（conform 会自动补静音轨）")
    print()
    return 0


def cmd_conform(args) -> int:
    dst = Path(args.out)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out_cfg = {
        "width": args.w, "height": args.h, "fps": args.fps,
        "crf": args.crf, "preset": args.preset, "vcodec": args.vcodec,
        "conform_mode": args.mode, "path": str(dst),
    }
    seg = {"src": args.input, "in": args.start, "out": args.end,
           "speed": args.speed, "crop_focus": args.focus}
    meta = conform_segment(seg, out_cfg, dst.parent, 0, args.dry_run, args.force)
    produced = dst.parent / "part_000.mp4"
    if produced.exists() and produced.resolve() != dst.resolve():
        shutil.move(str(produced), str(dst))
    if not args.dry_run:
        log(f"✓ conform 完成 → {dst} ({meta['duration']:.3f}s)")
    return 0


def cmd_plan(args) -> int:
    return do_build(args, plan_only=True)


def cmd_build(args) -> int:
    return do_build(args, plan_only=False)


def do_build(args, plan_only: bool) -> int:
    which_or_die("ffmpeg")
    which_or_die("ffprobe")

    edl = load_edl(args.edl, args.aspect, args.out)
    out_cfg = edl["output"]
    segments = edl["timeline"]
    work = Path(args.work)
    dry = plan_only or args.dry_run

    allow = available_transitions() or set(PREFERRED_TRANSITIONS)
    trans = transitions_of(segments, allow)

    log(f"素材 {len(segments)} 段 → {out_cfg['width']}x{out_cfg['height']}@{out_cfg['fps']}fps  "
        f"conform.mode={edl['conform']['mode']}  输出 {out_cfg['path']}")

    # ---------- 0) 预检：先用请求时长做转场安全断言，避免白跑一遍 conform ----------
    assert_transitions([requested_part(seg, i) for i, seg in enumerate(segments)], trans)

    # ---------- 1) conform ----------
    if not dry:
        work.mkdir(parents=True, exist_ok=True)
    parts = [conform_segment(seg, out_cfg, work, i, dry, args.force)
             for i, seg in enumerate(segments)]

    assert_transitions(parts, trans)

    # ---------- 2) assemble ----------
    level = args.force_level
    vg, ag, total, vout, aout = build_assemble_graph(parts, trans, level)
    finish_needed = bool(
        (edl.get("overlays") or [])
        or (edl.get("audio_track") or {}).get("bgm")
        or (edl.get("audio_track") or {}).get("loudnorm")
        or edl.get("subtitles")
        or out_cfg.get("target_mb")
    )
    intermediate = str(work / "timeline.mp4") if finish_needed else out_cfg["path"]
    if not dry:
        Path(intermediate).parent.mkdir(parents=True, exist_ok=True)

    if len(parts) == 1 and not finish_needed:
        cmd = ["ffmpeg", "-hide_banner", "-y", "-i", parts[0]["path"],
               "-c", "copy", "-movflags", "+faststart", out_cfg["path"]]
        log("只有 1 段且无需收尾 → 直接复制")
        return 0 if run(cmd, dry=dry).returncode == 0 else 1

    inter_crf = INTERMEDIATE_CRF if finish_needed else out_cfg["crf"]
    inter_preset = INTERMEDIATE_PRESET if finish_needed else out_cfg["preset"]

    def assemble_cmd_for(graph_v: str, graph_a: str, vo: str, ao: str) -> list:
        cmd = ["ffmpeg", "-hide_banner", "-y"]
        for p in parts:
            cmd += ["-i", p["path"]]
        if graph_v:
            cmd += ["-filter_complex", f"{graph_v};{graph_a}", "-map", f"[{vo}]", "-map", f"[{ao}]"]
        else:
            cmd += ["-map", "0:v", "-map", "0:a"]
        cmd += ["-c:v", pick_video_encoder(out_cfg.get("vcodec", "auto")),
                "-preset", inter_preset, "-crf", str(inter_crf),
                "-pix_fmt", "yuv420p", "-g", str(out_cfg["fps"] * 2),
                "-c:a", "aac", "-b:a", "192k", "-ar", str(AUDIO_RATE), "-ac", "2",
                "-movflags", "+faststart", intermediate]
        return cmd

    log(f"时间轴：{len(parts)} 段，{sum(1 for t in trans if t)} 个转场，"
        f"预计成片 {fmt_time(total)}（{total:.3f}s）")

    if dry:
        run(assemble_cmd_for(vg, ag, vout, aout), dry=True)
        if finish_needed:
            run(build_finish(intermediate, edl, out_cfg, total), dry=True)
        print()
        log("以上为 dry-run，未执行。")
        return 0

    # ---------- 2a) preflight ----------
    preflight_ok = False
    if vg:
        pre = ["ffmpeg", "-hide_banner", "-v", "error", "-y"]
        for p in parts:
            pre += ["-i", p["path"]]
        pre += ["-filter_complex", f"{vg};{ag}", "-map", f"[{vout}]", "-map", f"[{aout}]",
                "-t", "0.5", "-f", "null", "-"]
        preflight_ok = run(pre, quiet=True).returncode == 0
        if not preflight_ok:
            warn("preflight 失败（滤镜图不成立），将尝试降级")

    # ---------- 2b) 四级回退 ----------
    levels = []
    if vg:
        levels.append((1, "xfade + acrossfade（带转场）", assemble_cmd_for(vg, ag, vout, aout)))
    if len(parts) > 1:
        v2, a2, _, vo2, ao2 = build_assemble_graph(parts, trans, 2)
        levels.append((2, "concat filter（无转场直拼）", assemble_cmd_for(v2, a2, vo2, ao2)))
        listfile = work / "concat_list.txt"
        listfile.write_text(
            "".join(f"file '{Path(p['path']).resolve().as_posix()}'\n" for p in parts),
            encoding="utf-8")
        levels.append((3, "concat demuxer（copy 直拼）",
                       ["ffmpeg", "-hide_banner", "-y", "-f", "concat", "-safe", "0",
                        "-i", str(listfile), "-c", "copy", "-movflags", "+faststart", intermediate]))

    if level != 1:
        levels = [lv for lv in levels if lv[0] == level] or levels
        log(f"调试模式：只尝试 level {level}")

    used = None
    for lv, name, cmd in levels:
        if lv == 1 and not preflight_ok:
            warn("跳过 level 1（preflight 未通过）")
            continue
        if run(cmd).returncode == 0:
            used = (lv, name)
            break
        warn(f"level {lv} 失败：{name}")

    if used is None:
        die(f"拼接方案全部失败。中间产物保留在 {work}/，可用 --keep-work 保留现场排查。")
    lv, name = used
    if lv > 1:
        warn(f"⚠ 已降级为「{name}」：成片没有转场，请在交付说明里如实标注")

    # ---------- 3) finish ----------
    if finish_needed:
        if run(build_finish(intermediate, edl, out_cfg, total)).returncode != 0:
            die("finish 阶段失败（叠加/BGM/字幕/压缩）")
        if not args.keep_work:
            Path(intermediate).unlink(missing_ok=True)

    if not args.keep_work:
        for p in parts:
            Path(p["path"]).unlink(missing_ok=True)

    # ---------- 4) 自检 ----------
    final = probe(out_cfg["path"])
    print()
    log(f"✓ 成片 {out_cfg['path']}")
    print(f"  时长     {final['duration']:.3f}s（{fmt_time(final['duration'])}）")
    print(f"  分辨率   {final['width']}x{final['height']} @{final['fps']:.2f}fps")
    print(f"  视频     {final['vcodec']} {final['pix_fmt']}")
    print(f"  音频     {final['acodec']} {final['sample_rate']}Hz {final['channels']}ch")
    print(f"  体积     {final['size'] / 1024 / 1024:.2f}MB")
    if lv > 1:
        print(f"  ⚠ 降级   {name}")
    if abs(final["duration"] - total) > 0.15:
        warn(f"成片时长 {final['duration']:.3f}s 与预期 {total:.3f}s 相差 "
             f"{abs(final['duration'] - total):.3f}s，请抽帧确认拼接处")
    return 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main() -> int:
    p = argparse.ArgumentParser(
        prog="vedit.py",
        description="EDL 驱动的视频剪辑器：裁剪 / 拼接 / 转场 / 画中画 / 水印 / 画幅 / 压缩",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="先跑 plan 看命令，再跑 build；两者参数完全一致。",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("probe", help="读取素材元数据（时长/分辨率/帧率/音轨/HDR）")
    sp.add_argument("files", nargs="+")
    sp.set_defaults(func=cmd_probe)

    sc = sub.add_parser("conform", help="把单个素材标准化为统一规格")
    sc.add_argument("--in", dest="input", required=True)
    sc.add_argument("--out", required=True)
    sc.add_argument("--w", type=int, default=DEFAULT_W)
    sc.add_argument("--h", type=int, default=DEFAULT_H)
    sc.add_argument("--fps", type=int, default=DEFAULT_FPS)
    sc.add_argument("--mode", default="pad", choices=["pad", "crop", "blur"])
    sc.add_argument("--start", default=None)
    sc.add_argument("--end", default=None)
    sc.add_argument("--speed", type=float, default=1.0)
    sc.add_argument("--focus", default="center", choices=["top", "center", "bottom"])
    sc.add_argument("--crf", type=int, default=DEFAULT_CRF)
    sc.add_argument("--preset", default=DEFAULT_PRESET)
    sc.add_argument("--vcodec", default="auto")
    sc.add_argument("--force", action="store_true")
    sc.add_argument("--dry-run", action="store_true")
    sc.set_defaults(func=cmd_conform)

    for name, fn, helptext in (("plan", cmd_plan, "dry-run：打印将执行的 ffmpeg 命令"),
                               ("build", cmd_build, "真正执行：conform → assemble → finish")):
        s = sub.add_parser(name, help=helptext)
        s.add_argument("--edl", required=True, help="剪辑计划 JSON")
        s.add_argument("--out", default=None, help="覆盖 EDL 的 output.path")
        s.add_argument("--aspect", default=None,
                       choices=["keep", "vertical", "horizontal", "square"],
                       help="画幅预设（覆盖 EDL.aspect.preset）")
        s.add_argument("--work", default="work", help="中间产物目录（默认 work/）")
        s.add_argument("--force", action="store_true", help="忽略 conform 缓存")
        s.add_argument("--keep-work", action="store_true", help="保留中间产物便于排查")
        s.add_argument("--dry-run", action="store_true", help="只打印命令")
        s.add_argument("--force-level", type=int, default=1, choices=[1, 2, 3],
                       help="调试：强制使用某个拼接级别")
        s.set_defaults(func=fn)

    args = p.parse_args()
    if args.cmd in ("plan", "build") and args.force_level != 1:
        log(f"调试模式：强制拼接 level {args.force_level}")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
