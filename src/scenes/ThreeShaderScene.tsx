import React, { useMemo, useRef } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import * as THREE from 'three';
import { COLORS } from '../config';
import { FONT, MONO } from '../fonts';

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

  // 便宜的伪随机 + 值噪声
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

    float t = uTime * 0.35;
    // 域扭曲，让流动看起来像流体而不是贴图滚动
    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
    float n = fbm(p + 1.6 * q + vec2(0.0, t * 0.5));

    vec3 deep   = vec3(0.03, 0.05, 0.11);
    vec3 mid    = vec3(0.10, 0.55, 0.52);
    vec3 glow   = vec3(0.94, 0.67, 0.98);
    vec3 col = mix(deep, mid, smoothstep(0.25, 0.85, n));
    col = mix(col, glow, smoothstep(0.72, 1.0, n + 0.18 * length(q)));

    // 中心暗角，给前景文字留出对比
    float vig = smoothstep(1.25, 0.15, length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));
    col *= mix(0.45, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** 三维场景：全屏 GLSL 流体背景 + 旋转多面体。uTime 完全由当前帧驱动。 */
export const ThreeShaderScene: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
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

  // 直接改 uniform / 变换，不依赖 rAF 循环 —— 每一帧都可复现
  uniforms.uTime.value = t;
  uniforms.uRes.value.set(width, height);
  if (meshRef.current) {
    meshRef.current.rotation.x = t * 0.42;
    meshRef.current.rotation.y = t * 0.63;
  }

  const intro = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outro = interpolate(frame, [durationInFrames - 16, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pulse = 1 + Math.sin(t * 2.2) * 0.045;

  return (
    <AbsoluteFill style={{ opacity: Math.min(intro, outro) }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ fov: 45, position: [0, 0, 4.2] }}
        gl={{ antialias: true }}
      >
        {/* 全屏背景平面 */}
        <mesh position={[0, 0, -1.6]}>
          <planeGeometry args={[width / 90, height / 90]} />
          <shaderMaterial uniforms={uniforms} vertexShader={VERT} fragmentShader={FRAG} />
        </mesh>

        <ambientLight intensity={0.6} />
        <pointLight position={[3, 3, 4]} intensity={90} color={COLORS.accent} />
        <pointLight position={[-4, -2, 2]} intensity={60} color={COLORS.accent2} />

        <mesh ref={meshRef} scale={pulse}>
          <icosahedronGeometry args={[1.15, 1]} />
          <meshStandardMaterial
            color="#0e1a2b"
            metalness={0.85}
            roughness={0.22}
            emissive={COLORS.accent}
            emissiveIntensity={0.28}
            flatShading
          />
        </mesh>
        <mesh scale={1.55}>
          <icosahedronGeometry args={[1.15, 1]} />
          <meshBasicMaterial color={COLORS.accent} wireframe transparent opacity={0.22} />
        </mesh>
      </ThreeCanvas>

      {/* 前景文字：叠在 WebGL 画布之上 */}
      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: 260,
          fontFamily: FONT,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontSize: 30,
            fontFamily: MONO,
            letterSpacing: 8,
            color: COLORS.accent,
            marginBottom: 18,
          }}
        >
          GLSL · SHADER · REALTIME
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 900,
            color: COLORS.ink,
            letterSpacing: 3,
            textShadow: '0 18px 60px rgba(0,0,0,.65)',
          }}
        >
          像素由代码现场生成
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
