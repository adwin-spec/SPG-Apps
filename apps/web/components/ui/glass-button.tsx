import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Tombol: primary hitam, secondary putih transparan, ghost tanpa latar. Tegas, radius 11px, tanpa animasi pantul. */
const button = cva('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-glass-sm text-sm font-semibold transition-[background-color,box-shadow,color,transform] duration-200 ease-glass active:scale-[.98] disabled:pointer-events-none disabled:opacity-45', {
  variants: {
    variant: {
      primary: 'bg-ink text-white shadow-[0_6px_18px_rgba(0,0,0,.18)] hover:bg-ink-deep hover:shadow-[0_10px_24px_rgba(0,0,0,.22)]',
      secondary: 'border border-line-strong bg-white/70 text-ink backdrop-blur-md hover:bg-white',
      ghost: 'text-ink hover:bg-black/[.05]',
      danger: 'bg-critical text-white hover:brightness-95',
      success: 'bg-ink text-white hover:bg-ink-deep',
      link: 'px-0 text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink',
    },
    size: { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4', lg: 'h-12 px-5 text-base', icon: 'h-9 w-9' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});
export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> { asChild?: boolean; loading?: boolean }
export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...props}>
    {asChild ? children : <>{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</>}</Comp>;
});
GlassButton.displayName = 'GlassButton';
