import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Backdrop } from './components/Backdrop';
import { DanmakuLayer, type DanmakuItem } from './components/Danmaku';
import { PromoSubtitles } from './components/PromoSubtitles';
import { SfxTrack, cue } from './components/SfxTrack';
import { TransitionOverlay, useSceneEnter, useSceneExit, type TransitionKind } from './transitions';
import { endOf, promo, startOf, TOTAL_FRAMES } from './voicePromo';
import { CtaScene } from './scenes/promo/CtaScene';
import { EditScene } from './scenes/promo/EditScene';
import { EndScene } from './scenes/promo/EndScene';
import { HookScene } from './scenes/promo/HookScene';
import { IdeaScene } from './scenes/promo/IdeaScene';
import { IntroScene } from './scenes/promo/IntroScene';
import { MixScene } from './scenes/promo/MixScene';
import { PainScene } from './scenes/promo/PainScene';
import { PipelineScene } from './scenes/promo/PipelineScene';
import { PolishScene } from './scenes/promo/PolishScene';
import { RenderScene } from './scenes/promo/RenderScene';
import { StackScene } from './scenes/promo/StackScene';
import { VerifyScene } from './scenes/promo/VerifyScene';
import { VoiceScene } from './scenes/promo/VoiceScene';

/**
 * 推广片时间轴（Composition `WebVideoPromo`）。
 *
 * 与 `src/Main.tsx`（10 秒 demo）完全独立：原 Composition 一行没动，两个成片随时都能渲。
 * 这里只认 public/voice-promo/manifest.json，不碰 public/voice/。
 *
 * 两条设计决定：
 *  1. **切点落在停顿的中间**，不是落在下一句的开头。每段之间本来就有 350~500ms 真停顿，
 *     把转场覆盖层摆在停顿正中，画面换完的那一刻，正好是新句子开口的那一刻 ——
 *     既不会"话已经说了画面还没换"，也不会"画面换了半秒才开口"。
 *  2. **场景入场动作 = 切进它时那个转场覆盖层的类型**，方向和覆盖层一致，两者不会互相打架。
 */

type SceneComp = React.FC<{ durationInFrames: number }>;

const SCENES: { id: string; Comp: SceneComp }[] = [
  { id: 'hook', Comp: HookScene },
  { id: 'intro', Comp: IntroScene },
  { id: 'pain', Comp: PainScene },
  { id: 'idea', Comp: IdeaScene },
  { id: 'pipeline', Comp: PipelineScene },
  { id: 'render', Comp: RenderScene },
  { id: 'stack', Comp: StackScene },
  { id: 'edit', Comp: EditScene },
  { id: 'voice', Comp: VoiceScene },
  { id: 'polish', Comp: PolishScene },
  { id: 'mix', Comp: MixScene },
  { id: 'verify', Comp: VerifyScene },
  { id: 'cta', Comp: CtaScene },
  { id: 'end', Comp: EndScene },
];

/** 13 个切点各用一种转场，避免整片只用 fade 显得平。 */
const TRANSITIONS: TransitionKind[] = [
  'glitchCut', // hook → intro
  'wipeLeft', // intro → pain
  'dipToBlack', // pain → idea（转折要黑一下）
  'slidePush', // idea → pipeline
  'wipeUp', // pipeline → render
  'whipPan', // render → stack
  'circleOpen', // stack → edit
  'wipeRight', // edit → voice
  'fade', // voice → polish
  'zoomPunch', // polish → mix
  'wipeDown', // mix → verify
  'slidePush', // verify → cta
  'zoomPunch', // cta → end
];

/** 转场覆盖层的长度（帧）。12 帧 = 0.4s，和段间停顿同量级。 */
const CUT_FRAMES = 12;

/** 切点 = 下一段开始 − 停顿的一半（停顿正中）。 */
const CUTS = SCENES.slice(1).map((s, i) => {
  const gap = startOf(s.id) - endOf(SCENES[i].id);
  return Math.round(startOf(s.id) - gap / 2);
});

