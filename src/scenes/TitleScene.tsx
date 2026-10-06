import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { COLORS } from '../config';
import { FONT, MONO } from '../fonts';

const CODE_LINES = [
  '<Composition id="WebVideo" fps={30} />',
  'tts_edge.py --voice zh-CN-XiaoxiaoNeural',
  'ffmpeg -i silent.mp4 -i vo.mp3 -c:v copy …',
];

/** 开场：标题弹出 + 代码行逐条浮现。全部由"当前帧"推导，天然确定性。 */
export const TitleScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.7 }, durationInFrames: 26 });
  // 场景末端主动淡出，避免与下一场景硬切
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 14, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: FONT,
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          transform: `scale(${interpolate(pop, [0, 1], [0.86, 1])})`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: 12,
            color: COLORS.accent,
            fontWeight: 700,
            marginBottom: 26,
            opacity: interpolate(frame, [4, 20], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          WEB · VIDEO · PRODUCE
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 168,
            lineHeight: 1.05,
            fontWeight: 900,
            color: COLORS.ink,
            letterSpacing: 4,
            textShadow: '0 24px 80px rgba(94,234,212,.25)',
          }}
        >
          写代码
          <span style={{ color: COLORS.accent }}>，</span>
          做视频
        </h1>
      </div>

      <div style={{ marginTop: 78, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {CODE_LINES.map((line, i) => {
          const appear = interpolate(frame, [24 + i * 12, 40 + i * 12], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <div
              key={line}
              style={{
                opacity: appear,
                transform: `translateX(${interpolate(appear, [0, 1], [-40, 0])}px)`,
                fontFamily: MONO,
                fontSize: 28,
                color: COLORS.dim,
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 12,
                padding: '12px 26px',
              }}
            >
              <span style={{ color: COLORS.warm }}>$ </span>
              {line}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
