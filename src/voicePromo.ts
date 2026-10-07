import manifest from '../public/voice-promo/manifest.json';
import { FPS } from './config';

/**
 * 推广片的配音时间轴（与 src/voice.ts 同构，但读的是 public/voice-promo/）。
 *
 * 为什么要单独一份：原 `WebVideo` Composition 的 10 秒 demo 必须保持可渲染，
 * 所以它继续用 public/voice/manifest.json；推广片用独立目录，
 * 两份时间轴互不干扰（validate.py 只校验 src/Main.tsx ↔ public/voice/）。
 */
export type PromoSegment = {
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

export type PromoManifest = {
  voice: string;
  rate: string;
  fps: number;
  audio: string;
  srt: string;
  vtt: string;
  sample_rate: number;
  total_duration: number;
  total_frames: number;
  segments: PromoSegment[];
};

export const promo = manifest as unknown as PromoManifest;

if (promo.fps !== FPS) {
  console.warn(
    `[voicePromo] manifest.fps=${promo.fps} 与 config.ts 的 FPS=${FPS} 不一致，` +
      `请用 --fps ${FPS} 重新生成 public/voice-promo/manifest.json`
  );
}

const PLACEHOLDER: PromoSegment = {
  id: 'missing', index: -1, text: '', voice: promo.voice,
  start: 0, end: 0, duration: 0, start_frame: 0, duration_frames: 1, file: null,
};

export const pseg = (id: string): PromoSegment => {
  const found = promo.segments.find((s) => s.id === id);
  if (!found) {
    console.warn(`[voicePromo] 脚本里没有 id="${id}" 的段，已用占位段代替`);
    return { ...PLACEHOLDER, id };
  }
  return found;
};

/** 某段开始的帧号。 */
export const startOf = (id: string): number => pseg(id).start_frame;
/** 某段结束的帧号。 */
export const endOf = (id: string): number => pseg(id).start_frame + pseg(id).duration_frames;
/** 当前帧显示哪句字幕。 */
export const captionAt = (frame: number): PromoSegment | null =>
  promo.segments.find(
    (s) => frame >= s.start_frame && frame < s.start_frame + s.duration_frames
  ) ?? null;

export const TOTAL_FRAMES = Math.max(FPS, Math.ceil(promo.total_duration * FPS));
