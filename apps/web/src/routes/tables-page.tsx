import { Dices, FileUp, Plus, Table2, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  MAX_ROW_TEXT,
  MAX_ROW_WEIGHT,
  MAX_TABLE_ROWS,
  formatRange,
  parseTableText,
  rowRanges,
  totalWeight,
  type RollLogEntry,
  type RollTable,
  type Visibility,
} from '@atlas/shared';
import { ApiError, errorMessage } from '@/api/client';
import {
  useCreateTable,
  useDeleteTable,
  useRollTable,
  useTable,
  useTables,
  useUpdateTable,
} from '@/api/table-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RollPanel, RollResult } from '@/components/roll-panel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { FieldError, Input, Label, Textarea } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { VisibilityBadge, VisibilitySelect } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

interface DraftRow {
  key: string;
  weight: number;
  text: string;
}

const newKey = () => crypto.randomUUID();

function NewTableDialog({ onCreated }: { onCreated: (table: RollTable) => void }) {
  const { world } = useWorld();
  const create = useCreateTable(world.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    create.mutate(
      { name },
      {
        onSuccess: (table) => {
          setOpen(false);
          setName('');
          onCreated(table);
        },
        onError: (e) =>
          setError(
            e instanceof ApiError && e.status === 409
              ? 'You already have a table with that name'
              : errorMessage(e),
          ),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New table
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New table"
        description="Name it, then add the rows. Rows can have different weights, so some come up more often."
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="table-name">Name</Label>
            <Input
              id="table-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Random weather"
              aria-invalid={Boolean(error)}
            />
            <FieldError message={error} />
          </div>
          <DialogFooter className="mt-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ onImport }: { onImport: (rows: DraftRow[], replace: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseTableText(text), [text]);

  const run = (replace: boolean) => {
    onImport(
      parsed.rows.map((row) => ({ key: newKey(), ...row })),
      replace,
    );
    setOpen(false);
    setText('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileUp /> Import
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Import rows"
        description="Paste lines from a spreadsheet or a file. Start a line with a roll range to weight it, or just write the text."
        className="max-w-xl"
      >
        <div className="space-y-3">
          <Textarea
            aria-label="Rows to import"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'1-3, Rain\n4-6, Fog\n7-10, Clear skies'}
            className="min-h-40 font-mono text-[13px]"
          />
          <p className="text-xs text-muted-foreground">
            <code>1-3, Rain</code> counts as weight 3; <code>7, Fog</code> as 1; a line with no
            number as 1. Commas or tabs both work, and a header row is skipped. A header of{' '}
            <code>weight</code> reads the first column as weights.
          </p>
          {text.trim() ? (
            <div className="rounded-md border bg-muted/40 p-2 text-[13px]">
              <p className="font-medium">
                {parsed.rows.length} {parsed.rows.length === 1 ? 'row' : 'rows'} found
              </p>
              {parsed.notes.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {parsed.notes.slice(0, 5).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                  {parsed.notes.length > 5 ? <li>and {parsed.notes.length - 5} more</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="outline" disabled={!parsed.rows.length} onClick={() => run(true)}>
            Replace rows
          </Button>
          <Button disabled={!parsed.rows.length} onClick={() => run(false)}>
            Add to table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One table: its name, who sees it, and its rows. GMs edit and roll; everyone else reads. */
function TableView({ table }: { table: RollTable }) {
  const { world, base, canEdit, audience } = useWorld();
  const isGm = canEdit && audience === 'gm';
  const navigate = useNavigate();
  const update = useUpdateTable(world.id, table.id);
  const remove = useDeleteTable(world.id);
  const rollTable = useRollTable(world.id);

  const [name, setName] = useState(table.name);
  const [description, setDescription] = useState(table.description);
  const [visibility, setVisibility] = useState<Visibility>(table.visibility);
  const [rows, setRows] = useState<DraftRow[]>(() =>
    table.rows.map((row) => ({ key: row.id, weight: row.weight, text: row.text })),
  );
  const [last, setLast] = useState<RollLogEntry | null>(null);
  const [shareRoll, setShareRoll] = useState(false);
  const [error, setError] = useState<string>();
  const newRow = useRef<HTMLTextAreaElement | null>(null);

  const dirty =
    name !== table.name ||
    description !== table.description ||
    visibility !== table.visibility ||
    rows.length !== table.rows.length ||
    rows.some((row, i) => row.weight !== table.rows[i]!.weight || row.text !== table.rows[i]!.text);

  const ranges = rowRanges(rows);
  const total = totalWeight(rows);
  const picked = last?.kind === 'table' && last.detail.tableId === table.id ? last.detail : null;

  const save = () => {
    setError(undefined);
    update.mutate(
      {
        name,
        description,
        visibility,
        rows: rows.map(({ weight, text }) => ({ weight, text: text.trim() })),
      },
      {
        onSuccess: (saved) => {
          setRows(saved.rows.map((row) => ({ key: row.id, weight: row.weight, text: row.text })));
          toast.success('Table saved');
        },
        onError: (e) =>
          setError(
            e instanceof ApiError && e.status === 409
              ? 'You already have a table with that name'
              : errorMessage(e),
          ),
      },
    );
  };

  const setRow = (key: string, patch: Partial<DraftRow>) =>
    setRows((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const roll = () =>
    rollTable.mutate(
      { tableId: table.id, visibility: shareRoll ? 'player' : 'gm' },
      { onSuccess: setLast, onError: (e) => toast.error(errorMessage(e)) },
    );

  const blankRows = rows.some((row) => !row.text.trim());

  return (
    <article className="space-y-5">
      <header className="space-y-3">
        {isGm ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1 space-y-1.5">
                <Label htmlFor="table-title">Name</Label>
                <Input
                  id="table-title"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  className="font-serif text-lg font-semibold"
                  aria-invalid={Boolean(error)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="table-visibility">Who can see it</Label>
                <VisibilitySelect
                  id="table-visibility"
                  value={visibility}
                  onChange={setVisibility}
                />
              </div>
            </div>
            <FieldError message={error} />
            <div className="space-y-1.5">
              <Label htmlFor="table-description">Description</Label>
              <Textarea
                id="table-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
                className="min-h-14"
                placeholder="When to roll, and what the rows mean"
              />
            </div>
          </>
        ) : (
          <div>
            <h1 className="font-serif text-2xl font-semibold">{table.name}</h1>
            {table.description ? (
              <p className="mt-1 text-muted-foreground">{table.description}</p>
            ) : null}
          </div>
        )}
      </header>

      {isGm ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
          <Button onClick={roll} disabled={rollTable.isPending || dirty || total < 1}>
            <Dices /> Roll
            {total > 0 ? <span className="opacity-70">d{total}</span> : null}
          </Button>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              checked={shareRoll}
              onChange={(event) => setShareRoll(event.target.checked)}
              className="size-4 accent-primary"
            />
            Show to the players
          </label>
          {dirty ? (
            <span className="text-[13px] text-muted-foreground">Save your changes to roll.</span>
          ) : null}
          {last ? (
            <div
              className="basis-full rounded-lg border bg-muted/40 p-3 text-sm"
              aria-live="polite"
            >
              <RollResult entry={last} big />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-20 px-3 py-2 font-medium">Roll</th>
              {isGm ? <th className="w-24 px-3 py-2 font-medium">Weight</th> : null}
              <th className="px-3 py-2 font-medium">Result</th>
              {isGm ? <th className="w-10" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  No rows yet.
                </td>
              </tr>
            ) : null}
            {rows.map((row, index) => (
              <tr
                key={row.key}
                className={cn(
                  'border-t align-top',
                  picked && !dirty && picked.rowIndex === index && 'bg-accent',
                )}
              >
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  {formatRange(ranges[index]!)}
                </td>
                {isGm ? (
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      aria-label={`Weight of row ${index + 1}`}
                      min={1}
                      max={MAX_ROW_WEIGHT}
                      value={row.weight}
                      onChange={(event) =>
                        setRow(row.key, {
                          weight: Math.min(
                            MAX_ROW_WEIGHT,
                            Math.max(1, Math.floor(Number(event.target.value)) || 1),
                          ),
                        })
                      }
                      className="h-8 w-20 px-2"
                    />
                  </td>
                ) : null}
                <td className="px-3 py-1.5">
                  {isGm ? (
                    <Textarea
                      aria-label={`Result of row ${index + 1}`}
                      ref={index === rows.length - 1 ? newRow : undefined}
                      value={row.text}
                      maxLength={MAX_ROW_TEXT}
                      onChange={(event) => setRow(row.key, { text: event.target.value })}
                      className="min-h-8 min-w-56 resize-none px-2 py-1"
                      rows={1}
                    />
                  ) : (
                    <span className="block py-0.5">{row.text}</span>
                  )}
                </td>
                {isGm ? (
                  <td className="px-1 py-1.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove row ${index + 1}`}
                      onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isGm ? (
        <>
          <p className="text-xs text-muted-foreground">
            A row's weight is how many numbers on the die it covers. Write <code>[[2d6]]</code> in a
            result to roll dice there, and <code>{'{{Other table}}'}</code> to roll another table
            and put its result in.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length >= MAX_TABLE_ROWS}
              onClick={() => {
                setRows((list) => [...list, { key: newKey(), weight: 1, text: '' }]);
                setTimeout(() => newRow.current?.focus(), 0);
              }}
            >
              <Plus /> Add row
            </Button>
            <ImportDialog
              onImport={(imported, replace) =>
                setRows((list) => [...(replace ? [] : list), ...imported].slice(0, MAX_TABLE_ROWS))
              }
            />
            <div className="ml-auto flex items-center gap-2">
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm">
                    <Trash2 /> Delete table
                  </Button>
                }
                title={`Delete “${table.name}”?`}
                description="The table and its rows are removed for good. Tables that chain to it will show a note instead."
                onConfirm={() =>
                  remove.mutateAsync(table.id).then(
                    () => navigate(`${base}/tables`),
                    (e) => toast.error(errorMessage(e)),
                  )
                }
              />
              <Button
                onClick={save}
                disabled={!dirty || update.isPending || !name.trim() || blankRows}
              >
                Save changes
              </Button>
            </div>
          </div>
          {blankRows ? (
            <p className="text-[13px] text-muted-foreground">
              Fill in or remove the empty rows before saving.
            </p>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

function TableLoader({ tableId }: { tableId: string }) {
  const { world } = useWorld();
  const { data: table, isPending, error } = useTable(world.id, tableId);
  if (isPending) return <PageSpinner />;
  if (error || !table) {
    return (
      <EmptyState icon={<Table2 />} title="Table not found">
        <p>It may have been deleted, or it is not shared with you.</p>
      </EmptyState>
    );
  }
  // Re-seed the editor from the server whenever a different version is loaded.
  return <TableView key={`${table.id}:${table.updatedAt}`} table={table} />;
}

export function TablesPage() {
  const { world, base, canEdit, audience } = useWorld();
  const isGm = canEdit && audience === 'gm';
  const { tableId } = useParams();
  const navigate = useNavigate();
  const { data: tables, isPending } = useTables(world.id);

  if (isPending) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Game tools</p>
          <h1 className="font-serif text-3xl font-semibold">Tables and dice</h1>
          <p className="mt-1 text-muted-foreground">
            Random tables for encounters, loot, weather and rumours, with dice and a roll log.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
        <aside aria-label="Tables" className="space-y-3">
          {isGm ? <NewTableDialog onCreated={(t) => navigate(`${base}/tables/${t.id}`)} /> : null}
          {tables?.length ? (
            <ul className="space-y-0.5">
              {tables.map((t) => (
                <li key={t.id}>
                  <NavLink
                    to={`${base}/tables/${t.id}`}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted',
                        isActive && 'bg-accent font-medium',
                      )
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    <VisibilityBadge visibility={t.visibility} />
                    <span className="text-xs tabular-nums text-muted-foreground">{t.rowCount}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isGm ? 'No tables yet.' : 'No tables have been shared with you.'}
            </p>
          )}
        </aside>

        <div className="min-w-0">
          {tableId ? (
            <TableLoader tableId={tableId} />
          ) : (
            <EmptyState icon={<Table2 />} title={tables?.length ? 'Pick a table' : 'No tables yet'}>
              <p>
                {isGm
                  ? 'A table is a list of results with weights: roll it for a random encounter, a bit of loot or the weather. Rows can roll dice and other tables.'
                  : 'Tables the GM shares with you appear here.'}
              </p>
            </EmptyState>
          )}
        </div>

        <RollPanel className="lg:col-span-2 xl:col-span-1" />
      </div>
    </div>
  );
}

export { TablesPage as Component };
