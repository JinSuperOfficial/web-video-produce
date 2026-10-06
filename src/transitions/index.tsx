import React from 'react';
import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../config';

/**
 * transitions —— 转场层（覆盖式转场 + 入场/出场样式）
 * =====================================================================
 * 和 motion 一样，所有东西都由帧号算出来：没有 CSS transition、没有 @keyframes、
 * 没有 animation 属性。抽任意一帧渲染，结果都是可复现的。
 *
 * 三个导出的分工（用一次转场只需要三件事）：
 *
 *   1. useSceneExit(kind, D, total)  —— 给"要离开的场景"的根节点加样式
 *   2. TransitionOverlay             —— 覆盖层，画在最上层，负责"遮挡 → 揭开"
 *   3. useSceneEnter(kind, D)        —— 给"即将出现的场景"的根节点加样式
 *
 * 时间轴（D = durationInFrames，cut = 切点）：
 *
 *        覆盖层 Sequence  = [cut - D/2, cut + D/2)
 *        ├── 前半段：场景 A 用 useSceneExit 退出（同时被覆盖层盖住）
 *        └── 后半段：覆盖层揭开，场景 B 用 useSceneEnter 入场
 *
 *   帧:   cut-D/2        cut         cut+D/2
 *          ├──────────────┼──────────────┤
 *   A 出场 ████████████████│
 *   覆盖层 ░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒   ← 峰值(全遮)正好落在 cut
 *   B 入场 │              ████████████████
 *
 * 摆放覆盖层的两种写法（都能用，区别只在于"遮挡峰值落在哪一帧"）：
 *   · <Sequence from={cut - Math.round(D/2)} durationInFrames={D}>  → 峰值 = cut（推荐，真正跨切点）
 *   · <Sequence from={cut - D} durationInFrames={D}>                → 峰值 = cut - D/2（整段发生在切点之前）
 * 两种写法下，覆盖层在第 D-1 帧（局部帧）都保证完全不可见：几何转场已经整块移出画面，
 * 透明度转场 alpha 精确为 0，u===0 / u===1 时组件直接返回 null，不会留任何色块。
 *
 * 每种转场的几何形态（u 为覆盖层的归一化局部时间 0→1）：
 *
 *   fade        纯色块 alpha: 0 → 1 → 0（三次缓出进 / 三次缓入出）—— 溶解
 *   dipToBlack  同 fade，但中段 28%~72% 保持 alpha=1（真正的"黑场停留"）
 *   wipeLeft    全屏色块沿 X 轴 从右侧(+100%) 扫到 左侧(-100%)，x = 100 - 200u
 *   wipeRight   镜像：x = -100 + 200u
 *   wipeUp      沿 Y 轴 从下方(+100%) 扫到 上方(-100%)，y = 100 - 200u
 *   wipeDown    镜像：y = -100 + 200u
 *   slidePush   和 wipeLeft 同轨迹，但硬边 + 前缘挂一条 accent 竖条（"推"的力感）
 *   zoomPunch   色块先 scale 1.5→1 急速拉近盖满，再 scale 1→2.1 冲过镜头并淡出；
 *               u≈0.5 叠一层白色闪光（sin 包络，两端为 0）
 *   whipPan     6 条 44% 宽的高柱，整体 x = -130% → +130%，每条再按索引错开 4%，
 *               并 skewX(-14°) 造成"运动拖影"；柱间重叠 27% > 剪切位移 14%，不会露缝
 *   glitchCut   9 条水平切片，按 u 量化成 7 个台阶，每条用确定性哈希取横向错位 ±45px，
 *               少数切片染成 accent 色，整层 alpha 跟随遮挡曲线
 *   circleOpen  clip-path: circle(R% at 50% 50%)，R = 0 → 75 → 0（75% 足以盖满 16:9 四角）
 */

