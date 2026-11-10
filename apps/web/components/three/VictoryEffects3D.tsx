'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { createGoldDustTexture } from '@/components/three/textures';

interface VictoryEffects3DProps {
  /** Increments each time a live finale / fast-forward celebration should fire */
  burstKey: number;
}

const CONFETTI_COUNT = 160;
const FIREWORK_SPARK_COUNT = 96;
const CONFETTI_PALETTE = [
  '#F5C451', // Cathedral Gold
  '#F43F5E', // Ruby Rose
  '#3B82F6', // Sapphire
  '#10B981', // Emerald
  '#A855F7', // Amethyst
  '#FFF2B2', // Ivory Spark
];

interface ConfettiParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  scale: number;
}

interface SparkParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  delay: number;
}

function seededUnit(idx: number, salt: number): number {
  const s = Math.sin(idx * 91.345 + salt * 47.123) * 43758.5453;
  return s - Math.floor(s);
}

export function VictoryEffects3D({ burstKey }: VictoryEffects3DProps) {
  const confettiRef = React.useRef<THREE.InstancedMesh>(null);
  const sparksRef = React.useRef<THREE.Points>(null);

  const activeAgeRef = React.useRef<number>(-1);
  const lastBurstKeyRef = React.useRef<number>(burstKey);

  const particlesRef = React.useRef<ConfettiParticle[]>([]);
  const sparksStateRef = React.useRef<SparkParticle[]>([]);

  const dummyObj = React.useMemo(() => new THREE.Object3D(), []);
  const sparkTexture = React.useMemo(() => createGoldDustTexture(), []);
  const sparkGeometry = React.useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(FIREWORK_SPARK_COUNT * 3), 3)
    );
    geom.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(FIREWORK_SPARK_COUNT * 3), 3)
    );
    return geom;
  }, []);

  React.useEffect(() => {
    return () => {
      sparkTexture.dispose();
      sparkGeometry.dispose();
    };
  }, [sparkTexture, sparkGeometry]);

  // Pre-seed per-instance jewel colors cleanly once
  React.useEffect(() => {
    const mesh = confettiRef.current;
    if (!mesh) return;
    const c = new THREE.Color();
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      c.set(CONFETTI_PALETTE[i % CONFETTI_PALETTE.length]);
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const colAttr = sparkGeometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < FIREWORK_SPARK_COUNT; i++) {
      c.set(CONFETTI_PALETTE[(i * 2) % CONFETTI_PALETTE.length]);
      colAttr.setXYZ(i, c.r, c.g, c.b);
    }
    colAttr.needsUpdate = true;
  }, [sparkGeometry]);

  // Reset burst simulation when burstKey advances (> 0)
  React.useEffect(() => {
    if (burstKey === 0 || burstKey === lastBurstKeyRef.current) return;
    lastBurstKeyRef.current = burstKey;
    activeAgeRef.current = 0;

    const nextConfetti: ConfettiParticle[] = [];
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const sideOrigin = i % 3 === 0 ? 0 : i % 3 === 1 ? -1.8 : 1.8;
      const r1 = seededUnit(i + burstKey * 31, 1);
      const r2 = seededUnit(i + burstKey * 31, 2);
      const r3 = seededUnit(i + burstKey * 31, 3);
      const r4 = seededUnit(i + burstKey * 31, 4);

      nextConfetti.push({
        x: sideOrigin + (r1 - 0.5) * 1.1,
        y: -0.6 + r2 * 0.6,
        z: 1.9 + (r3 - 0.5) * 0.9,
        vx: (r1 - 0.5) * 5.2 + sideOrigin * 0.45,
        vy: 4.8 + r2 * 4.2,
        vz: (r3 - 0.5) * 3.2 + 0.6,
        rx: r1 * Math.PI * 2,
        ry: r2 * Math.PI * 2,
        rz: r3 * Math.PI * 2,
        vrx: (r4 - 0.5) * 11,
        vry: (r1 - 0.5) * 11,
        scale: 0.75 + r4 * 0.65,
      });
    }
    particlesRef.current = nextConfetti;

    // Two firework starburst fountains flanking the altar rose window
    const nextSparks: SparkParticle[] = [];
    for (let i = 0; i < FIREWORK_SPARK_COUNT; i++) {
      const leftSide = i < FIREWORK_SPARK_COUNT / 2;
      const ox = leftSide ? -3.15 : 3.15;
      const oy = 2.45;
      const oz = -1.3;
      const theta = seededUnit(i + burstKey * 19, 5) * Math.PI * 2;
      const phi = Math.acos(2 * seededUnit(i + burstKey * 19, 6) - 1);
      const speed = 2.4 + seededUnit(i + burstKey * 19, 7) * 3.4;

      nextSparks.push({
        x: ox,
        y: oy,
        z: oz,
        vx: Math.sin(phi) * Math.cos(theta) * speed,
        vy: Math.cos(phi) * speed + 1.1,
        vz: Math.sin(phi) * Math.sin(theta) * speed * 0.4,
        delay: leftSide ? 0.05 : 0.28,
      });
    }
    sparksStateRef.current = nextSparks;
  }, [burstKey]);

  useFrame((_, delta) => {
    const age = activeAgeRef.current;
    const confettiMesh = confettiRef.current;
    const sparksPts = sparksRef.current;

    if (age < 0 || age > 5.8) {
      if (confettiMesh) confettiMesh.visible = false;
      if (sparksPts) sparksPts.visible = false;
      return;
    }

    const dt = Math.min(delta, 0.045);
    activeAgeRef.current += dt;
    const fadeOut = age > 4.2 ? Math.max(0, 1 - (age - 4.2) / 1.6) : 1;

    if (confettiMesh) {
      confettiMesh.visible = true;
      const list = particlesRef.current;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        p.vy -= 5.8 * dt;
        // Air drag & gentle flutter
        p.vx *= 1 - dt * 0.9;
        p.vz *= 1 - dt * 0.9;
        p.x += (p.vx + Math.sin(age * 4 + i) * 0.35) * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rx += p.vrx * dt;
        p.ry += p.vry * dt;

        dummyObj.position.set(p.x, p.y, p.z);
        dummyObj.rotation.set(p.rx, p.ry, p.rz);
        dummyObj.scale.setScalar(p.y < -1.65 ? 0 : p.scale * fadeOut);
        dummyObj.updateMatrix();
        confettiMesh.setMatrixAt(i, dummyObj.matrix);
      }
      confettiMesh.instanceMatrix.needsUpdate = true;
    }

    if (sparksPts) {
      sparksPts.visible = true;
      const posAttr = sparkGeometry.getAttribute('position') as THREE.BufferAttribute;
      const mat = sparksPts.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, 1 - age / 2.9);

      const list = sparksStateRef.current;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (age < s.delay) {
          posAttr.setXYZ(i, 999, 999, 999);
          continue;
        }
        s.vy -= 3.2 * dt;
        s.vx *= 1 - dt * 1.1;
        s.vy *= 1 - dt * 0.5;
        s.vz *= 1 - dt * 1.1;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        posAttr.setXYZ(i, s.x, s.y, s.z);
      }
      posAttr.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh
        ref={confettiRef}
        args={[undefined, undefined, CONFETTI_COUNT]}
        visible={false}
        frustumCulled={false}
      >
        <planeGeometry args={[0.11, 0.055]} />
        <meshStandardMaterial
          roughness={0.28}
          metalness={0.55}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      <points ref={sparksRef} geometry={sparkGeometry} visible={false} frustumCulled={false}>
        <pointsMaterial
          map={sparkTexture}
          size={0.26}
          sizeAttenuation
          transparent
          vertexColors
          opacity={1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
