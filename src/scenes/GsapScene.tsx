import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import gsap from 'gsap';
import { COLORS } from '../config';
import { FONT, MONO } from '../fonts';

const CARDS = [
  { title: 'HTML / Canvas', desc: '网页即画布，DOM 与 2D 图形随便画', color: COLORS.accent },
  { title: 'Three.js + GLSL', desc: '三维场景与着色器，GPU 直接出像素', color: COLORS.accent2 },
  { title: 'React + Remotion', desc: '组件化时间轴，帧即状态', color: COLORS.warm },
  { title: 'edge-tts + FFmpeg', desc: '配音、字幕、编码一条流水线', color: '#7dd3fc' },
];

/**
 * GSAP 在 Remotion 里的唯一正确姿势：
 *   timeline 必须 paused: true，然后每帧 seek(frame / fps)。
 * 绝不能让 GSAP 用 requestAnimationFrame 自己跑——那样渲染结果不可复现。
 */
export const GsapScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  // 只构建一次时间线（单位统一用秒）
  useLayoutEffect(() => {
    const tl = gsap.timeline({ paused: true });

    if (titleRef.current) {
      tl.fromTo(
        titleRef.current,
        { y: 60, opacity: 0, letterSpacing: '24px' },
        { y: 0, opacity: 1, letterSpacing: '6px', duration: 0.9, ease: 'power3.out' },
        0
      );
    }

    const cards = cardRefs.current.filter(Boolean);
    if (cards.length) {
      tl.fromTo(
        cards,
        { y: 160, opacity: 0, rotate: -6, scale: 0.92 },
        {
          y: 0, opacity: 1, rotate: 0, scale: 1,
          duration: 0.85, ease: 'back.out(1.4)', stagger: 0.16,
        },
        0.35
      )
        // 第二拍：整排卡片轻微浮动，制造"活着"的感觉
        .to(cards, { y: -16, duration: 0.9, ease: 'sine.inOut', stagger: 0.1 }, 1.7)
        .to(cards, { y: 0, duration: 0.9, ease: 'sine.inOut', stagger: 0.1 }, 2.6);
    }

    tlRef.current = tl;
    return () => {
      tl.kill();
      tlRef.current = null;
    };
  }, []);

  // 每帧把时间线 seek 到对应位置（layout effect：截图前 DOM 已是终态）
  useLayoutEffect(() => {
    tlRef.current?.seek(frame / fps, false);
  }, [frame, fps]);

  const fadeOut = Math.min(1, Math.max(0, (durationInFrames - frame) / 14));

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: FONT,
        opacity: fadeOut,
      }}
    >
      <h2
        ref={titleRef}
        style={{
          margin: '0 0 70px',
          fontSize: 78,
          fontWeight: 900,
          color: COLORS.ink,
          letterSpacing: 6,
        }}
      >
        四种武器，一个时间轴
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 620px)',
          gap: 34,
        }}
      >
        {CARDS.map((c, i) => (
          <div
            key={c.title}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            style={{
              padding: '34px 40px',
              borderRadius: 22,
              background: 'linear-gradient(160deg, rgba(255,255,255,.09), rgba(255,255,255,.03))',
              border: `1px solid ${c.color}55`,
              boxShadow: `0 20px 60px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08)`,
            }}
          >
            <div style={{ fontSize: 40, fontWeight: 900, color: c.color, fontFamily: MONO }}>
              {c.title}
            </div>
            <div style={{ marginTop: 12, fontSize: 27, color: COLORS.dim, lineHeight: 1.5 }}>
              {c.desc}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
