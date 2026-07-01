// Barrel public de @veriterra/ui : composants du design system Veriterra
// (docs/design-system.md) + util de classes. Chaque composant exporte aussi
// son type *Props (requis pour l'extraction .d.ts de design-sync).

export { cn } from './lib/cn';

// ---------- Primitives (design-system §6) ----------
export { Button, buttonVariants, type ButtonProps } from './primitives/button';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
  type CardHeaderProps,
  type CardTitleProps,
  type CardDescriptionProps,
  type CardContentProps,
  type CardFooterProps,
} from './primitives/card';
export { Badge, badgeVariants, type BadgeProps } from './primitives/badge';
export { Input, type InputProps } from './primitives/input';
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type TabsProps,
  type TabsListProps,
  type TabsTriggerProps,
  type TabsContentProps,
} from './primitives/tabs';

// ---------- Composants signature (design-system §7) ----------
export {
  ConfidenceDots,
  type ConfidenceDotsProps,
  type ConfidenceLevel,
} from './signature/confidence-dots';
export { DataBlock, type DataBlockProps } from './signature/data-block';
export {
  UnavailableState,
  type UnavailableStateProps,
} from './signature/unavailable-state';
export { ScoreGauge, type ScoreGaugeProps } from './signature/score-gauge';
export {
  AlertChip,
  type AlertChipProps,
  type AlertChipSeverity,
} from './signature/alert-chip';
export {
  StatusPin,
  type StatusPinProps,
  type PortfolioStatus,
} from './signature/status-pin';
