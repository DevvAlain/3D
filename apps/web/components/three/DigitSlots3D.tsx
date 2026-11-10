'use client';

import * as React from 'react';
import * as THREE from 'three';
import { formatTicket } from '@church/shared';
import {
  createSlotDigitTexture,
  disposeTextureList,
} from '@/components/three/textures';

interface DigitSlots3DProps {
  digits: number;
  currentTicket: number | null;
  revealedDigits: number;
}

export function DigitSlots3D({
  digits,
  currentTicket,
  revealedDigits,
}: DigitSlots3DProps) {
  const safeDigits = Math.max(1, Math.min(8, digits));

  const slotTextures = React.useMemo(() => {
    const idle = createSlotDigitTexture('✦', 'idle');
    const hidden = createSlotDigitTexture('?', 'hidden');
    const revealed = Array.from({ length: 10 }, (_, d) =>
      createSlotDigitTexture(String(d), 'revealed')
    );
    return { idle, hidden, revealed };
  }, []);

  React.useEffect(() => {
    return () => {
      disposeTextureList([
        slotTextures.idle,
        slotTextures.hidden,
        ...slotTextures.revealed,
      ]);
    };
  }, [slotTextures]);

  const spacing = safeDigits <= 4 ? 0.96 : safeDigits === 5 ? 0.88 : 0.74;
  const plaqueW = safeDigits <= 5 ? 0.7 : 0.58;
  const plaqueH = safeDigits <= 5 ? 0.88 : 0.76;
  const totalSpan = (safeDigits - 1) * spacing;
  const lecternWidth = totalSpan + plaqueW + 0.55;

  const chars =
    currentTicket !== null
      ? formatTicket(currentTicket, safeDigits).split('')
      : Array.from({ length: safeDigits }, () => '✦');

  return (
    <group position={[0, -1.16, 2.68]}>
      {/* Dark Royal Lectern Base Bar resting smoothly on stage */}
      <mesh position={[0, -plaqueH / 2 - 0.08, 0]} receiveShadow castShadow>
        <boxGeometry args={[lecternWidth, 0.16, 0.42]} />
        <meshStandardMaterial color="#12183A" roughness={0.35} metalness={0.45} />
      </mesh>
      {/* Brushed Gold Trim Molding */}
      <mesh position={[0, -plaqueH / 2 + 0.01, 0]}>
        <boxGeometry args={[lecternWidth + 0.04, 0.035, 0.45]} />
        <meshStandardMaterial color="#E5B94C" metalness={0.9} roughness={0.22} />
      </mesh>

      {chars.map((ch, idx) => {
        const x = -totalSpan / 2 + idx * spacing;
        const isShown = currentTicket !== null && idx < revealedDigits;
        const isActivePending = currentTicket !== null && !isShown;

        const digitNum = Number(ch);
        const faceTex = isShown
          ? slotTextures.revealed[
              Number.isInteger(digitNum) && digitNum >= 0 && digitNum <= 9 ? digitNum : 0
            ]
          : isActivePending
            ? slotTextures.hidden
            : slotTextures.idle;

        return (
          <group key={idx} position={[x, 0, 0]} rotation={[-0.14, 0, 0]}>
            {/* Brushed Gold Backing Case */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[plaqueW + 0.08, plaqueH + 0.08, 0.12]} />
              <meshStandardMaterial
                color={isShown ? '#F5C451' : '#9B7526'}
                metalness={0.88}
                roughness={0.24}
                emissive={isShown ? '#996515' : '#000000'}
                emissiveIntensity={isShown ? 0.35 : 0}
              />
            </mesh>

            {/* Front Backlit Glass Digit Plaque */}
            <mesh position={[0, 0, 0.064]}>
              <planeGeometry args={[plaqueW, plaqueH]} />
              <meshStandardMaterial
                map={faceTex}
                emissiveMap={faceTex}
                emissive={new THREE.Color(isShown ? '#FFE699' : '#1E2A68')}
                emissiveIntensity={isShown ? 0.62 : isActivePending ? 0.35 : 0.16}
                roughness={0.2}
                metalness={0.1}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
