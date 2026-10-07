import React from 'react';
import { AbsoluteFill, Composition, Still } from 'remotion';
import { Main } from './Main';
import { PromoMain } from './PromoMain';
import { Cover } from './Cover';
import { PromoCover } from './PromoCover';
import { ShowcaseScene } from './scenes/ShowcaseScene';
import { FPS, HEIGHT, TAIL_FRAMES, WIDTH } from './config';
import { voice } from './voice';
import { TOTAL_FRAMES as PROMO_FRAMES } from './voicePromo';

/** 正片长度 = 配音总时长 + 片尾留白。改脚本/换音色后重新跑 tts_edge.py 即可自动变长。 */
const durationInFrames = Math.max(
  FPS,
  Math.ceil(voice.total_duration * FPS) + TAIL_FRAMES
);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="WebVideo"
        component={Main}
        durationInFrames={durationInFrames}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Still id="Cover" component={Cover} width={WIDTH} height={HEIGHT} />
      <Still
        id="PromoCover"
        component={PromoCover}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ bg: 'cover-bg.png' }}
      />
      <Still
        id="PromoCoverReal"
        component={PromoCover}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          bg: 'cover-real/a.png',
          titleSize: 138,
          scrim:
            'linear-gradient(90deg, rgba(4,7,14,.97) 0%, rgba(4,7,14,.93) 34%, rgba(4,7,14,.72) 48%, rgba(4,7,14,.18) 62%, rgba(4,7,14,0) 76%)',
        }}
      />
      {/* 推广片：独立 Composition，不动上面那个 10 秒 demo */}
      <Still
        id="PromoCoverReal43"
        component={PromoCover}
        width={1440}
        height={1080}
        defaultProps={{
          bg: 'cover-real/a.png',
          titleSize: 104,
          scrim:
            'linear-gradient(90deg, rgba(4,7,14,.97) 0%, rgba(4,7,14,.94) 40%, rgba(4,7,14,.80) 58%, rgba(4,7,14,.30) 78%, rgba(4,7,14,.10) 100%)',
        }}
      />
      <Composition
        id="WebVideoPromo"
        component={PromoMain}
        durationInFrames={PROMO_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="MotionShowcase"
        component={ShowcaseScene}
        durationInFrames={660}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ durationInFrames: 660 }}
      />
    </>
  );
};
