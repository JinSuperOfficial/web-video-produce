import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { promo } from '../../voicePromo';
import { useMotion } from '../../motion';
import { Arrow, Chip, Kicker, Panel, Title } from './kit';

const W = 1500;
const H = 260;

/**
 * 时间轴可视化（Canvas 2D）：
 *   上排 = 波形（用段时长当包络，确定性伪波形，不含随机数）
 *   下排 = 真实配音时间轴的 14 个段块（宽度 ∝ duration），加一条跟着帧号走的游标
 * 数据直接读 manifest，所以画面和声音永远是同一份时间轴。
 */
const TimelineCanvas: React.FC<{ frame: number }> = ({ frame }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const segs = promo.segments;
    const total = promo.total_frames || 1;
    const waveH = 124;
    const barY = 152;
    const barH = 64;

    // 圆角底板
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 18);
    ctx.fill();

    // ---- 波形：包络由"当前处在哪一段"决定，形状由序号确定性生成 ----
    const segAt = segs.find((s) => frame >= s.start_frame && frame < s.start_frame + s.duration_frames);
    const mid = waveH / 2;
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.accent;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const t = x / W;
      const f = t * total;
      // 找到这一列落在哪一段（没有对应段就按 0 处理）
      let amp = 0.12;
      let seed = 1;
      for (let i = 0; i < segs.length; i++) {
        if (f >= segs[i].start_frame && f < segs[i].start_frame + segs[i].duration_frames) {
          // 段内包络：中间饱满、两端收敛（像真实语音）
          const local = (f - segs[i].start_frame) / Math.max(1, segs[i].duration_frames);
          amp = 0.35 + 0.65 * Math.sin(Math.PI * local);
          seed = i + 1;
          break;
        }
      }
      const y =
        mid +
        Math.sin(t * 260 + seed * 7.1) * 34 * amp +
        Math.sin(t * 640 + seed * 3.3) * 16 * amp +
        Math.sin(t * 1180 + seed * 1.7) * 8 * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 当前段的高亮罩
    if (segAt) {
      const x0 = (segAt.start_frame / total) * W;
      const w = (segAt.duration_frames / total) * W;
      ctx.fillStyle = 'rgba(94,234,212,.10)';
      ctx.fillRect(x0, 8, w, waveH - 16);
    }

    // ---- 段块 ----
    ctx.font = '600 17px ui-monospace, Menlo, Consolas, monospace';
    segs.forEach((s, i) => {
      const x = (s.start_frame / total) * W;
      const w = Math.max(2, (s.duration_frames / total) * W - 3);
      const active = segAt?.id === s.id;
      ctx.fillStyle = active ? COLORS.accent : 'rgba(143,160,196,.30)';
      ctx.beginPath();
      ctx.roundRect(x + 1.5, barY, w, barH, 8);
      ctx.fill();

      if (w > 46) {
        ctx.fillStyle = active ? '#06202b' : 'rgba(244,247,255,.75)';
        ctx.fillText(s.id, x + 10, barY + 26);
      }
      // 段序号
      ctx.fillStyle = active ? 'rgba(6,32,43,.7)' : 'rgba(143,160,196,.7)';
      ctx.font = '500 14px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(String(i + 1).padStart(2, '0'), x + 10, barY + 48);
      ctx.font = '600 17px ui-monospace, Menlo, Consolas, monospace';
    });

    // ---- 游标 ----
    const px = Math.min(W, (frame / total) * W);
    ctx.strokeStyle = COLORS.warm;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, 4);
    ctx.lineTo(px, barY + barH + 4);
    ctx.stroke();
    ctx.fillStyle = COLORS.warm;
    ctx.beginPath();
    ctx.arc(px, 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [frame]);

  return <canvas ref={ref} width={W} height={H} style={{ width: W, height: H }} />;
};

const NODES = [
  { title: '分段脚本', sub: 'examples/script.promo.json', color: COLORS.warm },
  { title: '配音 + 字幕', sub: 'edge-tts / 自建 TTS API', color: COLORS.accent2 },
  { title: '帧号时间轴', sub: 'manifest.json + words.json', color: COLORS.accent },
];

/**
 * 第 5 幕 · pipeline（587–752 帧，约 5.5 秒）
 *
 * 三节点依次点亮 → 时间轴画布推进 → 强调"精确到帧"。
 * 这一幕的卖点不是"能配音"，而是"配音、字幕、帧号是同一次计算出来的"。
 */
export const PipelineScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const head = useMotion('rise', { delay: 2, duration: 14, distance: 30 });
  const canvasIn = useMotion('fade', { delay: 62, duration: 22 });
  const stat = useMotion('rise', { delay: 104, duration: 16, distance: 26 });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: '120px 150px 230px' }}>
      <div style={head}>
        <Kicker>工作流</Kicker>
        <Title style={{ marginTop: 12 }} size={64}>
          文本进来，MP4 出去
        </Title>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 44 }}>
        {NODES.map((n, i) => {
          const at = 10 + i * 26;
          const on = frame > at;
          return (
            <React.Fragment key={n.title}>
              {i > 0 ? <Arrow color={COLORS.accent} /> : null}
              <NodeCard node={n} delay={at} on={on} />
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ marginTop: 20, ...canvasIn }}>
        <TimelineCanvas frame={frame} />
      </div>

      <div
        style={{
          ...stat,
          marginTop: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Chip label={`${promo.segments.length} 段 · ${promo.total_frames} 帧 · ${promo.total_duration}s`} />
        <Chip label="段间 400ms 真停顿" color={COLORS.accent2} />
        <Chip label="片尾 600ms 呼吸" color={COLORS.warm} />
        <div style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 19, color: COLORS.dim }}>
          预览 {frame} / {durationInFrames} 帧
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 单个流程节点：帧到就点亮。 */
const NodeCard: React.FC<{
  node: (typeof NODES)[number];
  delay: number;
  on: boolean;
}> = ({ node, delay, on }) => {
  const style = useMotion('pop', { delay, duration: 16, from: 0.88 });
  return (
    <div style={{ ...style, flex: 1 }}>
      <Panel
        tint={`${node.color}10`}
        style={{
          borderColor: on ? `${node.color}66` : 'rgba(255,255,255,.10)',
          padding: '22px 26px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: on ? node.color : 'rgba(255,255,255,.18)',
              boxShadow: on ? `0 0 16px ${node.color}` : 'none',
            }}
          />
          <span style={{ fontSize: 32, fontWeight: 900, color: COLORS.ink }}>{node.title}</span>
        </div>
        <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 18, color: COLORS.dim }}>
          {node.sub}
        </div>
      </Panel>
    </div>
  );
};
