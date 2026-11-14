import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * The mark: a pair of chart dividers, which is also the A of Atlas. The arc between the legs is
 * the distance they have just measured.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7 text-primary', className)} aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 6.6 8.2 26.4M16 6.6l7.8 19.8" />
        <path d="M10.9 19.4c3.4 2.2 6.8 2.2 10.2 0" />
      </g>
      <circle cx="16" cy="5" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function Brand({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark />
      <span className="font-serif text-[1.35rem] font-medium leading-none">Atlas &amp; Ink</span>
    </Link>
  );
}
