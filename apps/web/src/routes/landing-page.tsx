import { Eye, Lock, MapPin } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/brand';
import { cn } from '@/lib/utils';
import './landing.css';

/*
 * The public front page. The screen is split the way the name is: Atlas on one half (a real
 * antique chart that stays put), Ink on the other (the column you read). As the reader moves
 * through the page the chart changes with the section, and in the middle the fixed half becomes
 * one entry from a world that the reader can rename, age and look at as a player would.
 */

type Scene = 'world' | 'kingdom' | 'city' | 'roads' | 'entry' | 'ink' | 'table';

interface Chart {
  scene: Exclude<Scene, 'entry'>;
  file: string;
  alt: string;
  caption: string;
  /** Which part of the sheet to keep when the frame crops it. */
  focus: string;
}

const CHARTS: Chart[] = [
  {
    scene: 'world',
    file: 'carta-marina',
    alt: 'A hand-coloured sea chart of the northern lands, its waters full of ships and sea monsters',
    caption: 'Carta marina, Olaus Magnus, 1539',
    focus: '22% 40%',
  },
  {
    scene: 'kingdom',
    file: 'islandia',
    alt: 'An engraved map of Iceland with mountains, fjords and monsters in the sea around it',
    caption: 'Islandia, Abraham Ortelius, 1587',
    focus: '50% 50%',
  },
  {
    scene: 'city',
    file: 'paris',
    alt: 'A bird’s-eye plan of walled Paris on the Seine, every street and garden drawn',
    caption: 'Lutetia, Braun and Hogenberg, 1572',
    focus: '50% 45%',
  },
  {
    scene: 'roads',
    file: 'portolan',
    alt: 'A vellum portolan chart of the Mediterranean crossed by compass lines',
    caption: 'Portolan chart of the Mediterranean, Genoa, about 1320',
    focus: '45% 50%',
  },
  {
    scene: 'ink',
    file: 'book-of-hours',
    alt: 'A manuscript page in black ink with decorated initials in red, blue and gold',
    caption: 'Book of Hours, Metz, about 1440',
    focus: '50% 30%',
  },
  {
    scene: 'table',
    file: 'hven',
    alt: 'An engraved map of the small island of Hven with its fields, village and observatory',
    caption: 'Hven, Joan Blaeu, 1663',
    focus: '50% 50%',
  },
];

/** Marks the block nearest the middle of the screen, and tells the stage which scene it wants. */
function useActiveScene(onScene: (scene: Scene) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver !== 'function') return;
    const blocks = [...root.querySelectorAll<HTMLElement>('[data-scene]')];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const block = entry.target as HTMLElement;
          block.toggleAttribute('data-active', entry.isIntersecting);
          if (entry.isIntersecting) onScene(block.dataset.scene as Scene);
        }
      },
      // A thin band across the middle of the screen: one block at a time is "the" block.
      { rootMargin: '-45% 0px -45% 0px' },
    );
    blocks.forEach((block) => observer.observe(block));
    return () => observer.disconnect();
  }, [onScene]);
  return ref;
}

