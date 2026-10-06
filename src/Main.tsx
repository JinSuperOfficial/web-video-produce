import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Backdrop } from './components/Backdrop';
import { SfxTrack, cue } from './components/SfxTrack';
import { Subtitles } from './components/Subtitles';
import { GsapScene } from './scenes/GsapScene';
import { ThreeShaderScene } from './scenes/ThreeShaderScene';
import { TitleScene } from './scenes/TitleScene';
import { TransitionOverlay, useSceneEnter, useSceneExit, type TransitionKind } from './transitions';
import { FPS, TAIL_FRAMES } from './config';
import { startOf, voice } from './voice';

/**
 * 视觉时间轴：以配音段落为锚点切场景，永远和声音对齐。
 * id 必须与 examples/script.intro10s.json 一致；换脚本时改这里即可。
 *
 * 首屏给固定 90 帧（3 秒）：10 秒短片里 s1 只有 58 帧，纯按 id 切会让标题动画来不及演完。
 * 第三幕严格从 "cta" 开始，保证收尾画面与最后一句台词同步。
 */
const TITLE_FRAMES = 90;

/** 转场覆盖层的长度（帧）。它只是视觉上的重叠，不参与时间轴计算 */
const CUT_FRAMES = 14;

/**
 * 场景槽：给每个场景套上入场/出场动作。
 *
 * 为什么要单独包一层：入场样式必须用**场景自己的局部帧**算（useCurrentFrame），
 * 所以只能在 Sequence 里面调用 hook。场景组件本身不用关心转场，换转场也不用动场景。
 */
const SceneSlot: React.FC<{
  durationInFrames: number;
  enter: TransitionKind;
  exit: TransitionKind;
  children: React.ReactNode;
}> = ({ durationInFrames, enter, exit, children }) => {
  const enterStyle = useSceneEnter(enter, CUT_FRAMES);
  const exitStyle = useSceneExit(exit, CUT_FRAMES, durationInFrames);
  return <AbsoluteFill style={{ ...enterStyle, ...exitStyle }}>{children}</AbsoluteFill>;
};

export const Main: React.FC = () => {
  const total = Math.ceil(voice.total_duration * FPS) + TAIL_FRAMES;
  const ctaStart = startOf('cta');
  const midStart = Math.min(TITLE_FRAMES, ctaStart);

  // 不变式：一个场景的入场动作 = 切进它时那个转场覆盖层的类型。
  // 这样"覆盖层揭开"和"新场景长出来"是同一个方向的运动，不会互相打架。
  const scenes: {
    from: number;
    to: number;
    Comp: React.FC<{ durationInFrames: number }>;
    enter: TransitionKind;
    exit: TransitionKind;
  }[] = [
    { from: 0, to: midStart, Comp: TitleScene, enter: 'fade', exit: 'fade' },
    { from: midStart, to: ctaStart, Comp: GsapScene, enter: 'wipeLeft', exit: 'fade' },
    { from: ctaStart, to: total, Comp: ThreeShaderScene, enter: 'zoomPunch', exit: 'fade' },
  ];

  // 覆盖层的摆放：让遮挡峰值正好落在切点上（from = 切点 − 一半），
  // 这样它才是真正"跨切点"的转场，而不是全在旧场景那一侧播完。
  const cuts = scenes.slice(1).map((s, i) => ({ at: s.from, kind: s.enter, key: `cut-${i}` }));

  // 音效轨：锚在切点和关键段上。用 seg:<id> 当锚点后，重录配音不用回来改数字。
  const sfx = [
    cue('transition', midStart, { offsetFrames: -4 }),
    cue('transition', ctaStart, { offsetFrames: -4 }),
    cue('impact', 'seg:cta'),
    cue('chime', Math.max(0, total - 42)),
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Backdrop />
      {scenes.map(({ from, to, Comp, enter, exit }, i) => {
        const durationInFrames = Math.max(1, to - from);
        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <SceneSlot durationInFrames={durationInFrames} enter={enter} exit={exit}>
              <Comp durationInFrames={durationInFrames} />
            </SceneSlot>
          </Sequence>
        );
      })}
      <Subtitles />
      {/* 转场覆盖层放在字幕之后：要盖住字幕，否则黑场过渡时字幕会"浮"在上面 */}
      {cuts.map(({ at, kind, key }) => (
        <Sequence
          key={key}
          from={Math.max(0, at - Math.round(CUT_FRAMES / 2))}
          durationInFrames={CUT_FRAMES}
        >
          <TransitionOverlay kind={kind} durationInFrames={CUT_FRAMES} />
        </Sequence>
      ))}
      <SfxTrack cues={sfx} />
      {/* 整条配音：由 tts_edge.py 产出，长度即正片长度 */}
      <Audio src={staticFile(`voice/${voice.audio}`)} />
    </AbsoluteFill>
  );
};
