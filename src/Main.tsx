import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Backdrop } from './components/Backdrop';
import { Subtitles } from './components/Subtitles';
import { GsapScene } from './scenes/GsapScene';
import { ThreeShaderScene } from './scenes/ThreeShaderScene';
import { TitleScene } from './scenes/TitleScene';
import { FPS, TAIL_FRAMES } from './config';
import { startOf, voice } from './voice';

/**
 * 视觉时间轴：以配音段落为锚点切场景，永远和声音对齐。
 * id 必须与 examples/script.intro10s.json 一致；换脚本时改这里即可。
 */
/**
 * 视觉时间轴：以配音段落为锚点切场景。
 * 首屏给固定 90 帧（3 秒）：10 秒短片里 s1 只有 58 帧，纯按 id 切会让标题动画来不及演完。
 * 第三幕严格从 "cta" 开始，保证收尾画面与最后一句台词同步。
 */
const TITLE_FRAMES = 90;

export const Main: React.FC = () => {
  const total = Math.ceil(voice.total_duration * FPS) + TAIL_FRAMES;
  const ctaStart = startOf('cta');

  const scenes = [
    { from: 0, to: Math.min(TITLE_FRAMES, ctaStart), Comp: TitleScene },
    { from: Math.min(TITLE_FRAMES, ctaStart), to: ctaStart, Comp: GsapScene },
    { from: ctaStart, to: total, Comp: ThreeShaderScene },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Backdrop />
      {scenes.map(({ from, to, Comp }, i) => {
        const durationInFrames = Math.max(1, to - from);
        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <Comp durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}
      <Subtitles />
      {/* 整条配音：由 tts_edge.py 产出，长度即正片长度 */}
      <Audio src={staticFile(`voice/${voice.audio}`)} />
    </AbsoluteFill>
  );
};
