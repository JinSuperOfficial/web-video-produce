import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { stagger, typewriter, useMotion } from '../../motion';
import { Chip, Kicker, Panel, Terminal, Title } from './kit';

const BADGES = ['MIT 开源', 'Node ≥ 18', 'FFmpeg ≥ 6', 'Python ≥ 3.9', 'edge-tts'];

/**
 * 错位入场的小包装。
 * 必须单独成一个组件：useMotion 内部会调 useCurrentFrame，
 * 直接在 .map() 里调 hook 会破坏 hook 调用顺序（React 会炸）。纯函数版给不了延迟参数，所以包一层。
 */
const RiseIn: React.FC<{ delay: number; children: React.ReactNode }> = ({ delay, children }) => {
  const style = useMotion('rise', { delay, duration: 14, distance: 26 });
  return <div style={style}>{children}</div>;
};

const CODE = [
  { text: 'python3 scripts/wvp.py doctor', hint: '环境 + 工程 + 成片规格，一条命令问清楚' },
  { text: 'python3 scripts/wvp.py render --out output/promo.mp4', hint: '配音 → 渲染 → 合成 → 验收' },
  { text: 'python3 scripts/wvp.py timeline --verify-audio', hint: '回到音频上实测，词窗有没有对准' },
];

/**
 * 第 2 幕 · intro（100–277 帧，约 5.9 秒）
 *
 * 卖点集中在这里：它是什么 + 三个子命令 + 环境门槛低。
 * 左标题、右终端、底徽章，三拍递进，5.9 秒里画面一直在变。
 */
export const IntroScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const title = useMotion('pop', { delay: 2, duration: 18, from: 0.86 });
  const sub = useMotion('rise', { delay: 12, duration: 16, distance: 34 });
  const cols = useMotion('slideLeft', { delay: 26, duration: 18, distance: 60 });
  const framePulse = 1 + Math.min(0.01, frame / 100000);

  const rows = CODE.map((c, i) => {
    const appear = 40 + i * 22;
    const typed = typewriter(c.text, frame, { delay: appear, cps: 30 });
    const hintOn = frame > appear + c.text.length / 30 * 30 + 7;
    return { ...c, typed, appear, hintOn };
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding: '150px 150px 240px' }}>
      <div style={{ display: 'flex', height: '100%', gap: 70 }}>
        {/* 左：标题 */}
        <div style={{ width: 780, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Kicker style={{ marginBottom: 22 }}>WEB VIDEO PRODUCE</Kicker>
          <div style={{ ...title, transform: `${title.transform ?? ''} scale(${framePulse})` }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 82,
                fontWeight: 900,
                color: COLORS.ink,
                letterSpacing: -1,
                lineHeight: 1.06,
              }}
            >
              web-video
              <br />
              <span style={{ color: COLORS.accent }}>produce</span>
            </div>
          </div>
          <div
            style={{
              ...sub,
              marginTop: 32,
              fontSize: 44,
              fontWeight: 900,
              color: COLORS.ink,
              letterSpacing: 3,
            }}
          >
            写代码，做视频
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 26,
              color: COLORS.dim,
              lineHeight: 1.55,
              maxWidth: 700,
            }}
          >
            把「写一段脚本 → 出一条带配音、字幕、背景音乐的 MP4」
            <br />
            变成 LLM 可以自主完成的代码任务
          </div>

          <div style={{ marginTop: 44, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {BADGES.map((b, i) => (
              <RiseIn key={b} delay={stagger(i, 6, 96)}>
                <Chip label={b} style={{ fontSize: 18, padding: '6px 14px' }} />
              </RiseIn>
            ))}
          </div>
        </div>

        {/* 右：终端里三个子命令 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', ...cols }}>
          <Terminal style={{ width: '100%' }} title="web-video-produce — 三个子命令，不用记顺序">
            {rows.map((r) => (
              <div key={r.text} style={{ marginBottom: 22 }}>
                <div style={{ fontFamily: MONO, fontSize: 20, color: COLORS.ink, lineHeight: 1.4 }}>
                  <span style={{ color: COLORS.warm }}>$ </span>
                  {r.typed}
                  {frame >= r.appear && frame < r.appear + 8 ? (
                    <span style={{ color: COLORS.accent }}>▌</span>
                  ) : null}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 19,
                    color: COLORS.dim,
                    opacity: r.hintOn ? 1 : 0,
                  }}
                >
                  {r.hint}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 6, display: 'flex', gap: 10 }}>
              <Chip label="doctor" color={COLORS.accent} />
              <Chip label="render" color={COLORS.accent2} />
              <Chip label="timeline" color={COLORS.warm} />
            </div>
          </Terminal>
        </div>
      </div>

      {/* 右下角小字：给"独立项目"这个身份一个交代 */}
      <Panel
        style={{
          position: 'absolute',
          right: 150,
          bottom: 250,
          ...useMotion('fade', { delay: 130, duration: 20 }),
        }}
      >
        <div style={{ fontSize: 22, color: COLORS.dim }}>
          一个 <span style={{ color: COLORS.accent }}>DSH Skill</span>，也是独立可跑的项目
        </div>
      </Panel>
    </AbsoluteFill>
  );
};
