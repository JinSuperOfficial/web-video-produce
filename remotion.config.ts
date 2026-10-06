import { Config } from '@remotion/cli/config';

/**
 * Remotion 渲染配置（会被 studio / render / bundle 共同读取）
 * 注意：Three.js / WebGL 场景必须用 angle 渲染器，否则 headless 里拿不到 WebGL 上下文。
 */
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');
Config.setConcurrency(4);
Config.setDelayRenderTimeoutInMilliseconds(120_000);
