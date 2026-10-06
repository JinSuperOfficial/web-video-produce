import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { COLORS } from '../config';
import { FONT, MONO } from '../fonts';
import {
  MotionKind,
  countUp,
  motionAt,
  progress,
  stagger,
  typewriter,
  useMotion,
} from '../motion';
import {
  TransitionKind,
  TransitionOverlay,
  useSceneEnter,
  useSceneExit,
} from '../transitions';

/**
 * ShowcaseScene —— 动作库 / 转场库的自检剧场
 * =====================================================================
 * 660 帧里把 11 种 MotionKind 与 11 种 TransitionKind 各跑一遍，全部由帧号驱动，
 * 抽任意一帧都能渲（不做全片渲染也能验收）。
 *
 * 时间表（纯常量，改这里就能改节奏）：
 *
 *   帧 0    .. 18      引子：11 种动作 / 11 种转场 / 660 帧
 *   帧 18   .. 326     11 个"转场小节"，每节 28 帧（覆盖层 + 出场 + 入场）
 *   帧 326  .. 660     11 个"动作小节"，每节 30 帧（最后一节 34 帧收满 660）
 *
 * 每个转场小节的内部结构（局部帧 0..27，切点在第 14 帧）：
 *
 *   0 ── 7 ──────── 14 ──────── 21 ── 27
 *   │ 场景 A 常态 │ A 出场(7f) │ B 入场(7f)  │ 场景 B 常态 │
 *   │            │ 覆盖层 cover 半段        │
 *   │            │            │ 覆盖层 reveal 半段         │
 *
 *   覆盖层 <Sequence from={cut-7} durationInFrames={14}>，它的局部第 13 帧
 *   （= 小节局部第 20 帧 = 切点后第 6 帧）必须完全不可见 —— 也就是本文件里
 *   frame=150 那一帧，正好被验收用的 still 抽到。
 */

const MOTION_KINDS: MotionKind[] = [
  'fade',
  'rise',
  'sink',
  'pop',
  'blur',
  'zoomIn',
  'zoomOut',
  'slideLeft',
  'slideRight',
  'flipX',
  'swing',
];

const TRANSITION_KINDS: TransitionKind[] = [
  'fade',
  'dipToBlack',
  'wipeLeft',
  'wipeRight',
  'wipeUp',
  'wipeDown',
  'slidePush',
  'zoomPunch',
  'whipPan',
  'glitchCut',
  'circleOpen',
];

const MOTION_ZH: Record<MotionKind, string> = {
  fade: '只做透明度，最安静的一种',
  rise: '由下往上浮起',
  sink: '由上往下落入',
  pop: '带过冲的缩放，弹到位',
  blur: '模糊 12px → 0，虚焦聚焦',
  zoomIn: '从 0.9 倍推到 1 倍',
  zoomOut: '从 1.1 倍缩回 1 倍',
  slideLeft: '从右侧滑入，向左归位',
  slideRight: '从左侧滑入，向右归位',
  flipX: '绕水平轴翻起，像翻卡片',
  swing: '摆锤式入场，中途回摆一次',
};

const TRANSITION_ZH: Record<TransitionKind, string> = {
  fade: '纯色块淡入再淡出，溶解式转场',
  dipToBlack: '中段保持全黑，真正的黑场停留',
  wipeLeft: '色块从右往左扫过整屏',
  wipeRight: '色块从左往右扫过整屏',
  wipeUp: '色块从下往上扫过整屏',
  wipeDown: '色块从上往下扫过整屏',
  slidePush: '硬边色块推挤，前缘带高光条',
  zoomPunch: '色块拉近盖满后冲出镜头，带白闪',
  whipPan: '六条斜柱横扫，制造甩镜拖影',
  glitchCut: '九条切片台阶式错位，故障切割',
  circleOpen: '圆形遮罩涨满再收拢',
};

const LEAD_IN = 18;
const T_ACT = 28; // 转场小节长度
const T_CUT = 14; // 小节内的切点
const T_HALF = 7; // 转场半段（覆盖 / 揭开）
const M_START = LEAD_IN + T_ACT * TRANSITION_KINDS.length; // 326
const M_ACT = 30;

/** 最后一节动作小节吃掉剩下的帧数，保证正好铺满 durationInFrames。 */
const motionActLength = (index: number, total: number): number => {
  if (index < MOTION_KINDS.length - 1) return M_ACT;
  return Math.max(1, total - (M_START + M_ACT * (MOTION_KINDS.length - 1)));
};

// ---------------------------------------------------------------------------
// 当前小节信息（顶栏 / 导轨都读它）
// ---------------------------------------------------------------------------

