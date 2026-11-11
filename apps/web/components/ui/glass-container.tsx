import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type GlassLevel = 'primary' | 'elevated' | 'dark' | 'nested' | 'minimal';
const LEVEL: Record<GlassLevel, string> = { primary: 'glass', elevated: 'glass-elevated', dark: 'glass-dark', nested: 'glass-nested', minimal: 'glass-minimal' };

/** Dasar semua container. Level 1 = primary, Level 2 = nested, Level 3 = minimal; elevated untuk lapisan melayang, dark untuk sorotan. */
export const GlassContainer = forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { level?: GlassLevel; interactive?: boolean; as?: 'div' | 'section' | 'article' | 'aside' }>(
  ({ level = 'primary', interactive, as: As = 'div', className, ...p }, ref) =>
    <As ref={ref as never} className={cn(LEVEL[level], interactive && 'glass-hover', className)} {...p} />);
GlassContainer.displayName = 'GlassContainer';
