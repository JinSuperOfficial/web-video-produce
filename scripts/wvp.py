#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""web-video-produce :: 统一 CLI 入口

三个子命令覆盖 90% 的日常操作，Agent 不需要记住十几个脚本的名字：

    python3 scripts/wvp.py doctor     环境自检 + 工程静态校验（+ 可选抽帧预览）
    python3 scripts/wvp.py render     一条命令出片：配音 → 渲染 → 合成 → 验收
    python3 scripts/wvp.py timeline   时间轴对齐检查（段/帧/词，可验证音画对齐）

为什么要有它：以前要跑通一条片子，得按顺序记住 check_env.sh、validate.py、
tts_edge.py、remotion render、mux.sh、ffprobe 六七个工具和它们的参数，
顺序错了或者漏了一步（比如忘了 --color-space=bt709）就会交付出错色的成片。
这里把顺序和默认参数固化下来，每步都有硬性验收，失败立刻停。

退出码：0 = 全绿；1 = 有错误；2 = 用法/前置条件错误。
"""

from __future__ import annotations

import argparse
import glob as globmod
import json
import math
import re
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
GREEN, YELLOW, RED, DIM, RESET = "\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[0m"
ANSI = re.compile(r"\033\[[0-9;]*m")


# --------------------------------------------------------------------------- #
# 基础工具
# --------------------------------------------------------------------------- #
def log(msg: str = "") -> None:
    print(msg, flush=True)


def step(n: int, total: int, msg: str) -> None:
    log(f"\n{GREEN}== [{n}/{total}] {msg}{RESET}")


def warn(msg: str) -> None:
    log(f"  {YELLOW}!{RESET} {msg}")


def bad(msg: str) -> None:
    log(f"  {RED}✗{RESET} {msg}")


def good(msg: str) -> None:
    log(f"  {GREEN}✓{RESET} {msg}")


def die(msg: str, code: int = 2) -> None:
    log(f"{RED}错误：{msg}{RESET}")
    raise SystemExit(code)


def run(cmd: list[str], quiet: bool = False, check: bool = True,
        timeout: float = 1800.0) -> subprocess.CompletedProcess:
    """跑一条外部命令。quiet=True 时不把子进程输出透传到终端（但仍捕获，失败时打印）。

    `timeout` 不是摆设：实测遇到过一次 `mix_bgm` 里的 ffmpeg 卡死（文件写到 256KB 就不动了），
    因为 subprocess 没有超时，整条流水线静静地挂在那一动不动 11 分钟 —— 没有任何输出，
    看起来和"正在渲染"一模一样。宁可超时报错，也不要静默地挂着。
    """
    if not quiet:
        log(f"{DIM}$ {' '.join(cmd)}{RESET}")
    try:
        proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=quiet, text=True,
                              timeout=timeout)
    except subprocess.TimeoutExpired:
        die(f"命令超过 {timeout:.0f}s 没结束，已中止（可能有子进程卡死）：{' '.join(cmd)}")
        raise  # 让类型检查满意；die() 不会返回
    if check and proc.returncode != 0:
        if quiet and proc.stdout:
            log(proc.stdout[-4000:])
        if quiet and proc.stderr:
            log(proc.stderr[-4000:])
        die(f"命令失败（退出码 {proc.returncode}）：{' '.join(cmd)}")
    return proc


def have(name: str) -> bool:
    return shutil.which(name) is not None


def py_for_tts() -> str:
    """配音要用装了 edge-tts 的解释器：优先项目 venv，其次当前解释器。"""
    venv = ROOT / ".venv" / "bin" / "python"
    if venv.exists():
        return str(venv)
    return sys.executable


def remotion_cmd(args: list[str]) -> list[str]:
    """优先用本地 bin（省掉 npx 的解析开销），没有才退回 npx。"""
    local = ROOT / "node_modules" / ".bin" / "remotion"
    return [str(local), *args] if local.exists() else ["npx", "remotion", *args]


def rel(path: Path) -> str:
    """尽量给出相对项目根的路径；在项目外就退回绝对路径。"""
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def sync_assets() -> list[str]:
    """把 assets/ 里需要被画面代码读取的素材同步到 public/。

    为什么必须做这一步：Remotion 的 staticFile() 只能读 public/ 目录，
    而 sfx / logo 这类素材的"正本"放在 assets/（剪辑路线 vedit.py 也从这里取）。
    两边都要用，就必须有一份在 public/。这里做增量同步（大小或时间戳不同才拷），
    并且只拷贝白名单目录，免得把 assets/raw 里的原始素材也搬进 public/。
    """
    synced: list[str] = []
    for sub in ("sfx", "fonts"):
        src_dir = ROOT / "assets" / sub
        if not src_dir.is_dir():
            continue
        dst_dir = ROOT / "public" / sub
        for f in sorted(src_dir.iterdir()):
            if not f.is_file() or f.name.startswith("."):
                continue
            dst = dst_dir / f.name
            if dst.exists() and dst.stat().st_size == f.stat().st_size \
                    and dst.stat().st_mtime >= f.stat().st_mtime:
                continue
            dst_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dst)
            synced.append(f"public/{sub}/{f.name}")
    return synced


def read_config() -> dict:
    """从 src/config.ts 读全片规格 —— 它是宽高/帧率的唯一真相，别在 CLI 里再写死一份。"""
    txt = ""
    cfg = ROOT / "src" / "config.ts"
    if cfg.exists():
        txt = cfg.read_text(encoding="utf-8")

    def num(name: str, default: int) -> int:
        m = re.search(rf"export\s+const\s+{name}\s*=\s*(-?\d+)", txt)
        return int(m.group(1)) if m else default

    return {
        "fps": num("FPS", 30),
        "width": num("WIDTH", 1920),
        "height": num("HEIGHT", 1080),
        "tail": num("TAIL_FRAMES", 0),
    }


def ffprobe_json(path: str | Path, entries: str) -> dict:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_entries", entries, str(path)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        return {}
    try:
        return json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        return {}


def media_summary(path: str | Path) -> dict:
    """成片规格摘要（时长/分辨率/帧率/编码/色彩/体积/有无音轨）。"""
    p = Path(path)
    if not p.exists():
        return {}
    data = ffprobe_json(p, "format=duration,size,bit_rate:stream=index,codec_type,codec_name,"
                           "width,height,r_frame_rate,pix_fmt,color_space,color_range,"
                           "sample_rate,channels")
    fmt = data.get("format", {})
    streams = data.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), {})
    a = next((s for s in streams if s.get("codec_type") == "audio"), {})
    rate = v.get("r_frame_rate", "0/1")
    try:
        num, den = (int(x) for x in rate.split("/"))
        fps = round(num / den, 3) if den else 0
    except (ValueError, ZeroDivisionError):
        fps = 0
    return {
        "path": str(p),
        "duration": float(fmt.get("duration") or 0),
        "size_mb": round(int(fmt.get("size") or 0) / 1e6, 2),
        "width": v.get("width"), "height": v.get("height"), "fps": fps,
        "vcodec": v.get("codec_name"), "pix_fmt": v.get("pix_fmt"),
        "color_space": v.get("color_space"), "color_range": v.get("color_range"),
        "acodec": a.get("codec_name"), "sample_rate": a.get("sample_rate"),
        "channels": a.get("channels"), "has_audio": bool(a),
    }


def run_validate(extra: list[str], quiet: bool) -> tuple[int, dict | None, str]:
    """跑静态校验器，返回 (退出码, JSON 结果, 原始输出)。"""
    cmd = [sys.executable, str(SCRIPTS / "validate.py"), *extra, "--json"]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    data = None
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        pass
    if not quiet:
        log(f"{DIM}$ {' '.join(cmd)}{RESET}")
    return proc.returncode, data, proc.stdout


def print_findings(data: dict | None, out: str = "") -> None:
    if not data:
        warn("校验器没有返回可解析的 JSON，请手动运行 scripts/validate.py")
        return
    for f in data.get("errors", []):
        bad(f"[{f['code']}] {f['message']}")
        if f.get("where"):
            log(f"      {DIM}{f['where']}{RESET}")
    for f in data.get("warnings", []):
        warn(f"[{f['code']}] {f['message']}")
    for f in data.get("info", []):
        if out and out not in str(f.get("where", "")):
            continue
        log(f"  {DIM}· {f['message']}{RESET}")
    n_e, n_w = len(data.get("errors", [])), len(data.get("warnings", []))
    if n_e:
        bad(f"{n_e} 个错误 / {n_w} 个警告")
    elif n_w:
        warn(f"0 错误 / {n_w} 个警告")
    else:
        good("校验通过：0 错误 0 警告")


def print_media(s: dict, title: str = "成片规格") -> None:
    if not s:
        warn("拿不到媒体信息")
        return
    log(f"\n{title}：")
    log(f"  路径      {s['path']}")
    log(f"  时长      {s['duration']:.3f}s   体积 {s['size_mb']} MB")
    log(f"  画面      {s['width']}x{s['height']} @ {s['fps']}fps  {s['vcodec']}  {s['pix_fmt']}")
    log(f"  色彩      {s['color_space']} / {s['color_range']}"
        + ("" if s["color_space"] == "bt709" and s["color_range"] == "tv"
           else f"   {RED}← 应为 bt709 / tv{RESET}"))
    if s["has_audio"]:
        log(f"  音频      {s['acodec']}  {s['sample_rate']}Hz  {s['channels']}ch")
    else:
        log(f"  音频      {RED}无音轨{RESET}")


# --------------------------------------------------------------------------- #
# doctor：环境 + 工程 + 成片规格，一次问清
# --------------------------------------------------------------------------- #
def cmd_doctor(args: argparse.Namespace) -> int:
    problems: list[str] = []
    log(f"{GREEN}web-video-produce :: doctor{RESET}")
    log(f"{DIM}项目 {ROOT}{RESET}")

    # ---- 1. 运行时环境（复用 check_env.sh，那是唯一的环境检查实现） ----
    step(1, 3, "环境自检（check_env.sh）")
    script = SCRIPTS / "check_env.sh"
    if not script.exists():
        bad("找不到 scripts/check_env.sh")
        problems.append("check_env.sh 缺失")
    else:
        proc = subprocess.run(["bash", str(script)], cwd=str(ROOT),
                              capture_output=True, text=True)
        text = ANSI.sub("", proc.stdout or "")
        log(text.rstrip())
        m = re.search(r"(\d+)\s*通过.*?(\d+)\s*警告.*?(\d+)\s*缺失", text)
        if m:
            n_ok, n_warn, n_fail = (int(x) for x in m.groups())
            if n_fail:
                problems.append(f"环境缺失 {n_fail} 项")
            if n_ok + n_warn + n_fail and n_warn:
                warn(f"环境有 {n_warn} 项警告（不一定阻塞，但要知道）")
        else:
            warn("没能解析环境自检的结果行（check_env.sh 输出格式变了？）")

    # ---- 2. 工程静态校验（确定性/时间轴/素材/字体） ----
    step(2, 3, "工程静态校验（validate.py）")
    # 先同步 assets/ → public/（sfx 等），否则静态校验会误报"素材缺失"。
    # doctor 是只读体检，这里的同步是幂等的增量拷贝，不改动 assets/ 里的正本。
    synced = sync_assets()
    if synced:
        log(f"  {DIM}· 已同步素材到 public/：{', '.join(synced)}{RESET}")
    code, data, _ = run_validate([], args.fast)
    print_findings(data)
    if code != 0:
        problems.append("静态校验有错误")

    # ---- 3. 成片规格（如果已经出过片就直接量） ----
    step(3, 3, "成片规格与响度")
    target = args.out or ""
    if not target:
        cands = sorted((ROOT / "output").glob("*.mp4"),
                       key=lambda p: p.stat().st_mtime, reverse=True)
        target = str(cands[0]) if cands else ""
    if target and Path(target).exists():
        code2, data2, _ = run_validate(["--out", target], args.fast)
        print_findings(data2, out=target)
        if code2 != 0:
            problems.append("成片规格不合规")
        print_media(media_summary(target))
    else:
        warn("还没有成片（output/ 下没有 mp4），跳过。先跑：python3 scripts/wvp.py render")

    # ---- 可选：抽帧预览，用眼睛确认画面 ----
    if args.preview > 0:
        log(f"\n{GREEN}== 抽帧预览（{args.preview} 帧）{RESET}")
        made = preview_frames(target, args.preview, args.comp)
        for f in made:
            good(f)
        if made:
            log(f"\n{args.preview} 张图在 output/preview/，用图像查看能力打开确认"
                f"（中文不是豆腐块、没裁切、对比度够）")

    log("")
    if problems:
        bad(f"doctor 结果：{len(problems)} 个阻塞问题 → " + "；".join(problems))
        return 1
    good("doctor 结果：全部通过，可以开拍")
    return 0

def preview_frames(mp4: str, count: int, comp: str) -> list[str]:
    """抽帧预览：有 mp4 就从 mp4 里均匀抽；没有就向 Remotion 要静帧。"""
    outdir = ROOT / "output" / "preview"
    outdir.mkdir(parents=True, exist_ok=True)
    made: list[str] = []
    if mp4 and Path(mp4).exists():
        dur = media_summary(mp4).get("duration") or 0
        if dur <= 0:
            warn("拿不到成片时长，无法抽帧")
            return made
        for i in range(count):
            t = dur * (i + 0.5) / count
            out = outdir / f"frame_{int(t * 1000):07d}ms.jpg"
            proc = subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", mp4,
                 "-frames:v", "1", "-q:v", "3", str(out)],
                capture_output=True, text=True)
            if proc.returncode == 0 and out.exists():
                made.append(f"{out.relative_to(ROOT)}  (t={t:.2f}s)")
        # 拼一张联系表（contact sheet），一眼看完整条片子的节奏
        if len(made) > 1:
            sheet = outdir / "contact_sheet.jpg"
            proc = subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", mp4, "-vf",
                 f"fps={max(1, count / max(dur, 1))},scale=480:-1,tile=4x2",
                 "-frames:v", "1", str(sheet)],
                capture_output=True, text=True)
            if proc.returncode == 0 and sheet.exists():
                made.append(f"output/preview/contact_sheet.jpg  (联系表)")
    else:
        cfg = read_config()
        for i in range(count):
            frame = int(cfg["fps"] * 2 * (i + 1))
            out = outdir / f"still_{frame:05d}.png"
            run(remotion_cmd(["still", "src/index.ts", comp, str(out), f"--frame={frame}"]),
                quiet=True)
            if out.exists():
                made.append(f"{out.relative_to(ROOT)}  (frame={frame})")
    return made


# --------------------------------------------------------------------------- #
# timeline：时间轴对齐检查
# --------------------------------------------------------------------------- #
def load_timeline(voice_dir: Path) -> tuple[dict, dict | None]:
    mf = voice_dir / "manifest.json"
    if not mf.exists():
        die(f"找不到 {mf}，先跑一次配音：python3 scripts/wvp.py render"
            f"（只出配音不渲染时可以加 --scale 0.5 --frames 0-60 先看样片）")
    manifest = json.loads(mf.read_text(encoding="utf-8"))
    words = None
    wf = voice_dir / "words.json"
    if wf.exists():
        try:
            words = json.loads(wf.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            warn(f"{wf} 不是合法 JSON，忽略词级时间戳")
    return manifest, words


def timeline_checks(manifest: dict, words: dict | None) -> list[str]:
    """时间轴不变量检查。返回问题列表（空 = 全对）。"""
    problems: list[str] = []
    segs = manifest.get("segments", [])
    cfg = read_config()
    if manifest.get("fps") != cfg["fps"]:
        problems.append(f"manifest.fps={manifest.get('fps')} 与 src/config.ts 的 FPS={cfg['fps']} 不一致"
                        f"（重新跑配音时要带 --fps {cfg['fps']}）")
    if not segs:
        problems.append("manifest.segments 为空")
        return problems

    prev_end = 0.0
    for i, s in enumerate(segs):
        if s["start"] < prev_end - 1e-6:
            problems.append(f"第 {i} 段 [{s['id']}] start={s['start']} 早于上一段结束 {prev_end:.3f}（字幕会重叠）")
        if s["duration"] <= 0:
            problems.append(f"第 {i} 段 [{s['id']}] 时长为 {s['duration']}")
        if s["duration_frames"] < 1:
            problems.append(f"第 {i} 段 [{s['id']}] 不足一帧，渲染时会被吞掉")
        prev_end = s["end"]
    total = float(manifest.get("total_duration") or 0)
    if prev_end > total + 0.05:
        problems.append(f"最后一段结束 {prev_end:.3f}s 超过音轨总长 {total:.3f}s")
    if abs(manifest.get("total_frames", 0) - round(total * manifest.get("fps", 30))) > 1:
        problems.append("total_frames 与 total_duration×fps 不一致")

    if words and words.get("precision") == "word":
        ws = words.get("words", [])
        spans = {s["id"]: (s["start_frame"], s["start_frame"] + s["duration_frames"]) for s in segs}
        prev = -1.0
        outside = 0
        for w in ws:
            if w["start"] < prev - 1e-6:
                problems.append(f"词「{w['text']}」时间回跳（{w['start']} < {prev:.3f}）")
            prev = w["end"]
            span = spans.get(w.get("segment"))
            if span and not (span[0] - 2 <= w["start_frame"] <= span[1] + 2):
                outside += 1
        if outside:
            problems.append(f"有 {outside} 个词的时间戳落在所属段之外")
        if words.get("word_count") != len(ws):
            problems.append("words.json 的 word_count 与 words 数组长度不符")
    return problems


def cmd_timeline(args: argparse.Namespace) -> int:
    voice_dir = Path(args.voice_dir)
    if not voice_dir.is_absolute():
        voice_dir = ROOT / voice_dir
    manifest, words = load_timeline(voice_dir)
    segs = manifest.get("segments", [])
    fps = manifest.get("fps", 30)
    cfg = read_config()
    problems = timeline_checks(manifest, words)

    if args.json:
        log(json.dumps({
            "ok": not problems, "problems": problems,
            "fps": fps, "mode": manifest.get("mode", "segment"),
            "total_duration": manifest.get("total_duration"),
            "total_frames": manifest.get("total_frames"),
            "word_precision": (words or {}).get("precision", "none"),
            "word_count": (words or {}).get("word_count", 0),
            "segments": [
                {"id": s["id"], "index": i, "start": s["start"], "end": s["end"],
                 "start_frame": s["start_frame"], "duration_frames": s["duration_frames"],
                 "text": s["text"],
                 "gap_ms": round((segs[i + 1]["start"] - s["end"]) * 1000)
                 if i + 1 < len(segs) else None}
                for i, s in enumerate(segs)
            ],
        }, ensure_ascii=False, indent=2))
        return 1 if problems else 0

    log(f"{GREEN}web-video-produce :: timeline{RESET}")
    log(f"{DIM}来源 {rel(voice_dir)}  模式 {manifest.get('mode', 'segment')}  "
        f"声音 {manifest.get('voice')}{RESET}")
    log(f"总长 {manifest.get('total_duration')}s / {manifest.get('total_frames')} 帧 @{fps}fps"
        f"   视频工程 fps={cfg['fps']}"
        + (f"  {RED}← 不一致{RESET}" if fps != cfg["fps"] else f"  {GREEN}一致{RESET}"))
    log(f"字幕 {manifest.get('srt')}   音轨 {manifest.get('audio')}")

    log(f"\n{'#':<4}{'id':<10}{'起':>8}{'止':>9}{'帧起':>7}{'帧数':>7}{'后停顿':>9}  文本")
    log("-" * 96)
    for i, s in enumerate(segs):
        gap = (segs[i + 1]["start"] - s["end"]) * 1000 if i + 1 < len(segs) else None
        gap_s = f"{gap:.0f}ms" if gap is not None else "—"
        text = s["text"][:26] + ("…" if len(s["text"]) > 26 else "")
        log(f"{i:<4}{s['id']:<10}{s['start']:>8.3f}{s['end']:>9.3f}"
            f"{s['start_frame']:>7}{s['duration_frames']:>7}{gap_s:>9}  {text}")

    if words and words.get("precision") == "word":
        ws = words["words"]
        log(f"\n词级时间戳 {len(ws)} 词（words.json，可用于卡拉OK 高亮）")
        if args.words:
            log(f"\n{'#':<4}{'词':<8}{'起':>8}{'止':>9}{'帧起':>7}{'帧数':>7}  段")
            log("-" * 60)
            for i, w in enumerate(ws):
                log(f"{i:<4}{w['text']:<8}{w['start']:>8.3f}{w['end']:>9.3f}"
                    f"{w['start_frame']:>7}{w['duration_frames']:>7}  {w.get('segment')}")
        else:
            n = args.limit
            head = ws[: max(1, n // 2)]
            tail = ws[-max(1, n // 2):] if len(ws) > len(head) else []
            for w in head:
                log(f"  {w['text']:<8}{w['start']:>8.3f} → {w['end']:.3f}  ({w.get('segment')})")
            if tail:
                log(f"  {DIM}… 省略 {len(ws) - len(head) - len(tail)} 词（--words 看全部）{RESET}")
                for w in tail:
                    log(f"  {w['text']:<8}{w['start']:>8.3f} → {w['end']:.3f}  ({w.get('segment')})")
    elif words:
        log(f"\n词级时间戳：{DIM}precision={words.get('precision')}"
            f"（{words.get('note', '当前引擎拿不到词边界')}）{RESET}")
    else:
        log(f"\n词级时间戳：{DIM}没有 words.json（旧版本产物，重跑一次配音即可生成）{RESET}")

    if args.verify_audio:
        log(f"\n{GREEN}== 音画对齐实测（解码音轨，量每个词窗的电平）{RESET}")
        problems += verify_audio(voice_dir, manifest, words or {})

    log("")
    if problems:
        for p in problems:
            bad(p)
        log(f"\n{RED}时间轴检查失败：{len(problems)} 个问题{RESET}")
        return 1
    good("时间轴检查通过：段单调、无重叠、词级时间戳自洽")
    return 0


def verify_audio(voice_dir: Path, manifest: dict, words: dict) -> list[str]:
    """实测音画对齐：解码音轨 → 量每个词窗的 RMS。

    这是"字幕/卡拉OK 到底准不准"的**唯一可信证据**：光看 JSON 只能证明数组自洽，
    只有回到音频上量能量，才能证明时间戳真的压在语音上、而不是压在静音里。
    段间停顿处应当接近静音，词窗内应当有明显的语音能量 —— 两者都对才算过关。
    """
    problems: list[str] = []
    audio = voice_dir / manifest.get("audio", "vo.mp3")
    if not audio.exists():
        return [f"找不到音轨 {audio}，无法验证音画对齐"]
    ws = words.get("words") or []
    if not ws:
        warn("没有词级时间戳（precision != word），跳过逐词对齐检查")
        return problems

    SR = 8000
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(audio), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True).stdout
    samples = struct.unpack(f"<{len(raw) // 2}h", raw[: len(raw) // 2 * 2])
    if not samples:
        return ["解码音轨失败，无法验证音画对齐"]

    def db(a: float, b: float) -> float:
        """词窗内的 RMS 电平（dBFS）。窗口很短的词按比例缩小边缘裁剪，避免自伤。"""
        trim = min(0.03, max(0.0, (b - a) * 0.25))
        i0, i1 = max(0, int((a + trim) * SR)), min(len(samples), int((b - trim) * SR))
        if i1 <= i0:
            i0, i1 = max(0, int(a * SR)), min(len(samples), max(i0 + 1, int(b * SR)))
        if i1 <= i0:
            return -120.0
        seg = samples[i0:i1]
        rms = math.sqrt(sum(float(x) * x for x in seg) / len(seg))
        return 20 * math.log10(rms / 32768.0) if rms > 0 else -120.0

    levels = [db(w["start"], w["end"]) for w in ws]
    voiced = sorted(levels)
    median = voiced[len(voiced) // 2]
    floor = median - 22                       # 比中位数低 22dB 就算"压在静音上"
    silent_words = [(w, l) for w, l in zip(ws, levels) if l <= floor]
    log(f"  解码 {len(samples) / SR:.2f}s @ {SR}Hz，词窗中位电平 {median:.1f} dBFS"
        f"（静音阈值 {floor:.1f}）")
    log(f"  词窗落在语音上：{len(ws) - len(silent_words)}/{len(ws)}")
    for w, l in silent_words[:8]:
        bad(f"词「{w['text']}」t={w['start']:.3f}s 电平只有 {l:.1f} dBFS（疑似对轴偏了）")
    if silent_words:
        problems.append(f"{len(silent_words)} 个词的时间戳没有压在语音上")

    # 段间停顿应当接近静音：这是"停顿真的插进去了"的反向证据
    segs = manifest.get("segments", [])
    for i in range(len(segs) - 1):
        a, b = segs[i]["end"], segs[i + 1]["start"]
        if b - a < 0.15:
            continue
        mid = (a + b) / 2
        lv = db(mid - 0.05, mid + 0.05)
        if lv > median - 6:
            warn(f"第 {i}→{i + 1} 段的停顿中点电平 {lv:.1f} dBFS（与语音相当，"
                 f"停顿可能没插进去或 BGM 太响）")
    return problems


# --------------------------------------------------------------------------- #
# render：配音 → 渲染 → 合成 → 验收
# --------------------------------------------------------------------------- #
def synth_voice(args: argparse.Namespace, script: str, fps: int, outdir: Path) -> None:
    cmd = [py_for_tts(), str(SCRIPTS / "tts_edge.py"),
           "--script", script, "--outdir", str(outdir),
           "--fps", str(fps), "--voice", args.voice, "--rate", args.rate]
    if args.bgm:
        cmd += ["--bgm", args.bgm]
    else:
        cmd += ["--no-bgm"]
    if args.normalize:
        cmd += ["--normalize", "--loudness-target", args.loudness_target]
    if args.no_words:
        cmd += ["--no-words"]
    run(cmd)


def render_video(args: argparse.Namespace, out: Path, fps: int) -> None:
    cfg = read_config()
    cmd = remotion_cmd(["render", "src/index.ts", args.comp, str(out),
                        "--codec=h264", f"--crf={args.crf}",
                        "--pixel-format=yuv420p",
                        # 不传 --color-space 的话 Remotion 不写 -color_range/-colorspace，
                        # ffmpeg 会落成 full-range(BT.601)，平台转码时颜色会漂
                        "--color-space=bt709",
                        f"--concurrency={args.concurrency}"])
    if args.gl:
        cmd.append(f"--gl={args.gl}")
    if args.scale and args.scale != 1:
        cmd.append(f"--scale={args.scale}")
    if args.frames:
        cmd.append(f"--frames={args.frames}")
    if args.fast:
        cmd.append("--log=error")
    log(f"{DIM}画面 {cfg['width']}x{cfg['height']} @ {fps}fps{RESET}")
    run(cmd, quiet=args.fast)


def ensure_audio(path: Path, args: argparse.Namespace, voice_dir: Path) -> None:
    """渲染产物必须带音轨。没有就自动补一次混流，绝不让用户拿到"哑巴成片"。"""
    info = media_summary(path)
    if info.get("has_audio") and not args.force_mux:
        good(f"成片自带音轨（{info['acodec']} {info['sample_rate']}Hz）")
        return
    if not info.get("has_audio"):
        warn("渲染产物没有音轨（场景里可能没写 <Audio>）→ 自动混入配音")
    vo = voice_dir / "vo.mp3"
    if not vo.exists():
        die(f"找不到配音 {vo}，无法补音轨")
    tmp = path.with_name(path.stem + ".mux.mp4")
    cmd = ["bash", str(SCRIPTS / "mux.sh"), "--video", str(path), "--audio", str(vo),
           "--out", str(tmp)]
    if args.subs:
        cmd += ["--subs", args.subs]
    if args.loudnorm:
        cmd += ["--loudnorm"]
    run(cmd, quiet=args.fast)
    if not tmp.exists():
        die("混流没有产出文件")
    tmp.replace(path)
    good("已混入配音音轨")


def one_render(args: argparse.Namespace, script: str, out: Path, index: int, total: int) -> dict:
    cfg = read_config()
    fps = cfg["fps"]
    voice_dir = ROOT / args.voice_dir
    label = f"({index}/{total}) {Path(script).name}" if total > 1 else Path(script).name
    log(f"\n{'=' * 78}\n{GREEN}▶ {label}{RESET}  →  {out.relative_to(ROOT)}")

    if not args.no_tts:
        step(1, 4, "配音与时间轴（tts_edge.py）")
        synth_voice(args, script, fps, voice_dir)
    else:
        step(1, 4, "配音与时间轴（--no-tts，复用现有产物）")
        if not (voice_dir / "manifest.json").exists():
            die(f"用了 --no-tts 但 {voice_dir}/manifest.json 不存在")

    manifest, words = load_timeline(voice_dir)
    problems = timeline_checks(manifest, words)
    if problems:
        for p in problems:
            bad(p)
        die("时间轴检查没过，先修再渲染（不要浪费一次全片渲染）")
    good(f"时间轴 OK：{manifest['total_duration']}s / {manifest['total_frames']} 帧 @{manifest['fps']}fps"
         + (f"，{words['word_count']} 词" if words and words.get("precision") == "word" else ""))

    if args.precheck:
        # 静态校验会检查 staticFile() 引用的素材是否真的在 public/ 下，
        # 所以必须先同步（assets/sfx → public/sfx），否则会误报"素材缺失"。
        synced = sync_assets()
        if synced:
            good(f"同步素材到 public/：{', '.join(synced)}")
        code, data, _ = run_validate([], args.fast)
        if code != 0:
            print_findings(data)
            die("静态校验没过，先修再渲染")
        good("静态校验 OK（确定性/素材/字体）")

    step(2, 4, "渲染画面（Remotion）")
    t0 = time.time()
    render_video(args, out, fps)
    if not out.exists():
        die(f"渲染没有产出 {out}")
    good(f"渲染完成，用时 {time.time() - t0:.1f}s")

    step(3, 4, "音轨与封装")
    ensure_audio(out, args, voice_dir)

    step(4, 4, "验收（规格 + 响度 + 色彩）")
    code, data, _ = run_validate(["--out", str(out)], args.fast)
    print_findings(data, out=str(out))
    info = media_summary(out)
    print_media(info)
    if info.get("color_space") != "bt709" or info.get("color_range") != "tv":
        bad("色彩空间不是 bt709/tv —— 上传平台会漂色，检查 --color-space=bt709 是否被丢掉")
    return {"script": script, "out": str(out.relative_to(ROOT)), **info,
            "ok": code == 0 and info.get("color_space") == "bt709"}


def cmd_render(args: argparse.Namespace) -> int:
    cfg = read_config()
    log(f"{GREEN}web-video-produce :: render{RESET}")
    log(f"{DIM}工程 {cfg['width']}x{cfg['height']} @{cfg['fps']}fps   "
        f"声音 {args.voice}  语速 {args.rate or '默认'}{RESET}")

    scripts: list[str] = []
    if args.batch:
        for item in args.batch:
            p = Path(item)
            if p.is_dir():
                scripts += sorted(globmod.glob(str(p / "*.json")))
            elif any(ch in item for ch in "*?["):
                scripts += sorted(globmod.glob(item))
            else:
                scripts.append(item)
        if not scripts:
            die(f"--batch 没有匹配到任何脚本：{args.batch}")
        if len(scripts) > 1 and not args.yes:
            log(f"\n{YELLOW}批量渲染 {len(scripts)} 个脚本，逐个覆盖 public/voice。{RESET}")
            log("注意：批量只对『画面由段 id 驱动』的工程成立 —— 每个脚本必须用同一套 id，"
                "否则场景切不对。")
    else:
        scripts = [args.script]

    results = []
    for i, s in enumerate(scripts, 1):
        if not Path(s).exists():
            die(f"脚本不存在：{s}")
        if len(scripts) > 1:
            out = ROOT / "output" / (Path(s).stem + ".mp4")
        else:
            out = Path(args.out)
            if not out.is_absolute():
                out = ROOT / out
        out.parent.mkdir(parents=True, exist_ok=True)
        results.append(one_render(args, s, out, i, len(scripts)))

    log(f"\n{'=' * 78}")
    if len(results) > 1:
        log(f"{GREEN}批量完成：{len(results)} 条{RESET}")
        log(f"{'脚本':<28}{'成片':<26}{'时长':>8}{'体积':>9}  色彩")
        for r in results:
            ok = f"{GREEN}bt709{RESET}" if r.get("color_space") == "bt709" else f"{RED}{r.get('color_space')}{RESET}"
            log(f"{Path(r['script']).name:<28}{Path(r['out']).name:<26}"
                f"{r['duration']:>7.2f}s{r['size_mb']:>8.2f}M  {ok}")
    else:
        r = results[0]
        good(f"出片完成 → {r['out']}")
        for f in (r["out"],):
            if Path(f).exists():
                present_hint = f
                log(f"  预览：{present_hint}")
    failed = [r for r in results if not r.get("ok")]
    if failed:
        bad(f"{len(failed)} 条没有全绿，看上面的校验输出")
        return 1
    good("全部验收通过")
    return 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(
        prog="wvp",
        description="web-video-produce 统一入口：doctor / render / timeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""示例：
  python3 scripts/wvp.py doctor                      # 开工前问一次环境与工程
  python3 scripts/wvp.py doctor --preview 6          # 顺手抽 6 帧看看画面
  python3 scripts/wvp.py timeline --words            # 检查段/帧/词对齐
  python3 scripts/wvp.py timeline --verify-audio     # 回到音频上实测音画是否对得上
  python3 scripts/wvp.py render                      # 一条命令出片（默认脚本 + 默认输出）
  python3 scripts/wvp.py render --scale 0.5 --frames 0-60   # 先出 2 秒半分辨率样片
  python3 scripts/wvp.py render --batch examples/*.json     # 批量出片
""")
    sub = ap.add_subparsers(dest="cmd", required=True, metavar="<命令>")

    d = sub.add_parser("doctor", help="环境自检 + 工程静态校验（+ 可选抽帧预览）")
    d.add_argument("--out", default="", help="指定要核验的成片（默认自动取 output/ 下最新的 mp4）")
    d.add_argument("--preview", type=int, default=0, metavar="N",
                   help="抽 N 帧到 output/preview/ 供肉眼确认（有 mp4 就抽 mp4，没有就渲染静帧）")
    d.add_argument("--comp", default="WebVideo", help="抽静帧用的 Composition id（默认 WebVideo）")
    d.add_argument("--fast", action="store_true", help="少打印子进程输出")
    d.set_defaults(func=cmd_doctor)

    t = sub.add_parser("timeline", help="时间轴对齐检查（段/帧/词）")
    t.add_argument("--voice-dir", default="public/voice", help="配音产物目录（默认 public/voice）")
    t.add_argument("--words", action="store_true", help="逐词打印（默认只显示首尾几个）")
    t.add_argument("--limit", type=int, default=8, help="不打印全部词时显示几个（默认 8）")
    t.add_argument("--verify-audio", action="store_true",
                   help="解码音轨实测每个词窗的电平（证明时间戳真的压在语音上）")
    t.add_argument("--json", action="store_true", help="输出机器可读 JSON")
    t.set_defaults(func=cmd_timeline)

    r = sub.add_parser("render", help="一条命令出片：配音 → 渲染 → 合成 → 验收")
    r.add_argument("--script", default="examples/script.intro10s.json", help="分段脚本 JSON")
    r.add_argument("--out", default="output/final.mp4", help="输出成片路径")
    r.add_argument("--comp", default="WebVideo", help="Remotion Composition id")
    r.add_argument("--voice-dir", default="public/voice", help="配音产物目录")
    r.add_argument("--voice", default="zh-CN-XiaoxiaoNeural", help="edge-tts 声音")
    r.add_argument("--rate", default="+0%", help="语速（+5%% 以内最自然）")
    r.add_argument("--bgm", default="assets/bgm.mp3", help="背景配乐（不存在则跳过）")
    r.add_argument("--no-bgm", dest="bgm", action="store_const", const="",
                   help="本条不要背景配乐")
    r.add_argument("--normalize", action="store_true", default=True,
                   help="响度归一（默认开）")
    r.add_argument("--no-normalize", dest="normalize", action="store_false")
    r.add_argument("--loudness-target", choices=["social", "podcast", "broadcast"],
                   default="podcast", help="响度目标：social=-14 / podcast=-16 / broadcast=-23 LUFS")
    r.add_argument("--no-words", action="store_true", help="不生成词级时间戳")
    r.add_argument("--no-tts", action="store_true", help="跳过配音，复用现有 public/voice")
    r.add_argument("--no-precheck", dest="precheck", action="store_false", default=True,
                   help="跳过渲染前的静态校验（不推荐）")
    r.add_argument("--crf", type=int, default=18, help="H.264 CRF（18 近无损，23 常规）")
    r.add_argument("--concurrency", type=int, default=4, help="渲染并发（默认 4 ≈ CPU 核数）")
    r.add_argument("--scale", type=float, default=1.0, help="缩放比例，0.5 = 半分辨率试片")
    r.add_argument("--frames", default="", help='只渲一段，如 "0-60"')
    r.add_argument("--gl", default="", choices=["", "angle", "swangle", "egl", "swiftshader"],
                   help="WebGL 渲染器（Three.js 场景必须 angle）")
    r.add_argument("--subs", default="", help="额外烧进画面的字幕 SRT")
    r.add_argument("--loudnorm", action="store_true", help="补音轨时再做一次响度归一")
    r.add_argument("--force-mux", action="store_true", help="即使成片已有音轨也重新混流")
    r.add_argument("--batch", nargs="+", metavar="脚本或目录", help="批量出片（注意段 id 必须一致）")
    r.add_argument("--yes", action="store_true", help="批量时不打印提醒")
    r.add_argument("--fast", action="store_true", help="少打印（子进程输出不刷屏）")
    r.set_defaults(func=cmd_render)

    args = ap.parse_args()
    if not have("ffmpeg") or not have("ffprobe"):
        die("没找到 ffmpeg/ffprobe，先装：sudo apt install ffmpeg")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
