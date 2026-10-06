import React from 'react';
import { Easing, useCurrentFrame } from 'remotion';
import { FPS } from '../config';

/**
 * motion —— 场景动作库（纯函数层）
 * =====================================================================
 * 铁律 2：每一帧都是纯函数 f(frame)。
 *
 * 这里的每个导出都只做一件事：把"当前帧 + 参数"映射成"这一帧长什么样"。
 * 没有动画状态机、没有 CSS transition / animation、没有计时器、没有随机数，
 * 所以同一帧永远渲染出同一张画面，可以先渲 1 张静帧来确认构图。
 *
 * 返回值是可以直接展开进 style 的普通对象：
 *   <div style={{ ...motionAt(frame, 'rise'), color: '#fff' }} />
 *
 * 组合约定（很重要）：
 *   · 所有动作都在 [0, 1] 的归一化进度 p 上定义，p 由
 *     (frame - delay) / duration 再套一层缓动得到；
 *   · p = 0 是"动作开始前的初态"，p = 1 是"动作结束后的常态（identity）"；
 *   · 只有 'back' 缓动会让 p 略微冲过 1（这是有意的过冲），
 *     所以透明度 / 模糊这类不能越界的量统一用 clamp 过的 q。
 */

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

/** 夹到 [0, 1]。 */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 命名缓动（输入 0..1 输出 0..1），基于 remotion 的 Easing 或自己实现 */
export type EaseName = 'linear' | 'out' | 'inOut' | 'back' | 'expo';

/**
 * expo（指数衰减）自己实现：remotion 的 Easing.exp 在 t=1 处留了 2^-10 ≈ 0.001 的余量，
 * 从外面看就是"动作永远差最后一丝"。这里显式钉死两端（0 → 0，1 → 1）。
 */
const easeOutExpo = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * 缓动表：
 *   linear —— 匀速，适合"扫描 / 循环"这类不该有加减速的量
 *   out    —— 三次方缓出（起步快、落点稳），默认值，绝大多数入场用它
 *   inOut  —— 三次方缓入缓出，适合"来回移动 / 呼吸"这类对称动作
 *   back   —— 缓出 + 过冲（约 1.08），落点会"弹一下"，适合强调
 *   expo   —— 指数缓出（起步极快、迅速收住），适合冲击式入场
 */
const EASES: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  back: Easing.out(Easing.back(1.7)),
  expo: easeOutExpo,
};

export const ease =
  (name: EaseName) =>
  (t: number): number =>
    EASES[name](clamp01(t));

// ---------------------------------------------------------------------------
// 动作
// ---------------------------------------------------------------------------

/** 入场/出场的动作种类 */
export type MotionKind =
  | 'fade'
  | 'rise'
  | 'sink'
  | 'pop'
  | 'blur'
  | 'zoomIn'
  | 'zoomOut'
  | 'slideLeft'
  | 'slideRight'
  | 'flipX'
  | 'swing';

export type MotionOptions = {
  /** 延迟帧数，默认 0 */
  delay?: number;
  /** 持续帧数，默认 18 */
  duration?: number;
  /** 位移距离 px，默认 48 */
  distance?: number;
  /** 起始缩放，默认 0.9 */
  from?: number;
  /** 缓动，默认 'out' */
  ease?: EaseName;
};

const DURATION = 18;
const DISTANCE = 48;
const FROM = 0.9;

/**
 * 纯函数：算出某个动作在 frame 帧的样式（transform + opacity + filter）。
 *
 * 每个 kind 的数学形态（p 为缓动后的进度，q = clamp01(p)）：
 *
 *   fade        opacity: p                                    —— 只有透明度，最安静，适合背景层/字幕
 *   rise        位移 y: +distance → 0（由下往上浮起）          —— 标题、卡片从下方升起
 *   sink        位移 y: -distance → 0（由上往下落入）          —— 菜单、抽屉、弹窗下落
 *   pop         缩放 = 1 + (from-1)(1-p) + 0.75(1-from)·sin(πp)
 *               线性项把 scale 从 from 拉到 1，sin 鼓包让中段冲过 1（约 +3%~8%），
 *               两端严格等于 from 与 1 —— 带过冲的"弹出来"
 *   blur        模糊 12px → 0，同时 scale 1.04 → 1；透明度在前 60% 就到位
 *               —— 虚焦聚焦，适合"从另一个世界切进来"的段落
 *   zoomIn      缩放 from → 1（无过冲）                        —— 镜头推近
 *   zoomOut     缩放 (2-from) → 1（从更大缩回）                —— 镜头拉远，与 zoomIn 方向相反
 *   slideLeft   位移 x: +distance → 0（从右侧滑入向左归位）    —— 横向列表/信息条
 *   slideRight  位移 x: -distance → 0（从左侧滑入向右归位）    —— 与 slideLeft 镜像
 *   flipX       perspective(1200px) rotateX(-78° → 0°)         —— 绕水平轴翻起，像翻卡片
 *   swing       rotate = -10°·(1-q)·cos(2πq)，位移 x/y 同步收紧（挂在上方荡进来）
 *               包络 (1-q) 保证末端精确归零，cos 让中途反向回摆一次
 */