export type TransitionKind =
  | 'fade'
  | 'dipToBlack'
  | 'wipeLeft'
  | 'wipeRight'
  | 'wipeUp'
  | 'wipeDown'
  | 'slidePush'
  | 'zoomPunch'
  | 'whipPan'
  | 'glitchCut'
  | 'circleOpen';

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 确定性伪随机（0..1）：同样的入参永远同样的输出，用来替代 Math.random。 */
const hash01 = (n: number): number => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * 把"局部帧"折算成 [0,1] 的过渡进度：第 0 帧 = 0，第 durationInFrames-1 帧 = 1。
 * 用 durationInFrames-1 作分母，是为了让"动作完成"与"最后一帧"严格对齐。
 */
const spanProgress = (local: number, durationInFrames: number): number => {
  if (durationInFrames <= 1) return 1;
  return clamp01(local / (durationInFrames - 1));
};

const outCubic = Easing.out(Easing.cubic);
const inCubic = Easing.in(Easing.cubic);

/** 遮挡曲线：0 → 1 → 0，两端精确为 0，峰值在 u = 0.5 的切点上。 */
const coverTri = (u: number): number => {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.5) return outCubic(u / 0.5);
  return 1 - inCubic((u - 0.5) / 0.5);
};

/** 黑场曲线：中段保持全遮，形成"黑一下"的停留。 */
const coverDip = (u: number): number => {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.28) return outCubic(u / 0.28);
  if (u < 0.72) return 1;
  return 1 - inCubic((u - 0.72) / 0.28);
};

/** 扫过式转场的"前缘高光"：只是一层半透明白渐变，不增加 DOM。 */
const leadGlow = (edge: 'left' | 'right' | 'top' | 'bottom'): string => {
  const deg = edge === 'left' ? '90deg' : edge === 'right' ? '270deg' : edge === 'top' ? '180deg' : '0deg';
  return `linear-gradient(${deg}, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 14%)`;
};

// ---------------------------------------------------------------------------
// 入场 / 出场样式
// ---------------------------------------------------------------------------

/**
 * 入场样式：p = 0 是"还看不见的初态"，p = 1 是"完全到位的常态"。
 * 几何方向与同名覆盖层完全对齐（覆盖层从哪边揭开，场景就从哪边长出来）。
 */
const enterStyle = (kind: TransitionKind, rawP: number): React.CSSProperties => {
  const p = clamp01(rawP);
  // 入场完成后返回**空样式**，而不是一套"恒等样式"（scale(1) / inset(0) / opacity:1）：
  // 恒等的 transform / clip-path / filter 依然会让浏览器把全屏容器提升成独立合成层并逐帧重栅格化，
  // 白白付代价。只有动作真的在进行时才带样式。
  // （诚实备注：想在本机量化这个差异时，测量被两个被杀掉的渲染任务残留进程污染了，
  //   没能隔离出可靠收益 —— 所以这是"按原理做对"，不是"实测提升 N 倍"。）
  if (p >= 1) return {};
  const e = outCubic(p);
  const rest = (1 - p) * 100;

  switch (kind) {
    case 'fade':
      return { opacity: p, transform: 'none' };

    case 'dipToBlack':
      // 从黑场里透出来：透明度先快后慢，再叠一点亮度恢复，"黑"才像黑。
      return { opacity: e, transform: 'none', filter: `brightness(${0.35 + 0.65 * p})` };

    // 揭开顺序与覆盖层相反相成：覆盖层从右往左扫走，露出的就是画面右侧。
    case 'wipeLeft':
      return { opacity: 1, clipPath: `inset(0 0 0 ${rest}%)` };
    case 'wipeRight':
      return { opacity: 1, clipPath: `inset(0 ${rest}% 0 0)` };
    case 'wipeUp':
      return { opacity: 1, clipPath: `inset(${rest}% 0 0 0)` };
    case 'wipeDown':
      return { opacity: 1, clipPath: `inset(0 0 ${rest}% 0)` };

    case 'slidePush':
      // 从右侧被推进来：位移用百分比，相对自身宽度 = 正好一屏。
      return { opacity: 1, transform: `translate3d(${rest}%, 0, 0)` };

    case 'zoomPunch':
      // 从 1.45 倍冲回 1 倍，像被"砸"到位。
      return {
        opacity: e,
        transform: `scale(${1.45 - 0.45 * p})`,
        transformOrigin: 'center center',
      };

    case 'whipPan':
      // 从左侧甩进来，带一点剪切拖影。
      return {
        opacity: clamp01(p * 1.6),
        transform: `translate3d(${-45 * (1 - p)}%, 0, 0) skewX(${-10 * (1 - p)}deg)`,
      };

    case 'glitchCut': {
      // 分段台阶跳变：每 ~2 帧换一次横向错位，透明度快速咬合。
      const step = Math.floor(p * 6);
      const jitter = (hash01(step * 7.3 + 1.7) - 0.5) * 50 * (1 - p);
      return {
        opacity: clamp01(p * 1.7),
        transform: `translate3d(${jitter}px, 0, 0)`,
      };
    }

    case 'circleOpen': {
      // 覆盖层的圆在收拢，所以"先露出来的是四角"：用 mask 挖掉中间那个圆。
      const r = (1 - p) * 75;
      const mask = `radial-gradient(circle at 50% 50%, transparent ${r}%, #000 ${r}%)`;
      return { opacity: 1, maskImage: mask, WebkitMaskImage: mask };
    }

    default:
      return { opacity: p };
  }
};

