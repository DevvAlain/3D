'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import type { DisplayQualityPreset } from '@/hooks/useDisplayController';
import type { RevealTimelineSnapshot } from '@/lib/reveal-timeline';
import { createGoldDustTexture } from '@/components/three/textures';

interface StainedGlassBackdropProps {
  quality: DisplayQualityPreset;
  primaryColor: string;
  revealTimelineRef: React.MutableRefObject<RevealTimelineSnapshot>;
}

const PETAL_COLORS = [
  '#E11D48', // Ruby
  '#1D4ED8', // Sapphire
  '#D97706', // Amber Gold
  '#059669', // Emerald
  '#7C3AED', // Amethyst
  '#DC2626', // Crimson
];

const CURTAIN_PLEAT_OFFSETS = [-1.45, -0.95, -0.45, 0.05, 0.55, 1.05];

export function StainedGlassBackdrop({
  quality,
  primaryColor,
  revealTimelineRef,
}: StainedGlassBackdropProps) {
  const dustRef = React.useRef<THREE.Points>(null);
  const roseGlowRef = React.useRef<THREE.Mesh>(null);
  const roseGroupRef = React.useRef<THREE.Group>(null);
  const leftCurtainRef = React.useRef<THREE.Group>(null);
  const rightCurtainRef = React.useRef<THREE.Group>(null);

  const particleCount = quality === 'high' ? 180 : 85;

  const dustTexture = React.useMemo(() => createGoldDustTexture(), []);

  const dustGeometry = React.useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      // Deterministic pseudo-random spread around the stage sanctuary
      const s1 = Math.sin(i * 12.9898) * 43758.5453;
      const s2 = Math.sin(i * 78.233 + 1.7) * 43758.5453;
      const s3 = Math.sin(i * 45.164 + 3.1) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const r2 = s2 - Math.floor(s2);
      const r3 = s3 - Math.floor(s3);

      positions[i * 3] = (r1 - 0.5) * 12.5;
      positions[i * 3 + 1] = -1.4 + r2 * 6.8;
      positions[i * 3 + 2] = -3.8 + r3 * 6.2;
      speeds[i] = 0.14 + r1 * 0.24;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    return geom;
  }, [particleCount]);

  React.useEffect(() => {
    return () => {
      dustTexture.dispose();
    };
  }, [dustTexture]);

  React.useEffect(() => {
    return () => {
      dustGeometry.dispose();
    };
  }, [dustGeometry]);

  const rosePetals = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const angle = (idx / 12) * Math.PI * 2;
      const color = idx % 3 === 0 ? primaryColor : PETAL_COLORS[idx % PETAL_COLORS.length];
      return { idx, angle, color };
    });
  }, [primaryColor]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const clampedDelta = Math.min(delta, 0.05);
    const { stageDimFactor, finalBurstStrength } = revealTimelineRef.current;
    const dimScale = Math.max(0.18, 1 - stageDimFactor * 0.78) + finalBurstStrength * 0.55;

    if (roseGlowRef.current) {
      const mat = roseGlowRef.current.material as THREE.MeshBasicMaterial;
      const targetOpacity = (0.26 + Math.sin(t * 0.9) * 0.04) * dimScale;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 1 - Math.exp(-7 * clampedDelta));
    }

    if (roseGroupRef.current) {
      roseGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          if (obj.material.userData.baseEmissive === undefined) {
            obj.material.userData.baseEmissive = obj.material.emissiveIntensity;
          }
          const base = Number(obj.material.userData.baseEmissive) || 0;
          if (base > 0) {
            obj.material.emissiveIntensity = THREE.MathUtils.lerp(
              obj.material.emissiveIntensity,
              base * dimScale,
              1 - Math.exp(-7 * clampedDelta)
            );
          }
        }
      });
    }

    if (leftCurtainRef.current) {
      leftCurtainRef.current.rotation.z = Math.sin(t * 0.55) * 0.012;
    }
    if (rightCurtainRef.current) {
      rightCurtainRef.current.rotation.z = -Math.sin(t * 0.55 + 0.6) * 0.012;
    }

    if (dustRef.current) {
      const posAttr = dustRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      const speedAttr = dustRef.current.geometry.getAttribute('aSpeed') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) + speedAttr.getX(i) * clampedDelta;
        const x = posAttr.getX(i) + Math.sin(t * 0.6 + i) * 0.0025;
        if (y > 5.4) y = -1.45;
        posAttr.setXY(i, x, y);
      }
      posAttr.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Reflective Sanctuary Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.65, 0]} receiveShadow>
        <circleGeometry args={[14, 64]} />
        {quality === 'high' ? (
          <MeshReflectorMaterial
            blur={[260, 80]}
            resolution={512}
            mixBlur={1}
            mixStrength={18}
            roughness={0.28}
            depthScale={1.0}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#070D22"
            metalness={0.6}
            mirror={0.45}
          />
        ) : (
          <meshStandardMaterial color="#09112B" roughness={0.26} metalness={0.72} />
        )}
      </mesh>

      {/* Concentric Gold Floor Inlay Rings */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.64, 0]}>
        <ringGeometry args={[2.72, 2.8, 64]} />
        <meshStandardMaterial
          color="#D4A13A"
          metalness={0.85}
          roughness={0.22}
          emissive="#8A5E14"
          emissiveIntensity={0.25}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.64, 0]}>
        <ringGeometry args={[4.45, 4.52, 72]} />
        <meshStandardMaterial color="#B6872B" metalness={0.85} roughness={0.28} />
      </mesh>

      {/* Cathedral Rose Window Backdrop (z = -5.6) */}
      <group ref={roseGroupRef} position={[0, 2.35, -5.6]}>
        {/* Back sanctuary halo behind rose glass */}
        <mesh ref={roseGlowRef} position={[0, 0, -0.25]}>
          <circleGeometry args={[4.85, 48]} />
          <meshBasicMaterial
            color={primaryColor}
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </mesh>

        {/* Outer Stone & Gilded Frame */}
        <mesh>
          <torusGeometry args={[3.95, 0.22, 18, 64]} />
          <meshStandardMaterial color="#231B16" metalness={0.5} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <torusGeometry args={[3.72, 0.075, 14, 64]} />
          <meshStandardMaterial
            color="#E5B94C"
            metalness={0.88}
            roughness={0.22}
            emissive="#A67617"
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <torusGeometry args={[2.15, 0.065, 12, 48]} />
          <meshStandardMaterial color="#D4A13A" metalness={0.88} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0, 0.07]}>
          <torusGeometry args={[0.92, 0.055, 12, 36]} />
          <meshStandardMaterial color="#E5B94C" metalness={0.88} roughness={0.22} />
        </mesh>

        {/* Central Radiant Sanctuary Medallion */}
        <mesh position={[0, 0, -0.02]}>
          <circleGeometry args={[0.9, 36]} />
          <meshStandardMaterial
            color={primaryColor}
            emissive={primaryColor}
            emissiveIntensity={0.9}
            roughness={0.2}
          />
        </mesh>

        {/* 12 Stained-Glass Petals & Dark Gothic Mullions */}
        {rosePetals.map(({ idx, angle, color }) => (
          <group key={idx} rotation={[0, 0, angle]}>
            {/* Mullion spoke */}
            <mesh position={[0, 1.9, 0.05]}>
              <boxGeometry args={[0.07, 3.65, 0.09]} />
              <meshStandardMaterial color="#211815" metalness={0.55} roughness={0.45} />
            </mesh>
            {/* Outer stained-glass trefoil ring */}
            <mesh position={[0, 2.95, -0.03]}>
              <circleGeometry args={[0.46, 20]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.78}
                roughness={0.25}
              />
            </mesh>
            {/* Gold surround ring on outer trefoil */}
            <mesh position={[0, 2.95, 0.03]}>
              <torusGeometry args={[0.46, 0.035, 10, 24]} />
              <meshStandardMaterial color="#C89B34" metalness={0.85} roughness={0.25} />
            </mesh>
            {/* Inner jewel lancet petal */}
            <mesh position={[0, 1.54, -0.03]} rotation={[0, 0, Math.PI / 4]}>
              <planeGeometry args={[0.62, 0.62]} />
              <meshStandardMaterial
                color={PETAL_COLORS[(idx + 2) % PETAL_COLORS.length]}
                emissive={PETAL_COLORS[(idx + 2) % PETAL_COLORS.length]}
                emissiveIntensity={0.62}
                roughness={0.28}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* Pleated Burgundy Velvet Curtains (Left Wing) */}
      <group ref={leftCurtainRef} position={[-5.4, 1.9, -2.5]} rotation={[0, 0.28, 0]}>
        {CURTAIN_PLEAT_OFFSETS.map((xOff, i) => (
          <mesh
            key={`l-${i}`}
            position={[xOff, 0, Math.sin(i * 1.1) * 0.14]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.31, 0.36, 7.6, 14]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? '#741122' : '#5E0C1A'}
              roughness={0.82}
              metalness={0.08}
            />
          </mesh>
        ))}
        {/* Snug Gold Braided Sash Collar hugging curtain pleats */}
        <mesh
          position={[-0.2, -0.45, 0.02]}
          rotation={[Math.PI / 2 - 0.12, 0, 0.04]}
          scale={[1.48, 0.42, 1]}
        >
          <torusGeometry args={[1.02, 0.055, 10, 32]} />
          <meshStandardMaterial color="#E5B94C" metalness={0.88} roughness={0.22} />
        </mesh>
      </group>

      {/* Pleated Burgundy Velvet Curtains (Right Wing) */}
      <group ref={rightCurtainRef} position={[5.4, 1.9, -2.5]} rotation={[0, -0.28, 0]}>
        {CURTAIN_PLEAT_OFFSETS.map((xOff, i) => (
          <mesh
            key={`r-${i}`}
            position={[-xOff, 0, Math.sin(i * 1.1) * 0.14]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.31, 0.36, 7.6, 14]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? '#741122' : '#5E0C1A'}
              roughness={0.82}
              metalness={0.08}
            />
          </mesh>
        ))}
        {/* Snug Gold Braided Sash Collar hugging curtain pleats */}
        <mesh
          position={[0.2, -0.45, 0.02]}
          rotation={[Math.PI / 2 - 0.12, 0, -0.04]}
          scale={[1.48, 0.42, 1]}
        >
          <torusGeometry args={[1.02, 0.055, 10, 32]} />
          <meshStandardMaterial color="#E5B94C" metalness={0.88} roughness={0.22} />
        </mesh>
      </group>

      {/* Overhead Velvet Valance Arch */}
      <mesh position={[0, 5.55, -2.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.52, 0.52, 13.4, 20]} />
        <meshStandardMaterial color="#680E1E" roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh position={[0, 5.1, -2.18]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 13.4, 14]} />
        <meshStandardMaterial color="#E5B94C" metalness={0.9} roughness={0.22} />
      </mesh>

      {/* Floating Gold Dust Particles */}
      <points ref={dustRef} geometry={dustGeometry}>
        <pointsMaterial
          map={dustTexture}
          size={0.14}
          sizeAttenuation
          transparent
          opacity={0.78}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          color="#FFE394"
        />
      </points>
    </group>
  );
}
