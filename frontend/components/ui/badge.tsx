import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/20 bg-primary/8 text-primary',
        secondary: 'border-border bg-muted text-muted-foreground',
        success: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700',
        warning: 'border-amber-200/80 bg-amber-50/80 text-amber-700',
        destructive: 'border-rose-200/80 bg-rose-50/80 text-rose-700',
        outline: 'border-border text-foreground'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
