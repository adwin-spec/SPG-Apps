import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const button = cva('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      primary: 'bg-primary text-white hover:bg-primary-hover',
      secondary: 'border border-border bg-white text-ink hover:bg-surface',
      ghost: 'text-ink-secondary hover:bg-surface hover:text-ink',
      danger: 'bg-critical text-white hover:bg-critical-text',
      success: 'bg-good-text text-white hover:opacity-90',
      link: 'text-primary underline-offset-2 hover:underline px-0',
    },
    size: { sm: 'h-8 px-2.5 text-xs', md: 'h-9 px-3.5', lg: 'h-11 px-5 text-base', icon: 'h-8 w-8' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> { asChild?: boolean; loading?: boolean }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...props}>
    {asChild ? children : <>{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</>}
  </Comp>;
});
Button.displayName = 'Button';
