import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Backdrop } from './components/Backdrop';
import { COLORS } from './config';
import { FONT, MONO } from './fonts';

/**
 * 封面静帧：npx remotion still src/index.ts Cover output/cover.png
 * Still 只渲染第 0 帧，所以这里不要用动画，直接用静态排版。
 */
export const Cover: React.FC = () => {
  useCurrentFrame(); // 保持与其他组件一致的调用习惯（静态内容用不到帧号）
  return (
    <AbsoluteFill>
      <Backdrop hueShift={6} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: FONT,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 24, letterSpacing: 14, color: COLORS.accent, fontWeight: 700 }}>
          WEB · VIDEO · PRODUCE
        </div>
        <h1
          style={{
            margin: '30px 0 0',
            fontSize: 150,
            fontWeight: 900,
            color: COLORS.ink,
            letterSpacing: 6,
          }}
        >
          写代码，做视频
        </h1>
        <div
          style={{
            marginTop: 40,
            fontFamily: MONO,
            fontSize: 30,
            color: COLORS.dim,
          }}
        >
          HTML · Canvas · Three.js · GLSL · Remotion · GSAP · edge-tts · FFmpeg
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
