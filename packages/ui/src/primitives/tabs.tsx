'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../lib/cn';

/**
 * Tabs : support clé de la progressive disclosure (design-system §6).
 * Ré-exports stylés des primitives Radix : Tabs (racine), TabsList,
 * TabsTrigger, TabsContent. React 19 : le ref est un prop normal, on étale
 * `...props` sur l'élément racine (pas de forwardRef).
 */

export type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root>;

export function Tabs({ className, ...props }: TabsProps) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-2', className)} {...props} />;
}

export type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List>;

export function TabsList({ className, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn('flex border-b border-neutral-200', className)}
      {...props}
    />
  );
}

export type TabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Trigger>;

export function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap px-3 py-2 text-sm font-medium',
        'border-b-2 border-transparent text-neutral-500 transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        'hover:text-neutral-700',
        'data-[state=active]:border-indigo-500 data-[state=active]:text-indigo-700',
        className,
      )}
      {...props}
    />
  );
}

export type TabsContentProps = React.ComponentProps<typeof TabsPrimitive.Content>;

export function TabsContent({ className, ...props }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      className={cn(
        'pt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  );
}
