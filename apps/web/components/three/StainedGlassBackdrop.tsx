'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import type { DisplayQualityPreset } from '@/lib/quality-monitor';
import type { RevealTimelineSnapshot } from '@/lib/reveal-timeline';
import type { StageThemeSpec } from '@/components/three/stage-themes';
import {
  createGoldDustTexture,
  createPetalTexture,
  createSnowflakeTexture,
  disposeTextureList,
} from '@/components/three/textures';

interface StainedGlassBackdropProps {
  quality: DisplayQualityPreset;
  primaryColor: string;
  themeSpec: StageThemeSpec;
  revealTimelineRef: React.MutableRefObject<RevealTimelineSnapshot>;
}

interface PetalParticleState {
  x: number;
  y: number;
  z: number;
  speedY: number;
  swayPhase: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  scale: number;
}

const CURTAIN_PLEAT_OFFSETS = [-1.45, -0.95, -0.45, 0.05, 0.55, 1.05];

function seededUnit(idx: number, salt: number): number {
  const s = Math.sin(idx * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function StainedGlassBackdrop({
  quality,
  primaryColor,
  themeSpec,
  revealTimelineRef,
}: StainedGlassBackdropProps) {
  const dustRef = React.useRef<THREE.Points>(null);
  const petalsMeshRef = React.useRef<THREE.InstancedMesh>(null);
  const roseGlowRef = React.useRef<THREE.Mesh>(null);
  const roseGroupRef = React.useRef<THREE.Group>(null);
  const leftCurtainRef = React.useRef<THREE.Group>(null);
  const rightCurtainRef = React.useRef<THREE.Group>(null);
  const dummyObj = React.useMemo(() => new THREE.Object3D(), []);

  const isLight = quality === 'light';
  const particleCount = quality === 'high' ? 180 : quality === 'medium' ? 90 : 40;
  const isSnow = themeSpec.particleMode === 'snow';
  const isPetals = themeSpec.particleMode === 'petals';

  const particleTextures = React.useMemo(() => {
    return {
      goldDust: createGoldDustTexture(),
      snowflake: createSnowflakeTexture(),
      petal: createPetalTexture(),
    };
  }, []);

  React.useEffect(() => {
    return () => {
      disposeTextureList([
        particleTextures.goldDust,
        particleTextures.snowflake,
        particleTextures.petal,
      ]);
    };
  }, [particleTextures]);

  const dustGeometry = React.useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      const r1 = seededUnit(i, 1);
      const r2 = seededUnit(i, 2);
      const r3 = seededUnit(i, 3);

      positions[i * 3] = (r1 - 0.5) * 13.0;
      positions[i * 3 + 1] = -1.45 + r2 * 7.0;
      positions[i * 3 + 2] = -3.8 + r3 * 6.4;
      speeds[i] = isSnow ? 0.42 + r1 * 0.55 : 0.14 + r1 * 0.24;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    return geom;
  }, [particleCount, isSnow]);

  React.useEffect(() => {
    return () => {
      dustGeometry.dispose();
    };
  }, [dustGeometry]);

  // Easter 3D floral petal particles state & instance colors
  const petalParticlesRef = React.useRef<PetalParticleState[]>([]);
  React.useEffect(() => {
    if (!isPetals) return;
    const list: PetalParticleState[] = [];
    for (let i = 0; i < particleCount; i++) {
      const r1 = seededUnit(i, 11);
      const r2 = seededUnit(i, 12);
      const r3 = seededUnit(i, 13);
      const r4 = seededUnit(i, 14);
      list.push({
        x: (r1 - 0.5) * 13.2,
        y: -1.4 + r2 * 7.0,
        z: -3.6 + r3 * 6.0,
        speedY: 0.36 + r4 * 0.38,
        swayPhase: r1 * Math.PI * 2,
        rx: r2 * Math.PI * 2,
        ry: r3 * Math.PI * 2,
        rz: r4 * Math.PI * 2,
        vrx: (r1 - 0.5) * 2.4,
        vry: (r3 - 0.5) * 2.8,
        scale: 0.68 + r4 * 0.62,
      });
    }
    petalParticlesRef.current = list;

    const mesh = petalsMeshRef.current;
    if (mesh) {
      const col = new THREE.Color();
      for (let i = 0; i < particleCount; i++) {
        col.set(themeSpec.petalColors[i % themeSpec.petalColors.length] ?? '#F9A8D4');
        mesh.setColorAt(i, col);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [isPetals, particleCount, themeSpec.petalColors]);

  const rosePetals = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const angle = (idx / 12) * Math.PI * 2;
      const color =
        idx % 3 === 0
          ? primaryColor
          : themeSpec.rosePetals[idx % themeSpec.rosePetals.length];
      return { idx, angle, color };
    });
  }, [primaryColor, themeSpec.rosePetals]);

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

    if (isPetals && petalsMeshRef.current) {
      const mesh = petalsMeshRef.current;
      const list = petalParticlesRef.current;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        p.y -= p.speedY * clampedDelta;
        p.x += Math.sin(t * 1.15 + p.swayPhase) * 0.34 * clampedDelta;
        p.rx += p.vrx * clampedDelta;
        p.ry += p.vry * clampedDelta;
        if (p.y < -1.6) {
          p.y = 5.65;
          p.x = (seededUnit(i + Math.floor(t), 19) - 0.5) * 13.0;
        }
        dummyObj.position.set(p.x, p.y, p.z);
        dummyObj.rotation.set(p.rx, p.ry, p.rz);
        dummyObj.scale.setScalar(p.scale);
        dummyObj.updateMatrix();
        mesh.setMatrixAt(i, dummyObj.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    } else if (dustRef.current) {
      const posAttr = dustRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      const speedAttr = dustRef.current.geometry.getAttribute('aSpeed') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i);
        let x = posAttr.getX(i);
        if (isSnow) {
          y -= speedAttr.getX(i) * clampedDelta;
          x += Math.sin(t * 0.9 + i * 0.7) * 0.25 * clampedDelta;
          if (y < -1.55) {
            y = 5.6;
            x = (seededUnit(i + Math.floor(t), 23) - 0.5) * 13.0;
          }
        } else {
          y += speedAttr.getX(i) * clampedDelta;
          x += Math.sin(t * 0.6 + i) * 0.0025;
          if (y > 5.4) y = -1.45;
        }
        posAttr.setXY(i, x, y);
      }
      posAttr.needsUpdate = true;
    }
  });

  const activePointTexture = isSnow
    ? particleTextures.snowflake
    : particleTextures.goldDust;

  return (
    <group>
      {/* Reflective Sanctuary Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.65, 0]} receiveShadow={!isLight}>
        <circleGeometry args={[14, isLight ? 28 : 64]} />
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
            color={themeSpec.floorColor}
            metalness={0.6}
            mirror={0.45}
          />
        ) : (
          <meshStandardMaterial
            color={themeSpec.floorStandardColor}
            roughness={0.26}
            metalness={0.72}
          />
        )}
      </mesh>

      {/* Concentric Gold Floor Inlay Rings */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.64, 0]}>
        <ringGeometry args={[2.72, 2.8, isLight ? 36 : 64]} />
        <meshStandardMaterial
          color="#D4A13A"
          metalness={0.85}
          roughness={0.22}
          emissive="#8A5E14"
          emissiveIntensity={0.25}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.64, 0]}>
        <ringGeometry args={[4.45, 4.52, isLight ? 40 : 72]} />
        <meshStandardMaterial color="#B6872B" metalness={0.85} roughness={0.28} />
      </mesh>

      {/* Cathedral Rose Window Backdrop (z = -5.6) */}
      <group ref={roseGroupRef} position={[0, 2.35, -5.6]}>
        {/* Back sanctuary halo behind rose glass */}
        <mesh ref={roseGlowRef} position={[0, 0, -0.25]}>
          <circleGeometry args={[4.85, isLight ? 28 : 48]} />
          <meshBasicMaterial
            color={primaryColor}
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </mesh>

        {/* Outer Stone & Gilded Frame */}
        <mesh>
          <torusGeometry args={[3.95, 0.22, isLight ? 10 : 18, isLight ? 36 : 64]} />
          <meshStandardMaterial color="#231B16" metalness={0.5} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <torusGeometry args={[3.72, 0.075, isLight ? 8 : 14, isLight ? 36 : 64]} />
          <meshStandardMaterial
            color="#E5B94C"
            metalness={0.88}
            roughness={0.22}
            emissive="#A67617"
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <torusGeometry args={[2.15, 0.065, isLight ? 8 : 12, isLight ? 28 : 48]} />
          <meshStandardMaterial color="#D4A13A" metalness={0.88} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0, 0.07]}>
          <torusGeometry args={[0.92, 0.055, isLight ? 8 : 12, isLight ? 24 : 36]} />
          <meshStandardMaterial color="#E5B94C" metalness={0.88} roughness={0.22} />
        </mesh>

        {/* Central Radiant Sanctuary Medallion */}
        <mesh position={[0, 0, -0.02]}>
          <circleGeometry args={[0.9, isLight ? 24 : 36]} />
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
              <circleGeometry args={[0.46, isLight ? 14 : 20]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.78}
                roughness={0.25}
              />
            </mesh>
            {/* Gold surround ring on outer trefoil */}
            <mesh position={[0, 2.95, 0.03]}>
              <torusGeometry args={[0.46, 0.035, 8, isLight ? 16 : 24]} />
              <meshStandardMaterial color="#C89B34" metalness={0.85} roughness={0.25} />
            </mesh>
            {/* Inner jewel lancet petal */}
            <mesh position={[0, 1.54, -0.03]} rotation={[0, 0, Math.PI / 4]}>
              <planeGeometry args={[0.62, 0.62]} />
              <meshStandardMaterial
                color={themeSpec.rosePetals[(idx + 2) % themeSpec.rosePetals.length]}
                emissive={themeSpec.rosePetals[(idx + 2) % themeSpec.rosePetals.length]}
                emissiveIntensity={0.62}
                roughness={0.28}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* Pleated Velvet Curtains (Left Wing) */}
      <group ref={leftCurtainRef} position={[-5.4, 1.9, -2.5]} rotation={[0, 0.28, 0]}>
        {CURTAIN_PLEAT_OFFSETS.map((xOff, i) => (
          <mesh
            key={`l-${i}`}
            position={[xOff, 0, Math.sin(i * 1.1) * 0.14]}
            castShadow={!isLight}
            receiveShadow={!isLight}
          >
            <cylinderGeometry args={[0.31, 0.36, 7.6, isLight ? 8 : 14]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? themeSpec.curtainPrimary : themeSpec.curtainSecondary}
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
          <torusGeometry args={[1.02, 0.055, isLight ? 8 : 10, isLight ? 20 : 32]} />
          <meshStandardMaterial color="#E5B94C" metalness={0.88} roughness={0.22} />
        </mesh>
      </group>

      {/* Pleated Velvet Curtains (Right Wing) */}
      <group ref={rightCurtainRef} position={[5.4, 1.9, -2.5]} rotation={[0, -0.28, 0]}>
        {CURTAIN_PLEAT_OFFSETS.map((xOff, i) => (
          <mesh
            key={`r-${i}`}
            position={[-xOff, 0, Math.sin(i * 1.1) * 0.14]}
            castShadow={!isLight}
            receiveShadow={!isLight}
          >
            <cylinderGeometry args={[0.31, 0.36, 7.6, isLight ? 8 : 14]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? themeSpec.curtainPrimary : themeSpec.curtainSecondary}
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
          <torusGeometry args={[1.02, 0.055, isLight ? 8 : 10, isLight ? 20 : 32]} />
          <meshStandardMaterial color="#E5B94C" metalness={0.88} roughness={0.22} />
        </mesh>
      </group>

      {/* Overhead Velvet Valance Arch */}
      <mesh position={[0, 5.55, -2.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.52, 0.52, 13.4, isLight ? 12 : 20]} />
        <meshStandardMaterial color={themeSpec.valanceColor} roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh position={[0, 5.1, -2.18]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 13.4, isLight ? 10 : 14]} />
        <meshStandardMaterial color="#E5B94C" metalness={0.9} roughness={0.22} />
      </mesh>

      {/* Theme-Aware Atmospheric Particles: Gold Dust (Classic) | Snowflakes (Christmas) | 3D Petals (Easter) */}
      {isPetals ? (
        <instancedMesh
          key={`petals-${particleCount}`}
          ref={petalsMeshRef}
          args={[undefined, undefined, particleCount]}
          frustumCulled={false}
        >
          <planeGeometry args={[0.14, 0.21]} />
          <meshStandardMaterial
            map={particleTextures.petal}
            alphaTest={0.22}
            transparent
            opacity={0.92}
            roughness={0.55}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </instancedMesh>
      ) : (
        <points ref={dustRef} geometry={dustGeometry}>
          <pointsMaterial
            map={activePointTexture}
            size={isSnow ? 0.22 : 0.14}
            sizeAttenuation
            transparent
            opacity={isSnow ? 0.88 : 0.78}
            blending={isSnow ? THREE.NormalBlending : THREE.AdditiveBlending}
            depthWrite={false}
            color={themeSpec.dustOrSnowColor}
          />
        </points>
      )}
    </group>
  );
}