/**
 * 场景槽：入场/出场样式必须在 Sequence 内部用局部帧算，
 * 所以只能包一层 —— 场景组件本身不用关心转场，换转场也不用动场景。
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

// ---------------------------------------------------------------------------
// 弹幕：只铺在这几幕（钩子、观点、干货、号召），不铺满全片
// ---------------------------------------------------------------------------

const DANMAKU: { base: number; span: number; items: DanmakuItem[] }[] = [
  {
    base: 0,
    span: startOf('intro'),
    items: [
      { at: 18, text: '？', lane: 1, speed: 26, opacity: 0.36 },
      { at: 40, text: '代码生成？', lane: 0, speed: 22, opacity: 0.42 },
      { at: 62, text: '已 star', lane: 2, speed: 20, opacity: 0.4 },
    ],
  },
  {
    base: startOf('intro'),
    span: endOf('intro') - startOf('intro') + 20,
    items: [
      { at: 58, text: '三个命令就出片', lane: 1, speed: 21, opacity: 0.38 },
      { at: 112, text: '这项目我见过', lane: 0, speed: 23, opacity: 0.36 },
    ],
  },
  {
    base: startOf('idea'),
    span: 180,
    items: [
      { at: 26, text: '这句好', lane: 1, speed: 23, opacity: 0.42 },
      { at: 64, text: '算出来的', lane: 0, speed: 21, opacity: 0.38 },
      { at: 100, text: 'f(frame) 可以', lane: 2, speed: 24, opacity: 0.4 },
    ],
  },
  {
    base: startOf('polish'),
    span: 200,
    items: [
      { at: 30, text: '原来是这样', lane: 1, speed: 22, opacity: 0.42 },
      { at: 82, text: '学到了', lane: 2, speed: 25, opacity: 0.38 },
      { at: 130, text: '细节了', lane: 0, speed: 21, opacity: 0.44 },
    ],
  },
  {
    base: startOf('cta'),
    span: 185,
    items: [
      { at: 26, text: '这就去 star', lane: 1, speed: 22, opacity: 0.46 },
      { at: 62, text: '三连了', lane: 0, speed: 24, opacity: 0.44 },
      { at: 98, text: '码住', lane: 2, speed: 21, opacity: 0.38 },
      { at: 130, text: '今晚就跑一遍', lane: 1, speed: 23, opacity: 0.4 },
    ],
  },
];

export const PromoMain: React.FC = () => {
  const scenes = SCENES.map((s, i) => ({
    ...s,
    from: i === 0 ? 0 : CUTS[i - 1],
    to: i < SCENES.length - 1 ? CUTS[i] : TOTAL_FRAMES,
    enter: (i === 0 ? 'fade' : TRANSITIONS[i - 1]) as TransitionKind,
    exit: (i < SCENES.length - 1 ? TRANSITIONS[i] : 'fade') as TransitionKind,
  }));

  // 音效锚点全部绑段 id，换配音不用回来改帧号
  const sfx = [
    ...CUTS.map((c) => cue('transition', c - 4)),
    cue('pop', startOf('intro') + 44),
    cue('pop', startOf('pain') + 12),
    cue('pop', startOf('render') + 6),
    cue('click', startOf('pipeline') + 60),
    cue('impact', startOf('idea') + 2),
    cue('pop', startOf('voice') + 40),
    cue('pop', startOf('polish') + 10),
    cue('click', startOf('verify') + 44),
    cue('riser', Math.max(0, startOf('cta') - 52)),
    cue('impact', startOf('cta') + 2),
    cue('chime', startOf('end') + 4),
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Backdrop />

      {scenes.map(({ id, Comp, from, to, enter, exit }) => {
        const durationInFrames = Math.max(1, to - from);
        return (
          <Sequence key={id} from={from} durationInFrames={durationInFrames} name={`scene:${id}`}>
            <SceneSlot durationInFrames={durationInFrames} enter={enter} exit={exit}>
              <Comp durationInFrames={durationInFrames} />
            </SceneSlot>
          </Sequence>
        );
      })}

      {/* 弹幕压在主体内容之上、字幕之下（字幕在最后画，永远最清楚） */}
      {DANMAKU.map((d, i) => (
        <Sequence
          key={`dm-${i}`}
          from={d.base}
          durationInFrames={d.span}
          name={`danmaku-block:${i}`}
        >
          <DanmakuLayer items={d.items} life={150} />
        </Sequence>
      ))}

      <PromoSubtitles />

      {/* 转场覆盖层：跨切点摆，峰值正好落在切点那一帧 */}
      {CUTS.map((at, i) => (
        <Sequence
          key={`cut-${i}`}
          from={Math.max(0, at - Math.round(CUT_FRAMES / 2))}
          durationInFrames={CUT_FRAMES}
          name={`transition:${TRANSITIONS[i]}`}
        >
          <TransitionOverlay kind={TRANSITIONS[i]} durationInFrames={CUT_FRAMES} />
        </Sequence>
      ))}

      <SfxTrack cues={sfx} />

      {/* 整条配音轨（已含 BGM 与响度归一，由 tts_edge.py 合成） */}
      <Audio src={staticFile(`voice-promo/${promo.audio}`)} />
    </AbsoluteFill>
  );
};
