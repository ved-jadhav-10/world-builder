import { CircleAlert, Info, RefreshCw, ShieldCheck, Undo2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  CONTINUITY_RULES,
  CONTINUITY_RULE_INFO,
  describeFinding,
  formatDate,
  type ContinuityFinding,
  type ContinuityReport,
  type ContinuityRule,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useContinuity, useDismissFinding } from '@/api/continuity-queries';
import { EntityIcon } from '@/components/entity-icon';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { Badge, EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

function FindingCard({
  finding,
  report,
  dismissed,
  onToggle,
}: {
  finding: ContinuityFinding;
  report: ContinuityReport;
  dismissed: boolean;
  onToggle: () => void;
}) {
  const { base, calendar, typeById } = useWorld();
  const entities = useMemo(() => new Map(report.entities.map((e) => [e.id, e])), [report]);
  const scenes = useMemo(() => new Map(report.scenes.map((s) => [s.id, s])), [report]);
  const { title, detail } = describeFinding(
    finding,
    {
      entityName: (id) => entities.get(id)?.name ?? 'Someone',
      formatDay: (day) => formatDate(calendar, day),
    },
    new Map(Object.entries(report.linkLabels)),
  );
  // Locations in a "two places" finding come after the narrator; they are shown too.
  const shownEntities = finding.entityIds
    .map((id) => entities.get(id))
    .filter((e) => e !== undefined);

  return (
    <li
      className={cn(
        'space-y-2 rounded-xl border border-l-4 bg-card p-3',
        finding.severity === 'warning' ? 'border-l-amber-500' : 'border-l-slate-300',
        dismissed && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium leading-snug">{title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
        </div>
        <Badge className="gap-1 text-muted-foreground">
          {finding.severity === 'warning' ? (
            <CircleAlert className="size-3" />
          ) : (
            <Info className="size-3" />
          )}
          {CONTINUITY_RULE_INFO[finding.rule].label}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-label={`${dismissed ? 'Bring back' : 'Dismiss'}: ${title}`}
        >
          {dismissed ? (
            <>
              <Undo2 /> Bring back
            </>
          ) : (
            <>
              <X /> It’s intended
            </>
          )}
        </Button>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {shownEntities.map((entity) => {
          const type = typeById.get(entity.typeId);
          return (
            <li key={entity.id}>
              <Link
                to={`${base}/e/${entity.id}`}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
              >
                <EntityIcon
                  icon={type?.icon ?? 'file-text'}
                  color={type?.color}
                  className="size-3"
                />
                {entity.name}
              </Link>
            </li>
          );
        })}
        {finding.sceneIds.map((id) => (
          <li key={id}>
            <Link
              to={`${base}/manuscript/s/${id}`}
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs hover:bg-muted"
            >
              Scene: {scenes.get(id)?.title ?? 'Untitled'}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function ContinuityPage() {
  const { world } = useWorld();
  const { data: report, isPending, isError, error, isFetching, refetch } = useContinuity(world.id);
  const dismiss = useDismissFinding(world.id);
  const [rule, setRule] = useState<ContinuityRule | ''>('');
  const [showDismissed, setShowDismissed] = useState(false);

  if (isPending) return <PageSpinner />;
  if (isError || !report) {
    return (
      <EmptyState icon={<ShieldCheck />} title="The continuity checker is for the GM">
        <p>{error ? errorMessage(error) : 'Switch back to your own view to use it.'}</p>
      </EmptyState>
    );
  }

  const toggle = (finding: ContinuityFinding, restore: boolean) =>
    dismiss.mutate({ key: finding.key, restore }, { onError: (e) => toast.error(errorMessage(e)) });
  const counts = new Map<ContinuityRule, number>();
  for (const f of report.findings) counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1);
  const shown = report.findings.filter((f) => !rule || f.rule === rule);
  const warnings = shown.filter((f) => f.severity === 'warning');
  const notices = shown.filter((f) => f.severity === 'notice');

  const list = (title: string, items: ContinuityFinding[], hint: string) =>
    items.length > 0 ? (
      <section aria-label={title} className="space-y-2">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground">{items.length}</span>
          <span className="text-xs font-normal text-muted-foreground">{hint}</span>
        </h2>
        <ul className="space-y-2">
          {items.map((f) => (
            <FindingCard
              key={f.key}
              finding={f}
              report={report}
              dismissed={false}
              onToggle={() => toggle(f, false)}
            />
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Writing</p>
          <h1 className="font-serif text-3xl font-semibold">Continuity</h1>
          <p className="mt-1 text-muted-foreground">
            Checked {report.checked.entries} {report.checked.entries === 1 ? 'entry' : 'entries'},{' '}
            {report.checked.scenes} {report.checked.scenes === 1 ? 'scene' : 'scenes'} and{' '}
            {report.checked.links} {report.checked.links === 1 ? 'link' : 'links'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label="Show one kind of finding"
            className="w-auto"
            value={rule}
            onChange={(event) => setRule(event.target.value as ContinuityRule | '')}
          >
            <option value="">All kinds ({report.findings.length})</option>
            {CONTINUITY_RULES.filter((r) => counts.has(r)).map((r) => (
              <option key={r} value={r}>
                {CONTINUITY_RULE_INFO[r].label} ({counts.get(r)})
              </option>
            ))}
          </NativeSelect>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn(isFetching && 'animate-spin')} /> Check again
          </Button>
        </div>
      </div>

      <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        This looks for things in your story that cannot all be true, using the dates on entries and
        scenes, who each scene mentions, and links that hold for a time. It points out candidates; a
        flashback or a ghost can be on purpose, so mark those “it’s intended” and they stay quiet
        until something about them changes.
      </p>

      {report.findings.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="No contradictions found">
          <p>
            {report.checked.scenes === 0
              ? 'Nothing to check against yet. Give scenes an in-world date and entries start and end dates (born, died, founded, fallen), and this page will watch for clashes between them.'
              : 'Everything with a date lines up. The more dates your entries and scenes carry, the more this can check.'}
          </p>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {list('Warnings', warnings, 'Likely mistakes.')}
          {list('Notices', notices, 'Worth a look, often fine.')}
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing of that kind.</p>
          ) : null}
        </div>
      )}

      {report.dismissed.length > 0 ? (
        <section aria-label="Dismissed" className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setShowDismissed((v) => !v)}>
            {showDismissed ? 'Hide' : 'Show'} {report.dismissed.length} marked as intended
          </Button>
          {showDismissed ? (
            <ul className="space-y-2">
              {report.dismissed.map((f) => (
                <FindingCard
                  key={f.key}
                  finding={f}
                  report={report}
                  dismissed
                  onToggle={() => toggle(f, true)}
                />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export { ContinuityPage as Component };
