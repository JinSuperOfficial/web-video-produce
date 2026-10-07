import React from 'react';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';

/** 推广片场景共用的排版零件。全部是纯展示组件，不含任何帧逻辑。 */

export const Kicker: React.FC<{
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, color = COLORS.accent, style }) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: 22,
      letterSpacing: 8,
      fontWeight: 700,
      color,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Title: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, size = 78, color = COLORS.ink, style }) => (
  <div
    style={{
      fontFamily: FONT,
      fontSize: size,
      fontWeight: 900,
      color,
      letterSpacing: 2,
      lineHeight: 1.18,
      ...style,
    }}
  >
    {children}
  </div>
);

/** 玻璃卡片 */
export const Panel: React.FC<{
  children: React.ReactNode;
  tint?: string;
  style?: React.CSSProperties;
}> = ({ children, tint = 'rgba(255,255,255,.08)', style }) => (
  <div
    style={{
      borderRadius: 22,
      padding: '26px 32px',
      background: `linear-gradient(155deg, ${tint}, rgba(255,255,255,.02))`,
      border: '1px solid rgba(255,255,255,.12)',
      boxShadow: '0 22px 60px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.07)',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Chip: React.FC<{
  label: string;
  color?: string;
  active?: boolean;
  style?: React.CSSProperties;
}> = ({ label, color = COLORS.accent, active = true, style }) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: 20,
      padding: '8px 18px',
      borderRadius: 10,
      color: active ? color : COLORS.dim,
      background: active ? `${color}1f` : 'rgba(255,255,255,.05)',
      border: `1px solid ${active ? `${color}66` : 'rgba(255,255,255,.10)'}`,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {label}
  </div>
);

/** 划掉的字（表示"错误做法"） */
export const Struck: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = '#ff6b6b',
}) => (
  <span style={{ position: 'relative', color: COLORS.dim }}>
    {children}
    <span
      style={{
        position: 'absolute',
        left: -6,
        right: -6,
        top: '52%',
        height: 4,
        borderRadius: 2,
        background: color,
        transform: 'rotate(-1.4deg)',
      }}
    />
  </span>
);

/** 大数字 + 说明 */
export const Stat: React.FC<{
  value: string;
  label: string;
  color?: string;
  size?: number;
}> = ({ value, label, color = COLORS.warm, size = 54 }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontFamily: MONO, fontSize: size, fontWeight: 900, color, lineHeight: 1 }}>
      {value}
    </div>
    <div style={{ marginTop: 8, fontSize: 21, color: COLORS.dim, fontFamily: FONT }}>
      {label}
    </div>
  </div>
);

/** 右向箭头（流程用） */
export const Arrow: React.FC<{ color?: string }> = ({ color = COLORS.dim }) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: 40,
      color,
      opacity: 0.75,
      padding: '0 6px',
    }}
  >
    →
  </div>
);

/** 终端窗口外框 */
export const Terminal: React.FC<{
  children: React.ReactNode;
  title?: string;
  style?: React.CSSProperties;
}> = ({ children, title = 'bash — web-video-produce', style }) => (
  <div
    style={{
      borderRadius: 18,
      overflow: 'hidden',
      background: 'rgba(4,7,14,.88)',
      border: '1px solid rgba(255,255,255,.14)',
      boxShadow: '0 30px 80px rgba(0,0,0,.55)',
      ...style,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 20px',
        background: 'rgba(255,255,255,.06)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
      }}
    >
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <span
          key={c}
          style={{ width: 13, height: 13, borderRadius: '50%', background: c, opacity: 0.9 }}
        />
      ))}
      <span style={{ marginLeft: 10, fontFamily: MONO, fontSize: 17, color: COLORS.dim }}>
        {title}
      </span>
    </div>
    <div style={{ padding: '22px 26px' }}>{children}</div>
  </div>
);
