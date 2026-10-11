import { FileText } from 'lucide-react';
import { ENTITY_ICONS } from '@/lib/entity-icons';
import { cn } from '@/lib/utils';

export function EntityIcon({
  icon,
  color,
  className,
}: {
  icon: string;
  color?: string;
  className?: string;
}) {
  const Icon = ENTITY_ICONS[icon] ?? FileText;
  return (
    <Icon className={cn('size-4 shrink-0', className)} style={color ? { color } : undefined} />
  );
}