/**
 * 出场样式：p = 0 是常态，p = 1 是"已经完全退出/被盖住"。
 * 方向同样与覆盖层对齐：覆盖层从哪边盖过来，场景就从哪边消失。
 */
const exitStyle = (kind: TransitionKind, rawP: number): React.CSSProperties => {
  const p = clamp01(rawP);
  // 还没开始淡出时不返回任何样式（同理：恒等样式 = 白付一层合成开销）。
  // 注意只跳过 p<=0；p 到 1 时是"已经淡出完毕"（如 opacity 0），那是有意义的终态，不能跳。
  if (p <= 0) return {};
  const gone = p * 100;

  switch (kind) {
    case 'fade':
      return { opacity: 1 - p };

    case 'dipToBlack':
      // 沉入黑暗：透明度用缓入（后段掉得快），亮度同步压下去，接得住黑场停留。
      return { opacity: 1 - inCubic(p), filter: `brightness(${1 - 0.65 * p})` };

    case 'wipeLeft':
      return { opacity: 1, clipPath: `inset(0 ${gone}% 0 0)` };
    case 'wipeRight':
      return { opacity: 1, clipPath: `inset(0 0 0 ${gone}%)` };
    case 'wipeUp':
      return { opacity: 1, clipPath: `inset(0 0 ${gone}% 0)` };
    case 'wipeDown':
      return { opacity: 1, clipPath: `inset(${gone}% 0 0 0)` };

    case 'slidePush':
      return { opacity: 1, transform: `translate3d(${-gone}%, 0, 0)` };

    case 'zoomPunch':
      return {
        opacity: 1 - outCubic(p),
        transform: `scale(${1 + 0.7 * p})`,
        transformOrigin: 'center center',
      };

    case 'whipPan':
      return {
        opacity: 1 - clamp01(p * 0.7),
        transform: `translate3d(${45 * p}%, 0, 0) skewX(${12 * p}deg)`,
      };

    case 'glitchCut': {
      const step = Math.floor(p * 6);
      const jitter = (hash01(step * 5.1 + 9.3) - 0.5) * 50 * p;
      return { opacity: 1 - clamp01(p * 1.7), transform: `translate3d(${jitter}px, 0, 0)` };
    }

    case 'circleOpen':
      // 覆盖层的圆从中心涨起来，所以画面是"从中心被吃掉"：可用区域收成一个圆。
      return { opacity: 1, clipPath: `circle(${(1 - p) * 75}% at 50% 50%)` };

    default:
      return { opacity: 1 - p };
  }
};

