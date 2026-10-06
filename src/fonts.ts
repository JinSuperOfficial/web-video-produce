import { loadFont } from '@remotion/google-fonts/NotoSansSC';

/**
 * 中文字体：必须显式加载。
 * headless 容器里通常没有任何 CJK 系统字体，不加载就会渲染成"豆腐块"。
 * loadFont() 内部会 delayRender，等字体就绪后才让 Remotion 截图。
 * 离线渲染请改用 @remotion/fonts + staticFile('fonts/xxx.woff2')。
 */
const { fontFamily } = loadFont('normal', {
  weights: ['400', '700', '900'],
  subsets: ['chinese-simplified', 'latin'],
});

export const FONT = fontFamily;
export const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
