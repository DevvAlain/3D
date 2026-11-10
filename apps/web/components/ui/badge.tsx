import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-parish-gold/40 bg-parish-gold/15 text-parish-goldLight',
        success: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
        warning: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
        destructive: 'border-red-400/50 bg-red-600/25 text-red-100',
        muted: 'border-white/20 bg-white/10 text-parish-cream/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
