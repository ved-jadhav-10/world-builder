import { SpellCheck } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { LONG_SENTENCE_WORDS, MAX_WATCHED_WORDS, type WordCount } from '@atlas/shared';
import { useWordCheck } from '@/api/word-check-queries';
import { Input, Label, NativeSelect } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { useManuscriptTree } from '@/lib/manuscript-tree';
import { useDebounced } from '@/lib/use-debounced';
import { useWorld } from '@/lib/world-context';

const WATCH_KEY = 'atlas.wordcheck.watch';

function readWatch(): string {
  try {
    return localStorage.getItem(WATCH_KEY) ?? '';
  } catch {
    return '';
  }
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-serif text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A list of words with a bar for how often each is used. */
function WordBars({ words, empty }: { words: WordCount[]; empty: string }) {
  if (words.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...words.map((w) => w.count));
  return (
    <ul className="space-y-1">
      {words.map((w) => (
        <li key={w.word} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate font-medium">{w.word}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className="block h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max(4, (w.count / max) * 100)}%` }}
            />
          </span>
          <span className="tabular-nums text-muted-foreground">
            {w.count} <span className="text-xs">({w.perThousand}/1000)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** Habits in the writing: most used words, crutch words, adverbs and close repeats. */
export function WordCheckPage() {
  const { world } = useWorld();
  const { tree } = useManuscriptTree();
  const [nodeId, setNodeId] = useState('');
  const [watchText, setWatchText] = useState(readWatch);
  const watch = useDebounced(watchText.trim(), 400);
  const { data, isPending } = useWordCheck(world.id, nodeId, watch);

  // Everything in the manuscript in reading order, indented by depth, for choosing what to check.
  const options = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const node of tree.childrenOf(parentId)) {
        out.push({
          id: node.id,
          label: `${'  '.repeat(depth)}${node.title || 'Untitled'}`,
        });
        walk(node.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [tree]);

  function onWatch(value: string) {
    setWatchText(value);
    try {
      localStorage.setItem(WATCH_KEY, value);
    } catch {
      // Without storage the list is just not remembered.
    }
  }

  if (isPending) return <PageSpinner />;
  const check = data?.check;
  const notFound = check?.watched.filter((w) => w.count === 0).map((w) => w.word) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Writing</p>
        <h1 className="font-serif text-3xl font-semibold">Word check</h1>
        <p className="mt-1 text-muted-foreground">
          Where your prose leans on the same words. These are places to look, not rules: some
          repetition is style. Names from your Codex are left out of the lists.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wc-scope">Check</Label>
          <NativeSelect id="wc-scope" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
            <option value="">Whole manuscript</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wc-watch">Words to watch</Label>
          <Input
            id="wc-watch"
            value={watchText}
            maxLength={400}
            placeholder="suddenly, smirked, orbs"
            onChange={(e) => onWatch(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Separate with commas, up to {MAX_WATCHED_WORDS}. Remembered on this device only.
          </p>
        </div>
      </div>

      {!check || check.totalWords === 0 ? (
        <EmptyState icon={<SpellCheck />} title="Nothing to check yet">
          <p>
            {data?.scope.scenes
              ? 'The scenes here have no words in them yet.'
              : 'Write some scenes in the manuscript and come back.'}
          </p>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Words" value={check.totalWords.toLocaleString()} />
            <Stat label="Different words" value={check.uniqueWords.toLocaleString()} />
            <Stat label="Sentences" value={check.sentences.toLocaleString()} />
            <Stat label="Words per sentence" value={String(check.avgSentenceWords)} />
            <Stat
              label="Long sentences"
              value={String(check.longSentences)}
              hint={`over ${LONG_SENTENCE_WORDS} words`}
            />
            <Stat
              label="Adverbs"
              value={String(check.adverbs.perThousand)}
              hint="per 1,000 words"
            />
          </div>

          {watch ? (
            <Section title="Words you are watching" hint="Counted wherever they appear.">
              <WordBars
                words={check.watched.filter((w) => w.count > 0)}
                empty="None of those words appear here."
              />
              {notFound.length > 0 && notFound.length < check.watched.length ? (
                <p className="text-xs text-muted-foreground">Not found: {notFound.join(', ')}</p>
              ) : null}
            </Section>
          ) : null}

          <Section
            title="Most used words"
            hint="Words used three or more times, not counting small words or names."
          >
            <WordBars words={check.topWords} empty="No word is used three or more times." />
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              title="Crutch words"
              hint="Words that often pad or soften a sentence. Cut the ones that are not earning their place."
            >
              <WordBars words={check.crutchWords} empty="None of the usual crutch words." />
            </Section>
            <Section
              title="Adverbs"
              hint={`${check.adverbs.total} in all. Strong verbs often do the job alone.`}
            >
              <WordBars words={check.adverbs.top} empty="No adverbs ending in -ly." />
            </Section>
          </div>

          <Section
            title="Close repeats"
            hint="The same word again within a few words, with how many times it happened."
          >
            {check.closeRepeats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No word repeats this closely.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {check.closeRepeats.map((r) => (
                  <li key={r.word} className="rounded-full border px-3 py-1 text-sm">
                    {r.word} <span className="tabular-nums text-muted-foreground">×{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

export { WordCheckPage as Component };