export const motionAt = (
  frame: number,
  kind: MotionKind,
  opts: MotionOptions = {}
): React.CSSProperties => {
  const delay = opts.delay ?? 0;
  const duration = Math.max(1, opts.duration ?? DURATION);
  const distance = opts.distance ?? DISTANCE;
  const from = opts.from ?? FROM;
  const easeName = opts.ease ?? 'out';

  const p = ease(easeName)((frame - delay) / duration); // 缓动后进度（可能略过 1）
  const q = clamp01(p); // 不能越界的量用它

  switch (kind) {
    case 'fade':
      return { opacity: q, transform: 'none', filter: 'none' };

    case 'rise':
      return {
        opacity: q,
        transform: `translate3d(0, ${distance * (1 - p)}px, 0)`,
        filter: 'none',
      };

    case 'sink':
      return {
        opacity: q,
        transform: `translate3d(0, ${-distance * (1 - p)}px, 0)`,
        filter: 'none',
      };

    case 'pop': {
      // 过冲幅度与"起始缩放差"挂钩：from=0.9 时约 7.5%，视觉上是"啪"地弹到位。
      const amp = 0.75 * (1 - from);
      const scale = 1 + (from - 1) * (1 - p) + amp * Math.sin(Math.PI * q);
      return { opacity: q, transform: `scale(${scale})`, filter: 'none' };
    }

    case 'blur':
      return {
        opacity: clamp01(p / 0.6),
        transform: `scale(${1 + 0.04 * (1 - q)})`,
        filter: `blur(${12 * (1 - q)}px)`,
      };

    case 'zoomIn':
      return {
        opacity: q,
        transform: `scale(${from + (1 - from) * p})`,
        filter: 'none',
      };

    case 'zoomOut': {
      const big = 1 + (1 - from); // from=0.9 → 1.1：从"更近"缩回常态
      return {
        opacity: q,
        transform: `scale(${big + (1 - big) * p})`,
        filter: 'none',
      };
    }

    case 'slideLeft':
      return {
        opacity: q,
        transform: `translate3d(${distance * (1 - p)}px, 0, 0)`,
        filter: 'none',
      };

    case 'slideRight':
      return {
        opacity: q,
        transform: `translate3d(${-distance * (1 - p)}px, 0, 0)`,
        filter: 'none',
      };

    case 'flipX':
      return {
        opacity: q,
        transform: `perspective(1200px) rotateX(${-78 * (1 - q)}deg)`,
        transformOrigin: 'center center',
        filter: 'none',
      };

    case 'swing': {
      const rot = -10 * (1 - q) * Math.cos(2 * Math.PI * q);
      return {
        opacity: clamp01(p / 0.5),
        transform:
          `translate3d(${distance * 0.5 * (1 - q)}px, ${-distance * 0.35 * (1 - q)}px, 0)` +
          ` rotate(${rot}deg)`,
        transformOrigin: 'top center',
        filter: 'none',
      };
    }

    default:
      // 类型上到不了这里；留着保证任何输入都返回一个可安全展开的样式。
      return { opacity: 1, transform: 'none', filter: 'none' };
  }
};

/**
 * Hook 包装：motionAt(useCurrentFrame(), ...)
 * 场景里用得最多的就是这个；在 <Sequence> 内部 useCurrentFrame 是"局部帧"，
 * 所以同一个动作组件可以被放进任意时间窗口里复用。
 */
export const useMotion = (kind: MotionKind, opts: MotionOptions = {}): React.CSSProperties => {
  const frame = useCurrentFrame();
  return motionAt(frame, kind, opts);
};

/**
 * 序列错位：第 i 个元素的延迟帧数。
 * 一行卡片想"依次出现"就传 delay: stagger(i)，不要手写 0 / 6 / 12…
 */
export const stagger = (index: number, step = 6, start = 0): number => start + index * step;

// ---------------------------------------------------------------------------
// 数值类工具（同样是纯函数）
// ---------------------------------------------------------------------------

/**
 * 数字滚动：从 from 数到 to，到 duration 帧后停住（纯函数，输出当前值）。
 * decimals 是小数位（内部用四舍五入，不用 toFixed 的字符串，方便直接参与计算）。
 */
export const countUp = (
  frame: number,
  opts: {
    from?: number;
    to: number;
    duration?: number;
    delay?: number;
    decimals?: number;
    ease?: EaseName;
  }
): number => {
  const from = opts.from ?? 0;
  const duration = Math.max(1, opts.duration ?? DURATION);
  const delay = opts.delay ?? 0;
  const decimals = Math.max(0, Math.min(10, opts.decimals ?? 0));
  const p = ease(opts.ease ?? 'out')((frame - delay) / duration);
  const v = from + (opts.to - from) * p;
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
};

/**
 * 打字机：按进度返回前 n 个字符。
 * cps = 字符/秒，用 fps（默认取项目 config 的 FPS）换算成每帧字符数；
 * 用 Array.from 切分，避免把 emoji / 代理对劈成半个字符。
 */
export const typewriter = (
  text: string,
  frame: number,
  opts: { delay?: number; cps?: number; fps?: number } = {}
): string => {
  const delay = opts.delay ?? 0;
  const cps = opts.cps ?? 24;
  const fps = opts.fps ?? FPS;
  const chars = Math.max(0, Math.floor((frame - delay) * (cps / Math.max(1, fps))));
  return Array.from(text)
    .slice(0, chars)
    .join('');
};

/**
 * 进度条 / 高亮条这类"从 0 长到 1"的量。
 * 返回 0..100 的百分数，可以直接写 width: `${progress(frame)}%`。
 */
export const progress = (
  frame: number,
  opts: { delay?: number; duration?: number; ease?: EaseName } = {}
): number => {
  const delay = opts.delay ?? 0;
  const duration = Math.max(1, opts.duration ?? DURATION);
  const p = ease(opts.ease ?? 'out')((frame - delay) / duration);
  return 100 * clamp01(p);
};
