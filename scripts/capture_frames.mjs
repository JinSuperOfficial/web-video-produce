#!/usr/bin/env node
/**
 * web-video-produce :: HTML/Canvas 页面逐帧截图（不依赖 Remotion 的轻量路径）
 * ===========================================================================
 * 页面必须实现"帧协议"（templates/frame-protocol.js）：画面 = f(帧号)，
 * 截图器只调 window.__seek(frame) 就能拿到任意一帧。
 *
 * 两种驱动模式：
 *   protocol（推荐）：只加载页面**一次**，之后每帧调 window.__seek(frame)。
 *   reload  （兼容）：每帧用 ?frame=N 重新加载整个页面。给没实现协议的老页面用。
 *   auto    （默认）：检测到 window.__wvp 就走 protocol，否则回退 reload 并提示。
 *
 * 实测（1280x720，本机 headless-shell）：
 *   截图本身 255ms/帧  ← 真正的瓶颈是 CDP 截图的 PNG 编码，不是 seek
 *   __seek    41ms/帧  ← 其中 32ms 是等两层 rAF 合成，12ms 才是页面重绘
 *   ⇒ protocol 与 reload 在**本地文件**上速度几乎一样（1.9 vs 1.8 帧/秒）。
 *     protocol 的价值不在速度，而在于：页面只解析一次（重页面/开发服务器/WebGL 上下文
 *     不用每帧重建）、不会每帧闪一次字体、截图器不需要知道动画库是什么。
 *   真正能提速的是输出格式：--format jpeg 实测 52ms/帧（比 png 快 5 倍）、体积 1/6。
 *     需要无损就用默认 png；中间帧序列用 jpeg 完全够（后面还要过一遍 H.264）。
 *
 * 安装（二选一）：
 *   npm i -D playwright        # 自带 Chromium，最省事（约 150MB 浏览器）
 *   npm i -D playwright-core   # 只有驱动库；用 --executable 指向已有 Chromium
 * 本仓库已装 playwright-core，并会自动复用 Remotion 下载好的 chrome-headless-shell，
 * 所以不装 playwright 也能跑。
 *
 * 用法:
 *   node scripts/capture_frames.mjs --html templates/html-gsap/index.html \
 *        --outdir frames --fps 30 --seconds 12 --width 1920 --height 1080
 *   node scripts/capture_frames.mjs --url "http://localhost:5173/" --outdir frames --seconds 5
 *   node scripts/capture_frames.mjs --html page.html --outdir frames --mode reload   # 老页面
 *   node scripts/capture_frames.mjs --html page.html --outdir out --frames 0,10,20   # 只截几帧
 *   node scripts/capture_frames.mjs --html page.html --outdir frames --format jpeg --quality 92
 */
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';

// --------------------------------------------------------------------------- #
// 参数
// --------------------------------------------------------------------------- #
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
const seconds = args.seconds === undefined ? null : Number(args.seconds);
const width = Number(args.width ?? 1920);
const height = Number(args.height ?? 1080);
const scale = Number(args.scale ?? 1);
const mode = args.mode ?? 'auto';
/** 输出格式：png 无损（默认）；jpeg 快 5 倍、体积 1/6，中间帧序列够用 */
const format = (args.format ?? 'png').toLowerCase();
const quality = Number(args.quality ?? 92);
const ext = format === 'jpeg' || format === 'jpg' ? '.jpg' : '.png';
/** --frames 0,10,20 只截指定帧（调试构图用，比渲全片快得多） */
const onlyFrames = args.frames ? String(args.frames).split(',').map((s) => Number(s.trim())) : null;

if (!url) {
  console.error('需要 --html <文件> 或 --url <地址>');
  process.exit(2);
}
if (!['auto', 'protocol', 'reload'].includes(mode)) {
  console.error(`--mode 只能是 auto / protocol / reload（收到 ${mode}）`);
  process.exit(2);
}
if (!['png', 'jpeg', 'jpg'].includes(format)) {
  console.error(`--format 只能是 png / jpeg（收到 ${format}）`);
  process.exit(2);
}

// --------------------------------------------------------------------------- #
// 找驱动库与浏览器：优先用仓库里已有的，避免再下一份 150MB 浏览器
// --------------------------------------------------------------------------- #
async function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return { mod: await import(name), name };
    } catch (err) {
      if (err?.code !== 'ERR_MODULE_NOT_FOUND' && err?.code !== 'MODULE_NOT_FOUND') throw err;
    }
  }
  console.error(
    '没找到 playwright/playwright-core。安装其一：\n' +
    '  npm i -D playwright         # 自带 Chromium\n' +
    '  npm i -D playwright-core    # 复用系统/Remotion 的 Chrome'
  );
  process.exit(2);
}

