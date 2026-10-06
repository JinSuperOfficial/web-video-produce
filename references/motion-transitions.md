# 动作库与转场层（Remotion 侧）

`src/motion/` 与 `src/transitions/` 是两层**可复用件**：动作库管"元素怎么进场/离场"，
转场层管"两个场景之间怎么换"。有了它们，写新场景不用再从 `interpolate(...)` 手搓曲线，
换转场也不用改场景代码。

全部是**纯函数 + 帧驱动**：没有状态机、没有 CSS `animation`/`transition`、没有自走时钟。
所以任何一帧都能单独渲染出来，且每次渲染结果相同。

预览全部效果：

```bash
npx remotion still src/index.ts MotionShowcase output/showcase.png --frame=150
# 或者直接开 studio 拖时间轴看
npx remotion studio src/index.ts
```

---

## 1. 动作库 `src/motion/index.ts`

### 导出

| 导出 | 签名 | 用途 |
| --- | --- | --- |
| `motionAt` | `(frame, kind, opts?) => CSSProperties` | 核心：算出某个动作在第 frame 帧的样式（transform + opacity + filter） |
| `useMotion` | `(kind, opts?) => CSSProperties` | 上面那个的 Hook 包装，`useCurrentFrame()` 已替你取好 —— 场景里最常用 |
| `stagger` | `(index, step=6, start=0) => number` | 第 index 个元素的延迟帧数（列表错位入场） |
| `countUp` | `(frame, {from, to, duration, delay, decimals, ease}) => number` | 数字滚动，到 duration 帧后停住 |
| `typewriter` | `(text, frame, {delay, cps}) => string` | 打字机效果 |
| `progress` | `(frame, {delay, duration, ease}) => number` | 0→1 进度（进度条/高亮条宽度） |
| `ease` | `(name) => (t) => number` | 命名缓动：`linear` / `out` / `inOut` / `back` / `expo` |

### 11 种动作的形态差异

| kind | 数学形态 | 适合 |
| --- | --- | --- |
| `fade` | 只有 opacity | 背景层、字幕、最安静的进场 |
| `rise` | 位移 y `+distance → 0`（由下往上浮起） | 标题、卡片 |
| `sink` | 位移 y `-distance → 0`（由上往下落入） | 菜单、抽屉、弹窗 |
| `pop` | `1 + (from-1)(1-p) + 0.75(1-from)·sin(πp)`，中段冲过 1（约 +3%~8%），两端严格 = from / 1 | 强调型元素，"弹"出来 |
| `blur` | 模糊 12px → 0，scale 1.04 → 1，透明度前 60% 就到位 | 虚焦聚焦、"从另一个世界切进来" |
| `zoomIn` | scale `from → 1`（无过冲） | 镜头推近 |
| `zoomOut` | scale `(2-from) → 1` | 镜头拉远 |
| `slideLeft` | 位移 x `+distance → 0`（从右侧滑入） | 横向列表、信息条 |
| `slideRight` | 位移 x `-distance → 0`（镜像） | 同上，反向 |
| `flipX` | `perspective(1200px) rotateX(-78° → 0°)` | 绕水平轴翻起，像翻卡片 |
| `swing` | `rotate = -10°·(1-q)·cos(2πq)`，包络保证末端精确归零，中途反向回摆一次 | 挂在上方荡进来 |

`MotionOptions`：`delay`（延迟帧，默认 0）、`duration`（默认 18）、`distance`（位移 px，默认 48）、
`from`（起始缩放，默认 0.9）、`ease`（默认 `'out'`）。

```tsx
import { useMotion, stagger } from '../motion';

const title = useMotion('rise', { duration: 24 });
const card = useMotion('pop', { delay: stagger(2, 8), duration: 20 });
```

---

## 2. 转场层 `src/transitions/index.tsx`

### 11 种转场

`fade`、`dipToBlack`、`wipeLeft`、`wipeRight`、`wipeUp`、`wipeDown`、
`slidePush`、`zoomPunch`、`whipPan`、`glitchCut`、`circleOpen`

