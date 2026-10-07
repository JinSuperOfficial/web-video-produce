import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { captionAt } from '../voicePromo';
import { COLORS } from '../config';
import { FONT } from '../fonts';

/**
 * 推广片字幕：B 站风格 —— 大字号 + 实底衬 + 左侧 accent 短杠。
 *
 * 与 src/components/Subtitles.tsx（demo 用）的区别，都是按"手机端也要看得清"定的：
 *   · 字号 46 → 68px，字重 700 → 900
 *   · 底衬加深到 .80 并加 blur，避免压在亮画面上糊掉
 *   · 位置 bottom 92 → 120，避开 B 站播放器的进度条与弹幕输入框
 *   · 长句自动折行（maxWidth 1520），不会顶到画面两侧
 */
export const PromoSubtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const current = captionAt(frame);
  if (!current) return null;

  const local = frame - current.start_frame;
  const total = current.duration_frames;
  const opacity = interpolate(
    local,
    [0, 5, Math.max(6, total - 5), total],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const rise = interpolate(local, [0, 7], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 120,
        display: 'flex',
        justifyContent: 'center',
        opacity,
        transform: `translateY(${rise}px)`,
        padding: '0 130px',
      }}
    >
      <div
        style={{
          position: 'relative',
          fontFamily: FONT,
          fontSize: 68,
          lineHeight: 1.28,
          fontWeight: 900,
          color: COLORS.ink,
          textAlign: 'center',
          letterSpacing: 1,
          padding: '18px 46px 18px 58px',
          borderRadius: 20,
          background: 'rgba(6,10,20,.80)',
          boxShadow: '0 16px 50px rgba(0,0,0,.55)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,.10)',
          maxWidth: 1600,
          textShadow: '0 3px 12px rgba(0,0,0,.75)',
        }}
      >
        {/* 左侧 accent 短杠：一眼看出"这是字幕"而不是画面里的装饰字 */}
        <span
          style={{
            position: 'absolute',
            left: 22,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 6,
            height: '46%',
            borderRadius: 3,
            background: COLORS.accent,
          }}
        />
        {current.text}
      </div>
    </div>
  );
};
