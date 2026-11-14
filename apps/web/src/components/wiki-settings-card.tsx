import { BookOpen, Copy, ExternalLink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useUpdateWikiSettings, useWikiSettings } from '@/api/wiki-queries';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/inputs';
import { Spinner } from '@/components/ui/misc';
import { useWorld } from '@/lib/world-context';

/** World settings › Reader wiki: turn the public, spoiler-safe wiki on and say how it behaves. */
export function WikiSettingsCard() {
  const { world } = useWorld();
  const settings = useWikiSettings(world.id);
  const update = useUpdateWikiSettings(world.id);
  const [password, setPassword] = useState('');
  const address = `${location.origin}/wiki/${world.slug}`;

  async function change(input: Parameters<typeof update.mutateAsync>[0], done: string) {
    try {
      await update.mutateAsync(input);
      toast.success(done);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function saveIntro(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await change({ intro: String(form.get('intro') ?? '') }, 'Welcome text saved');
  }

  const data = settings.data;
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <BookOpen className="size-4" /> Reader wiki
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A public, read-only companion to {world.name} that never spoils the book. Readers say
          which chapter they have reached and see each entry as it stood then: later names, facts
          and links stay hidden, and entries you hold back appear when their chapter is read. Only
          entries whose visibility is Public are shown.
        </p>
      </div>

      {!data ? (
        <Spinner />
      ) : !data.available ? (
        <p className="text-sm text-muted-foreground">
          Public wikis are switched off on this server.
        </p>
      ) : (
        <>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={data.enabled}
              disabled={update.isPending}
              onChange={(event) =>
                change(
                  { enabled: event.target.checked },
                  event.target.checked ? 'The wiki is open' : 'The wiki is closed',
                )
              }
            />
            <span>
              <span className="font-medium">Open the wiki</span>
              <span className="block text-muted-foreground">
                Anyone with the address can read it. Turn it off and the address stops working.
              </span>
            </span>
          </label>

          {data.enabled ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-[13px]">
                  {address}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(address);
                    toast.success('Address copied');
                  }}
                >
                  <Copy /> Copy
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/wiki/${world.slug}`} target="_blank" rel="noreferrer">
                    <ExternalLink /> Open
                  </a>
                </Button>
              </div>

              <form onSubmit={saveIntro} className="space-y-1.5" key={data.intro}>
                <Label htmlFor="wiki-intro">Welcome text</Label>
                <Textarea
                  id="wiki-intro"
                  name="intro"
                  defaultValue={data.intro}
                  maxLength={2000}
                  placeholder="A line or two for readers arriving at the wiki."
                />
                <Button type="submit" variant="outline" size="sm" disabled={update.isPending}>
                  Save welcome text
                </Button>
              </form>

              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={data.showChapterTitles}
                  disabled={update.isPending}
                  onChange={(event) => change({ showChapterTitles: event.target.checked }, 'Saved')}
                />
                <span>
                  <span className="font-medium">Show chapter titles</span>
                  <span className="block text-muted-foreground">
                    Off, readers pick “Chapter 7”. On, they see its title too, which can give things
                    away.
                  </span>
                </span>
              </label>

              <form
                className="space-y-1.5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!password) return;
                  await change({ password }, 'Password set');
                  setPassword('');
                }}
              >
                <Label htmlFor="wiki-password">
                  Password {data.hasPassword ? '(one is set)' : '(none: open to anyone)'}
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="wiki-password"
                    type="text"
                    autoComplete="off"
                    className="max-w-xs"
                    value={password}
                    maxLength={200}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={data.hasPassword ? 'A new password' : 'For beta readers'}
                  />
                  <Button type="submit" variant="outline" disabled={!password || update.isPending}>
                    {data.hasPassword ? 'Change' : 'Set password'}
                  </Button>
                  {data.hasPassword ? (
                    <Button
                      variant="ghost"
                      disabled={update.isPending}
                      onClick={() => change({ password: '' }, 'Password removed')}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Changing or removing it signs out everyone who used the old one.
                </p>
              </form>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
