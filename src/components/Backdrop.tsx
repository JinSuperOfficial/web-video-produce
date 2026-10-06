import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../config';

/** 统一背景：深色渐变 + 两团缓慢游走的光斑，避免画面死板。 */
export const Backdrop: React.FC<{ hueShift?: number }> = ({ hueShift = 0 }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;

  const blobA = {
    x: interpolate(Math.sin(t * 0.35), [-1, 1], [-18, 18]) + hueShift,
    y: interpolate(Math.cos(t * 0.27), [-1, 1], [-12, 12]),
  };
  const blobB = {
    x: interpolate(Math.cos(t * 0.23), [-1, 1], [16, -16]),
    y: interpolate(Math.sin(t * 0.31), [-1, 1], [14, -14]),
  };

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 50% 0%, ${COLORS.bg1} 0%, ${COLORS.bg0} 62%)`,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(closest-side, ${COLORS.accent}44, transparent 70%)`,
          width: 1200,
          height: 1200,
          left: `calc(18% + ${blobA.x}% - 600px)`,
          top: `calc(10% + ${blobA.y}% - 600px)`,
          filter: 'blur(30px)',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(closest-side, ${COLORS.accent2}33, transparent 70%)`,
          width: 1000,
          height: 1000,
          left: `calc(62% + ${blobB.x}% - 500px)`,
          top: `calc(45% + ${blobB.y}% - 500px)`,
          filter: 'blur(40px)',
        }}
      />
      {/* 细网格，给画面一点"工程感" */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          maskImage: 'radial-gradient(75% 65% at 50% 45%, #000 30%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(75% 65% at 50% 45%, #000 30%, transparent 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
