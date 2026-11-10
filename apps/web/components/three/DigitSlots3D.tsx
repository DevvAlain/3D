'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { formatTicket } from '@church/shared';
import type { RevealTimelineSnapshot } from '@/lib/reveal-timeline';
import {
  createGoldDustTexture,
  createSlotDigitTexture,
  disposeTextureList,
} from '@/components/three/textures';
import {
  computeDigitSlotLayout,
  DIGIT_SLOTS_ANCHOR,
} from '@/components/three/stage-layout';

interface DigitSlots3DProps {
  digits: number;
  currentTicket: number | null;
  revealedDigits: number;
  isFinalReveal: boolean;
  revealTimelineRef: React.MutableRefObject<RevealTimelineSnapshot>;
}

export function DigitSlots3D({
  digits,
  currentTicket,
  revealedDigits,
  isFinalReveal,
  revealTimelineRef,
}: DigitSlots3DProps) {
  const { safeDigits, spacing, plaqueW, plaqueH, totalSpan, lecternWidth } =
    computeDigitSlotLayout(digits);

  const rowGroupRef = React.useRef<THREE.Group>(null);
  const plaqueGroupRefs = React.useRef<Array<THREE.Group | null>>([]);
  const burstHaloRef = React.useRef<THREE.Mesh>(null);
  const prevRevealedRef = React.useRef<number>(revealedDigits);
  const slotPopTimersRef = React.useRef<number[]>(new Array(8).fill(0));

  const slotTextures = React.useMemo(() => {
    const idle = createSlotDigitTexture('✦', 'idle');
    const hidden = createSlotDigitTexture('?', 'hidden');
    const revealed = Array.from({ length: 10 }, (_, d) =>
      createSlotDigitTexture(String(d), 'revealed')
    );
    const halo = createGoldDustTexture();
    return { idle, hidden, revealed, halo };
  }, []);

  React.useEffect(() => {
    return () => {
      disposeTextureList([
        slotTextures.idle,
        slotTextures.hidden,
        slotTextures.halo,
        ...slotTextures.revealed,
      ]);
    };
  }, [slotTextures]);

  // Trigger individual plaque bounce pop the instant a new digit reveals
  React.useEffect(() => {
    const prev = prevRevealedRef.current;
    if (revealedDigits > prev) {
      for (let i = prev; i < revealedDigits; i++) {
        slotPopTimersRef.current[i] = 1.0;
      }
    } else if (revealedDigits === 0) {
      slotPopTimersRef.current.fill(0);
    }
    prevRevealedRef.current = revealedDigits;
  }, [revealedDigits]);

  // Mask characters strictly whenever a slot has not yet been revealed
  const formattedTicket =
    currentTicket !== null ? formatTicket(currentTicket, safeDigits) : null;
  const visibleChars = Array.from({ length: safeDigits }, (_, idx) => {
    if (!formattedTicket) return '✦';
    return idx < revealedDigits ? formattedTicket[idx] ?? '?' : '?';
  });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const timeline = revealTimelineRef.current;
    const t = state.clock.elapsedTime;

    // Whole row scales up gracefully on final reveal while tilting slightly upright
    if (rowGroupRef.current) {
      const targetScale = isFinalReveal
        ? 1.11 + timeline.finalBurstStrength * 0.08
        : 1.0;
      const s = THREE.MathUtils.lerp(
        rowGroupRef.current.scale.x,
        targetScale,
        1 - Math.exp(-7 * dt)
      );
      rowGroupRef.current.scale.setScalar(s);

      const targetY = isFinalReveal ? 0.09 : 0;
      rowGroupRef.current.position.y = THREE.MathUtils.lerp(
        rowGroupRef.current.position.y,
        targetY,
        1 - Math.exp(-7 * dt)
      );
    }

    // Light burst halo behind the full revealed number
    if (burstHaloRef.current) {
      const mat = burstHaloRef.current.material as THREE.MeshBasicMaterial;
      const strength = timeline.finalBurstStrength;
      if (strength > 0.01) {
        burstHaloRef.current.visible = true;
        const haloScale = 1 + (1 - strength) * 1.45;
        burstHaloRef.current.scale.set(haloScale * 2.2, haloScale, 1);
        mat.opacity = strength * 0.72;
      } else {
        burstHaloRef.current.visible = false;
      }
    }

    // Per-plaque impact pop + suspense pulse
    for (let i = 0; i < safeDigits; i++) {
      const plaque = plaqueGroupRefs.current[i];
      if (!plaque) continue;

      let pop = slotPopTimersRef.current[i] ?? 0;
      if (pop > 0) {
        pop = Math.max(0, pop - dt * 2.4);
        slotPopTimersRef.current[i] = pop;
      }

      const isTargetAnticipating =
        timeline.slotHighlightIndex === i && timeline.phase === 'final-suspense';
      const suspensePulse = isTargetAnticipating ? 1 + Math.sin(t * 9.5) * 0.045 : 1;
      const popBoost = Math.sin(pop * Math.PI) * 0.22;
      const targetScale = suspensePulse + popBoost;

      plaque.scale.setScalar(
        THREE.MathUtils.lerp(plaque.scale.x, targetScale, 1 - Math.exp(-16 * dt))
      );
    }
  });

  return (
    <group position={DIGIT_SLOTS_ANCHOR}>
      {/* Radiant Final Light Burst Halo */}
      <mesh ref={burstHaloRef} position={[0, 0.05, -0.35]} visible={false}>
        <planeGeometry args={[lecternWidth * 1.35, plaqueH * 2.8]} />
        <meshBasicMaterial
          map={slotTextures.halo}
          color="#FFE38A"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Dark Royal Lectern Base resting solidly on floor */}
      <mesh position={[0, -plaqueH / 2 - 0.14, 0]} receiveShadow castShadow>
        <boxGeometry args={[lecternWidth, 0.22, 0.44]} />
        <meshStandardMaterial color="#12183A" roughness={0.35} metalness={0.45} />
      </mesh>
      {/* Brushed Gold Trim Molding */}
      <mesh position={[0, -plaqueH / 2 - 0.01, 0]}>
        <boxGeometry args={[lecternWidth + 0.05, 0.04, 0.48]} />
        <meshStandardMaterial color="#E5B94C" metalness={0.9} roughness={0.22} />
      </mesh>

      <group ref={rowGroupRef}>
        {visibleChars.map((ch, idx) => {
          const x = -totalSpan / 2 + idx * spacing;
          const isShown = formattedTicket !== null && idx < revealedDigits;
          const isActivePending = formattedTicket !== null && !isShown;

          const digitNum = Number(ch);
          const faceTex = isShown
            ? slotTextures.revealed[
                Number.isInteger(digitNum) && digitNum >= 0 && digitNum <= 9 ? digitNum : 0
              ]
            : isActivePending
              ? slotTextures.hidden
              : slotTextures.idle;

          return (
            <group
              key={idx}
              ref={(el) => {
                plaqueGroupRefs.current[idx] = el;
              }}
              position={[x, 0, 0]}
              rotation={[-0.12, 0, 0]}
            >
              {/* Brushed Gold Backing Case */}
              <mesh castShadow receiveShadow>
                <boxGeometry args={[plaqueW + 0.08, plaqueH + 0.08, 0.12]} />
                <meshStandardMaterial
                  color={isShown ? '#F7CA57' : '#9B7526'}
                  metalness={0.9}
                  roughness={0.2}
                  emissive={isShown ? '#A86E14' : '#000000'}
                  emissiveIntensity={isShown ? (isFinalReveal ? 0.55 : 0.35) : 0}
                />
              </mesh>

              {/* Front Backlit Glass Digit Plaque */}
              <mesh position={[0, 0, 0.064]}>
                <planeGeometry args={[plaqueW, plaqueH]} />
                <meshStandardMaterial
                  map={faceTex}
                  emissiveMap={faceTex}
                  emissive={new THREE.Color(isShown ? '#FFE699' : '#1E2A68')}
                  emissiveIntensity={
                    isShown ? (isFinalReveal ? 0.85 : 0.65) : isActivePending ? 0.35 : 0.16
                  }
                  roughness={0.18}
                  metalness={0.1}
                />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}
