'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parish-gold/70 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-parish-gold to-parish-goldLight text-parish-navy shadow hover:brightness-105',
        secondary:
          'border border-parish-gold/30 bg-parish-navy/80 text-parish-cream hover:bg-parish-gold/15',
        destructive:
          'bg-parish-burgundy text-parish-cream shadow-sm hover:bg-red-700 border border-red-400/30',
        outline:
          'border border-parish-gold/35 bg-transparent text-parish-goldLight hover:bg-parish-gold/10',
        ghost: 'text-parish-cream/80 hover:bg-white/10 hover:text-parish-cream',
        success:
          'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 border border-emerald-400/30',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-xl px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = 'Button';
