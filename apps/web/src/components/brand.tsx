import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export function Brand({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('inline-flex items-center gap-2', className)}>
      <img src="/favicon.svg" alt="" className="size-7" />
      <span className="font-serif text-lg font-semibold tracking-tight">Atlas &amp; Ink</span>
    </Link>
  );
}
