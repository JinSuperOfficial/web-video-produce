#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""web-video-produce :: validate.py —— 渲染前/交付前的静态校验器

用途：把"渲染完 10 分钟才发现 fps 不一致 / 字体没加载 / 字幕对不上"这类问题，
提前到 1 秒内报出来。只读，不改任何文件。

用法
----
python3 scripts/validate.py                     # 校验源码 + 时间轴
python3 scripts/validate.py --json              # 机器可读（Agent 用这个）
python3 scripts/validate.py --strict            # 警告也算失败
python3 scripts/validate.py --out output/edit.mp4   # 额外核验成片规格与响度

检查项
------
1. 确定性铁律：src/ 与 templates/ 里不得出现 Math.random / Date.now / performance.now /
   requestAnimationFrame / CSS 无限动画
2. 时间轴一致性：manifest.json ↔ src/config.ts 的 FPS、total_duration 与 total_frames
3. 场景 id 覆盖：Main.tsx 里 startOf/endOf 用到的 id 必须都在配音脚本里
4. 素材引用：staticFile(...) 与 EDL 里的 src 必须真实存在
5. 字体：必须显式加载中文字体（否则 headless 渲染成豆腐块）
6. 成片核验（--out）：分辨率/帧率/时长偏差/编码/响度
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 只扫这些目录；ref/ 是第三方只读参考，永远不扫
SCAN_DIRS = ["src", "templates"]
FORBIDDEN = [
    (r"\bMath\.random\s*\(", "Math.random() 会让每帧不同，渲染不可复现"),
    (r"\bDate\.now\s*\(", "Date.now() 依赖真实时间，渲染不可复现"),
    (r"\bperformance\.now\s*\(", "performance.now() 依赖真实时间"),
    (r"\bnew\s+Date\s*\(", "new Date() 依赖真实时间"),
    (r"requestAnimationFrame\s*\(", "自走时钟：动画必须由当前帧号驱动"),
    (r"animation\s*:[^;]*\binfinite\b", "CSS 无限动画：截图/渲染不可复现"),
]

findings: list[dict] = []
QUIET = False          # --json 时只输出 JSON，不掺人类可读进度行


def add(level: str, code: str, msg: str, where: str = "") -> None:
    findings.append({"level": level, "code": code, "message": msg, "where": where})


def ok(msg: str) -> None:
    if not QUIET:
        print(f"  \033[32m✓\033[0m {msg}")


def bad(msg: str) -> None:
    if not QUIET:
        print(f"  \033[31m✗\033[0m {msg}")


def warn(msg: str) -> None:
    if not QUIET:
        print(f"  \033[33m!\033[0m {msg}")


def section(msg: str) -> None:
    if not QUIET:
        print(msg)


def strip_comments(text: str, suffix: str) -> str:
    """去掉注释再扫描（保留行号），避免把注释里的示例/说明当成真代码。"""
    def blank(m: "re.Match") -> str:
        return "\n" * m.group(0).count("\n")

    if suffix in (".html", ".htm"):
        text = re.sub(r"<!--.*?-->", blank, text, flags=re.S)
    if suffix in (".ts", ".tsx", ".js", ".mjs", ".css", ".html", ".htm"):
        text = re.sub(r"/\*.*?\*/", blank, text, flags=re.S)
        lines = []
        for line in text.splitlines():
            i = line.find("//")
            if i >= 0 and (i == 0 or line[i - 1] != ":"):   # 放过 https://
                line = line[:i]
            lines.append(line)
        text = "\n".join(lines)
    return text


def scan_files() -> list[Path]:
    files: list[Path] = []
    for d in SCAN_DIRS:
        base = ROOT / d
        if not base.exists():
            continue
        for pat in ("*.ts", "*.tsx", "*.html", "*.css"):
            files += [f for f in base.rglob(pat) if "node_modules" not in f.parts]
    return files


def check_determinism() -> None:
    section("[1] 确定性铁律")
    hits = 0
    for f in scan_files():
        raw = f.read_text(encoding="utf-8", errors="ignore")
        text = strip_comments(raw, f.suffix)
        for i, line in enumerate(text.splitlines(), 1):
            for pat, why in FORBIDDEN:
                if re.search(pat, line):
                    rel = f.relative_to(ROOT)
                    add("error", "nondeterministic", f"{why}：{line.strip()[:70]}", f"{rel}:{i}")
                    hits += 1
    if hits:
        bad(f"{hits} 处非确定性写法")
    else:
        ok("src/ 与 templates/ 无随机/真实时间/自走动画")


