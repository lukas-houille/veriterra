import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Fusionne des classes conditionnelles (clsx) puis dédoublonne les utilitaires
 * Tailwind en conflit (tailwind-merge). Utilitaire de base de tous les composants.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
