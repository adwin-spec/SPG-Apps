'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertOctagon, Info } from 'lucide-react';

type Toast = { id: number; tone: 'success' | 'error' | 'info'; message: string };
const Ctx = createContext<(tone: Toast['tone'], message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, message }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  return <Ctx.Provider value={push}>{children}
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
      {items.map((t) => {
        const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? AlertOctagon : Info;
        return <div key={t.id} className="pointer-events-auto flex items-start gap-2 glass-elevated !rounded-glass-md px-4 py-3 text-sm font-medium">
          <Icon className={t.tone === 'success' ? 'h-4 w-4 text-good-text' : t.tone === 'error' ? 'h-4 w-4 text-critical-text' : 'h-4 w-4 text-ink'} aria-hidden />
          <span>{t.message}</span></div>;
      })}
    </div>
  </Ctx.Provider>;
}
export const useToast = () => useContext(Ctx);
