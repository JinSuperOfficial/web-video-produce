import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import { voice } from '../voice';

/**
 * 音效轨（SFX）。
 *
 * 为什么单独做一层：BGM 是"氛围"，音效是"事件"。事件必须**卡在帧上**，
 * 而不是"大概在那个位置" —— 转场音早 2 帧就散了，晚 2 帧就砸空了。
 * 所以这里只接受两种锚点：
 *   · 绝对帧号（数字）：用在片头、片尾这种写死的位置；
 *   · 段落 id（'seg:cta'）：自动解析成该段的起始帧 —— 配音改了就自动跟着走，
 *     不需要回来手改数字。这是 SFX 与配音时间轴唯一的耦合点。
 *
 * 音效素材由 `python3 scripts/make_sfx.py` 本地合成（可商用），
 * 放在 assets/sfx/，渲染前需要有一份在 public/sfx/（`wvp.py render` 会自动同步，
 * 因为 Remotion 的 staticFile 只服务 public/ 目录）。
 */
export type SfxAnchor = number | `seg:${string}`;

export type SfxCue = {
  /** 触发位置：绝对帧号，或 'seg:<段id>'（该段起始帧） */
  at: SfxAnchor;
  /** assets/sfx/ 下的文件名，如 'whoosh.mp3' */
  file: string;
  /** 音量（0~1），默认 0.5。音效压过人声是外行做法，宁可小一点 */
  volume?: number;
  /** 相对锚点的偏移帧数，用来微调（负数 = 提前） */
  offsetFrames?: number;
};

/**
 * 音效"调色板"：按用途给好默认音量。
 * 现场音效最容易犯的错是"全都 1.0"，结果人声被盖住、转场像砸锅。
 * 这里的默认值是按"转场音要像呼吸、落地音要像重物"定的。
 */
export const SFX_PRESETS = {
  /** 场景切换的"唰"：最轻，几乎只是气声 */
  transition: { file: 'whoosh.mp3', volume: 0.32 },
  /** 元素弹出/卡片出现 */
  pop: { file: 'pop.mp3', volume: 0.4 },
  /** UI 点击/强调 */
  click: { file: 'click.mp3', volume: 0.35 },
  /** 悬念铺垫，通常配在最后一个场景之前 */
  riser: { file: 'riser.mp3', volume: 0.42 },
  /** 重击/落地/标题砸下 */
  impact: { file: 'impact.mp3', volume: 0.5 },
  /** 收尾/logo 亮相 */
  chime: { file: 'chime.mp3', volume: 0.45 },
} as const;

export type SfxPresetName = keyof typeof SFX_PRESETS;

/** 把 'seg:cta' 解析成帧号。段 id 不存在时会警告并用 0（不崩渲染）。 */
export const resolveAnchor = (at: SfxAnchor): number => {
  if (typeof at === 'number') return Math.max(0, Math.round(at));
  const id = at.slice(4);
  const found = voice.segments.find((s) => s.id === id);
  if (!found) {
    console.warn(`[SfxTrack] 没有 id="${id}" 的段，音效锚点退化为第 0 帧`);
    return 0;
  }
  return found.start_frame;
};

/** 用预设 + 锚点写 cue 的快捷方式，例如 sfx.cue('transition', 'seg:s2') */
export const cue = (
  preset: SfxPresetName,
  at: SfxAnchor,
  extra: Partial<SfxCue> = {}
): SfxCue => ({ at, file: SFX_PRESETS[preset].file, volume: SFX_PRESETS[preset].volume, ...extra });

export const SfxTrack: React.FC<{ cues: SfxCue[] }> = ({ cues }) => {
  return (
    <>
      {cues.map((c, i) => {
        const from = resolveAnchor(c.at) + (c.offsetFrames ?? 0);
        if (from < 0) return null;
        return (
          <Sequence key={`${c.file}-${i}`} from={from} name={`sfx:${c.file}`}>
            <Audio src={staticFile(`sfx/${c.file}`)} volume={c.volume ?? 0.5} />
          </Sequence>
        );
      })}
    </>
  );
};
