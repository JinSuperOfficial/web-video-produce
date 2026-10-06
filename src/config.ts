/** 全局视频参数：改这里，所有场景一起生效。 */
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/**
 * 正片结束后额外留白的帧数。
 * 现在配音轨自带 --tail-ms（默认 600ms）的 BGM 收尾空间，所以这里通常设 0：
 * 视频长度 = 配音轨长度，BGM 在最后 1.5s 自然淡出。
 */
export const TAIL_FRAMES = 0;

export const COLORS = {
  bg0: '#080b14',
  bg1: '#101a33',
  ink: '#f4f7ff',
  dim: '#8fa0c4',
  accent: '#5eead4',
  accent2: '#f0abfc',
  warm: '#fbbf24',
};
