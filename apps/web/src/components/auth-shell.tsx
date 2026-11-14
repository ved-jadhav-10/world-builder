import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';

const CHARTS = {
  portolan: {
    alt: 'A vellum portolan chart of the Mediterranean crossed by compass lines',
    caption: 'Portolan chart of the Mediterranean, Genoa, about 1320',
    focus: '40% 50%',
  },
  'carta-marina': {
    alt: 'A hand-coloured sea chart of the northern lands, its waters full of ships and sea monsters',
    caption: 'Carta marina, Olaus Magnus, 1539',
    focus: '20% 45%',
  },
  hven: {
    alt: 'An engraved map of the small island of Hven with its fields, village and observatory',
    caption: 'Hven, Joan Blaeu, 1663',
    focus: '50% 50%',
  },
  islandia: {
    alt: 'An engraved map of Iceland with mountains, fjords and monsters in the sea around it',
    caption: 'Islandia, Abraham Ortelius, 1587',
    focus: '45% 60%',
  },
} as const;

export type AuthChart = keyof typeof CHARTS;

/**
 * The frame for every signed-out form: the form on a sheet of paper, an old chart beside it.
 * The charts are in the public domain (see the front page's credits).
 */
export function AuthShell({
  chart = 'portolan',
  children,
  footer,
}: {
  chart?: AuthChart;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const picture = CHARTS[chart];
  return (
    <div className="grid min-h-dvh gap-3 p-3 lg:grid-cols-2">
      <div className="flex flex-col rounded-lg bg-card px-6 py-6 sm:px-10">
        <Brand />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          {children}
          {footer ? <p className="mt-8 text-sm text-muted-foreground">{footer}</p> : null}
        </div>
      </div>
      <figure className="relative hidden overflow-hidden rounded-lg bg-muted lg:block">
        <img
          src={`/charts/${chart}-1200.webp`}
          srcSet={`/charts/${chart}-1200.webp 1200w, /charts/${chart}-2400.webp 2400w`}
          sizes="50vw"
          alt={picture.alt}
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: picture.focus }}
        />
        <figcaption className="absolute bottom-0 left-0 rounded-tr-lg bg-card px-4 py-1.5 font-serif text-[15px] italic">
          {picture.caption}
        </figcaption>
      </figure>
    </div>
  );
}
