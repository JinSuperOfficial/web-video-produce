import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import gsap from 'gsap';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { Chip } from './kit';

const CARDS = [
  { title: 'HTML / Canvas', desc: '网页即画布，DOM 与 2D 图形随便画', color: COLORS.accent },
  { title: 'Three.js + GLSL', desc: '三维场景与着色器，GPU 直接出像素', color: COLORS.accent2 },
  { title: 'React + Remotion', desc: '组件化时间轴，帧即状态', color: COLORS.warm },
  { title: 'edge-tts + FFmpeg', desc: '配音、字幕、编码一条流水线', color: '#7dd3fc' },
];

/**
 * 第 7 幕 · stack（899–1082 帧，约 6.1 秒）
 *
 * 沿用仓库里 GsapScene 的已知可用姿势：timeline 必须 paused: true，每帧 seek(frame/fps)，
 * 绝不让 GSAP 用 requestAnimationFrame 自己跑 —— 否则渲染不可复现（validate.py 会直接报错）。
 */
export const StackScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useLayoutEffect(() => {
    const tl = gsap.timeline({ paused: true });

    if (titleRef.current) {
      tl.fromTo(
        titleRef.current,
        { y: 54, opacity: 0, letterSpacing: '22px' },
        { y: 0, opacity: 1, letterSpacing: '6px', duration: 0.85, ease: 'power3.out' },
        0
      );
    }

    const cards = cardRefs.current.filter(Boolean);
    if (cards.length) {
      tl.fromTo(
        cards,
        { y: 150, opacity: 0, rotate: -5, scale: 0.93 },
        { y: 0, opacity: 1, rotate: 0, scale: 1, duration: 0.8, ease: 'back.out(1.4)', stagger: 0.14 },
        0.3
      )
        .to(cards, { y: -14, duration: 0.85, ease: 'sine.inOut', stagger: 0.09 }, 2.2)
        .to(cards, { y: 0, duration: 0.85, ease: 'sine.inOut', stagger: 0.09 }, 3.05);
    }

    tlRef.current = tl;
    return () => {
      tl.kill();
      tlRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    tlRef.current?.seek(frame / fps, false);
  }, [frame, fps]);

  // 第二拍：按帧轮播高亮当前卡片（不依赖 GSAP，纯帧函数）
  const focus = Math.min(CARDS.length - 1, Math.max(0, Math.floor((frame - 96) / 22)));
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
          margin: '0 0 32px',
          fontSize: 64,
          fontWeight: 900,
          color: COLORS.ink,
          letterSpacing: 6,
        }}
      >
        四种武器，一个时间轴
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 620px)', gap: 26 }}>
        {CARDS.map((c, i) => {
          const active = i === focus && frame > 96;
          return (
            <div
              key={c.title}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              style={{
                padding: '24px 30px',
                borderRadius: 22,
                background: 'linear-gradient(160deg, rgba(255,255,255,.09), rgba(255,255,255,.03))',
                border: `1px solid ${c.color}${active ? 'cc' : '55'}`,
                boxShadow: active
                  ? `0 24px 70px rgba(0,0,0,.45), 0 0 34px ${c.color}33, inset 0 1px 0 rgba(255,255,255,.08)`
                  : '0 20px 60px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08)',
                transform: `scale(${active ? 1.02 : 1})`,
              }}
            >
              <div style={{ fontSize: 33, fontWeight: 900, color: c.color, fontFamily: MONO }}>
                {c.title}
              </div>
              <div style={{ marginTop: 8, fontSize: 22, color: COLORS.dim, lineHeight: 1.5 }}>
                {c.desc}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Chip label="11 种动作" />
        <Chip label="11 种转场" color={COLORS.accent2} />
        <Chip label="58 种 xfade" color={COLORS.warm} />
        <Chip label="GSAP 手动 seek" color="#7dd3fc" />
      </div>
    </AbsoluteFill>
  );
};
