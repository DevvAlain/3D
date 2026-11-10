import type { EventTheme } from '@church/shared';

export type StageParticleMode = 'gold-dust' | 'snow' | 'petals';

export interface StageThemeSpec {
  id: EventTheme;
  label: string;
  particleMode: StageParticleMode;
  skyColor: string;
  fogColor: string;
  floorColor: string;
  floorStandardColor: string;
  curtainPrimary: string;
  curtainSecondary: string;
  valanceColor: string;
  pedestalMarbleColor: string;
  pedestalColumnColor: string;
  ambientLightColor: string;
  hemiSkyColor: string;
  hemiGroundColor: string;
  rimLightColor: string;
  lecternBaseColor: string;
  rosePetals: readonly [string, string, string, string, string, string];
  confettiPalette: readonly [string, string, string, string, string, string];
  dustOrSnowColor: string;
  petalColors: readonly string[];
  css2dBgClass: string;
  css2dOverlayStops: [string, string];
}

export function getStageThemeSpec(
  theme: EventTheme | string | null | undefined,
  primaryColor?: string | null
): StageThemeSpec {
  const accent = primaryColor && /^#/.test(primaryColor) ? primaryColor : null;

  if (theme === 'christmas') {
    return {
      id: 'christmas',
      label: 'Giáng Sinh (Tuyết rơi)',
      particleMode: 'snow',
      skyColor: '#05120D',
      fogColor: '#05120D',
      floorColor: '#071B13',
      floorStandardColor: '#092218',
      curtainPrimary: '#8F1024',
      curtainSecondary: '#690A18',
      valanceColor: '#7A0D1E',
      pedestalMarbleColor: '#0D231A',
      pedestalColumnColor: '#132E22',
      ambientLightColor: '#DDF4FF',
      hemiSkyColor: '#FFE8C7',
      hemiGroundColor: '#082016',
      rimLightColor: accent ?? '#FFD066',
      lecternBaseColor: '#0D241B',
      rosePetals: ['#DC2626', '#15803D', '#F59E0B', '#38BDF8', '#B91C1C', '#10B981'],
      confettiPalette: ['#DC2626', '#16A34A', '#F5C451', '#E2E8F0', '#38BDF8', '#FEF08A'],
      dustOrSnowColor: '#F0F9FF',
      petalColors: ['#F0F9FF'],
      css2dBgClass: 'bg-[#05120D]',
      css2dOverlayStops: ['rgba(185,28,28,0.22)', 'rgba(21,128,61,0.24)'],
    };
  }

  if (theme === 'easter') {
    return {
      id: 'easter',
      label: 'Phục Sinh (Cánh hoa bay)',
      particleMode: 'petals',
      skyColor: '#130D2E',
      fogColor: '#130D2E',
      floorColor: '#17113A',
      floorStandardColor: '#1C1647',
      curtainPrimary: '#52219E',
      curtainSecondary: '#3D157A',
      valanceColor: '#471B8C',
      pedestalMarbleColor: '#1B1442',
      pedestalColumnColor: '#241B57',
      ambientLightColor: '#FAF0FF',
      hemiSkyColor: '#FFF5D6',
      hemiGroundColor: '#22134A',
      rimLightColor: accent ?? '#FFE48F',
      lecternBaseColor: '#1F174D',
      rosePetals: ['#F472B6', '#38BDF8', '#FACC15', '#34D399', '#C084FC', '#FB7185'],
      confettiPalette: ['#F472B6', '#38BDF8', '#FDE047', '#34D399', '#C084FC', '#FFF7ED'],
      dustOrSnowColor: '#FFE8B8',
      petalColors: ['#F9A8D4', '#FDE68A', '#DDD6FE', '#FED7AA', '#FFF1F2'],
      css2dBgClass: 'bg-[#130D2E]',
      css2dOverlayStops: ['rgba(244,114,182,0.22)', 'rgba(124,58,237,0.24)'],
    };
  }

  return {
    id: 'classic',
    label: 'Cổ Điển (Gala Kính Màu)',
    particleMode: 'gold-dust',
    skyColor: '#060918',
    fogColor: '#060918',
    floorColor: '#070D22',
    floorStandardColor: '#09112B',
    curtainPrimary: '#741122',
    curtainSecondary: '#5E0C1A',
    valanceColor: '#680E1E',
    pedestalMarbleColor: '#10152F',
    pedestalColumnColor: '#181236',
    ambientLightColor: '#D4E1FF',
    hemiSkyColor: '#FFE8B3',
    hemiGroundColor: '#160B2E',
    rimLightColor: accent ?? '#FFD062',
    lecternBaseColor: '#12183A',
    rosePetals: ['#E11D48', '#1D4ED8', '#D97706', '#059669', '#7C3AED', '#DC2626'],
    confettiPalette: ['#F5C451', '#F43F5E', '#3B82F6', '#10B981', '#A855F7', '#FFF2B2'],
    dustOrSnowColor: '#FFE394',
    petalColors: ['#FFE394'],
    css2dBgClass: 'bg-parish-navy',
    css2dOverlayStops: ['rgba(245,196,81,0.16)', 'rgba(142,27,46,0.22)'],
  };
}
