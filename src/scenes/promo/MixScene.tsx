import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { useMotion } from '../../motion';
import { Chip, Kicker, Title } from './kit';

const MW = 1480;
const MH = 300;
const BARS = 58;

/** 伪频谱（确定性）：低频高、高频缓降，再加一点固定起伏当"泛音"。 */
const spectrumAt = (i: number): number => {
  const t = i / (BARS - 1);
  const tilt = Math.pow(1 - t, 0.85); // 粉噪声式下滑
  const ripple = 0.72 + 0.28 * Math.sin(i * 1.7) * Math.cos(i * 0.6);
  return Math.max(0.08, tilt * ripple);
};

/** 20Hz → 20kHz 的对数频率映射（只为了画刻度线位置）。 */
const freqToX = (hz: number): number => {
  const lo = Math.log10(20);
  const hi = Math.log10(20000);
  return ((Math.log10(hz) - lo) / (hi - lo)) * MW;
};

/**
 * 混音示意（Canvas 2D）：A/B 对比"整体闪避"和"多频段 carve"。
 *
 *   前段(≈20–88 帧)：整体闪避 —— 人声一进来，所有频段一起掉，音乐瘪掉
 *   后段(≈96–164 帧)：carve —— 只有 300Hz~3400Hz 那段被侧链压下去，低频与空气感保留
 * 中间两条竖线就是 Linkwitz-Riley 的分频点（300Hz / 3400Hz）。
 */
const MixCanvas: React.FC<{ frame: number }> = ({ frame }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, MW, MH);

    const carve = frame >= 96; // true = 演示 carve，false = 演示整体闪避
    // 人声存在度：平滑往复，用来驱动侧链
    const vg = 0.5 + 0.5 * Math.sin((frame - 20) / 13);

    const baseY = 236;
    const maxH = 176;
    const loX = freqToX(300);
    const hiX = freqToX(3400);

    // 频段底色
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    ctx.fillRect(0, 0, MW, baseY);

    // carve 模式下，人声频段整块标出来
    if (carve) {
      ctx.fillStyle = 'rgba(94,234,212,.09)';
      ctx.fillRect(loX, 0, hiX - loX, baseY);
    }

    for (let i = 0; i < BARS; i++) {
      const x = (i / BARS) * MW + 3;
      const w = MW / BARS - 6;
      const inVoiceBand = x + w > loX && x < hiX;

      let h = spectrumAt(i) * maxH;
      if (carve) {
        if (inVoiceBand) h *= 1 - 0.5 * vg; // 只压人声频段
      } else {
        h *= 1 - 0.42 * vg; // 整体一起掉
      }

      const grad = ctx.createLinearGradient(0, baseY - h, 0, baseY);
      if (inVoiceBand && carve) {
        grad.addColorStop(0, COLORS.accent);
        grad.addColorStop(1, 'rgba(94,234,212,.18)');
      } else if (!carve) {
        grad.addColorStop(0, 'rgba(143,160,196,.75)');
        grad.addColorStop(1, 'rgba(143,160,196,.14)');
      } else {
        grad.addColorStop(0, COLORS.accent2);
        grad.addColorStop(1, 'rgba(240,171,252,.16)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, baseY - h, w, h, 4);
      ctx.fill();
    }

    // 分频线
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    [loX, hiX].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x, baseY);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.font = '600 15px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(244,247,255,.7)';
    ctx.fillText('300Hz', loX + 8, 24);
    ctx.fillText('3400Hz', hiX + 8, 24);

    // 人声存在度条
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath();
    ctx.roundRect(0, baseY + 22, MW, 14, 7);
    ctx.fill();
    ctx.fillStyle = COLORS.warm;
    ctx.beginPath();
    ctx.roundRect(0, baseY + 22, MW * vg, 14, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(244,247,255,.8)';
    ctx.font = '600 15px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('人声（侧链触发）', 12, baseY + 66);

    // 模式标签
    ctx.font = '700 22px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = carve ? COLORS.accent : '#ff8f8f';
    ctx.fillText(carve ? 'MODE: 多频段 carve（音乐保住了）' : 'MODE: 整体闪避（音乐瘪掉）', loX + 8, baseY + 66);
  }, [frame]);

  return <canvas ref={ref} width={MW} height={MH} style={{ width: MW, height: MH }} />;
};

const STATS = [
  { value: '−35.4', label: '不处理', color: '#ff8f8f' },
  { value: '−43.2', label: '整体闪避', color: COLORS.dim },
  { value: '−36.1', label: '多频段 carve', color: COLORS.accent },
];

/**
 * 第 11 幕 · mix（1595–1778 帧，约 6.1 秒）
 *
 * README 里最有说服力的一组实测：低频能量 不处理 −35.4 / 整体闪避 −43.2 / carve −36.1 dB。
 * 画面用 A/B 两段把"整体闪避为什么不行"演出来，而不是只丢三个数字。
 */
export const MixScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const head = useMotion('rise', { delay: 2, duration: 14, distance: 28 });
  const statsIn = useMotion('rise', { delay: 128, duration: 18, distance: 26 });

  const label = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: '120px 150px 230px' }}>
      <div style={head}>
        <Kicker>混音</Kicker>
        <Title style={{ marginTop: 12 }} size={62}>
          多频段 carve，不是把音乐整体压低
        </Title>
      </div>

      <div style={{ marginTop: 30, opacity: label }}>
        <MixCanvas frame={frame} />
      </div>

      <div style={{ ...statsIn, marginTop: 24, display: 'flex', gap: 40, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 44 }}>
          {STATS.map((s) => (
            <div key={s.label}>
              <div style={{ fontFamily: MONO, fontSize: 46, fontWeight: 900, color: s.color }}>
                {s.value}
                <span style={{ fontSize: 20, color: COLORS.dim, marginLeft: 6 }}>dB</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 21, color: COLORS.dim }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 620 }}>
          <Chip label="Linkwitz-Riley 300 / 3400Hz" />
          <Chip label="两遍 loudnorm" color={COLORS.accent2} />
          <Chip label="social −14 LUFS" color={COLORS.warm} />
          <div style={{ width: '100%', textAlign: 'right', fontFamily: MONO, fontSize: 18, color: COLORS.dim }}>
            {durationInFrames} 帧 · BGM 由 make_bgm.py 合成
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
