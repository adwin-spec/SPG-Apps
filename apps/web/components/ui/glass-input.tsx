import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/** Kolom isian: permukaan transparan, garis halus, cincin fokus hitam, error merah. */
export const fieldBase = 'w-full min-w-0 rounded-glass-sm border border-line-strong bg-white/70 px-3 text-sm text-ink backdrop-blur-sm placeholder:text-ink-muted transition-[border-color,box-shadow] duration-200 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:bg-black/[.03] disabled:text-ink-muted aria-[invalid=true]:border-critical aria-[invalid=true]:ring-critical/15';

export const GlassInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...p} />);
GlassInput.displayName = 'GlassInput';
export const GlassTextarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(fieldBase, 'min-h-[80px] py-2', className)} {...p} />);
GlassTextarea.displayName = 'GlassTextarea';
export const GlassSelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => <select ref={ref} className={cn(fieldBase, 'h-10 pr-8 font-medium', className)} {...p}>{children}</select>);
GlassSelect.displayName = 'GlassSelect';

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-xs font-semibold text-ink-secondary', className)} {...p} />;
}
/** Label + kontrol + pesan error/bantuan (error diumumkan ke pembaca layar). */
export function Field({ label, error, hint, htmlFor, required, children, className }: { label: string; error?: string; hint?: string; htmlFor?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label htmlFor={htmlFor}>{label}{required && <span className="text-critical-text"> *</span>}</Label>{children}
    {error ? <p role="alert" className="mt-1 text-xs font-medium text-critical-text">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}</div>;
}