/**
 * 入场：把即将出现的场景内容做入场处理（返回给场景根 AbsoluteFill 的 style）。
 * 内部读 useCurrentFrame()，即"场景自己的局部帧"——场景 Sequence 从切点开始时，
 * 局部第 0 帧就是切点那一帧。
 */
export const useSceneEnter = (
  kind: TransitionKind,
  durationInFrames: number
): React.CSSProperties => {
  const frame = useCurrentFrame();
  return enterStyle(kind, spanProgress(frame, durationInFrames));
};

/**
 * 出场：把即将被替换的场景内容做出场处理。
 *
 * 注意一个坑：Remotion 的 useVideoConfig().durationInFrames 返回的是 **Composition**
 * 的总时长，不是当前 <Sequence> 的时长。所以当场景被放进 <Sequence> 时，
 * 必须把该 Sequence 的 durationInFrames 作为第三个参数传进来，本函数才知道
 * "最后 D 帧"从哪里开始。场景本身就是 Composition 时可以省略。
 */
export const useSceneExit = (
  kind: TransitionKind,
  durationInFrames: number,
  totalFrames?: number
): React.CSSProperties => {
  const frame = useCurrentFrame();
  const { durationInFrames: compDuration } = useVideoConfig();
  const total = totalFrames ?? compDuration;
  const start = Math.max(0, total - durationInFrames);
  return exitStyle(kind, spanProgress(frame - start, durationInFrames));
};

// ---------------------------------------------------------------------------
// 覆盖层
// ---------------------------------------------------------------------------

const OVERLAY_BASE: React.CSSProperties = {
  pointerEvents: 'none',
  zIndex: 1200,
};

/**
 * 覆盖层：自身放在一个跨越切点的 <Sequence> 里，用局部帧在 durationInFrames 内
 * 完成一次"遮挡 → 揭开"。必须画在最上层（AbsoluteFill + pointerEvents: none），
 * 并且最后一帧完全不可见。
 */
