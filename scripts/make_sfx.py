#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""web-video-produce :: make_sfx.py —— 用代码合成一组免版权音效（SFX）

授权状态
--------
本文件产出的 6 个音效（whoosh / pop / riser / impact / click / chime）**全部样点由本脚本
在本地用数学方法合成**，不下载、不采样、不引用任何第三方素材或采样库，因此可商用、
可再分发、无署名义务（等价 CC0，随仓库 MIT 一起使用）。BGM 的思路见 make_bgm.py。

为什么自己合成：转场"唰"、卡片"啵"、标题"砸"这类音效是成片的必需品，但从素材站下载
既有授权风险又要挑半天。自己合成的好处是参数可控、可版本化、可无限次重跑，
而且和 BGM 一样只靠 ffmpeg 收尾（这里 ffmpeg 只做"wav → mp3"的编码，不用它的合成滤镜）。

用法
----
python3 scripts/make_sfx.py                     # 6 个音效 → assets/sfx/（已存在则跳过）
python3 scripts/make_sfx.py --force             # 全部重生成
python3 scripts/make_sfx.py --only whoosh,pop   # 只做其中几个
python3 scripts/make_sfx.py --list              # 只列清单（文件名/时长/用途/听感）
python3 scripts/make_sfx.py --seed 7 --force    # 换随机种子（噪声类音效会随之变化）

设计要点（改代码时别破坏）
------------------------
* 纯 Python 标准库、零第三方依赖；ffmpeg 只负责把 wav 编码成 mp3
* 每个音效是**各自独立的合成算法**：扫频带通噪声 / 解析滑音 / 上升谐波堆 + 亮度扫频 /
  软饱和低频 + 梳状延时尾巴 / 极短高频 tick / 非谐泛音铃。没有"6 个正弦加淡出"
* 48000Hz、立体声、16bit wav 作中间产物 → 128k mp3；中间 wav 只写系统临时目录，
  正常结束或中途异常都会清理，绝不污染 assets/sfx/
* 所有噪声来自 `random.Random(固定种子)`，同一组参数重复运行**逐样点一致**
* 归一化到 -2.0dBFS 目标峰值（mp3 编码器对噪声类信号有约 +0.5dB 过冲，
  留足 headroom 才能保证成品实测仍在 -0.5dB 以下），并用
  `ffmpeg -af volumedetect` 回读成品的真实 max_volume 打印成表；超过 -0.5dB 判定失败
