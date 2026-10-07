import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { useMotion } from '../../motion';
import { Kicker, Panel, Struck, Title } from './kit';

const ROWS = [
  { bad: '稿子写句号「。」', good: '逗号断句，或直接分段' },
  { bad: '分段合成', good: '整段韵律：一次请求，语调连续' },
  { bad: '语速 +10%', good: '语速 +0% ~ +5%，先降速再谈特效' },
];

/** 对比条：从 0 长到目标百分比。 */
const Bar: React.FC<{
  label: string;
  ratio: number;
  color: string;
  note: string;
  grow: number;
}> = ({ label, ratio, color, note, grow }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 21, color: COLORS.dim, fontFamily: FONT }}>{label}</span>
      <span style={{ fontSize: 21, color, fontFamily: MONO, fontWeight: 700 }}>{note}</span>
    </div>
    <div
      style={{
        height: 20,
        borderRadius: 6,
        background: 'rgba(255,255,255,.06)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${ratio * grow * 100}%`,
          background: color,
          borderRadius: 6,
        }}
      />
    </div>
  </div>
);

/**
 * 第 10 幕 · polish（1409–1595 帧，约 6.2 秒）
 *
 * 这一幕是"专业度"的证据：不是嘴上说配音自然，而是给三条硬约束和实测数字。
 * 数字全部来自 README：同稿分段 8.75s vs 整段 6.98s，差的 1.8 秒全是假停顿。
 */
export const PolishScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const head = useMotion('rise', { delay: 2, duration: 14, distance: 28 });
  const barsIn = useMotion('fade', { delay: 92, duration: 18 });

  const grow = interpolate(frame, [96, 150], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: '120px 150px 230px' }}>
      <div style={head}>
        <Kicker color={COLORS.warm}>三条硬约束</Kicker>
        <Title style={{ marginTop: 12 }} size={62}>
          踩过的坑，写进代码里了
        </Title>
      </div>

      <div style={{ display: 'flex', gap: 52, marginTop: 40 }}>
        {/* 左：错误做法 → 正确做法 */}
        <div style={{ width: 800 }}>
          {ROWS.map((r, i) => (
            <Row key={r.bad} row={r} delay={8 + i * 26} />
          ))}
        </div>

        {/* 右：实测对比 */}
        <div style={{ flex: 1, ...barsIn }}>
          <Panel tint="rgba(94,234,212,.08)">
            <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 5, color: COLORS.dim }}>
              MEASURED · 同一句稿
            </div>
            <div style={{ marginTop: 22 }}>
              <Bar label="分段合成（每段一次请求）" ratio={1} color="#ff6b6b" note="8.75s" grow={grow} />
              <Bar label="整段韵律（默认）" ratio={6.98 / 8.75} color={COLORS.accent} note="6.98s" grow={grow} />
            </div>
            <div
              style={{
                marginTop: 18,
                paddingTop: 16,
                borderTop: '1px solid rgba(255,255,255,.10)',
                fontSize: 24,
                color: COLORS.ink,
                lineHeight: 1.5,
              }}
            >
              差的 <span style={{ color: COLORS.warm, fontFamily: MONO, fontWeight: 900 }}>1.8 秒</span>
              ，全是每次请求自带的假停顿
            </div>
            <div style={{ marginTop: 14, fontSize: 20, color: COLORS.dim }}>
              另：BGM 用多频段 carve 而非整体压低 —— 不处理 −35.4dB / 整体闪避 −43.2dB /
              carve −36.1dB
            </div>
          </Panel>
          <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 18, color: COLORS.dim }}>
            本片 {durationInFrames} 帧 · 语速 +0% · 晓晓
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 单行对比。独立组件：useMotion 是 hook，不能写进 .map()。 */
const Row: React.FC<{ row: (typeof ROWS)[number]; delay: number }> = ({ row, delay }) => {
  const style = useMotion('rise', { delay, duration: 15, distance: 34 });
  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: '20px 26px',
        marginBottom: 16,
        borderRadius: 16,
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.09)',
      }}
    >
      <div style={{ width: 300, fontSize: 30, fontWeight: 900 }}>
        <Struck>{row.bad}</Struck>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 26, color: COLORS.accent }}>→</div>
      <div style={{ flex: 1, fontSize: 27, color: COLORS.ink, lineHeight: 1.35 }}>{row.good}</div>
    </div>
  );
};
