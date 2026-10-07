import React from 'react';
import { Sequence, useCurrentFrame } from 'remotion';
import { WIDTH } from '../config';

/**
 * 弹幕层：B 站"飘过的文字条"。
 *
 * 两个要点：
 *  1. **纯函数**：位置只由 (局部帧, 速度) 决定，车道与出现时间在数据里写死，
 *     没有 Math.random / 没有 CSS animation —— 抽任意一帧都能复现。
 *  2. **不喧宾夺主**：默认只铺在上三分之一（避开主体内容与字幕），
 *     字号 40px、不透明度 0.38~0.48（太低会像画面糊了一层灰）。
 *     B 站原生弹幕是"白字 + 黑描边"，这里用多层 text-shadow 模拟描边。
 */
export type DanmakuItem = {
  /** 相对父级 Sequence 起点之后多少帧出现 */
  at: number;
  text: string;
  /** 车道序号：0 最靠上 */
  lane: number;
  /** 速度 px/帧：18~26 大约 3 秒横穿全屏，接近 B 站的观感 */
  speed?: number;
  /** 不透明度，建议 0.35~0.5 */
  opacity?: number;
};

/**
 * 车道只占顶部一条带（y=96/150/204）。
 * 踩过的坑：最初排到 y=342 的第 4 道，正好压在画面中部的标题、命令框和流程卡上，
 * 看起来像渲染脏了。弹幕再淡也不该盖住主体内容 —— 所以收在上 1/4，字号也压到 34px。
 */
const LANE_Y = [96, 150, 204];
const FONT_SIZE = 34;

/** 估算文本宽度：CJK 按 1em、ASCII 按 0.62em。只用来决定"什么时候飘出屏幕"。 */
const approxWidth = (text: string): number =>
  Array.from(text).reduce((a, ch) => a + (/[\x00-\xff]/.test(ch) ? 0.62 : 1), 0) * FONT_SIZE;

const OUTLINE =
  '2px 0 0 rgba(0,0,0,.85), -2px 0 0 rgba(0,0,0,.85), 0 2px 0 rgba(0,0,0,.85),' +
  '0 -2px 0 rgba(0,0,0,.85), 2px 2px 0 rgba(0,0,0,.7), -2px -2px 0 rgba(0,0,0,.7),' +
  '0 4px 10px rgba(0,0,0,.6)';

const DanmakuOne: React.FC<{ item: DanmakuItem }> = ({ item }) => {
  const frame = useCurrentFrame();
  const speed = item.speed ?? 22;
  const w = approxWidth(item.text);
  const x = WIDTH + 60 - frame * speed;
  if (x < -w - 80) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: LANE_Y[item.lane % LANE_Y.length],
        fontSize: FONT_SIZE,
        fontWeight: 700,
        color: '#ffffff',
        opacity: item.opacity ?? 0.44,
        textShadow: OUTLINE,
        whiteSpace: 'nowrap',
        fontFamily:
          'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
        letterSpacing: 1,
      }}
    >
      {item.text}
    </div>
  );
};

/** 弹幕层：每条各自一个 Sequence，`at` 是相对本层起点的帧号。 */
export const DanmakuLayer: React.FC<{
  items: DanmakuItem[];
  /** 每条弹幕的最大存活帧数（超出就卸载，避免长镜头里堆积） */
  life?: number;
}> = ({ items, life = 150 }) => (
  <>
    {items.map((item, i) => (
      <Sequence
        key={`${item.lane}-${item.at}-${i}`}
        from={Math.max(0, Math.round(item.at))}
        durationInFrames={life}
        name={`danmaku:${item.text.slice(0, 6)}`}
      >
        <DanmakuOne item={item} />
      </Sequence>
    ))}
  </>
);
