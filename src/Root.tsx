import React from 'react';
import { AbsoluteFill, Composition, Still } from 'remotion';
import { Main } from './Main';
import { Cover } from './Cover';
import { ShowcaseScene } from './scenes/ShowcaseScene';
import { FPS, HEIGHT, TAIL_FRAMES, WIDTH } from './config';
import { voice } from './voice';

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
