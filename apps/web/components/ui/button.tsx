import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const button = cva('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-semibold transition-all active:translate-x-px active:translate-y-px disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      primary: 'border-2 border-ink bg-ink text-paper-card shadow-hard-red hover:bg-tt hover:border-tt hover:shadow-hard',
      secondary: 'border-2 border-ink bg-paper-card text-ink shadow-hard-sm hover:bg-paper-deep',
      ghost: 'text-ink-secondary hover:bg-surface hover:text-ink',
      danger: 'border-2 border-tt bg-tt text-white shadow-hard-sm hover:bg-tt-dark',
      success: 'border-2 border-ink bg-ink text-paper-card shadow-hard-sm hover:bg-good-text hover:border-good-text',
      link: 'text-ink underline decoration-tt decoration-2 underline-offset-4 hover:text-tt px-0',
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