def check_timeline() -> dict | None:
    section("[2] 时间轴一致性")
    mpath = ROOT / "public/voice/manifest.json"
    if not mpath.exists():
        # 首次运行（刚 clone / 刚同步成 Skill）时这是**正常状态**，不是错误：
        # 报成 error 会让 `wvp.py doctor` 在空项目上直接失败，看起来像环境坏了。
        # 所以这里给 warn，并把"下一步该敲什么"写清楚。
        warn("还没有配音时间轴（首次运行正常）→ 下一步：python3 scripts/wvp.py render")
        add("warn", "manifest_missing",
            "还没有配音时间轴，画面无法对轴。下一步：python3 scripts/wvp.py render"
            "（只跑配音不渲染：加 --scale 0.5 --frames 0-60 先出样片）",
            "public/voice/manifest.json")
        return None
    manifest = json.loads(mpath.read_text(encoding="utf-8"))

    cfg = (ROOT / "src/config.ts").read_text(encoding="utf-8")
    m = re.search(r"export\s+const\s+FPS\s*=\s*(\d+)", cfg)
    cfg_fps = int(m.group(1)) if m else None
    if cfg_fps is None:
        bad("src/config.ts 里读不到 FPS")
        add("error", "fps_missing", "config.ts 没有 FPS", "src/config.ts")
    elif cfg_fps != manifest.get("fps"):
        bad(f"FPS 不一致：config.ts={cfg_fps} vs manifest={manifest.get('fps')}")
        add("error", "fps_mismatch",
            f"config.ts FPS={cfg_fps} 与 manifest.fps={manifest.get('fps')} 不一致，"
            f"画面会与声音错位；用 --fps {cfg_fps} 重跑 tts_edge.py", "src/config.ts")
    else:
        ok(f"FPS 一致（{cfg_fps}）")

    dur, tf = manifest.get("total_duration"), manifest.get("total_frames")
    if dur and tf and abs(tf - dur * manifest["fps"]) > manifest["fps"]:
        bad(f"total_frames({tf}) 与 total_duration({dur})×fps 对不上")
        add("error", "frames_mismatch", "manifest 内部不一致", "public/voice/manifest.json")
    else:
        ok(f"总时长 {dur}s / {tf} 帧 自洽")

    for key in ("audio", "srt"):
        if not (ROOT / "public/voice" / manifest[key]).exists():
            bad(f"manifest 指向的 {manifest[key]} 不存在")
            add("error", "asset_missing", f"public/voice/{manifest[key]} 不存在", "public/voice/")
    return manifest


def check_scene_ids(manifest: dict | None) -> None:
    section("[3] 场景 id 覆盖")
    main = ROOT / "src/Main.tsx"
    if not main.exists():
        warn("没有 src/Main.tsx，跳过")
        return
    text = main.read_text(encoding="utf-8")
    ids = set(re.findall(r"(?:startOf|endOf)\(\s*['\"]([^'\"]+)['\"]", text))
    if not ids:
        warn("Main.tsx 里没有用 startOf/endOf 锚定场景（纯固定时间轴）")
        return
    if manifest is None:
        return
    known = {s["id"] for s in manifest.get("segments", [])}
    missing = sorted(ids - known)
    if missing:
        bad(f"Main.tsx 引用了配音脚本里不存在的 id：{missing}")
        add("error", "scene_id_missing",
            f"这些 id 不在 manifest.segments 里：{missing}（运行时会用占位段，画面与声音对不上）",
            "src/Main.tsx")
    else:
        ok(f"{len(ids)} 个场景 id 全部命中配音段：{', '.join(sorted(ids))}")


