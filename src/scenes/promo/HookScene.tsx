import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { useMotion, stagger, typewriter } from '../../motion';

const CMD = 'python3 -c "make_video(idea)"';

/**
 * 第 1 幕 · hook（0–100 帧，约 3.3 秒）
 *
 * B 站的开头三秒：不铺垫、不 logo，直接给"反常识"的一句话。
 * 打公式：短命令先敲出来 → 大字分两拍砸下 → 光标一直闪（"程序还在跑"的暗示）。
 */
export const HookScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const cmd = typewriter(CMD, frame, { delay: 4, cps: 22 });
  const cursorOn = Math.floor(frame / 9) % 2 === 0;

  const line1 = useMotion('rise', { delay: 26, duration: 13, distance: 46 });
  const line2 = useMotion('pop', { delay: 36, duration: 16, from: 0.82 });
  const glow = interpolate(frame, [36, 54], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 收尾时轻微推近，避免最后 1 秒完全静止
  const push = interpolate(frame, [60, durationInFrames], [1, 1.035], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: FONT,
        padding: '0 150px 190px',
        transform: `scale(${push})`,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 30,
          color: COLORS.dim,
          background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.10)',
          borderRadius: 12,
          padding: '12px 24px',
          minHeight: 58,
          minWidth: 720,
        }}
      >
        <span style={{ color: COLORS.warm }}>$ </span>
        {cmd}
        <span style={{ opacity: cursorOn ? 1 : 0, color: COLORS.accent }}>▌</span>
      </div>

      <div style={{ marginTop: 46, textAlign: 'center' }}>
        <div
          style={{
            ...line1,
            fontSize: 84,
            fontWeight: 900,
            color: COLORS.ink,
            letterSpacing: 6,
            lineHeight: 1.12,
          }}
        >
          这条视频，
        </div>
        <div
          style={{
            ...line2,
            marginTop: 8,
            fontSize: 106,
            fontWeight: 900,
            letterSpacing: 8,
            color: COLORS.accent,
            lineHeight: 1.1,
            textShadow: `0 0 ${34 * glow}px ${COLORS.accent}88, 0 24px 70px rgba(0,0,0,.6)`,
          }}
        >
          全程由代码生成
        </div>
      </div>

      {/* 左下角：三个标签暗示内容（错位入场） */}
      <div
        style={{
          position: 'absolute',
          left: 150,
          bottom: 300,
          display: 'flex',
          gap: 16,
        }}
      >
        {['没有剪辑软件', '没有多模态模型', '纯文本 LLM 可用'].map((t, i) => (
          <div
            key={t}
            style={{
              ...enterAt(frame - stagger(i, 5, 52)),
              fontFamily: FONT,
              fontSize: 24,
              color: COLORS.dim,
              padding: '8px 18px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,.12)',
              background: 'rgba(255,255,255,.04)',
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** 纯函数小包装：把"已经过了几帧"折成一段上浮入场（不是 hook，可以在 map 里调）。 */
function enterAt(f: number): React.CSSProperties {
  const p = Math.max(0, Math.min(1, f / 16));
  const e = 1 - Math.pow(1 - p, 3);
  return { opacity: e, transform: `translate3d(0, ${26 * (1 - e)}px, 0)` };
}
