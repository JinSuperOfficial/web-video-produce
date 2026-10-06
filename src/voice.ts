import manifest from '../public/voice/manifest.json';
import { FPS } from './config';

/**
 * 配音时间轴。
 * manifest.json 由 scripts/tts_edge.py 生成，是音画的唯一真相来源：
 * 声音多长、每一句从第几帧开始，都以它为准，视频代码不要"手工估算秒数"。
 */
export type VoiceSegment = {
  id: string;
  index: number;
  text: string;
  voice: string;
  start: number;
  end: number;
  duration: number;
  start_frame: number;
  duration_frames: number;
  file: string | null;
};

export type VoiceManifest = {
  voice: string;
  rate: string;
  fps: number;
  audio: string;
  srt: string;
  sample_rate: number;
  total_duration: number;
  total_frames: number;
  segments: VoiceSegment[];
};

export const voice = manifest as unknown as VoiceManifest;

if (voice.fps !== FPS) {
  // 常见坑：改过 fps 但没重新跑 tts_edge.py，帧号会对不上。
  console.warn(
    `[voice] manifest.fps=${voice.fps} 与 src/config.ts 的 FPS=${FPS} 不一致，` +
      `请用 --fps ${FPS} 重新生成 manifest.json`
  );
}

export const seg = (id: string): VoiceSegment => {
  const found = voice.segments.find((s) => s.id === id);
  if (!found) {
    // 找不到就返回一个占位段，保证渲染不崩
    console.warn(`[voice] 脚本里没有 id="${id}" 的段，已用占位段代替`);
    return {
      id, index: -1, text: '', voice: voice.voice,
      start: 0, end: 0, duration: 0, start_frame: 0, duration_frames: 1, file: null,
    };
  }
  return found;
};

/** 某个 segment 开始的帧号。 */
export const startOf = (id: string): number => seg(id).start_frame;
/** 某个 segment 结束的帧号（= start + duration）。 */
export const endOf = (id: string): number => seg(id).start_frame + seg(id).duration_frames;

/** 当前帧应该显示哪句字幕（没有就返回 null）。 */
export const captionAt = (frame: number): VoiceSegment | null =>
  voice.segments.find(
    (s) => frame >= s.start_frame && frame < s.start_frame + s.duration_frames
  ) ?? null;
