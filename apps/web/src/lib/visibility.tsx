import { Eye, EyeOff, Lock, Users } from 'lucide-react';
import { VISIBILITIES, type Visibility } from '@atlas/shared';
import { Badge } from '@/components/ui/misc';
import { NativeSelect } from '@/components/ui/inputs';
import { cn } from '@/lib/utils';
import { VISIBILITY_HINTS, VISIBILITY_LABELS } from '@/lib/visibility-labels';
import type { ComponentProps } from 'react';

/** The order people think in: most private first. */
const ORDER: Visibility[] = ['gm', 'hidden', 'player', 'reader', 'public'];

export function VisibilitySelect({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<'select'>, 'value' | 'onChange'> & {
  value: Visibility;
  onChange: (value: Visibility) => void;
}) {
  return (
    <NativeSelect
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value as Visibility)}
    >
      {ORDER.filter((v) => VISIBILITIES.includes(v)).map((v) => (
        <option key={v} value={v}>
          {VISIBILITY_LABELS[v]}
        </option>
      ))}
    </NativeSelect>
  );
}

const ICONS = { gm: Lock, hidden: EyeOff, player: Users, reader: Eye, public: Eye } as const;

/** A small label for who can see something. Public things don't need one. */
export function VisibilityBadge({
  visibility,
  className,
}: {
  visibility: Visibility;
  className?: string;
}) {
  if (visibility === 'public') return null;
  const Icon = ICONS[visibility];
  return (
    <Badge
      className={cn('gap-1 text-muted-foreground', className)}
      title={VISIBILITY_HINTS[visibility]}
    >
      <Icon className="size-3" />
      {VISIBILITY_LABELS[visibility]}
    </Badge>
  );
}