/** 复用 Remotion 下好的 chrome-headless-shell：省一次 150MB 下载，也保证版本一致 */
function findRemotionChrome() {
  const base = path.resolve('node_modules/.remotion/chrome-headless-shell');
  if (!existsSync(base)) return null;
  const candidates = [
    'linux64/chrome-headless-shell-linux64/chrome-headless-shell',
    'mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell',
    'mac-x64/chrome-headless-shell-mac-x64/chrome-headless-shell',
    'win64/chrome-headless-shell-win64/chrome-headless-shell.exe',
    'win32/chrome-headless-shell-win32/chrome-headless-shell.exe',
  ];
  for (const rel of candidates) {
    const p = path.join(base, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

const { mod: pw, name: driverName } = await loadPlaywright();
const executablePath = args.executable ?? findRemotionChrome() ?? undefined;

await mkdir(outdir, { recursive: true });

const browser = await pw.chromium.launch({
  executablePath,
  args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--font-render-hinting=none'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
page.on('pageerror', (e) => console.error('[page error]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[console]', m.text());
});

const started = Date.now();
let usedMode = mode;

async function shoot(frame) {
  const file = path.join(outdir, `f_${String(frame).padStart(5, '0')}${ext}`);
  // animations:'disabled' 会冻结 CSS 动画/过渡，是确定性的第二道保险
  const opts = format === 'png'
    ? { path: file, type: 'png', animations: 'disabled' }
    : { path: file, type: 'jpeg', quality, animations: 'disabled' };
  await page.screenshot(opts);
  return file;
}

function progress(done, total) {
  const pct = ((done / total) * 100).toFixed(1);
  process.stdout.write(`\r  截图 ${done}/${total} (${pct}%)`);
}

// --------------------------------------------------------------------------- #
// 第一次加载：顺便探测页面是否实现了帧协议
// --------------------------------------------------------------------------- #
const sep = url.includes('?') ? '&' : '?';
const first = onlyFrames ? onlyFrames[0] : 0;
await page.goto(`${url}${sep}frame=${first}&fps=${fps}`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

const info = await page.evaluate(() => (window.__wvp ? window.__frameInfo() : null));

if (usedMode === 'auto') usedMode = info ? 'protocol' : 'reload';
if (usedMode === 'protocol' && !info) {
  console.error(
    '页面没有实现帧协议（找不到 window.__wvp）。\n' +
    '  修法：在页面里 <script src="templates/frame-protocol.js"></script>，' +
    '然后 __registerTimeline(...) / __onSeek(...)。\n' +
    '  或加 --mode reload 用老办法（每帧重新加载，慢）。'
  );
  await browser.close();
  process.exit(1);
}

const total = onlyFrames
  ? onlyFrames.length
  : Math.round(fps * (seconds ?? (info?.durationInFrames ? info.durationInFrames / fps : 10)));
const frames = onlyFrames ?? Array.from({ length: total }, (_, i) => i);

if (info) {
  console.log(
    `  页面协议 v${info.version}：fps=${info.fps} 已注册时间线 [${info.timelines.join(', ') || '无'}]` +
    ` ${info.hooks} 个重绘钩子` + (info.durationInFrames ? `，声明时长 ${info.durationInFrames} 帧` : '')
  );
  if (info.fps !== fps) {
    console.error(`  ✗ 帧率不一致：页面 fps=${info.fps}，命令行 --fps=${fps}。改成一个再跑。`);
    await browser.close();
    process.exit(1);
  }
}
console.log(`  驱动 ${driverName}${executablePath ? ` + ${path.basename(executablePath)}` : '（自带 Chromium）'}` +
            `  模式 ${usedMode}  ${format}${format === 'png' ? '' : ` q${quality}`}` +
            `  目标 ${frames.length} 帧 @ ${width}x${height}`);

// --------------------------------------------------------------------------- #
// 逐帧截图
// --------------------------------------------------------------------------- #
const files = [];
if (usedMode === 'protocol') {
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    // 唯一入口：把画面推到第 frame 帧，协议内部会等浏览器合成完再 resolve
    await page.evaluate((f) => window.__seek(f), frame);
    files.push(await shoot(frame));
    if (i % 15 === 0 || i === frames.length - 1) progress(i + 1, frames.length);
  }
} else {
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    await page.goto(`${url}${sep}frame=${frame}&fps=${fps}&duration=${total}`, { waitUntil: 'load' });
    await page
      .waitForFunction('window.__FRAME_READY__ === true', null, { timeout: 15_000 })
      .catch(() => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(true)))));
    await page.evaluate(() => document.fonts.ready);
    files.push(await shoot(frame));
    if (i % 15 === 0 || i === frames.length - 1) progress(i + 1, frames.length);
  }
}
process.stdout.write('\n');

await browser.close();
const secs = (Date.now() - started) / 1000;
const firstFile = `f_${String(frames[0]).padStart(5, '0')}${ext}`;
console.log(
  `✓ ${files.length} 帧 → ${outdir}/${firstFile} …  ` +
  `用时 ${secs.toFixed(1)}s（${(files.length / secs).toFixed(1)} 帧/秒，模式 ${usedMode}，${format}）`
);
console.log(
  `下一步: bash scripts/frames_to_video.sh --frames ${outdir} --fps ${fps} ` +
  `--audio public/voice/vo.mp3 --out output/from_frames.mp4`
);
