import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { useMotion } from '../../motion';
import { Chip } from './kit';

/**
 * 第 4 幕 · idea（450–587 帧，约 4.6 秒）
 *
 * 全片的"转折点"，只讲一句话。上一幕的黑场（dipToBlack）刚过，
 * 这里用最少的元素、最大的字号把观点砸出来，背景网格同步亮起当作"系统上线"的暗示。
 */
export const IdeaScene: React.FC<{ durationInFrames: number }> = () => {
  const frame = useCurrentFrame();
  const l1 = useMotion('rise', { delay: 4, duration: 16, distance: 40 });
  const l2 = useMotion('pop', { delay: 16, duration: 20, from: 0.8 });
  const badge = useMotion('fade', { delay: 46, duration: 20 });
  const chips = useMotion('rise', { delay: 62, duration: 18, distance: 30 });

  // 网格亮度：从几乎看不见到可见，制造"坐标系建立起来"的感觉
  const gridOn = interpolate(frame, [24, 72], [0, 0.55], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const breathe = 1 + Math.sin(frame / 26) * 0.006;

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(94,234,212,.16) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(94,234,212,.16) 1px, transparent 1px)',
          backgroundSize: '96px 96px',
          opacity: gridOn,
          maskImage: 'radial-gradient(70% 60% at 50% 50%, #000 20%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(70% 60% at 50% 50%, #000 20%, transparent 100%)',
        }}
      />

      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          paddingBottom: 120,
          transform: `scale(${breathe})`,
        }}
      >
        <div
          style={{
            ...l1,
            fontSize: 62,
            fontWeight: 700,
            color: COLORS.dim,
            letterSpacing: 4,
          }}
        >
          视频不是剪出来的，
        </div>
        <div
          style={{
            ...l2,
            marginTop: 18,
            fontSize: 132,
            fontWeight: 900,
            color: COLORS.ink,
            letterSpacing: 6,
            lineHeight: 1.1,
            textShadow: `0 0 44px ${COLORS.accent}44, 0 26px 80px rgba(0,0,0,.6)`,
          }}
        >
          是<span style={{ color: COLORS.accent }}>算</span>出来的
        </div>

        <div
          style={{
            ...badge,
            marginTop: 44,
            fontFamily: MONO,
            fontSize: 30,
            color: COLORS.accent2,
            padding: '10px 26px',
            borderRadius: 12,
            background: 'rgba(240,171,252,.10)',
            border: `1px solid ${COLORS.accent2}55`,
          }}
        >
          f(frame) → 每一帧
        </div>

        <div style={{ ...chips, marginTop: 40, display: 'flex', gap: 14 }}>
          <Chip label="时间轴是唯一真相" color={COLORS.accent} />
          <Chip label="渲染必须可复现" color={COLORS.accent2} />
          <Chip label="交付即验证" color={COLORS.warm} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