type ActInfo = {
  phase: 'intro' | 'transition' | 'motion';
  /** 轮播里的位置：0..10 转场，11..21 动作，引子为 -1 */
  slot: number;
  name: string;
  zh: string;
  local: number;
  length: number;
};

const actAt = (frame: number, total: number): ActInfo => {
  if (frame < LEAD_IN) {
    return {
      phase: 'intro',
      slot: -1,
      name: 'MOTION x TRANSITION',
      zh: '11 种动作 · 11 种转场 · 每一帧都是纯函数',
      local: frame,
      length: LEAD_IN,
    };
  }
  if (frame < M_START) {
    const i = Math.min(
      TRANSITION_KINDS.length - 1,
      Math.floor((frame - LEAD_IN) / T_ACT)
    );
    const kind = TRANSITION_KINDS[i];
    return {
      phase: 'transition',
      slot: i,
      name: kind,
      zh: TRANSITION_ZH[kind],
      local: frame - (LEAD_IN + i * T_ACT),
      length: T_ACT,
    };
  }
  const j = Math.min(
    MOTION_KINDS.length - 1,
    Math.floor((frame - M_START) / M_ACT)
  );
  const kind = MOTION_KINDS[j];
  return {
    phase: 'motion',
    slot: TRANSITION_KINDS.length + j,
    name: kind,
    zh: MOTION_ZH[kind],
    local: frame - (M_START + M_ACT * j),
    length: motionActLength(j, total),
  };
};

// ---------------------------------------------------------------------------
// 小组件
// ---------------------------------------------------------------------------

const Chip: React.FC<{ label: string; active: boolean; style?: React.CSSProperties }> = ({
  label,
  active,
  style,
}) => (
  <div
    style={{
      flex: '1 1 0',
      minWidth: 0,
      textAlign: 'center',
      padding: '7px 0',
      borderRadius: 8,
      fontFamily: MONO,
      fontSize: 15,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      color: active ? COLORS.bg0 : COLORS.dim,
      background: active ? COLORS.accent : 'rgba(255,255,255,.05)',
      border: `1px solid ${active ? COLORS.accent : 'rgba(255,255,255,.08)'}`,
      fontWeight: active ? 700 : 400,
      ...style,
    }}
  >
    {label}
  </div>
);

const RailRow: React.FC<{ label: string; names: string[]; offset: number; active: number }> = ({
  label,
  names,
  offset,
  active,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
    <div
      style={{
        width: 150,
        fontFamily: MONO,
        fontSize: 15,
        letterSpacing: 2,
        color: COLORS.dim,
        textAlign: 'right',
      }}
    >
      {label}
    </div>
    <div style={{ flex: 1, display: 'flex', gap: 6 }}>
      {names.map((name, i) => (
        <Chip key={`${offset + i}-${name}`} label={name} active={offset + i === active} />
      ))}
    </div>
  </div>
);

/** 动作小节的演示卡：一张卡讲一个 MotionKind。 */
const DemoCard: React.FC<{ kind: MotionKind; ghost?: boolean }> = ({ kind, ghost }) => (
  <div
    style={{
      width: 560,
      height: 268,
      borderRadius: 24,
      padding: '30px 38px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 14,
      background: 'linear-gradient(150deg, rgba(255,255,255,.10), rgba(255,255,255,.03))',
      border: `1px solid ${ghost ? 'rgba(94,234,212,.25)' : COLORS.accent}`,
      boxShadow: '0 26px 70px rgba(0,0,0,.45)',
    }}
  >
    <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 900, color: COLORS.accent }}>
      {kind}
    </div>
    <div style={{ fontSize: 26, color: COLORS.dim, lineHeight: 1.4 }}>{MOTION_ZH[kind]}</div>
  </div>
);

/** 转场小节里的场景卡：A 用 useSceneExit 出场，B 用 useSceneEnter 入场。 */
const SceneCard: React.FC<{
  variant: 'A' | 'B';
  kind: TransitionKind;
  slot: number;
  style: React.CSSProperties;
}> = ({ variant, kind, slot, style }) => {
  const isA = variant === 'A';
  const tint = isA ? COLORS.accent2 : COLORS.accent;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 1180,
          height: 420,
          borderRadius: 28,
          padding: '44px 56px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 18,
          background: isA
            ? 'linear-gradient(140deg, rgba(240,171,252,.16), rgba(8,11,20,.9))'
            : 'linear-gradient(140deg, rgba(94,234,212,.16), rgba(8,11,20,.9))',
          border: `2px solid ${tint}`,
          boxShadow: '0 30px 90px rgba(0,0,0,.5)',
          ...style,
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: 6, color: tint }}>
          {isA ? `SCENE A · 正在离开 · #${slot}` : `SCENE B · 正在进入 · #${slot}`}
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 66,
            fontWeight: 900,
            color: COLORS.ink,
            lineHeight: 1.1,
          }}
        >
          {kind}
        </div>
        <div style={{ fontSize: 28, color: COLORS.dim, lineHeight: 1.45 }}>
          {TRANSITION_ZH[kind]}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 19, color: 'rgba(255,255,255,.45)' }}>
          {isA ? 'useSceneExit(kind, 7, 14)' : 'useSceneEnter(kind, 7)'}
        </div>
      </div>
    </div>
  );
};

