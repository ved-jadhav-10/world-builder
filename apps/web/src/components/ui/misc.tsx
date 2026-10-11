import { LoaderCircle } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-4 animate-spin text-muted-foreground', className)} />;
}

export function PageSpinner() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}

export function Badge({ className, color, ...props }: ComponentProps<'span'> & { color?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={
        color ? { borderColor: `${color}55`, backgroundColor: `${color}14`, color } : undefined
      }
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-muted-foreground [&_svg]:size-8">{icon}</div> : null}
      <p className="font-serif text-lg font-semibold">{title}</p>
      {children ? (
        <div className="mt-2 max-w-sm text-sm text-muted-foreground">{children}</div>
      ) : null}
    </div>
  );
}
