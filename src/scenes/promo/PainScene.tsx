import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { countUp, stagger, useMotion } from '../../motion';
import { Kicker, Panel, Title } from './kit';

const STEPS = [
  { label: '拍摄', note: '灯光、机位、收音，重来一条' },
  { label: '剪辑', note: '拖时间线，对齐口播' },
  { label: '对轴', note: '字幕一句句手动贴' },
  { label: '配字幕', note: '字号、断句、错别字' },
];

/** 秒 → H:MM:SS */
const hms = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

/**
 * 单张流程卡。必须独立成组件：useMotion 内部要调 useCurrentFrame，
 * 直接在 .map() 里调用会破坏 hook 顺序。
 */
const StepCard: React.FC<{ step: (typeof STEPS)[number]; delay: number; show: boolean }> = ({
  step,
  delay,
  show,
}) => {
  const style = useMotion('rise', { delay, duration: 15, distance: 40 });
  return (
    <div style={style}>
      <Panel
        style={{ position: 'relative', padding: '22px 26px', borderColor: 'rgba(255,120,120,.28)' }}
        tint="rgba(255,120,120,.08)"
      >
        <div style={{ fontSize: 40, fontWeight: 900, color: COLORS.ink, letterSpacing: 2 }}>
          {step.label}
        </div>
        <div style={{ marginTop: 8, fontSize: 21, color: COLORS.dim, lineHeight: 1.45 }}>
          {step.note}
        </div>
        {/* 红叉：帧到才出现，不用 CSS 动画 */}
        <div
          style={{
            position: 'absolute',
            right: 18,
            top: 16,
            fontFamily: MONO,
            fontSize: 34,
            fontWeight: 900,
            color: '#ff6b6b',
            opacity: show ? 1 : 0,
            transform: `scale(${show ? 1 : 0.6})`,
          }}
        >
          ✕
        </div>
      </Panel>
    </div>
  );
};

/**
 * 第 3 幕 · pain（277–450 帧，约 5.8 秒）
 *
 * 讲"原本有多麻烦"。计时器按用户 review 修正：不再夸张到 8 小时，
 * 改成从 0 缓慢累加到 4:00:00 —— 手剪一条一分钟的片子，4 小时是可信的上限。
 */
export const PainScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const timer = countUp(frame, { to: 4 * 3600, duration: 92, delay: 40, ease: 'out' });
  const timerGlow = frame > 40 ? 1 : 0;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: '150px 150px 240px' }}>
      <div>
        <Kicker color="#ff8f8f">传统流程</Kicker>
        <Title style={{ marginTop: 16 }} size={72}>
          一分钟的片子，磨一整天
        </Title>
      </div>

      <div style={{ display: 'flex', gap: 64, marginTop: 54, alignItems: 'flex-start' }}>
        {/* 左：四步流程 */}
        <div style={{ width: 900, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 22 }}>
          {STEPS.map((s, i) => (
            <StepCard key={s.label} step={s} delay={stagger(i, 8, 10)} show={frame > stagger(i, 8, 10) + 30} />
          ))}
        </div>

        {/* 右：计时器 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Panel
            style={{
              width: '100%',
              textAlign: 'center',
              padding: '40px 30px',
              ...useMotion('pop', { delay: 34, duration: 16, from: 0.88 }),
            }}
            tint="rgba(251,191,36,.10)"
          >
            <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 6, color: COLORS.dim }}>
              MANUAL EDIT TIME
            </div>
            <div
              style={{
                marginTop: 18,
                fontFamily: MONO,
                fontSize: 74,
                fontWeight: 900,
                color: COLORS.warm,
                letterSpacing: 3,
                textShadow: `0 0 ${26 * timerGlow}px ${COLORS.warm}66`,
              }}
            >
              {hms(timer)}
            </div>
            <div style={{ marginTop: 14, fontSize: 22, color: COLORS.dim, fontFamily: FONT }}>
              手剪一条 60 秒视频的真实耗时
            </div>
          </Panel>

          <div
            style={{
              marginTop: 22,
              fontFamily: MONO,
              fontSize: 20,
              color: COLORS.dim,
              opacity: frame > durationInFrames - 70 ? 1 : 0,
            }}
          >
            而这里，只写了一段脚本
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