"""

from __future__ import annotations

import argparse
import math
import random
import struct
import subprocess
import sys
import wave
from pathlib import Path

# --------------------------------------------------------------------------- #
# 常量
# --------------------------------------------------------------------------- #
SR = 48000              # 采样率：和成片音频链保持一致，避免二次重采样
CHANNELS = 2            # 立体声（whoosh / riser / impact 会用到左右差异）
TARGET_PEAK_DB = -2.0   # 归一化目标峰值：实测 mp3 编码过冲可达 +0.5dB，-2dB 目标才稳在 -0.5dB 以下
EDGE_FADE_MS = 0.5      # 首尾各 0.5ms 淡入淡出：兜底消除任何边界跳变（爆音）
MP3_BITRATE = "128k"

# (文件名, 时长秒, 用途, 听感)
SOUNDS = [
    ("whoosh", 0.45, "转场/场景切换", "带通噪声扫频，一『唰』而过，首尾能量低"),
    ("pop",    0.12, "元素弹出/卡片出现", "音高快速下滑，短促干脆"),
    ("riser",  1.60, "悬念铺垫/推向高潮", "音高与亮度持续上升，末段最亮"),
    ("impact", 0.90, "重击/落地/标题砸下", "低频 thump + 噪声瞬态 + 自然衰减尾巴"),
    ("click",  0.06, "UI 点击/强调", "极短、干净、无尾音"),
    ("chime",  1.40, "成功/收尾/logo 亮相", "多个非谐泛音叠成铃感，自然衰减"),
]
SOUND_NAMES = [s[0] for s in SOUNDS]
SOUND_INFO = {s[0]: s for s in SOUNDS}


# --------------------------------------------------------------------------- #
# 基础工具：数学、包络、滤波器
# --------------------------------------------------------------------------- #
def db_to_gain(db: float) -> float:
    """分贝 → 线性增益。"""
    return 10.0 ** (db / 20.0)


def amp_to_db(amp: float) -> float:
    """线性幅度 → 分贝（夹一个地板值，避免 log10(0) 炸掉）。"""
    return 20.0 * math.log10(max(abs(amp), 1e-12))


def smoothstep(x: float) -> float:
    """0..1 的平滑过渡（一阶导连续），用来做不会"顶"出爆音的包络。"""
    x = 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)
    return x * x * (3.0 - 2.0 * x)


def new_stereo(seconds: float) -> tuple:
    """申请一对左右声道缓冲（秒 → 样点）。"""
    n = max(1, int(round(seconds * SR)))
    return [0.0] * n, [0.0] * n


class SVF:
    """TPT 状态变量滤波器（零延迟反馈结构），逐样点可改截止频率。

    为什么不用普通 biquad：whoosh / riser 的截止频率每个样点都在动，biquad 需要反复
    重算系数，在宽范围扫频时还容易数值不稳定；TPT-SVF 在 g>0、k>0 时恒稳定，
    一次运算同时给出低通/带通/高通三个输出，正好用来"塑形噪声"。
    """

    def __init__(self) -> None:
        self.ic1 = 0.0
        self.ic2 = 0.0
        self.g = 0.1
        self.k = 1.0
        self.a1 = self.a2 = self.a3 = 0.0
        self.set(1000.0, 0.7)

    def set(self, fc: float, q: float) -> None:
        """设定截止频率与 Q（fc 夹在安全区，防止 tan() 在 Nyquist 附近爆掉）。"""
        fc = min(max(fc, 10.0), SR * 0.45)
        self.g = math.tan(math.pi * fc / SR)
        self.k = 1.0 / max(q, 0.05)
        self.a1 = 1.0 / (1.0 + self.g * (self.g + self.k))
        self.a2 = self.g * self.a1
        self.a3 = self.g * self.a2

    def process(self, x: float) -> tuple:
        """输入一个样点，返回 (低通, 带通, 高通)。"""
        v3 = x - self.ic2
        v1 = self.a1 * self.ic1 + self.a2 * v3
        v2 = self.ic2 + self.a2 * self.ic1 + self.a3 * v3
        self.ic1 = 2.0 * v1 - self.ic1
        self.ic2 = 2.0 * v2 - self.ic2
        return v2, v1, x - self.k * v1 - v2


def comb_tail(buf: list, delay_ms: float, feedback: float, damp: float) -> list:
    """给瞬态加一段"房间尾巴"：延迟线 + 阻尼低通反馈。

    为什么不用卷积混响：那需要 IR 素材（有授权问题）且更吃 CPU。对 impact 这种
    "瞬态 + 短尾巴"的场景，二十行的梳状延时已经够用；反馈系数固定 → 结果完全可复现。
    """
    d = max(1, int(delay_ms / 1000.0 * SR))
    out = list(buf)
    lp = 0.0
    for i in range(d, len(out)):
        lp += damp * (out[i - d] - lp)      # 反馈路径上做低通 → 高频先死，尾巴听着自然
        out[i] += feedback * lp
    return out


# --------------------------------------------------------------------------- #
# 6 个音效各自的合成算法
# --------------------------------------------------------------------------- #
def render_whoosh(seconds: float, rng: random.Random) -> tuple:
    """转场"唰"：白噪声 → 时变带通（先上扫再下扫）→ 首尾能量压低的包络。

    为什么这么设计：噪声本身没有音高，人耳判断"从哪来、到哪去"全靠**频谱重心随时间移动**，
    所以用 TPT-SVF 逐样点改中心频率来扫频；两端能量压到接近 0，剪到转场点上才不会顶出爆音。
    左右声道用独立噪声 + 4ms 的时间错位 + 交叉声像，"唰"过去时有横向空间感，且完全确定性。
    """
    left, right = new_stereo(seconds)
    n = len(left)
    f_lo, f_hi = 220.0, 7200.0
    fl, fr = SVF(), SVF()
    body_l, body_r = SVF(), SVF()      # 额外的低通层：给"风体"一点厚度

    def sweep(u: float) -> float:
        """扫频轨迹：前 45% 指数上扫到最亮，之后指数回落（u 为 0..1 的归一化时间）。"""
        u = 0.0 if u < 0.0 else (1.0 if u > 1.0 else u)
        peak = 0.45
        if u < peak:
            return f_lo * (f_hi / f_lo) ** (u / peak)
        return f_hi * (f_lo / f_hi) ** ((u - peak) / (1.0 - peak))

    def env(u: float) -> float:
        """包络：18% 处到达峰值，尾部 50% 缓慢收干净 → 首尾能量低。"""
        return smoothstep(u / 0.18) * smoothstep((1.0 - u) / 0.50)

    for i in range(n):
        t = i / SR
        ul = (t + 0.004) / seconds      # 左声道提前 4ms
        ur = (t - 0.004) / seconds      # 右声道延后 4ms
        fl.set(sweep(ul), 1.0 + 3.6 * math.sin(math.pi * min(max(ul, 0.0), 1.0)))
        fr.set(sweep(ur), 1.0 + 3.6 * math.sin(math.pi * min(max(ur, 0.0), 1.0)))
        body_l.set(sweep(ul) * 0.25 + 120.0, 0.7)
        body_r.set(sweep(ur) * 0.25 + 120.0, 0.7)
        _, bl, hl = fl.process(rng.random() * 2.0 - 1.0)
        _, br, hr = fr.process(rng.random() * 2.0 - 1.0)
        lol, _, _ = body_l.process(rng.random() * 2.0 - 1.0)
        lor, _, _ = body_r.process(rng.random() * 2.0 - 1.0)
        # 带通当主体、高通当"空气感"、低通当"风体"
        vl = (bl + 0.22 * hl + 0.40 * lol) * env(ul)
        vr = (br + 0.22 * hr + 0.40 * lor) * env(ur)
        # 声像由左向右轻微移动（交叉淡化，不是硬切换）
        left[i] = vl * (1.15 - 0.40 * min(max(ul, 0.0), 1.0))
        right[i] = vr * (0.75 + 0.40 * min(max(ur, 0.0), 1.0))
    return left, right


def render_pop(seconds: float, rng: random.Random) -> tuple:
    """卡片弹出"啵"：指数下滑的音高 + 2/3 次泛音 + 1ms 噪声 tick。

    为什么音高要"下滑"：短音的听感方向由音高走向决定——上升像"咻/问号"，
    下降才像"啵/确认"。相位用瞬时频率的**解析积分**算（而不是 f(t)*t），
    否则滑音过程中会自带频率抖动，听着发脏。
    衰减时间常数取 32ms：0.12s 的文件里前三段都要有可闻余韵，太短会变成"干点击"。
    """
    n = max(1, int(round(seconds * SR)))
    mono = [0.0] * n
    f_start, f_end, tau_f = 1400.0, 250.0, 0.022     # 音高：1400Hz → 250Hz
    tau_a = 0.032                                     # 主体衰减（撑满 0.12s）
    hp = SVF()
    hp.set(2800.0, 0.7)                               # tick 只留高频，保持"干脆"
    for i in range(n):
        t = i / SR
        # f(t) = f_end + (f_start-f_end)·e^(-t/τ)；相位 = 2π∫f dt 的解析解
        phase = 2.0 * math.pi * (f_end * t + (f_start - f_end) * tau_f * (1.0 - math.exp(-t / tau_f)))
        env = min(1.0, t / 0.0008) * math.exp(-t / tau_a)      # 0.8ms 起振，之后指数衰减
        v = math.sin(phase)
        v += 0.34 * math.sin(2.0 * phase) * math.exp(-t / (tau_a * 0.60))
        v += 0.12 * math.sin(3.0 * phase) * math.exp(-t / (tau_a * 0.45))
        _, _, tick = hp.process(rng.random() * 2.0 - 1.0)
        v = v * env + 0.55 * tick * math.exp(-t / 0.0012)      # 起手 1.2ms 的噪声 tick
        mono[i] = v
    # 右声道延后 1.2ms、略低 3%：给中心感加一点点宽度（Haas 效应）
    d = int(0.0012 * SR)
    left = list(mono)
    right = [(0.97 * mono[i - d]) if i >= d else 0.0 for i in range(n)]
    return left, right


def render_riser(seconds: float, rng: random.Random) -> tuple:
    """悬念垫高：上升的带通噪声 + 上升的音高谐波堆 + 末段才出现的空气感。

    为什么用三层：单靠"音高上升"听起来像救护车，单靠"噪声变亮"又太像风。
    三层各自负责一件事——噪声扫频给"亮度/张力"，谐波堆给"音高上升"，
    末段的高通噪声给"最后最亮"的收束感；三者的包络都是加速上升（t^1.35），
    所以听感是"越到后面越满"，而不是匀速爬升。
    """
    left, right = new_stereo(seconds)
    n = len(left)
    fl, fr = SVF(), SVF()
    sl, sr = SVF(), SVF()          # 末段 shimmer 的高通
    harmonics = ((1.0, 1.00), (2.0, 0.50), (3.0, 0.30), (4.0, 0.18), (5.0, 0.10))
    for i in range(n):
        t = i / SR
        u = t / seconds
        # 噪声层：中心频率 250Hz → 9kHz，Q 从 0.9 收到 7（越到后面越"聚焦"）
        f_noise = 250.0 * (9000.0 / 250.0) ** (u ** 0.9)
        fl.set(f_noise, 0.9 + 6.1 * u)
        fr.set(f_noise, 0.9 + 6.1 * u)
        xl = rng.random() * 2.0 - 1.0
        xr = rng.random() * 2.0 - 1.0
        _, bl, _ = fl.process(xl)
        _, br, _ = fr.process(xr)
        # 谐波层：基频 150Hz → 600Hz（两个八度），高次泛音的音量随时间涨得更快 → 亮度上升
        f0 = 150.0 * 2.0 ** (2.0 * u ** 1.15)
        tone_l = tone_r = 0.0
        for k, amp in harmonics:
            rise = u ** (1.0 + 0.6 * k)
            tone_l += amp * rise * math.sin(2.0 * math.pi * f0 * (1.0 - 0.002) * k * t)
            tone_r += amp * rise * math.sin(2.0 * math.pi * f0 * (1.0 + 0.002) * k * t)
        # 空气层：只在高通 4kHz 的噪声里，末段才抬起来
        sl.set(4000.0, 0.7)
        sr.set(4000.0, 0.7)
        _, _, shl = sl.process(xl)
        _, _, shr = sr.process(xr)
        env = u ** 1.35                      # 加速上升：末段最满
        shimmer = 0.55 * (u ** 3.0)
        pan_l = 1.0 + 0.25 * (1.0 - 2.0 * u)  # 从偏左缓慢移到偏右
        pan_r = 1.0 - 0.25 * (1.0 - 2.0 * u)
        left[i] = (1.0 * bl + 0.55 * tone_l + shimmer * shl) * env * pan_l
        right[i] = (1.0 * br + 0.55 * tone_r + shimmer * shr) * env * pan_r
    # 结尾停在最亮处，最后 5ms 快速收干净，避免硬切产生"咔"
    tail = int(0.005 * SR)
    for i in range(tail):
        w = smoothstep((tail - i) / tail)
        left[n - 1 - i] *= w
        right[n - 1 - i] *= w
    return left, right


def render_impact(seconds: float, rng: random.Random) -> tuple:
    """重击/落地：软饱和的低频 thump + 中频 body + 噪声爆点 + 梳状延时房间尾巴。

    为什么低频要软饱和（tanh）：纯正弦下滑的"闷响"没有重量感，tanh 产生的奇次谐波
    会让声音在音箱上"更响"（等响曲线），这是 impact 类音效的常规做法，而且它是纯数学，
    不需要任何素材。尾巴用反馈延时做，反馈量 0.42 → 0.9 秒内自然衰减到听不见。
    """
    n = max(1, int(round(seconds * SR)))
    core = [0.0] * n
    crack_l = [0.0] * n
    crack_r = [0.0] * n
    lp_l, lp_r = SVF(), SVF()
    hp_l, hp_r = SVF(), SVF()
    lp_l.set(2600.0, 0.8); lp_r.set(2600.0, 0.8)
    hp_l.set(3200.0, 0.7); hp_r.set(3200.0, 0.7)
    sub_end, sub_start, tau_sub = 38.0, 120.0, 0.055      # 低频音高：120Hz → 38Hz
    body = ((180.0, 0.50, 0.130), (268.0, 0.34, 0.100), (392.0, 0.20, 0.075))
    for i in range(n):
        t = i / SR
        # 1) 次低频 thump
        phase = 2.0 * math.pi * (sub_end * t + (sub_start - sub_end) * tau_sub * (1.0 - math.exp(-t / tau_sub)))
        sub_env = min(1.0, t / 0.003) * math.exp(-t / 0.20)
        sub = math.tanh(1.8 * math.sin(phase) * sub_env) / math.tanh(1.8)
        # 2) 中频 body：三个固定衰减的实心感
        v = sub * 0.95
        for f, amp, tau in body:
            v += amp * math.sin(2.0 * math.pi * f * t) * math.exp(-t / tau)
        core[i] = v
        # 3) 噪声爆点：10ms 量级，低通 + 高通混合；左右独立 → 立体声宽度
        _, bl, _ = lp_l.process(rng.random() * 2.0 - 1.0)
        _, _, hl = hp_l.process(rng.random() * 2.0 - 1.0)
        _, br, _ = lp_r.process(rng.random() * 2.0 - 1.0)
        _, _, hr = hp_r.process(rng.random() * 2.0 - 1.0)
        trans = math.exp(-t / 0.010)
        crack_l[i] = (0.75 * bl + 0.45 * hl) * trans
        crack_r[i] = (0.75 * br + 0.45 * hr) * trans
    left = [core[i] + crack_l[i] for i in range(n)]
    right = [core[i] + crack_r[i] for i in range(n)]
    # 4) 房间尾巴：左右用不同延时（37/41 与 43/47 ms）→ 不单调、有空间感
    left = comb_tail(left, 37.0, 0.42, 0.55)
    left = comb_tail(left, 41.0, 0.30, 0.60)
    right = comb_tail(right, 43.0, 0.42, 0.55)
    right = comb_tail(right, 47.0, 0.30, 0.60)
    return left, right


def render_click(seconds: float, rng: random.Random) -> tuple:
    """UI 点击：三个高频衰减分音 + 1.6ms 噪声 tick，全程高通、结尾绝对静音。

    为什么这么短还要做高通：低频在这类音效里只会拖泥带水，而且小喇叭（手机）根本放不出来；
    砍掉 400Hz 以下之后，剩下的是"哒"的干净质感。结尾必须真正回到 0 —— 不能有尾音，
    否则连续点击会糊成一片。
    """
    n = max(1, int(round(seconds * SR)))
    mono = [0.0] * n
    partials = ((2100.0, 1.00, 0.0042), (3350.0, 0.55, 0.0032), (4900.0, 0.30, 0.0024))
    hp = SVF()
    hp_tick = SVF()
    hp.set(420.0, 0.7)
    hp_tick.set(1800.0, 0.7)
    for i in range(n):
        t = i / SR
        v = 0.0
        for f, amp, tau in partials:
            v += amp * math.sin(2.0 * math.pi * f * t) * math.exp(-t / tau)
        _, _, tick = hp_tick.process(rng.random() * 2.0 - 1.0)
        v = (v + 0.60 * tick * math.exp(-t / 0.0016)) * min(1.0, t / 0.0003)
        _, _, v = hp.process(v)          # 整体再过一次高通，去掉直流与低频
        mono[i] = v
    # 最后 12ms 平滑压到 0：确保"无尾音"，同时不产生台阶
    cut = int(0.012 * SR)
    for i in range(cut):
        mono[n - 1 - i] *= smoothstep((cut - i) / cut)
    return list(mono), list(mono)        # 点击是正前方的事件 → 严格居中（左右一致）


def render_chime(seconds: float, rng: random.Random) -> tuple:
    """成功/收尾铃：11 个非谐泛音叠加，各自独立的衰减时间与左右偏向。

    为什么用非谐泛音：真实钟/铃的泛音比不是 1:2:3，而是 0.56 / 1.19 / 2.51 这类
    非整数比，照抄这个"音分表"才有金属感；每个分音再拆成一对 ±0.15% 微失谐的正弦，
    让它自己产生缓慢的拍频（金属件的"嗡"），比加 LFO 更自然，也更容易做到确定性。
    """
    left, right = new_stereo(seconds)
    n = len(left)
    base = 523.25                        # C5
    # (频率比, 振幅, 衰减时间常数 s, 声像 -1..1)
    partials = (
        (0.56, 0.55, 0.55, -0.35),
        (0.92, 0.80, 0.48, 0.30),
        (1.00, 1.00, 0.42, 0.00),
        (1.19, 0.68, 0.34, 0.45),
        (1.56, 0.48, 0.28, -0.50),
        (2.00, 0.40, 0.22, -0.20),
        (2.51, 0.30, 0.18, 0.55),
        (2.66, 0.25, 0.16, -0.55),
        (3.01, 0.21, 0.13, 0.20),
        (4.16, 0.15, 0.10, -0.30),
        (5.43, 0.10, 0.08, 0.40),
    )
    detune = 0.0015                      # ±0.15% → 几百毫秒级的拍频
    for ratio, amp, tau, pan in partials:
        f = base * ratio
        gl = 1.0 - 0.35 * pan            # 声像：不是硬左右，只是轻微偏置
        gr = 1.0 + 0.35 * pan
        fl = f * (1.0 - detune)
        fr = f * (1.0 + detune)
        wl = 2.0 * math.pi * fl
        wr = 2.0 * math.pi * fr
        for i in range(n):
            t = i / SR
            e = min(1.0, t / 0.004) * math.exp(-t / tau)      # 4ms 起振 + 指数衰减
            left[i] += 0.5 * amp * gl * (math.sin(wl * t) + math.sin(wr * t)) * e
            right[i] += 0.5 * amp * gr * (math.sin(wr * t) + math.sin(wl * t)) * e
    # 尾巴留 30ms 平滑收尾：1.4s 处泛音已经衰减到 1e-3 以下，只是把残值抹平
    tail = int(0.030 * SR)
    for i in range(tail):
        w = smoothstep((tail - i) / tail)
        left[n - 1 - i] *= w
        right[n - 1 - i] *= w
    return left, right


RENDERERS = {
    "whoosh": render_whoosh,
    "pop": render_pop,
    "riser": render_riser,
    "impact": render_impact,
    "click": render_click,
    "chime": render_chime,
}


# --------------------------------------------------------------------------- #
# 归一化 / 落盘 / 测量
# --------------------------------------------------------------------------- #
def normalize(left: list, right: list, target_db: float) -> float:
    """把左右声道整体缩放到目标峰值，返回**缩放前**的峰值(dB)。

    为什么统一在这个环节做归一化：各音效的算法内部振幅口径完全不同（噪声 vs 正弦堆），
    让每个算法自己去凑响度既容易削波也难维护；统一归一化 + 固定目标峰值，
    配合 volumedetect 回读，就能保证"都不削波、彼此响度接近"。
    """
    peak = 0.0
    for v in left:
        a = -v if v < 0.0 else v
        if a > peak:
            peak = a
    for v in right:
        a = -v if v < 0.0 else v
        if a > peak:
            peak = a
    if peak <= 0.0:
        raise ValueError("合成结果是静音（峰值 0），检查算法参数")
    g = db_to_gain(target_db) / peak
    for i in range(len(left)):
        left[i] *= g
        right[i] *= g
    return amp_to_db(peak)


def fade_edges(left: list, right: list, ms: float = EDGE_FADE_MS) -> None:
    """首尾各做 ms 的平滑淡入淡出，兜底消除任何边界跳变（爆音/咔哒）。"""
    k = max(1, int(ms / 1000.0 * SR))
    n = len(left)
    for i in range(k):
        w = smoothstep(i / k)
        left[i] *= w
        right[i] *= w
        left[n - 1 - i] *= w
        right[n - 1 - i] *= w


def write_wav(path: Path, left: list, right: list) -> None:
    """写 16bit 立体声 wav（中间产物）。"""
    frames = bytearray()
    for i in range(len(left)):
        frames += struct.pack("<hh", int(round(left[i] * 32767.0)), int(round(right[i] * 32767.0)))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(CHANNELS)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(frames))


def encode_mp3(wav: Path, out: Path) -> None:
    """ffmpeg 只做一件事：把 wav 编码成 mp3（不用它的任何合成滤镜）。"""
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-v", "error", "-y", "-i", str(wav),
         "-ar", str(SR), "-ac", str(CHANNELS), "-c:a", "libmp3lame", "-b:a", MP3_BITRATE, str(out)],
        check=True,
    )


def _parse_db(text: str, key: str):
    """从 ffmpeg 的日志里抠出 "... : -1.5 dB" 这样的数值（-inf 视为 None）。"""
    i = text.find(key)
    if i < 0:
        return None
    rest = text[i + len(key):].strip()
    token = rest.split()[0] if rest.split() else ""
    if token in ("-inf", "inf", "nan", ""):
        return None
    try:
        return float(token)
    except ValueError:
        return None


def measure(path: Path):
    """用 volumedetect 回读成品的真实峰值/均值（对编码后的 mp3 量，所见即所得）。"""
    try:
        proc = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
            capture_output=True, text=True,
        )
    except FileNotFoundError:
        return None, None
    if proc.returncode != 0:
        return None, None
    return _parse_db(proc.stderr, "max_volume:"), _parse_db(proc.stderr, "mean_volume:")


# --------------------------------------------------------------------------- #
# 临时目录（只用 pathlib，不引 tempfile：保持"零额外模块"的风格）
# --------------------------------------------------------------------------- #
def make_temp_dir(seed: int) -> Path:
    """在系统临时目录里开一个本次运行专用的工作目录。

    为什么不用 assets/sfx/ 下的临时名：中间 wav 有 6 个，万一中途 Ctrl-C 就会留下垃圾；
    放到 /tmp 下并保证结束时清理，assets/sfx/ 里永远只有成品 mp3。
    mkdir(exist_ok=False) 是原子的 → 并发跑两次也不会撞车。
    """
    root = Path("/tmp") if Path("/tmp").is_dir() else Path.cwd()
    for i in range(1000):
        cand = root / f"wvp-sfx-{seed}-{i}"
        try:
            cand.mkdir()
            return cand
        except FileExistsError:
            continue
    raise RuntimeError("无法在临时目录下创建工作目录")


def clean_temp_dir(tmp: Path) -> None:
    """删掉临时目录里的 wav 再删目录（自己删，不用 shutil）。"""
    for p in sorted(tmp.glob("*.wav")):
        p.unlink(missing_ok=True)
    try:
        tmp.rmdir()
    except OSError:
        pass


# --------------------------------------------------------------------------- #
# CLI 与表格
# --------------------------------------------------------------------------- #
def _disp_width(s: str) -> int:
    """中文字符在终端占两列，自己算显示宽度（不引 unicodedata）才能把表对齐。"""
    w = 0
    for ch in s:
        o = ord(ch)
        if (0x1100 <= o <= 0x115F or 0x2E80 <= o <= 0xA4CF or 0xAC00 <= o <= 0xD7A3
                or 0xF900 <= o <= 0xFAFF or 0xFE30 <= o <= 0xFE6F or 0xFF00 <= o <= 0xFF60
                or 0xFFE0 <= o <= 0xFFE6 or 0x20000 <= o <= 0x3FFFD):
            w += 2
        else:
            w += 1
    return w


def _pad(s: str, width: int) -> str:
    """按显示宽度左对齐补空格。"""
    return s + " " * max(0, width - _disp_width(s))


def print_list() -> None:
    """--list：只打印音效清单，方便快速查名字。"""
    print("[sfx] 可用音效（全部自研合成、可商用）：")
    print(f"  {_pad('名称', 10)} {_pad('时长', 8)} {_pad('用途', 22)} 听感")
    for name, seconds, use, feel in SOUNDS:
        print(f"  {_pad(name, 10)} {_pad(f'{seconds:.2f}s', 8)} {_pad(use, 22)} {feel}")


def print_table(rows: list) -> None:
    """打印结果表：文件名 / 时长 / 大小 / max_volume（外加状态列）。"""
    head = (_pad("文件", 14), _pad("时长", 8), _pad("大小", 10),
            _pad("max_volume", 12), _pad("mean", 10), "状态")
    line = "-" * (_disp_width("".join(head)) + 4)
    print(line)
    print("  ".join(head))
    print(line)
    for name, seconds, size_kb, mx, mn, state in rows:
        mx_s = "未能测量" if mx is None else f"{mx:.2f} dB"
        mn_s = "未能测量" if mn is None else f"{mn:.2f} dB"
        print("  ".join((_pad(name, 14), _pad(f"{seconds:.2f}s", 8), _pad(f"{size_kb:.1f} KB", 10),
                         _pad(mx_s, 12), _pad(mn_s, 10), state)))
    print(line)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="合成一组免版权音效（纯标准库；ffmpeg 只用于编码 mp3）",
        epilog="示例：python3 scripts/make_sfx.py --force --only whoosh,riser",
    )
    ap.add_argument("--outdir", default="assets/sfx", help="输出目录（默认 assets/sfx）")
    ap.add_argument("--only", default="", help="只生成指定音效，逗号分隔，如 whoosh,pop")
    ap.add_argument("--force", action="store_true", help="已存在也重新生成（默认跳过）")
    ap.add_argument("--seed", type=int, default=20240607, help="随机种子（默认 20240607，同种子结果一致）")
    ap.add_argument("--list", action="store_true", help="只列出可用音效与用途")
    args = ap.parse_args()

    if args.list:
        print_list()
        return 0

    wanted = [s.strip() for s in args.only.split(",") if s.strip()] or list(SOUND_NAMES)
    unknown = [s for s in wanted if s not in RENDERERS]
    if unknown:
        sys.exit(f"[sfx] 未知音效：{', '.join(unknown)}；可用：{', '.join(SOUND_NAMES)}")

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    print(f"[sfx] 输出目录 {outdir} ｜ {SR}Hz / {CHANNELS}ch / {MP3_BITRATE} mp3 ｜ 种子 {args.seed}"
          f" ｜ 目标峰值 {TARGET_PEAK_DB}dBFS")

    tmp = make_temp_dir(args.seed)
    rows = []
    failures = 0
    try:
        for name in wanted:
            seconds = SOUND_INFO[name][1]
            use = SOUND_INFO[name][2]
            out = outdir / f"{name}.mp3"
            state = "新生成"
            if out.exists() and not args.force:
                state = "跳过（已存在）"
                print(f"[sfx] {name:<7} 跳过（已存在；要覆盖请加 --force）")
            else:
                # 每个音效用自己的种子（按 SOUNDS 里的固定序号派生），
                # 这样 --only 单跑某个音效时，噪声序列和全量跑完全一致
                idx = SOUND_NAMES.index(name)
                rng = random.Random(args.seed + idx)
                left, right = RENDERERS[name](seconds, rng)
                raw_peak = normalize(left, right, TARGET_PEAK_DB)
                fade_edges(left, right)
                wav = tmp / f"{name}.wav"
                write_wav(wav, left, right)
                encode_mp3(wav, out)
                print(f"[sfx] {name:<7} {seconds:.2f}s · 用途 {use} · 合成峰值 {raw_peak:+.2f}dB"
                      f" → 归一化 {TARGET_PEAK_DB}dBFS → {out}")
            mx, mn = measure(out)
            size_kb = out.stat().st_size / 1024.0
            if mx is None:
                state = "测量失败"
                failures += 1
            elif mx > -0.5:
                state = f"峰值过高（>{-0.5}dB）"
                failures += 1
            rows.append((f"{name}.mp3", seconds, size_kb, mx, mn, state))
    finally:
        clean_temp_dir(tmp)          # 正常结束、报错、Ctrl-C 都会走到这里

    print_table(rows)
    total_kb = sum(r[2] for r in rows)
    print(f"[sfx] 共 {len(rows)} 个文件 / {total_kb:.1f} KB ｜ 全部为自研合成样点（可商用），"
          f"ffmpeg 仅用于 wav→mp3 编码")
    if failures:
        print(f"[sfx] ✗ 有 {failures} 个文件不合格（峰值必须 ≤ -0.5dB 且能被测量）")
        return 1
    print("[sfx] ✓ 全部文件峰值均低于 -0.5dBFS（无削波）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