/** Parts of a section arrive one after another the first time it comes into view. */
function useReveal() {
  useEffect(() => {
    const parts = [...document.querySelectorAll<HTMLElement>('.landing [data-reveal]')];
    if (typeof IntersectionObserver !== 'function') {
      parts.forEach((part) => part.setAttribute('data-in', ''));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-in', '');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    parts.forEach((part) => observer.observe(part));
    return () => observer.disconnect();
  }, []);
}

/* The entry on the stage: one place in a sample world, as it changes over the years. */

const YEAR_MIN = 1138;
const YEAR_MAX = 1190;

function placeAt(year: number) {
  const guildRule = year >= 1162;
  return {
    age: year - YEAR_MIN,
    ruler: guildRule ? 'The Tide Guild' : 'Harbourmaster Odo Karr',
    people: Math.round((2400 + (year - YEAR_MIN) * 190) / 100) * 100,
    knownFor:
      year < 1150 ? 'Salt cod and a single quay' : guildRule ? 'Pilots for hire' : 'Its lamp tower',
    chapter: year < 1150 ? 'the prologue' : guildRule ? 'chapter 19' : 'chapter 4',
  };
}

type Audience = 'gm' | 'player';

type EntryPart = 'name' | 'time' | 'secret';

function EntryFragment({
  name,
  year,
  audience,
  part,
}: {
  name: string;
  year: number;
  audience: Audience;
  /** On a small screen each control shows only the part of the entry it changes. */
  part?: EntryPart;
}) {
  const place = placeAt(year);
  const shown = name.trim() || 'Vesh';
  if (part) return <EntryPartView part={part} shown={shown} year={year} audience={audience} />;
  return (
    <div data-ui className="entry-fragment font-sans">
      <div className="entry-map">
        <img src="/charts/carta-marina-1200.webp" alt="" width={1200} height={889} />
        <span className="entry-pin">
          <MapPin aria-hidden="true" />
          <span>{shown}</span>
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">Location · as of {year} AF</p>
          <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
            <Eye className="size-3.5" aria-hidden="true" />
            {audience === 'gm' ? 'You, the GM' : 'A player'}
          </p>
        </div>
        <p className="font-serif text-[1.9rem] font-medium leading-none">{shown}</p>
        <dl className="entry-fields">
          <div>
            <dt>Founded</dt>
            <dd>
              {YEAR_MIN} AF <span className="text-muted-foreground">({place.age} years ago)</span>
            </dd>
          </div>
          <div>
            <dt>Ruled by</dt>
            <dd>{place.ruler}</dd>
          </div>
          <div>
            <dt>People</dt>
            <dd className="tabular-nums">{place.people.toLocaleString('en-GB')}</dd>
          </div>
          <div>
            <dt>Known for</dt>
            <dd>{place.knownFor}</dd>
          </div>
          {audience === 'gm' ? (
            <div className="entry-secret">
              <dt>
                <Lock className="size-3.5" aria-hidden="true" /> GM only
              </dt>
              <dd>The lamp tower is a drowned god’s finger. The Guild knows.</dd>
            </div>
          ) : null}
        </dl>
        <p className="entry-prose">
          From {place.chapter}: “By the time the pilot brought them into{' '}
          <span className="mention">{shown}</span>, the tide had turned and{' '}
          {place.ruler === 'The Tide Guild' ? 'the Guild’s lamps' : 'Karr’s one lamp'} burned along
          the quay.”
        </p>
      </div>
    </div>
  );
}

function EntryPartView({
  part,
  shown,
  year,
  audience,
}: {
  part: EntryPart;
  shown: string;
  year: number;
  audience: Audience;
}) {
  const place = placeAt(year);
  return (
    <div data-ui className="entry-fragment entry-part font-sans">
      {part === 'name' ? (
        <>
          <div className="entry-map">
            <img src="/charts/carta-marina-1200.webp" alt="" width={1200} height={889} />
            <span className="entry-pin">
              <MapPin aria-hidden="true" />
              <span>{shown}</span>
            </span>
          </div>
          <p className="entry-prose">
            “By the time the pilot brought them into <span className="mention">{shown}</span>, the
            tide had turned.”
          </p>
        </>
      ) : null}
      {part === 'time' ? (
        <dl className="entry-fields">
          <div>
            <dt>As of</dt>
            <dd>
              {year} AF <span className="text-muted-foreground">({place.chapter})</span>
            </dd>
          </div>
          <div>
            <dt>Ruled by</dt>
            <dd>{place.ruler}</dd>
          </div>
          <div>
            <dt>People</dt>
            <dd className="tabular-nums">{place.people.toLocaleString('en-GB')}</dd>
          </div>
          <div>
            <dt>Known for</dt>
            <dd>{place.knownFor}</dd>
          </div>
        </dl>
      ) : null}
      {part === 'secret' ? (
        <dl className="entry-fields">
          <div>
            <dt>Known for</dt>
            <dd>{place.knownFor}</dd>
          </div>
          {audience === 'gm' ? (
            <div className="entry-secret">
              <dt>
                <Lock className="size-3.5" aria-hidden="true" /> GM only
              </dt>
              <dd>The lamp tower is a drowned god’s finger. The Guild knows.</dd>
            </div>
          ) : (
            <div>
              <dt>Secrets</dt>
              <dd className="text-muted-foreground">None that a player can see.</dd>
            </div>
          )}
        </dl>
      ) : null}
    </div>
  );
}

/** The same chart as the stage shows, set in the column where there is no stage beside it. */
function InlineChart({ scene }: { scene: Chart['scene'] }) {
  const chart = CHARTS.find((c) => c.scene === scene)!;
  return (
    <figure className="inline-chart">
      <img
        src={`/charts/${chart.file}-1200.webp`}
        alt={chart.alt}
        width={1200}
        height={889}
        loading="lazy"
        decoding="async"
        style={{ objectPosition: chart.focus }}
      />
      <figcaption>{chart.caption}</figcaption>
    </figure>
  );
}

function Stage({ scene, children }: { scene: Scene; children: ReactNode }) {
  const chart = CHARTS.find((c) => c.scene === scene);
  return (
    <div className="stage">
      {CHARTS.map((c, index) => (
        <img
          key={c.file}
          src={`/charts/${c.file}-1200.webp`}
          srcSet={`/charts/${c.file}-1200.webp 1200w, /charts/${c.file}-2400.webp 2400w`}
          sizes="(min-width: 1024px) 50vw, 100vw"
          alt={c.alt}
          width={2400}
          height={1778}
          loading={index === 0 ? 'eager' : 'lazy'}
          decoding="async"
          style={{ objectPosition: c.focus }}
          className={cn('stage-chart', c.scene === scene && 'is-on')}
        />
      ))}
      {scene === 'entry' ? <div className="stage-entry">{children}</div> : null}
      <p className={cn('stage-caption', chart && 'is-on')} aria-hidden={!chart}>
        {chart?.caption ?? ''}
      </p>
    </div>
  );
}

const BOX: { kind: string; items: string[] }[] = [
  {
    kind: 'For the writing',
    items: [
      'Books, parts, chapters, scenes',
      'Plot boards and beat templates',
      'Arc tracker',
      'Version history',
      'Word check',
      'Goals, streaks and sprints',
      'Word, EPUB and PDF export',
    ],
  },
  {
    kind: 'For the world',
    items: [
      'Your own entry types',
      'Relationship graph',
      'Family trees',
      'Faction diplomacy',
      'Invented calendars and moons',
      'Timeline with playback',
      'Continuity checker',
    ],
  },
  {
    kind: 'For the map',
    items: [
      'Maps inside maps',
      'Pins, roads and regions',
      'Journeys with dated stops',
      'Measure and travel times',
      'Borders that change by year',
      'Fog of war',
      'Token maker',
    ],
  },
  {
    kind: 'For the table',
    items: [
      'Roles for players and readers',
      'View as a player',
      'Quest log',
      'GM screen',
      'Initiative and loot',
      'Rollable tables and dice',
      'Handouts and session notes',
    ],
  },
];

export function LandingPage() {
  const [scene, setScene] = useState<Scene>('world');
  const [name, setName] = useState('Vesh');
  const [year, setYear] = useState(1158);
  const [audience, setAudience] = useState<Audience>('gm');
  const columnRef = useActiveScene(setScene);
  useReveal();

  useEffect(() => {
    document.title = 'Atlas & Ink: maps, lore and chapters in one linked place';
    return () => {
      document.title = 'Atlas & Ink';
    };
  }, []);

  return (
    <div className="landing">
      <div className="split">
        <div className="reading" ref={columnRef}>
          <header className="hero" data-scene="world">
            <nav className="hero-nav" aria-label="Main">
              <Link to="/" className="wordmark">
                <BrandMark className="size-8!" /> Atlas &amp; Ink
              </Link>
              <span className="hero-links">
                <a href="#atlas">Atlas</a>
                <a href="#codex">Codex</a>
                <a href="#manuscript">Manuscript</a>
                <Link to="/sign-in">Sign in</Link>
              </span>
            </nav>
            <div className="hero-body">
              <h1 data-reveal>Your story world, on one desk</h1>
              <p className="lead" data-reveal>
                Atlas &amp; Ink keeps a world’s maps, people, lore and chapters in one linked place,
                so the map, the notes and the manuscript never drift apart. For fantasy writers, and
                for game masters who run the same worlds at the table.
              </p>
              <p data-reveal>
                <Link to="/sign-up" className="action">
                  Start a world
                </Link>
                <Link to="/sign-in" className="text-link">
                  I have an account
                </Link>
              </p>
            </div>
          </header>

          <section id="atlas" aria-labelledby="atlas-title">
            <h2 id="atlas-title" data-reveal>
              Maps inside maps
            </h2>
            <div className="statement" data-scene="world">
              <InlineChart scene="world" />
              <p className="say">Start with the whole world.</p>
              <p>
                Upload a map of any size and move around it smoothly. Drop a pin and it opens the
                entry for that place; draw the roads, rivers and borders on top.
              </p>
            </div>
            <div className="statement" data-scene="kingdom">
              <InlineChart scene="kingdom" />
              <p className="say">Open a kingdom inside it.</p>
              <p>
                Any region can hold a map of its own, so the world leads to the realm and the realm
                to the valley. Each sheet keeps its own layers, labels and scale.
              </p>
            </div>
            <div className="statement" data-scene="city">
              <InlineChart scene="city" />
              <p className="say">Then a city inside that.</p>
              <p>
                Street by street if you like. Players see only the quarters you have uncovered, and
                your prep notes on each pin are never sent to them.
              </p>
            </div>
            <div className="statement" data-scene="roads">
              <InlineChart scene="roads" />
              <p className="say">Measure the road between.</p>
              <p>
                Set a scale and read travel times on foot, on horseback or under sail. Journeys keep
                dated stops, so on any day you can see how far the company has come.
              </p>
            </div>
          </section>

          <section id="codex" aria-labelledby="codex-title" data-scene="entry">
            <h2 id="codex-title" data-reveal>
              One entry, everywhere
            </h2>
            <p className="lead" data-reveal>
              A place, a person or a faction is written down once. The map, the chapters and the
              timeline all read from that one entry. Try it on this one.
            </p>

            <div className="capability" data-reveal>
              <p className="say">Name it once.</p>
              <p>
                Change the name here and it changes on the map and in the chapter, because both
                point at the entry rather than repeat it.
              </p>
              <label className="control">
                <span>Name of the place</span>
                <input
                  type="text"
                  value={name}
                  maxLength={18}
                  onChange={(event) => setName(event.target.value)}
                  onFocus={() => setScene('entry')}
                />
              </label>
              <div className="inline-entry">
                <EntryFragment name={name} year={year} audience={audience} part="name" />
              </div>
            </div>

            <div className="capability" data-reveal>
              <p className="say">Ask what was true then.</p>
              <p>
                Rulers change, towns grow, people age. Record the change with its date and open any
                entry as it stood in a given year or chapter.
              </p>
              <label className="control">
                <span>
                  The year <output>{year} AF</output>
                </span>
                <input
                  type="range"
                  min={YEAR_MIN + 2}
                  max={YEAR_MAX}
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  onFocus={() => setScene('entry')}
                />
              </label>
              <div className="inline-entry">
                <EntryFragment name={name} year={year} audience={audience} part="time" />
              </div>
            </div>

            <div className="capability" data-reveal>
              <p className="say">Keep your secrets.</p>
              <p>
                Everything starts private. Share an entry with players or readers when you are
                ready, keep single fields for yourself, and check your work by looking as they do.
              </p>
              <div className="control" role="group" aria-label="View as">
                <span>View as</span>
                <div className="segmented">
                  {(['gm', 'player'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={audience === option}
                      onClick={() => {
                        setAudience(option);
                        setScene('entry');
                      }}
                    >
                      {option === 'gm' ? 'Myself, the GM' : 'A player'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="inline-entry">
                <EntryFragment name={name} year={year} audience={audience} part="secret" />
              </div>
            </div>
          </section>

          <section id="manuscript" aria-labelledby="manuscript-title" data-scene="ink">
            <h2 id="manuscript-title" data-reveal>
              Write the book beside it
            </h2>
            <p className="lead" data-reveal>
              The manuscript lives in the same place as the world it describes. Names from your
              codex are recognised as you type, and every entry lists the scenes it appears in.
            </p>
            <InlineChart scene="ink" />
            <dl className="ledger" data-reveal>
              <div>
                <dt>Draft</dt>
                <dd>
                  Books, parts, chapters and scenes, saved as you write, with a quiet full-screen
                  mode.
                </dd>
              </div>
              <div>
                <dt>Plan</dt>
                <dd>
                  Plot boards laid out by beat and storyline, from three acts to kishōtenketsu.
                </dd>
              </div>
              <div>
                <dt>Check</dt>
                <dd>
                  A continuity checker that notices the dead walking, a narrator in two cities at
                  once, a child older than a parent.
                </dd>
              </div>
              <div>
                <dt>Send</dt>
                <dd>
                  Word in submission layout, EPUB, PDF, or Markdown and a full backup. It is your
                  book.
                </dd>
              </div>
            </dl>
          </section>

          <section id="table" aria-labelledby="table-title" data-scene="table">
            <h2 id="table-title" data-reveal>
              Run it at the table
            </h2>
            <p className="lead" data-reveal>
              Send your group a link. Each player joins with an account of their own and sees only
              what you have shared with them.
            </p>
            <InlineChart scene="table" />
            <ul className="plain-list" data-reveal>
              <li>A GM screen with dice, initiative, loot and clocks</li>
              <li>Handouts that reach players within seconds</li>
              <li>A quest log tied to the people and places involved</li>
              <li>Session notes that link to everything that came up</li>
              <li>Rollable tables that can call other tables</li>
              <li>Private journals for each player, readable by you</li>
            </ul>
          </section>
        </div>

        <Stage scene={scene}>
          <EntryFragment name={name} year={year} audience={audience} />
        </Stage>
      </div>

      <section className="box" aria-labelledby="box-title">
        <h2 id="box-title" data-reveal>
          All of it, in the box
        </h2>
        <div className="box-columns" data-reveal>
          {BOX.map((group) => (
            <ul key={group.kind}>
              <li className="box-kind">{group.kind}</li>
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <h2 id="closing-title" className="sr-only">
          Begin
        </h2>
        <p data-reveal>
          Put the first place on the map tonight. A world is free to start and yours to take away
          whenever you like.
        </p>
        <p data-reveal>
          <Link to="/sign-up" className="action">
            Start a world
          </Link>
          <Link to="/sign-in" className="text-link">
            Sign in
          </Link>
        </p>
      </section>

      <footer className="landing-footer">
        <p>Atlas &amp; Ink, a home for story worlds.</p>
        <p className="landing-footer-links">
          <a href="#atlas">Atlas</a>
          <a href="#codex">Codex</a>
          <a href="#manuscript">Manuscript</a>
          <Link to="/sign-up">Start a world</Link>
        </p>
        <p className="credits">
          Charts and manuscript leaf: Olaus Magnus, Abraham Ortelius, Braun and Hogenberg, Joan
          Blaeu and unknown hands of Genoa and Metz. All public domain, via{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Carta_Marina.jpeg">Wikimedia Commons</a>.
        </p>
      </footer>
    </div>
  );
}
