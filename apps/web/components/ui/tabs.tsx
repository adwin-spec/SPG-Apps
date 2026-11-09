'use client';
import * as T from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;
export function TabsList({ className, ...p }: T.TabsListProps) {
  return <T.List className={cn('mb-3 flex gap-1 overflow-x-auto border-b border-border', className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: T.TabsTriggerProps) {
  return <T.Trigger className={cn('-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-ink-secondary hover:text-ink data-[state=active]:border-primary data-[state=active]:text-primary', className)} {...p} />;
}
export const TabsContent = T.Content;