const ExitingSceneCard: React.FC<{ kind: TransitionKind; slot: number }> = ({ kind, slot }) => {
  // 卡 A 的 Sequence 长 14 帧；最后 7 帧出场，与覆盖层的 cover 半段完全对齐。
  const style = useSceneExit(kind, T_HALF, T_CUT);
  return <SceneCard variant="A" kind={kind} slot={slot} style={style} />;
};

const EnteringSceneCard: React.FC<{ kind: TransitionKind; slot: number }> = ({ kind, slot }) => {
  // 卡 B 从切点开始，前 7 帧入场，与覆盖层的 reveal 半段完全对齐。
  const style = useSceneEnter(kind, T_HALF);
  return <SceneCard variant="B" kind={kind} slot={slot} style={style} />;
};

// ---------------------------------------------------------------------------
// 小节
// ---------------------------------------------------------------------------

const TransitionAct: React.FC<{ kind: TransitionKind; slot: number }> = ({ kind, slot }) => (
  <>
    <Sequence from={0} durationInFrames={T_CUT}>
      <ExitingSceneCard kind={kind} slot={slot} />
    </Sequence>
    <Sequence from={T_CUT} durationInFrames={T_ACT - T_CUT}>
      <EnteringSceneCard kind={kind} slot={slot} />
    </Sequence>
    {/* 覆盖层跨越切点：峰值(全遮)落在第 14 帧，最后一帧(局部 13)返回 null */}
    <Sequence from={T_CUT - T_HALF} durationInFrames={T_HALF * 2}>
      <TransitionOverlay kind={kind} durationInFrames={T_HALF * 2} />
    </Sequence>
  </>
);

