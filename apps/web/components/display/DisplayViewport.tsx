'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import type { DisplayStatePayload } from '@church/shared';
import { useDisplayController } from '@/hooks/useDisplayController';
import { DisplayStage2D } from '@/components/display/DisplayStage2D';

const DisplayStage3D = dynamic(
  () => import('@/components/three/DisplayStage3D').then((m) => m.DisplayStage3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-parish-navy text-parish-goldLight">
        <div className="rounded-2xl border border-parish-gold/30 bg-parish-night/85 px-6 py-4 text-sm font-medium shadow-2xl">
          Đang khởi tạo sân khấu 3D...
        </div>
      </div>
    ),
  }
);

interface DisplayViewportProps {
  initialState: DisplayStatePayload;
  isPreview: boolean;
  actorEmail: string;
}

export function DisplayViewport({
  initialState,
  isPreview,
  actorEmail,
}: DisplayViewportProps) {
  const controller = useDisplayController({
    initialState,
    isPreview,
    actorEmail,
  });

  if (!controller.shouldRender3D) {
    return <DisplayStage2D controller={controller} />;
  }

  return <DisplayStage3D controller={controller} />;
}
