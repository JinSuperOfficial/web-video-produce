import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { COLORS } from './config';
import { FONT, MONO } from './fonts';

export type PromoCoverProps = {
  /** public/ 下的底图 */
  bg?: string;
  /** 左侧压暗渐变：写实照片需要更重一点的scrim，才能压住画面里的高光 */
  scrim?: string;
  /** 标题字号（写实底图里人物偏右，可以更大） */
  titleSize?: number;
};

/**
 * B 站封面（静帧）。
 *
 *   npx remotion still src/index.ts PromoCover     output/promo-cover.png       # 抽象科技底图
 *   npx remotion still src/index.ts PromoCoverReal output/promo-cover-real.png  # 写实（真人出镜感）底图
 *
 * 底图由 gpt-image-2 生成，中文标题一律由代码叠上去 —— 图像模型写中文经常糊，
 * 文字交给 Remotion 才稳，也才能保证和视频是同一套配色与字体。
 */
export const PromoCover: React.FC<PromoCoverProps> = ({
  bg = 'cover-bg.png',
  scrim = 'linear-gradient(90deg, rgba(4,7,14,.96) 0%, rgba(4,7,14,.90) 38%, rgba(4,7,14,.45) 62%, rgba(4,7,14,0) 82%)',
  titleSize = 132,
}) => (
  <AbsoluteFill style={{ backgroundColor: COLORS.bg0 }}>
    <Img src={staticFile(bg)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

    {/* 左侧压暗，保证文字在任何底图上都够对比 */}
    <AbsoluteFill style={{ background: scrim }} />

    <AbsoluteFill style={{ padding: '120px 120px 110px', justifyContent: 'center' }}>
      <div style={{ fontFamily: FONT, maxWidth: 1020 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 24,
            letterSpacing: 10,
            color: COLORS.accent,
            fontWeight: 700,
          }}
        >
          CODE-TO-VIDEO · OPEN SOURCE
        </div>

        <div
          style={{
            marginTop: 26,
            fontSize: titleSize,
            fontWeight: 900,
            color: COLORS.ink,
            letterSpacing: 4,
            lineHeight: 1.08,
            textShadow: '0 12px 50px rgba(0,0,0,.85)',
          }}
        >
          写代码
          <span style={{ color: COLORS.accent }}>，</span>
          做视频
        </div>

        <div
          style={{
            marginTop: 26,
            fontSize: 40,
            fontWeight: 700,
            color: COLORS.ink,
            letterSpacing: 2,
            textShadow: '0 6px 26px rgba(0,0,0,.8)',
          }}
        >
          配音 · 字幕 · 背景音乐，全自动
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 34,
            color: COLORS.dim,
            textShadow: '0 6px 26px rgba(0,0,0,.8)',
          }}
        >
          一条命令，直接出 MP4
        </div>

        <div style={{ marginTop: 44, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {['MIT 开源', 'Remotion', 'Canvas / GLSL', 'edge-tts', 'FFmpeg'].map((t) => (
            <span
              key={t}
              style={{
                fontFamily: MONO,
                fontSize: 21,
                padding: '8px 16px',
                borderRadius: 10,
                color: COLORS.accent,
                background: 'rgba(6,14,22,.72)',
                border: `1px solid ${COLORS.accent}66`,
              }}
            >
              {t}
            </span>
          ))}
        </div>

        <div
          style={{
            marginTop: 46,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            fontFamily: MONO,
            fontSize: 24,
            color: COLORS.ink,
            textShadow: '0 6px 26px rgba(0,0,0,.85)',
          }}
        >
          <span>github.com/JinSuperOfficial/web-video-produce</span>
          <span style={{ color: COLORS.warm }}>· UP 主 JinSuper</span>
        </div>
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);
