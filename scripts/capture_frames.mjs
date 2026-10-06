#!/usr/bin/env node
/**
 * web-video-produce :: HTML/Canvas 页面逐帧截图（不依赖 Remotion 的轻量路径）
 *
 * 前提: 页面必须实现"帧协议"——
 *   1. 用 ?frame=<n>&fps=<f>&duration=<n> 决定画面，禁止 requestAnimationFrame 自走时
 *   2. 渲染完成后把 window.__FRAME_READY__ 置为 true
 *   3. 禁止使用 Math.random() / Date.now()；需要随机请用固定种子的 PRNG
 *
 * 安装: npm i -D playwright && npx playwright install chromium
 * 用法:
 *   node scripts/capture_frames.mjs --html templates/html-gsap/index.html \
 *        --outdir frames --fps 30 --seconds 12 --width 1920 --height 1080
 *   node scripts/capture_frames.mjs --url "http://localhost:5173/" --outdir frames --seconds 5
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]?.startsWith('--') ? 'true' : arr[i + 1]]);
    return acc;
  }, [])
);

const html = args.html;
const url = args.url ?? (html ? pathToFileURL(path.resolve(html)).href : null);
const outdir = args.outdir ?? 'frames';
const fps = Number(args.fps ?? 30);
const seconds = Number(args.seconds ?? 10);
const width = Number(args.width ?? 1920);
const height = Number(args.height ?? 1080);
const scale = Number(args.scale ?? 1);
const total = Math.round(fps * seconds);

if (!url) {
  console.error('需要 --html <文件> 或 --url <地址>');
  process.exit(2);
}

await mkdir(outdir, { recursive: true });

const browser = await chromium.launch({
  args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--font-render-hinting=none'],
});
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: scale,
});

page.on('pageerror', (e) => console.error('[page error]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[console]', m.text());
});

const started = Date.now();
for (let frame = 0; frame < total; frame++) {
  const sep = url.includes('?') ? '&' : '?';
  await page.goto(`${url}${sep}frame=${frame}&fps=${fps}&duration=${total}`, {
    waitUntil: 'load',
  });
  // 等页面自报"这一帧画好了"；没有实现协议就退化为等一帧
  await page
    .waitForFunction('window.__FRAME_READY__ === true', null, { timeout: 15_000 })
    .catch(() => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(true)))));
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(outdir, `f_${String(frame).padStart(5, '0')}.png`);
  await page.screenshot({ path: file, type: 'png', animations: 'disabled' });
  if (frame % 30 === 0 || frame === total - 1) {
    const pct = (((frame + 1) / total) * 100).toFixed(1);
    process.stdout.write(`\r  截图 ${frame + 1}/${total} (${pct}%)`);
  }
}
process.stdout.write('\n');

await browser.close();
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`✓ ${total} 帧 → ${outdir}/f_00000.png …  用时 ${secs}s（${(total / secs).toFixed(1)} fps）`);
console.log(`下一步: bash scripts/frames_to_video.sh --frames ${outdir} --fps ${fps} --audio public/voice/vo.mp3 --out output/from_frames.mp4`);