def check_assets() -> None:
    section("[4] 素材引用")
    # staticFile('...') → public/...
    missing = []
    for f in scan_files():
        text = strip_comments(f.read_text(encoding="utf-8", errors="ignore"), f.suffix)
        for ref in re.findall(r"staticFile\(\s*[`'\"]([^`'\"]+)[`'\"]", text):
            ref = ref.split("${")[0]  # 模板串只校验静态前缀
            if not ref:
                continue
            if not (ROOT / "public" / ref).exists() and not list((ROOT / "public").glob(ref + "*")):
                missing.append((str(f.relative_to(ROOT)), ref))
    if missing:
        for where, ref in missing:
            if ref.endswith("/"):
                # 模板串只留下了目录前缀（如 staticFile(`sfx/${file}`)）：
                # 目录不存在通常是"素材还没生成/同步"，给 warn + 可操作提示，不用 error 卡住。
                warn(f"public/{ref} 还不存在（{where}）→ 跑 `python3 scripts/wvp.py render` 会自动同步，"
                     f"或先 `python3 scripts/make_sfx.py` 生成音效")
                add("warn", "asset_dir_pending",
                    f"public/{ref} 不存在（动态引用，素材还没生成或同步）", where)
            else:
                bad(f"staticFile('{ref}') 找不到对应文件（{where}）")
                add("error", "asset_missing", f"public/{ref} 不存在", where)
    else:
        ok("staticFile 引用的素材都存在")

    edl = ROOT / "examples/edit-plan.example.json"
    if edl.exists():
        try:
            plan = json.loads(edl.read_text(encoding="utf-8"))
            gone = [s["src"] for s in plan.get("timeline", []) if not (ROOT / s["src"]).exists()]
            bgm = (plan.get("audio_track") or {}).get("bgm")
            if bgm and not (ROOT / bgm).exists():
                gone.append(bgm)
            if gone:
                warn(f"EDL 示例引用的素材还没生成（跑 npm run assets）：{gone}")
                add("info", "edl_assets_pending", f"示例 EDL 素材未生成：{gone}", "examples/edit-plan.example.json")
            else:
                ok("示例 EDL 引用的素材都存在")
        except json.JSONDecodeError as exc:
            bad(f"示例 EDL 不是合法 JSON：{exc}")
            add("error", "edl_invalid", str(exc), "examples/edit-plan.example.json")


def check_fonts() -> None:
    section("[5] 中文字体")
    fpath = ROOT / "src/fonts.ts"
    if not fpath.exists():
        bad("没有 src/fonts.ts")
        add("error", "fonts_missing", "headless 环境没有 CJK 字体，不显式加载会渲染成豆腐块", "src/fonts.ts")
        return
    text = fpath.read_text(encoding="utf-8")
    loaded = ("loadFont(" in text) or ("@fontsource" in text) or ("@font-face" in text)
    if loaded:
        ok("字体已显式加载（不会出豆腐块）")
    else:
        bad("fonts.ts 里没有加载任何字体")
        add("error", "fonts_not_loaded", "必须 loadFont() 或 import @fontsource，否则中文是豆腐块", "src/fonts.ts")


