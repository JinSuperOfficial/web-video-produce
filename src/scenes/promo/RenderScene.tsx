import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { countUp, typewriter, useMotion } from '../../motion';
import { promo } from '../../voicePromo';
import { Chip, Kicker, Terminal, Title } from './kit';

const CODE: { t: string; c: string }[] = [
  { t: '// 画面不是画出来的，是组件算出来的', c: COLORS.dim },
  { t: '<Composition', c: COLORS.ink },
  { t: '  id="WebVideoPromo"', c: COLORS.accent },
  { t: '  fps={30} width={1920} height={1080} />', c: COLORS.ink },
  { t: '', c: COLORS.ink },
  { t: 'const frame = useCurrentFrame();', c: COLORS.accent2 },
  { t: 'return f(frame);   // 同一帧 → 同一张图', c: COLORS.warm },
];

const RULER_W = 620;
const RULER_H = 150;

/** 帧标尺（Canvas）：0 → total_frames 的刻度 + 跟着帧走的游标。 */
const Ruler: React.FC<{ frame: number }> = ({ frame }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, RULER_W, RULER_H);

    const total = promo.total_frames || 1;
    const top = 24;
    const y = 74;

    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(RULER_W, y);
    ctx.stroke();

    ctx.font = '500 13px ui-monospace, Menlo, Consolas, monospace';
    for (let t = 0; t <= total; t += 100) {
      const x = (t / total) * RULER_W;
      const major = t % 500 === 0;
      ctx.strokeStyle = major ? 'rgba(94,234,212,.55)' : 'rgba(255,255,255,.16)';
      ctx.beginPath();
      ctx.moveTo(x, y - (major ? 16 : 8));
      ctx.lineTo(x, y + (major ? 16 : 8));
      ctx.stroke();
      if (major) {
        ctx.fillStyle = 'rgba(143,160,196,.85)';
        ctx.fillText(String(t), x + 4, y + 32);
      }
    }

    // 已播放区域
    const px = Math.min(RULER_W, (frame / total) * RULER_W);
    ctx.fillStyle = 'rgba(94,234,212,.14)';
    ctx.fillRect(0, y - 20, px, 40);
    ctx.strokeStyle = COLORS.warm;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, y + 24);
    ctx.stroke();
    ctx.fillStyle = COLORS.warm;
    ctx.beginPath();
    ctx.arc(px, top, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [frame]);
  return <canvas ref={ref} width={RULER_W} height={RULER_H} style={{ width: RULER_W, height: RULER_H }} />;
};

/**
 * 第 6 幕 · render（752–899 帧，约 4.9 秒）
 *
 * 讲"主推技术栈"：React + Remotion。左边代码在打字，右边帧号真的在涨，
 * 用最直白的方式说明"帧即状态、f(frame) 可复现"。
 */
export const RenderScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const total = promo.total_frames;
  const shown = countUp(frame, { to: total, duration: durationInFrames - 20, delay: 10, ease: 'linear' });
  const left = useMotion('slideRight', { delay: 2, duration: 16, distance: 40 });
  const right = useMotion('slideLeft', { delay: 10, duration: 18, distance: 46 });

  let budget = 0;
  const lines = CODE.map((l) => {
    const start = 8 + budget;
    budget += Math.max(6, Math.min(26, l.t.length * 0.7));
    return { ...l, typed: typewriter(l.t, frame, { delay: start, cps: 34 }) };
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: '150px 150px 240px' }}>
      <div style={{ position: 'absolute', top: 130, left: 150 }}>
        <Kicker color={COLORS.accent2}>主推技术栈</Kicker>
        <Title style={{ marginTop: 12 }} size={62}>
          React + Remotion：帧即状态
        </Title>
      </div>

      <div style={{ display: 'flex', gap: 56, height: '100%', alignItems: 'center' }}>
        {/* 左：代码 */}
        <div style={{ ...left, width: 880, marginTop: 60 }}>
          <Terminal title="src/scenes/promo/RenderScene.tsx" style={{ width: '100%' }}>
            {lines.map((l, i) => (
              <div
                key={i}
                style={{
                  fontFamily: MONO,
                  fontSize: 25,
                  lineHeight: 1.75,
                  color: l.c,
                  minHeight: 44,
                  whiteSpace: 'pre',
                }}
              >
                {l.typed}
                {frame > 8 && i === lines.length - 1 && frame < 8 + budget + 10 ? (
                  <span style={{ color: COLORS.accent }}>▌</span>
                ) : null}
              </div>
            ))}
          </Terminal>
        </div>

        {/* 右：帧号 + 标尺 */}
        <div style={{ ...right, flex: 1, marginTop: 60 }}>
          <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 6, color: COLORS.dim }}>
            CURRENT FRAME
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 96,
              fontWeight: 900,
              color: COLORS.accent,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            {String(Math.round(shown)).padStart(4, '0')}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 24, color: COLORS.dim, marginBottom: 18 }}>
            / {total} 帧 @ {promo.fps}fps
          </div>
          <Ruler frame={frame} />
          <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Chip label="0 随机" />
            <Chip label="0 真实时间" color={COLORS.accent2} />
            <Chip label="0 自走动画" color={COLORS.warm} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
