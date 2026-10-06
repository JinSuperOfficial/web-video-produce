/**
 * web-video-produce :: 帧协议 v1
 * ===========================================================================
 * 目的：让**任何**动画路线（GSAP / 自研 Canvas / Three.js / Lottie…）都能被
 * 逐帧截图器确定性驱动，截图器不需要知道页面的内部结构。
 *
 * 为什么需要它：如果动画自己走时钟（requestAnimationFrame 累加、CSS animation、
 * 第三方库的自动播放），同一帧截两次结果就不一样，渲染出来的片子会"抖"，
 * 而且返工是灾难 —— 你没法复现问题。帧协议的契约只有一条：
 *
 *      画面 = f(帧号)。给同一个帧号，必须得到同一张图。
 *
 * 页面要做的事（三行）：
 *   1. <script src="frame-protocol.js"></script>            // 引入本文件
 *   2. __registerTimeline('名字', tl)                        // 注册带 .seek(t秒) 的时间线
 *      或 __onSeek((frame, t) => { ... })                    // 注册自己的重绘函数
 *   3. 不要在别处调用 rAF 推进动画（本文件里的 rAF 只用来等浏览器合成）
 *
 * 截图器要做的事（一行）：
 *      await page.evaluate((f) => window.__seek(f), frame)
 *
 * 兼容：没有实现协议的页面仍然可以用 ?frame=N 重新加载的老办法（capture_frames.mjs
 * 的 --mode reload），只是慢很多 —— 每帧一次完整加载，还可能撞上字体闪烁。
 */
(() => {
  const q = new URLSearchParams(location.search);

  const state = {
    version: 1,
    fps: Number(q.get('fps') ?? 30),
    /** 总帧数；0 = 页面自己也不知道（截图器用 --seconds 决定） */
    durationInFrames: Number(q.get('duration') ?? 0),
    frame: Number(q.get('frame') ?? 0),
    /** 时间线注册表：name -> { seek(秒, 是否suppressEvents) } */
    timelines: {},
    /** 页面自己的重绘钩子：(frame, 秒) => void */
    seekHooks: [],
    ready: false,
    seeks: 0,
  };
  window.__wvp = state;

  /** 注册一条可被 seek 的时间线。GSAP timeline 直接可用（它本来就有 seek）。 */
  window.__registerTimeline = (name, timeline) => {
    if (!timeline || typeof timeline.seek !== 'function') {
      console.warn(`[frame-protocol] 忽略 ${name}：对象没有 seek(秒) 方法`);
      return timeline;
    }
    state.timelines[name] = timeline;
    // 注册时立刻同步到当前帧，避免"注册之后、下次 seek 之前"出现空白帧
    timeline.seek(state.frame / state.fps, false);
    return timeline;
  };

  /** 注册页面自己的重绘逻辑。可以有多个。 */
  window.__onSeek = (fn) => {
    state.seekHooks.push(fn);
    fn(state.frame, state.frame / state.fps);
    return fn;
  };

  /**
   * 截图器唯一入口：把画面推到第 frame 帧。
   * 返回 Promise，resolve 时表示"已经合成到屏幕上"，可以截图了。
   *
   * 这里的 requestAnimationFrame **不是**用来推进动画时间的（那会破坏确定性），
   * 只是等浏览器把这一帧真的画出来；DOM 改动 → 下一帧合成 → 再下一帧稳定，
   * 所以等两层 rAF 比等一层更可靠（单层偶尔会截到没更新的画面）。
   */
  window.__seek = (frame) => {
    state.frame = frame;
    const t = frame / state.fps;
    for (const tl of Object.values(state.timelines)) {
      tl.seek(t, false);
    }
    for (const fn of state.seekHooks) fn(frame, t);
    state.seeks += 1;
    return new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          state.ready = true;
          window.__FRAME_READY__ = true; // 兼容老协议
          resolve(true);
        })
      );
    });
  };

  window.__frameInfo = () => ({
    version: state.version,
    fps: state.fps,
    frame: state.frame,
    durationInFrames: state.durationInFrames,
    timelines: Object.keys(state.timelines),
    hooks: state.seekHooks.length,
  });
})();