const MotionAct: React.FC<{ kind: MotionKind; slot: number; length: number }> = ({
  kind,
  slot,
  length,
}) => {
  const frame = useCurrentFrame();
  const D = 18;
  const opts = { duration: D, distance: 64, from: 0.86 };
  const main = motionAt(frame, kind, opts);
  const ghosts = [3, 6, 9];

  return (
    <div style={{ display: 'flex', height: '100%', gap: 70, alignItems: 'center' }}>
      {/* 左：主卡 + 洋葱皮（同一动作在更早帧上的形态，让静帧也能看出轨迹） */}
      <div style={{ position: 'relative', width: 980, height: '100%' }}>
        {ghosts.map((back, k) => (
          <div
            key={back}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.18 - k * 0.05,
            }}
          >
            <div style={motionAt(frame - back, kind, opts)}>
              <DemoCard kind={kind} ghost />
            </div>
          </div>
        ))}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={main}>
            <DemoCard kind={kind} />
          </div>
        </div>
      </div>

      {/* 右：错位 / 数值 / 打字机 / 进度条 —— 同一套库里的其它工具 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: 3, color: COLORS.accent2 }}>
          STAGGER · motionAt(frame, '{kind}', {'{'} delay: stagger(i, 4) {'}'})
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: '14px 20px',
              borderRadius: 12,
              fontSize: 22,
              color: COLORS.ink,
              background: 'rgba(255,255,255,.06)',
              border: '1px solid rgba(255,255,255,.10)',
              ...motionAt(frame, kind, { duration: D, distance: 40, delay: stagger(i, 4) }),
            }}
          >
            第 {i + 1} 个元素 · delay {stagger(i, 4)} 帧
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 16, color: COLORS.dim }}>progress()</span>
          <div
            style={{
              flex: 1,
              height: 10,
              borderRadius: 6,
              background: 'rgba(255,255,255,.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress(frame, { duration: D })}%`,
                background: COLORS.accent,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <span style={{ fontFamily: MONO, fontSize: 16, color: COLORS.dim }}>countUp()</span>
          <span style={{ fontFamily: MONO, fontSize: 40, color: COLORS.warm, fontWeight: 700 }}>
            {countUp(frame, { to: (slot + 1) * 7, duration: 20 })}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 16, color: COLORS.dim }}>
            {typewriter(`motionAt(frame, '${kind}')`, frame, { cps: 46 })}
          </span>
        </div>

        <div style={{ fontFamily: MONO, fontSize: 15, color: 'rgba(255,255,255,.38)' }}>
          本小节 {length} 帧 · 局部帧 {frame}
        </div>
      </div>
    </div>
  );
};

/** 引子里的一枚数字条：错位入场（delay = stagger(index, 4)）。 */
const IntroChip: React.FC<{ text: string; index: number }> = ({ text, index }) => {
  const style = useMotion('rise', {
    delay: stagger(index, 4),
    duration: 16,
    distance: 34,
  });
  return (
    <div
      style={{
        padding: '22px 34px',
        borderRadius: 18,
        fontSize: 34,
        color: COLORS.accent,
        background: 'rgba(94,234,212,.10)',
        border: `1px solid ${COLORS.accent}55`,
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/** 引子：标题弹出 + 三枚数字条依次错位入场。 */
const Intro: React.FC = () => {
  const title = useMotion('pop', { duration: 14, from: 0.8 });
  const items = ['11 种动作', '11 种转场', '660 帧纯函数'];
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          ...title,
          fontSize: 108,
          fontWeight: 900,
          color: COLORS.ink,
          letterSpacing: 4,
        }}
      >
        动作库 × 转场库
      </div>
      <div style={{ display: 'flex', gap: 26, marginTop: 54 }}>
        {items.map((text, i) => (
          <IntroChip key={text} text={text} index={i} />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 场景
// ---------------------------------------------------------------------------

export const ShowcaseScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const act = actAt(frame, durationInFrames);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg0, fontFamily: FONT }}>
      <Backdrop />

      {/* 顶栏：当前 kind 名字（打字机）+ 中文说明 + 轮播序号 + 本节进度 */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: 44 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 19,
                letterSpacing: 9,
                color: COLORS.accent,
              }}
            >
              MOTION / TRANSITIONS
            </div>
            <div
              style={{
                marginTop: 10,
                fontFamily: MONO,
                fontSize: 60,
                fontWeight: 900,
                color: COLORS.ink,
                letterSpacing: 1,
                minHeight: 72,
              }}
            >
              {typewriter(act.name, act.local, { cps: 34 })}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, color: COLORS.dim }}>{act.zh}</div>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                gap: 20,
                alignItems: 'baseline',
                justifyContent: 'flex-end',
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 38, color: COLORS.warm, fontWeight: 700 }}>
                {act.slot < 0 ? '--' : String(act.slot + 1).padStart(2, '0')} / 22
              </span>
              <span style={{ fontFamily: MONO, fontSize: 21, color: COLORS.dim, letterSpacing: 2 }}>
                {act.phase === 'transition' ? 'TRANSITION' : act.phase === 'motion' ? 'MOTION' : 'INTRO'}
              </span>
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 16,
            height: 6,
            borderRadius: 3,
            background: 'rgba(255,255,255,.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress(act.local, { duration: Math.max(1, act.length), ease: 'linear' })}%`,
              background: COLORS.accent,
            }}
          />
        </div>
      </div>

      {/* 中部演示区 */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: 240, bottom: 210 }}>
        {frame < LEAD_IN ? <Intro /> : null}

        {TRANSITION_KINDS.map((kind, i) => (
          <Sequence key={`t-${kind}`} from={LEAD_IN + i * T_ACT} durationInFrames={T_ACT}>
            <TransitionAct kind={kind} slot={i + 1} />
          </Sequence>
        ))}

        {MOTION_KINDS.map((kind, j) => (
          <Sequence
            key={`m-${kind}`}
            from={M_START + j * M_ACT}
            durationInFrames={motionActLength(j, durationInFrames)}
          >
            <MotionAct
              kind={kind}
              slot={TRANSITION_KINDS.length + j}
              length={motionActLength(j, durationInFrames)}
            />
          </Sequence>
        ))}
      </div>

      {/* 底部导轨：22 个 kind 的循环轮播 + 全局进度 */}
      <div style={{ position: 'absolute', left: 80, right: 80, bottom: 40 }}>
        <RailRow label="TRANSITION" names={TRANSITION_KINDS} offset={0} active={act.slot} />
        <RailRow
          label="MOTION"
          names={MOTION_KINDS}
          offset={TRANSITION_KINDS.length}
          active={act.slot}
        />
        <div
          style={{
            marginTop: 12,
            height: 4,
            borderRadius: 2,
            background: 'rgba(255,255,255,.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress(frame, {
                duration: Math.max(1, durationInFrames - 1),
                ease: 'linear',
              })}%`,
              background: COLORS.accent2,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