其中 `circleOpen` 用 `clip-path: circle(R% at 50% 50%)`，R 从 0 → 75 → 0
（75% 足以盖满 16:9 的四个角）。

### 三个 API

| API | 作用 |
| --- | --- |
| `useSceneEnter(kind, D) => CSSProperties` | 把**即将出现**的场景内容做入场处理（贴到场景根 `AbsoluteFill` 上） |
| `useSceneExit(kind, D, totalFrames?) => CSSProperties` | 把**即将被替换**的场景内容做出场处理 |
| `<TransitionOverlay kind D color?/>` | 覆盖层：自己放进一个跨越切点的 `<Sequence>`，用局部帧在 D 帧内完成"遮挡 → 揭开" |

### 正确用法（`src/Main.tsx` 是范例）

```tsx
const CUT_FRAMES = 14;
const CUT: TransitionKind = 'wipeLeft';

// ① 场景槽：入场/出场样式必须在 Sequence 内部算（要用场景自己的局部帧）
const SceneSlot: React.FC<{ durationInFrames: number; children: React.ReactNode }> = ({
  durationInFrames, children,
}) => (
  <AbsoluteFill
    style={{
      ...useSceneEnter(CUT, CUT_FRAMES),
      ...useSceneExit('fade', CUT_FRAMES, durationInFrames),
    }}
  >
    {children}
  </AbsoluteFill>
);

// ② 覆盖层：让遮挡峰值**正好落在切点上**（from = 切点 − D/2）
<Sequence from={cut - Math.round(CUT_FRAMES / 2)} durationInFrames={CUT_FRAMES}>
  <TransitionOverlay kind={CUT} durationInFrames={CUT_FRAMES} />
</Sequence>
```

**摆放的不变式**：覆盖层的遮挡峰值要落在切点上，才叫"跨切点转场"。
两种写法都满足"最后一帧完全不可见"，但效果不同：

| 写法 | 峰值位置 | 观感 |
| --- | --- | --- |
| `from = cut - D` | `cut - D/2`（全在旧场景那侧） | 旧场景先被盖住、揭开时新场景才刚开始 → 中间会有一帧"两边都不在"的空画面 |
| `from = cut - round(D/2)` ← **推荐** | 正好 `cut` | 真正的跨切点过渡，新旧场景都在运动 |

**另一个值得保持的不变式**：一个场景的入场动作 = 切进它时那个覆盖层的类型
（`src/Main.tsx` 里 `cuts[i].kind = scenes[i+1].enter`）。
这样"覆盖层揭开"和"新场景长出来"是同一个方向的运动，不会互相打架。

---

## 3. 写新场景时容易撞上的坑（实测踩过）

1. **`useVideoConfig().durationInFrames` 是 Composition 的总时长，不是当前 `<Sequence>` 的时长。**
   承载 Sequence 时长的 `SequenceContext` 没有从 remotion 公开导出，所以
   `useSceneExit(kind, D)` 无法自己知道"最后 D 帧"从哪开始 —— 放进 Sequence 时必须传第三个参数
   `totalFrames={该 Sequence 的 durationInFrames}`。场景本身就是 Composition 时可以省略。
2. **`<Composition>` 对有必填 props 的组件强制要求 `defaultProps`**，否则 tsc 报 TS2322。
3. **`AbsoluteFill` 的默认样式是 `top/left/right/bottom: 0` + `width/height: 100%`**，
   而且 style 是最后展开的。做"整块移出画面"的擦除时只改 `left`/`top` 会与 `right`/`bottom`
   过约束，必须同时写 `right: 'auto'` / `bottom: 'auto'`，否则盒子被压成 0 宽。
4. **remotion 的 `Easing.exp` 在 t=1 处留了 `2^-10 ≈ 0.001` 的余量**（`out(exp)(1)=0.999`），
   会让动作永远差最后一厘。expo 在本库里是自己实现的 `1-2^(-10t)` 并钉死两端。
5. 所有随机都用确定性哈希（`sin(x*12.9898+78.233)*43758.5453` 取小数）代替 `Math.random()`，
   否则 `validate.py` 的确定性铁律扫描会直接报错。