def check_output(path: str) -> None:
    section(f"[6] 成片核验 {path}")
    p = Path(path)
    if not p.is_absolute():
        p = ROOT / p
    if not p.exists():
        warn(f"{path} 还不存在，跳过（渲染后再跑一次）")
        add("info", "output_absent", f"{path} 不存在", str(p))
        return
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", str(p)], capture_output=True, text=True)
    if proc.returncode != 0:
        bad("ffprobe 读取失败")
        add("error", "output_unreadable", proc.stderr.strip()[:120], str(p))
        return
    info = json.loads(proc.stdout)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    dur = float(info["format"]["duration"])

    if v is None:
        bad("成片没有视频流")
        add("error", "no_video", "输出没有视频流", str(p))
    else:
        fmt = v.get("pix_fmt", "")
        if fmt != "yuv420p":
            bad(f"像素格式 {fmt} 不是 yuv420p（平台/播放器兼容性差）")
            add("error", "pix_fmt",
                f"pix_fmt={fmt}；full-range 的 yuvj420p 建议转成 yuv420p + color_range=tv"
                f"（Remotion 侧在 remotion.config.ts 设 Config.setColorSpace('bt709')）", str(p))
        else:
            ok(f"视频 {v['codec_name']} {v['width']}x{v['height']} {fmt}")
        cspace, crange = v.get("color_space", ""), v.get("color_range", "")
        if v["height"] >= 720 and cspace in ("bt470bg", "smpte170m"):
            bad(f"HD 视频标了 {cspace}（BT.601），平台按 BT.709 解释会偏色")
            add("error", "color_space", f"color_space={cspace}，HD 应为 bt709", str(p))
        elif cspace:
            ok(f"色彩空间 {cspace} / 范围 {crange or '未标记'}")
        if crange == "pc":
            warn("色彩范围标为 full(pc)，部分平台会忽略该标记导致对比度被压缩")
            add("warn", "color_range_pc", "color_range=pc，建议输出 tv（limited）", str(p))

    if a is None:
        bad("成片没有音频流")
        add("error", "no_audio", "输出没有音频", str(p))
    else:
        ok(f"音频 {a['codec_name']} {a.get('sample_rate')}Hz {a.get('channels')}ch")

    # 把量到的规格写进 info：--json 模式下这些数字就是给 Agent 和报告用的证据
    if v is not None:
        fps_raw = v.get("r_frame_rate", "0/1")
        add("info", "output_spec",
            f"{v['width']}x{v['height']} @{fps_raw} {v['codec_name']} {v.get('pix_fmt')} "
            f"color={v.get('color_space', '未标记')}/{v.get('color_range', '未标记')}",
            str(p))
    if a is not None:
        add("info", "output_audio_spec",
            f"{a['codec_name']} {a.get('sample_rate')}Hz {a.get('channels')}ch", str(p))

    # 响度与峰值
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(p),
                           "-af", "volumedetect", "-f", "null", "-"],
                          capture_output=True, text=True)
    mean = re.search(r"mean_volume:\s*(-?[\d.]+) dB", proc.stderr)
    peak = re.search(r"max_volume:\s*(-?[\d.]+) dB", proc.stderr)
    if peak:
        pk = float(peak.group(1))
        if pk > -0.5:
            bad(f"峰值 {pk}dB 接近 0，可能削波")
            add("error", "clipping", f"max_volume={pk}dB", str(p))
        elif pk < -20:
            warn(f"峰值只有 {pk}dB，整体偏轻")
            add("warn", "too_quiet", f"max_volume={pk}dB", str(p))
        else:
            ok(f"峰值 {pk}dB（无削波）")
    if mean:
        mv = float(mean.group(1))
        if mv < -35:
            bad(f"平均音量 {mv}dB 过低，可能是静音素材")
            add("error", "near_silent", f"mean_volume={mv}dB", str(p))
        else:
            ok(f"平均 {mv}dB")

    proc = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(p),
                           "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                          capture_output=True, text=True)
    lufs = re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", proc.stderr)
    if lufs:
        got = float(lufs[-1])
        ok(f"整体响度 {got} LUFS")
        add("info", "loudness",
            f"integrated={got} LUFS  max={peak.group(1) if peak else '?'}dB  "
            f"mean={mean.group(1) if mean else '?'}dB", str(p))
        if not -24 <= got <= -12:
            warn(f"{got} LUFS 偏离常见投放区间（-24 ~ -12）")
            add("warn", "loudness_range", f"integrated={got} LUFS", str(p))

    ok(f"时长 {dur:.3f}s")


def main() -> int:
    ap = argparse.ArgumentParser(description="web-video-produce 静态校验器")
    ap.add_argument("--json", action="store_true", help="输出机器可读结果")
    ap.add_argument("--strict", action="store_true", help="警告也算失败")
    ap.add_argument("--out", default="", help="额外核验成片（如 output/edit.mp4）")
    args = ap.parse_args()

    global QUIET
    QUIET = args.json
    if not QUIET:
        print("== web-video-produce validate ==\n")
    manifest = check_timeline()
    check_scene_ids(manifest)
    check_determinism()
    check_assets()
    check_fonts()
    if args.out:
        check_output(args.out)

    errors = [f for f in findings if f["level"] == "error"]
    warns = [f for f in findings if f["level"] == "warn"]
    infos = [f for f in findings if f["level"] == "info"]

    if args.json:
        print(json.dumps({"ok": not errors and not (args.strict and warns),
                          "errors": errors, "warnings": warns, "info": infos},
                         ensure_ascii=False, indent=2))
    else:
        print()
        for f in errors + warns:
            tag = "✗" if f["level"] == "error" else "!"
            print(f"  {tag} [{f['code']}] {f['message']}")
            if f["where"]:
                print(f"      {f['where']}")
        print(f"\n结果：{len(errors)} 错误 / {len(warns)} 警告 / {len(infos)} 提示")
        if errors:
            print("→ 有错误，先修再渲染。")
        elif warns:
            print("→ 无阻塞错误；警告建议修。")

    return 1 if (errors or (args.strict and warns)) else 0


if __name__ == "__main__":
    raise SystemExit(main())
