import { Config } from '@remotion/cli/config';

/**
 * Remotion 渲染配置（会被 studio / render / bundle 共同读取）
 * 注意：Three.js / WebGL 场景必须用 angle 渲染器，否则 headless 里拿不到 WebGL 上下文。
 */
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');
// 色彩空间：不设的话 Remotion 不传 -color_range / -colorspace，
// ffmpeg 会按默认写成 full-range(yuvj420p) + BT.601 —— 平台转码时颜色会漂。
// 设成 bt709 后 Remotion 会加 -colorspace bt709 -color_range tv 并做 zscale 限幅转换。
Config.setColorSpace('bt709');
Config.setConcurrency(4);
Config.setDelayRenderTimeoutInMilliseconds(120_000);
