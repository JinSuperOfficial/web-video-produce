import React, { useMemo, useRef } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import * as THREE from 'three';
import { COLORS } from '../../config';
import { FONT, MONO } from '../../fonts';
import { useMotion, typewriter } from '../../motion';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2  uRes;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.6;
    float t = uTime * 0.32;
    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
    float n = fbm(p + 1.6 * q + vec2(0.0, t * 0.5));

    vec3 deep = vec3(0.03, 0.05, 0.11);
    vec3 mid  = vec3(0.10, 0.55, 0.52);
    vec3 glow = vec3(0.94, 0.67, 0.98);
    vec3 col = mix(deep, mid, smoothstep(0.25, 0.85, n));
    col = mix(col, glow, smoothstep(0.72, 1.0, n + 0.18 * length(q)));

    float vig = smoothstep(1.25, 0.15, length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));
    col *= mix(0.34, 1.0, vig);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const URL = 'github.com/JinSuperOfficial/web-video-produce';

const TRIPLE = [
  { zh: '赞', label: '点赞', color: COLORS.accent, at: 62 },
  { zh: '币', label: '投币', color: COLORS.warm, at: 74 },
  { zh: '藏', label: '收藏', color: COLORS.accent2, at: 86 },
];

/**
 * 第 13 幕 · cta（1963–2134 帧，约 5.7 秒）
 *
 * B 站的结尾必须两件事都做完：给得出去的地址 + 给得出的动作。
 * 背景是 Three.js + GLSL 的流体（uTime 完全由帧号驱动），前景压暗后放文字，
 * 保证"地址"在手机小屏上也是画面里最亮的东西。
 */
export const CtaScene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(width, height) },
    }),
    [width, height]
  );

  uniforms.uTime.value = t;
  uniforms.uRes.value.set(width, height);
  if (meshRef.current) {
    meshRef.current.rotation.x = t * 0.4;
    meshRef.current.rotation.y = t * 0.6;
  }

  const url = typewriter(URL, frame, { delay: 20, cps: 44 });
  const kicker = useMotion('rise', { delay: 4, duration: 14, distance: 26 });
  const urlIn = useMotion('fade', { delay: 18, duration: 14 });
  const tail = useMotion('rise', { delay: 100, duration: 18, distance: 26 });

  const intro = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outro = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pulse = 1 + Math.sin(t * 2.4) * 0.012;

  return (
    <AbsoluteFill style={{ opacity: Math.min(intro, outro) }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ fov: 45, position: [0, 0, 4.2] }}
        gl={{ antialias: true }}
      >
        <mesh position={[0, 0, -1.6]}>
          <planeGeometry args={[width / 90, height / 90]} />
          <shaderMaterial uniforms={uniforms} vertexShader={VERT} fragmentShader={FRAG} />
        </mesh>

        <ambientLight intensity={0.6} />
        <pointLight position={[3, 3, 4]} intensity={90} color={COLORS.accent} />
        <pointLight position={[-4, -2, 2]} intensity={60} color={COLORS.accent2} />

        <mesh ref={meshRef} scale={0.9}>
          <icosahedronGeometry args={[1.15, 1]} />
          <meshStandardMaterial
            color="#0e1a2b"
            metalness={0.85}
            roughness={0.22}
            emissive={COLORS.accent}
            emissiveIntensity={0.3}
            flatShading
          />
        </mesh>
        <mesh scale={1.3}>
          <icosahedronGeometry args={[1.15, 1]} />
          <meshBasicMaterial color={COLORS.accent} wireframe transparent opacity={0.2} />
        </mesh>
      </ThreeCanvas>

      {/* 前景压暗层：让文字在任何一帧的流体背景上都读得清 */}
      <AbsoluteFill style={{ background: 'radial-gradient(58% 52% at 50% 52%, rgba(4,7,14,.82), rgba(4,7,14,.94))' }} />

      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: FONT,
          textAlign: 'center',
          padding: '0 120px 150px',
          transform: `scale(${pulse})`,
        }}
      >
        <div style={{ ...kicker, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 8, color: COLORS.accent }}>
            开源 · MIT
          </span>
        </div>

        <div style={{ ...urlIn, marginTop: 22 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 50,
              fontWeight: 900,
              color: COLORS.ink,
              letterSpacing: -0.5,
              whiteSpace: 'nowrap',
              textShadow: '0 8px 40px rgba(0,0,0,.8)',
            }}
          >
            {url}
            <span style={{ opacity: 0.5, color: COLORS.accent }}>|</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 26, color: COLORS.dim }}>
            搜索关键词：<span style={{ color: COLORS.accent }}>web video produce</span>
          </div>
        </div>

        {/* 一键三连 */}
        <div style={{ marginTop: 40, display: 'flex', gap: 24, alignItems: 'center' }}>
          {TRIPLE.map((it) => (
            <TripleIcon key={it.zh} item={it} frame={frame} />
          ))}
          <div
            style={{
              marginLeft: 20,
              ...tail,
              fontSize: 48,
              fontWeight: 900,
              color: COLORS.warm,
              letterSpacing: 4,
              textShadow: `0 0 40px ${COLORS.warm}55`,
            }}
          >
            一键三连
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 三连图标：用中文字当图形，不依赖 emoji 字体（headless 里 emoji 常常是豆腐块）。 */
const TripleIcon: React.FC<{
  item: (typeof TRIPLE)[number];
  frame: number;
}> = ({ item, frame }) => {
  const p = Math.max(0, Math.min(1, (frame - item.at) / 12));
  const e = 1 - Math.pow(1 - p, 3);
  const overshoot = 1 + 0.16 * Math.sin(Math.PI * Math.min(1, p));
  return (
    <div
      style={{
        width: 116,
        height: 116,
        borderRadius: '50%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        background: `radial-gradient(circle at 50% 35%, ${item.color}33, rgba(8,11,20,.9))`,
        border: `2px solid ${item.color}`,
        boxShadow: `0 0 30px ${item.color}44`,
        opacity: e,
        transform: `scale(${e * overshoot})`,
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 900, color: item.color, lineHeight: 1 }}>{item.zh}</div>
      <div style={{ fontSize: 18, color: COLORS.dim }}>{item.label}</div>
    </div>
  );
};