export const TransitionOverlay: React.FC<{
  kind: TransitionKind;
  durationInFrames: number;
  /** 默认用 config 的 bg0 */
  color?: string;
}> = ({ kind, durationInFrames, color = COLORS.bg0 }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const last = Math.max(1, durationInFrames - 1);
  const u = clamp01(frame / last); // 0 → 1，最后一帧恰好是 1

  // 两端直接不渲染：既省一次合成，也从结构上保证"末尾那一帧不可能是纯色块"。
  if (u <= 0 || u >= 1) return null;

  switch (kind) {
    case 'fade':
    case 'dipToBlack': {
      const alpha = kind === 'fade' ? coverTri(u) : coverDip(u);
      return <AbsoluteFill style={{ ...OVERLAY_BASE, backgroundColor: color, opacity: alpha }} />;
    }

    // 扫过式：色块沿一个轴从画面外扫到另一个画面外，中点(u=0.5)刚好铺满。
    case 'wipeLeft':
    case 'wipeRight':
    case 'wipeUp':
    case 'wipeDown': {
      const horizontal = kind === 'wipeLeft' || kind === 'wipeRight';
      const sign = kind === 'wipeLeft' || kind === 'wipeUp' ? 1 : -1;
      const pos = sign * (100 - 200 * u); // 100 → -100（wipeLeft/Up）或 -100 → 100（镜像）
      const edge: 'left' | 'right' | 'top' | 'bottom' =
        kind === 'wipeLeft' ? 'left' : kind === 'wipeRight' ? 'right' : kind === 'wipeUp' ? 'top' : 'bottom';
      return (
        <AbsoluteFill
          style={{
            ...OVERLAY_BASE,
            backgroundColor: color,
            backgroundImage: leadGlow(edge),
            ...(horizontal
              ? { left: `${pos}%`, right: 'auto' }
              : { top: `${pos}%`, bottom: 'auto' }),
          }}
        />
      );
    }

    case 'slidePush': {
      // 与 wipeLeft 同轨迹，但硬边 + 前缘一条 accent 竖条，读起来是"被推走"。
      const x = 100 - 200 * u;
      return (
        <AbsoluteFill
          style={{
            ...OVERLAY_BASE,
            backgroundColor: color,
            left: `${x}%`,
            right: 'auto',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 90,
              background: COLORS.accent,
              opacity: 0.85,
            }}
          />
        </AbsoluteFill>
      );
    }

    case 'zoomPunch': {
      // 遮挡 = 色块急速拉近盖满 → 再继续放大冲过镜头并淡出；峰值那一帧加一道白闪。
      const alpha = coverTri(u);
      const scale = u <= 0.5 ? 1.5 - 1.0 * (u / 0.5) : 1 + 1.1 * ((u - 0.5) / 0.5);
      // 白闪必须是"一下"，不是"一层灰幕"。
      // 踩过的坑：最初窗口取 u∈[0.32,0.68] 且不透明度 0.5*sin(...)，14 帧的转场里有 5 帧
      // 叠加了半透明白 —— 实测切点整屏 RGB 均值从背景的 #080b14 变成 #7b7c83（中灰），
      // 连续 3~5 帧。那看起来不像"闪"，像渲染坏了（抽帧一眼就能看出是块灰板）。
      // 现在窗口收窄到 u∈[0.43,0.57]（14 帧转场里只有 1~2 帧），配平方收敛 → 尖而短。
      const flash = Math.pow(clamp01(1 - Math.abs(u - 0.5) / 0.07), 2);
      return (
        <AbsoluteFill
          style={{
            ...OVERLAY_BASE,
            backgroundColor: color,
            opacity: alpha,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <AbsoluteFill style={{ backgroundColor: '#ffffff', opacity: 0.7 * flash }} />
        </AbsoluteFill>
      );
    }

    case 'whipPan': {
      // 6 条宽柱整体横扫 + skewX 拖影；柱宽 44%、间距 16.67%，重叠足够不露缝。
      const N = 6;
      const dxPct = -130 + 260 * u;
      return (
        <AbsoluteFill style={{ ...OVERLAY_BASE }}>
          {Array.from({ length: N }, (_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(i * 100) / N - 18}%`,
                width: '44%',
                backgroundColor: color,
                opacity: i % 2 === 0 ? 1 : 0.94,
                transform: `translate3d(${((dxPct + i * 4) / 100) * width}px, 0, 0) skewX(-14deg)`,
              }}
            />
          ))}
        </AbsoluteFill>
      );
    }

    case 'glitchCut': {
      // 9 条水平切片，按 u 量化成 7 个台阶做横向错位；错位量随遮挡曲线收敛到 0。
      const alpha = coverTri(u);
      const ROWS = 9;
      const step = Math.floor(u * 7);
      return (
        <AbsoluteFill style={{ ...OVERLAY_BASE, opacity: alpha }}>
          {Array.from({ length: ROWS }, (_, r) => {
            const jitter = (hash01(r * 13.7 + step * 7.3) - 0.5) * 90;
            const tinted = hash01(r * 3.1 + step) > 0.78;
            return (
              <div
                key={r}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: `${(r * 100) / ROWS}%`,
                  height: `${100 / ROWS + 1}%`,
                  backgroundColor: tinted ? (r % 2 === 0 ? COLORS.accent : COLORS.accent2) : color,
                  transform: `translate3d(${jitter * alpha}px, 0, 0)`,
                }}
              />
            );
          })}
        </AbsoluteFill>
      );
    }

    case 'circleOpen': {
      // 圆形涨满再收拢：75% 的半径足以盖满 16:9 的四个角。
      const r = u <= 0.5 ? 75 * (u / 0.5) : 75 * (1 - (u - 0.5) / 0.5);
      return (
        <AbsoluteFill
          style={{
            ...OVERLAY_BASE,
            backgroundColor: color,
            clipPath: `circle(${r}% at 50% 50%)`,
          }}
        />
      );
    }

    default:
      return <AbsoluteFill style={{ ...OVERLAY_BASE, backgroundColor: color, opacity: coverTri(u) }} />;
  }
};
