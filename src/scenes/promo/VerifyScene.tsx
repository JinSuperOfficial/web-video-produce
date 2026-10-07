import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { useMotion } from '../../motion';
import { promo } from '../../voicePromo';
import { Kicker, Terminal, Title } from './kit';

const LINES: { t: string; c: string; at: number }[] = [
  { t: '$ python3 scripts/validate.py', c: COLORS.ink, at: 4 },
  { t: '✓ 确定性铁律：无随机 / 真实时间 / 自走动画', c: COLORS.accent, at: 18 },
  { t: `✓ 时间轴一致：${promo.total_frames} 帧 @ ${promo.fps}fps`, c: COLORS.accent, at: 30 },
  { t: '✓ 场景 id 全部命中配音段', c: COLORS.accent, at: 42 },
  { t: '✓ 素材引用与中文字体已就绪', c: COLORS.accent, at: 54 },
  { t: '', c: COLORS.ink, at: 66 },
  { t: '$ python3 scripts/validate.py --out output/promo.mp4', c: COLORS.ink, at: 74 },
  { t: '✓ 1920×1080 · h264 · yuv420p · bt709 / tv', c: COLORS.accent, at: 90 },
  { t: '✓ 响度 −14.0 LUFS（social）｜无爆音', c: COLORS.accent, at: 102 },
  { t: '✓ 校验通过：0 错误 0 警告', c: COLORS.warm, at: 116 },
];

const CHECKS = ['pixel format', 'color space', 'color range', 'peak level', 'LUFS', 'font', 'asset'];

/**
 * 第 12 幕 · verify（1778–1963 帧，约 6.2 秒）
 *
 * "交付即验证"是整个项目的态度，也是最能打动技术观众的一点：
 * 它不是"我觉得没问题"，而是"校验器说没问题"。
 */
export const VerifyScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const head = useMotion('rise', { delay: 2, duration: 14, distance: 28 });
  const stampIn = useMotion('pop', { delay: 132, duration: 18, from: 0.7 });

  const stampScale = interpolate(frame, [132, 156], [0.8, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: '120px 150px 230px' }}>
      <div style={head}>
        <Kicker color={COLORS.accent}>交付即验证</Kicker>
        <Title style={{ marginTop: 12 }} size={62}>
          出片之后，先跑校验器
        </Title>
      </div>

      <div style={{ display: 'flex', gap: 48, marginTop: 34, alignItems: 'flex-start' }}>
        <div style={{ width: 1010 }}>
          <Terminal title="web-video-produce — validate.py">
            {LINES.map((l) => (
              <div
                key={l.t + l.at}
                style={{
                  fontFamily: MONO,
                  fontSize: 23,
                  lineHeight: 1.62,
                  color: l.c,
                  minHeight: 37,
                  opacity: frame >= l.at ? 1 : 0,
                  transform: `translateX(${frame >= l.at ? 0 : -14}px)`,
                }}
              >
                {l.t}
              </div>
            ))}
          </Terminal>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 5, color: COLORS.dim }}>
            CHECKED
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CHECKS.map((c, i) => {
              const at = 22 + i * 9;
              const on = frame >= at;
              return (
                <div
                  key={c}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontFamily: MONO,
                    fontSize: 21,
                    color: on ? COLORS.ink : 'rgba(143,160,196,.35)',
                  }}
                >
                  <span style={{ color: on ? COLORS.accent : 'rgba(143,160,196,.35)', fontSize: 22 }}>
                    {on ? '✓' : '·'}
                  </span>
                  {c}
                </div>
              );
            })}
          </div>

          <div
            style={{
              ...stampIn,
              marginTop: 34,
              transform: `rotate(-7deg) scale(${stampScale})`,
              display: 'inline-block',
              padding: '16px 30px',
              border: `4px solid ${COLORS.accent}`,
              borderRadius: 14,
              color: COLORS.accent,
              fontFamily: FONT,
              fontSize: 42,
              fontWeight: 900,
              letterSpacing: 3,
              boxShadow: `0 0 40px ${COLORS.accent}44`,
            }}
          >
            0 错误 0 警告
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', right: 150, bottom: 320, fontFamily: MONO, fontSize: 18, color: COLORS.dim }}>
        {durationInFrames} 帧 · bt709 / tv
      </div>
    </AbsoluteFill>
  );
};
