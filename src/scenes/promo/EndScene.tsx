import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { useMotion } from '../../motion';

/**
 * 第 14 幕 · end（2134–2212 帧，约 2.6 秒）
 *
 * 收在项目自己的 slogan 上，并署上 UP 主。最后一帧整体淡到全黑，
 * 这样接 B 站的播放器 UI 不会突兀。
 */
export const EndScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const l1 = useMotion('rise', { delay: 2, duration: 14, distance: 30 });
  const l2 = useMotion('fade', { delay: 14, duration: 16 });
  const sign = useMotion('fade', { delay: 26, duration: 18 });

  const fade = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: FONT,
        opacity: fade,
      }}
    >
      <div style={{ ...l1, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 116, fontWeight: 900, color: COLORS.ink, letterSpacing: 4 }}>
          写代码
        </span>
        <span style={{ fontSize: 116, fontWeight: 900, color: COLORS.accent }}>，</span>
        <span style={{ fontSize: 116, fontWeight: 900, color: COLORS.ink, letterSpacing: 4 }}>
          做视频
        </span>
      </div>

      <div
        style={{
          ...l2,
          marginTop: 34,
          fontFamily: MONO,
          fontSize: 28,
          letterSpacing: 6,
          color: COLORS.dim,
        }}
      >
        web-video-produce
      </div>

      <div
        style={{
          ...sign,
          marginTop: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 30,
          color: COLORS.ink,
        }}
      >
        <span style={{ width: 46, height: 2, background: COLORS.accent, display: 'inline-block' }} />
        UP 主 · JinSuper
        <span style={{ width: 46, height: 2, background: COLORS.accent, display: 'inline-block' }} />
      </div>
    </AbsoluteFill>
  );
};
