import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const base = 'w-full rounded-md border-2 border-ink bg-paper-card px-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-tt focus:outline-none disabled:bg-paper-deep disabled:text-ink-muted aria-[invalid=true]:border-tt';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) =>
  <input ref={ref} className={cn(base, 'h-9', className)} {...p} />);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) =>
  <textarea ref={ref} className={cn(base, 'min-h-[72px] py-2', className)} {...p} />);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) =>
  <select ref={ref} className={cn(base, 'h-9 pr-7', className)} {...p}>{children}</select>);
Select.displayName = 'Select';

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-xs font-bold uppercase tracking-wide text-ink-secondary', className)} {...p} />;
}

/** Form field wrapper: label + control + error/hint (errors are announced to screen readers). */
export function Field({ label, error, hint, htmlFor, required, children, className }: { label: string; error?: string; hint?: string; htmlFor?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return <div className={className}>
    <Label htmlFor={htmlFor}>{label}{required && <span className="text-critical"> *</span>}</Label>
    {children}
    {error ? <p role="alert" className="mt-1 text-xs text-critical-text">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
  </div>;
}
