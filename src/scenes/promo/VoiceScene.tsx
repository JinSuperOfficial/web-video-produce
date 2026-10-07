import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { useMotion } from '../../motion';
import { Chip, Kicker, Title } from './kit';

/** README 里的 14 个中文音色（zh-CN / zh-HK / zh-TW）。 */
const VOICES = [
  'zh-CN-XiaoxiaoNeural',
  'zh-CN-XiaoyiNeural',
  'zh-CN-YunxiNeural',
  'zh-CN-YunjianNeural',
  'zh-CN-YunyangNeural',
  'zh-CN-YunxiaNeural',
  'zh-CN-liaoning-XiaobeiNeural',
  'zh-CN-shaanxi-XiaoniNeural',
  'zh-HK-HiuGaaiNeural',
  'zh-HK-HiuMaanNeural',
  'zh-HK-WanLungNeural',
  'zh-TW-HsiaoChenNeural',
  'zh-TW-HsiaoYuNeural',
  'zh-TW-YunJheNeural',
];
const HERO = 'zh-CN-XiaoxiaoNeural';

const VW = 660;
const VH = 250;

/** 语音波形：形状由帧号与段序号确定性生成，不引入随机数。 */
const VoiceWave: React.FC<{ frame: number }> = ({ frame }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, VW, VH);

    const mid = VH / 2;
    const grow = Math.min(1, frame / 40);

    // 外侧辉光
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(94,234,212,.16)';
    ctx.beginPath();
    for (let x = 0; x <= VW; x += 2) {
      const t = x / VW;
      const env = Math.sin(Math.PI * Math.min(1, t * grow * 1.06)) ** 1.4;
      const y =
        mid +
        (Math.sin(t * 190 + frame / 26) * 44 + Math.sin(t * 430 + frame / 17) * 22) * env;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.accent;
    ctx.beginPath();
    for (let x = 0; x <= VW; x += 2) {
      const t = x / VW;
      const env = Math.sin(Math.PI * Math.min(1, t * grow * 1.06)) ** 1.4;
      const y =
        mid +
        (Math.sin(t * 190 + frame / 26) * 44 + Math.sin(t * 430 + frame / 17) * 22) * env;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 中线
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(VW, mid);
    ctx.stroke();
  }, [frame]);
  return <canvas ref={ref} width={VW} height={VH} style={{ width: VW, height: VH }} />;
};

/**
 * 第 9 幕 · voice（1264–1409 帧，约 4.8 秒）
 *
 * 配音这一层最容易讲成"我们支持很多音色"——太泛。这里改成给证据：
 * 14 个音色列全（README 实数），并直接说明本次成片用的是哪一个。
 */
export const VoiceScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const head = useMotion('rise', { delay: 2, duration: 14, distance: 28 });
  const wave = useMotion('fade', { delay: 26, duration: 20 });
  const note = useMotion('rise', { delay: 86, duration: 16, distance: 24 });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: '120px 150px 230px' }}>
      <div style={head}>
        <Kicker color={COLORS.accent2}>配音</Kicker>
        <Title style={{ marginTop: 12 }} size={62}>
          14 个中文音色，也可以换成你自己的
        </Title>
      </div>

      <div style={{ display: 'flex', gap: 50, marginTop: 38, alignItems: 'flex-start' }}>
        {/* 左：音色列表 */}
        <div
          style={{
            width: 760,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 9,
          }}
        >
          {VOICES.map((v, i) => {
            const isHero = v === HERO;
            const at = 10 + i * 3.2;
            const on = frame > at;
            return (
              <div
                key={v}
                style={{
                  fontFamily: MONO,
                  fontSize: isHero ? 19 : 16,
                  padding: isHero ? '10px 14px' : '8px 14px',
                  borderRadius: 8,
                  color: isHero ? '#06202b' : COLORS.dim,
                  background: isHero ? COLORS.accent : 'rgba(255,255,255,.05)',
                  border: `1px solid ${isHero ? COLORS.accent : 'rgba(255,255,255,.09)'}`,
                  fontWeight: isHero ? 700 : 400,
                  opacity: on ? 1 : 0.25,
                  transform: `translateX(${on ? 0 : -10}px)`,
                  boxShadow: isHero ? `0 0 26px ${COLORS.accent}55` : 'none',
                }}
              >
                {v.replace('Neural', '')}
              </div>
            );
          })}
        </div>

        {/* 右：波形 + 本次用的声音 */}
        <div style={{ flex: 1, ...wave }}>
          <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 6, color: COLORS.dim }}>
            THIS VIDEO
          </div>
          <div style={{ marginTop: 10, fontSize: 40, fontWeight: 900, color: COLORS.ink }}>
            晓晓 · 女声温暖通用
          </div>
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 21, color: COLORS.accent }}>
            {HERO}
          </div>
          <div style={{ marginTop: 20 }}>
            <VoiceWave frame={frame} />
          </div>
        </div>
      </div>

      <div style={{ ...note, marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Chip label="整段韵律 / 分段可控" />
        <Chip label="自动剔除句号" color={COLORS.accent2} />
        <Chip label="语速 +0% ~ +5%" color={COLORS.warm} />
        <Chip label="段间 400ms 真停顿" color="#7dd3fc" />
        <div style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 19, color: COLORS.dim }}>
          {durationInFrames} 帧 · 逐词时间戳可选
        </div>
      </div>
    </AbsoluteFill>
  );
};
