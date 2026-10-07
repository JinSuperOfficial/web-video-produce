import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { useMotion } from '../../motion';
import { Chip, Kicker, Title } from './kit';

const CW = 1480;
const CH = 330;

const CLIPS = [
  { id: 'clip_a', spec: '1920×1080 · 30fps · h264', h: 46, color: COLORS.accent2 },
  { id: 'clip_b', spec: '1280×720 · 25fps · hevc', h: 76, color: '#7dd3fc' },
  { id: 'clip_c', spec: '3840×2160 · 60fps · 无音轨', h: 30, color: COLORS.warm },
];

/**
 * EDL 剪辑示意（Canvas 2D）：
 *   左 = 三段异构素材（高度代表参数不一致）
 *   中 = conform 之后高度被拉齐（分辨率/帧率/编码/采样率统一，无音轨补静音）
 *   右 = 拼成一条时间线，接缝处就是 xfade（有 xfade 必有 acrossfade）
 * 所有几何量都是"进度 p"的函数，p 由帧号算出来。
 */
const EditCanvas: React.FC<{ p: number; merge: number }> = ({ p, merge }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CW, CH);

    const rowH = 84;
    const gap = 16;
    const top = 40;
    const leftX = 40;
    const midX = 520;
    const rightX = 1010;
    const colW = 400;

    const uniform = rowH - 10;

    // ---- 三列小标题 ----
    ctx.font = '600 18px ui-monospace, Menlo, Consolas, monospace';
    const heads: [string, number, string][] = [
      ['异构素材', leftX, COLORS.dim],
      ['conform 统一规格', midX, COLORS.accent],
      ['assemble → output', rightX, COLORS.warm],
    ];
    heads.forEach(([label, x, color]) => {
      ctx.fillStyle = color;
      ctx.fillText(label, x, 22);
    });

    // ---- 左：异构 ----
    CLIPS.forEach((c, i) => {
      const y = top + i * (rowH + gap);
      ctx.fillStyle = `${c.color}33`;
      ctx.beginPath();
      ctx.roundRect(leftX, y + (rowH - c.h) / 2, colW, c.h, 8);
      ctx.fill();
      ctx.strokeStyle = `${c.color}99`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(244,247,255,.85)';
      ctx.font = '600 16px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(c.id, leftX + 12, y + rowH / 2 + 6);
    });

    // ---- 中：拉齐（高度从 c.h 插值到 uniform） ----
    CLIPS.forEach((c, i) => {
      const y = top + i * (rowH + gap);
      const h = c.h + (uniform - c.h) * p;
      ctx.fillStyle = 'rgba(94,234,212,.20)';
      ctx.beginPath();
      ctx.roundRect(midX, y + (rowH - h) / 2, colW, h, 8);
      ctx.fill();
      ctx.strokeStyle = `rgba(94,234,212,${0.35 + 0.5 * p})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (p > 0.55) {
        ctx.fillStyle = 'rgba(94,234,212,.95)';
        ctx.font = '600 15px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillText('yuv420p · 48kHz 立体声', midX + 12, y + rowH / 2 + 5);
      }
    });

    // ---- 右：拼成一条时间线（merge 0→1 时依次长出来） ----
    const totalW = 430;
    const parts = [0.34, 0.3, 0.36];
    let acc = 0;
    parts.forEach((frac, i) => {
      const local = Math.max(0, Math.min(1, merge * 3 - i));
      const w = totalW * frac * local;
      const x = rightX + totalW * acc;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(251,191,36,.35)' : 'rgba(240,171,252,.30)';
      ctx.beginPath();
      ctx.roundRect(x, top + 24, Math.max(0, w - 4), rowH * 2 + gap - 20, 8);
      ctx.fill();
      if (local > 0.6 && i < 2) {
        // xfade 标记
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + totalW * frac, top + 10);
        ctx.lineTo(x + totalW * frac, top + rowH * 2 + gap + 4);
        ctx.stroke();
        ctx.fillStyle = COLORS.accent;
        ctx.font = '600 14px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillText('xfade', x + totalW * frac + 8, top + 20);
      }
      acc += frac;
    });

    if (merge > 0.85) {
      ctx.fillStyle = COLORS.warm;
      ctx.font = '700 20px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('output/edit.mp4', rightX + 6, top + rowH * 2 + gap + 34);
    }
  }, [p, merge]);

  return <canvas ref={ref} width={CW} height={CH} style={{ width: CW, height: CH }} />;
};

const RULES = [
  '先 conform 再拼',
  'offset = 累计时长 − 转场时长',
  '有 xfade 必有 acrossfade',
  '四级降级兜底',
];

/**
 * 第 8 幕 · edit（1082–1264 帧，约 6.1 秒）
 *
 * 讲第二条能力：已有素材也能进。卖点不是"能拼"，而是"异构素材不会花屏/爆音"——
 * 所以画面重点是 conform 把三行拉齐的那一下。
 */
export const EditScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const head = useMotion('rise', { delay: 2, duration: 14, distance: 28 });
  const canvasIn = useMotion('fade', { delay: 8, duration: 16 });
  const rulesIn = useMotion('rise', { delay: 108, duration: 18, distance: 26 });

  const p = interpolate(frame, [22, 74], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const merge = interpolate(frame, [66, 112], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: '120px 150px 230px' }}>
      <div style={head}>
        <Kicker color={COLORS.warm}>剪辑模式 · EDL 驱动</Kicker>
        <Title style={{ marginTop: 12 }} size={62}>
          已有素材，也进同一条流水线
        </Title>
      </div>

      <div style={{ marginTop: 34, ...canvasIn }}>
        <EditCanvas p={p} merge={merge} />
      </div>

      <div style={{ ...rulesIn, marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {RULES.map((r, i) => (
          <Chip key={r} label={`${i + 1}. ${r}`} color={i === 2 ? COLORS.accent2 : COLORS.accent} />
        ))}
        <div style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 19, color: COLORS.dim }}>
          plan 先看命令，build 再动手｜{durationInFrames} 帧
        </div>
      </div>
    </AbsoluteFill>
  );
};
