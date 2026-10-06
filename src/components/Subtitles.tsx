import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { captionAt } from '../voice';
import { COLORS } from '../config';
import { FONT } from '../fonts';

/**
 * 字幕条：直接读 manifest.json 的段级时间轴。
 * 段级（一句一行）适合口播；要"逐词高亮"就把 tts_edge.py 的 parts/*.srt
 * 也读进来（SRT 解析示例见 SKILL.md）。
 */
export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const current = captionAt(frame);
  if (!current) return null;

  const local = frame - current.start_frame;
  const total = current.duration_frames;
  const opacity = interpolate(
    local,
    [0, 6, Math.max(7, total - 6), total],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const rise = interpolate(local, [0, 8], [18, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 92,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        transform: `translateY(${rise}px)`,
        padding: '0 120px',
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontSize: 46,
          lineHeight: 1.35,
          fontWeight: 700,
          color: COLORS.ink,
          textAlign: 'center',
          letterSpacing: 0.5,
          padding: '14px 34px',
          borderRadius: 18,
          background: 'rgba(6,10,20,.62)',
          boxShadow: '0 12px 40px rgba(0,0,0,.45)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,.08)',
          maxWidth: 1500,
        }}
      >
        {current.text}
      </div>
      {/* fps 仅供调试：确认渲染帧率与配音一致 */}
      <span style={{ display: 'none' }}>{fps}</span>
    </div>
  );
};
