import { DEFAULT_CALENDAR, dayToDate, formatDate, formatYear } from './calendar';
import { richTextToMarkdown } from './markdown';
import type { CalendarDef } from './schemas/calendar';
import type { FieldDefinition } from './schemas/entity-type';
import type { WorldExport } from './types';

/*
 * A world as a folder of Markdown notes, in the shape Obsidian and other note apps expect: one
 * file per entry with YAML front-matter, wikilinks between them, the manuscript as chapters of
 * scenes, and the full JSON export alongside for a lossless copy.
 */

export interface MarkdownFile {
  /** Path inside the export, with forward slashes. */
  path: string;
  content: string;
}

export interface MarkdownExportOptions {
  /** Gallery image ID -> its path inside the export, for the pictures that are included. */
  imagePaths?: ReadonlyMap<string, string>;
}

// ---- Names and paths ---------------------------------------------------------------------

/**
 * A fixed order for naming files: names compared without case, then by ID. `localeCompare` would
 * order "The" and "the" differently on different machines, changing which note gets a "(2)".
 */
const byName = (a: { name: string; id: string }, b: { name: string; id: string }) => {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A name safe to use as a file or folder name on Windows, macOS and Linux. */
export function safeName(name: string, fallback = 'Untitled'): string {
  let cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).trim();
  if (!cleaned) return fallback;
  return RESERVED.test(cleaned) ? `${cleaned}_` : cleaned;
}

/** Hands out names that are unique within a folder, ignoring case (some file systems do). */
class Names {
  private used = new Map<string, Set<string>>();

  unique(folder: string, name: string, fallback?: string): string {
    const taken = this.used.get(folder) ?? new Set<string>();
    this.used.set(folder, taken);
    const base = safeName(name, fallback);
    let candidate = base;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})`;
    taken.add(candidate.toLowerCase());
    return candidate;
  }
}

// ---- YAML front-matter -------------------------------------------------------------------

function yamlLines(key: string, value: unknown, indent: number): string[] {
  const pad = ' '.repeat(indent);
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.length ? [`${pad}${key}: ${JSON.stringify(value)}`] : [];
  if (typeof value === 'object') {
    const inner = Object.entries(value).flatMap(([k, v]) => yamlLines(k, v, indent + 2));
    return inner.length ? [`${pad}${key}:`, ...inner] : [];
  }
  // JSON strings are valid YAML double-quoted strings, so any text is safe to write this way.
  return [`${pad}${key}: ${typeof value === 'string' ? JSON.stringify(value) : String(value)}`];
}

function frontMatter(data: Record<string, unknown>): string {
  const lines = Object.entries(data).flatMap(([key, value]) => yamlLines(key, value, 0));
  return `---\n${lines.join('\n')}\n---\n\n`;
}

const keyFor = (label: string, fallback: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;

// ---- The export ------------------------------------------------------------------------------

function fieldText(def: FieldDefinition, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (def.type === 'url' && typeof value === 'string') return `<${value}>`;
  return String(value);
}

export function worldToMarkdown(
  data: WorldExport,
  options: MarkdownExportOptions = {},
): MarkdownFile[] {
  const root = safeName(data.world.slug, 'world');
  const calendar: CalendarDef = data.calendar?.definition ?? DEFAULT_CALENDAR;
  const names = new Names();
  const files: MarkdownFile[] = [];
  const add = (path: string, content: string) => files.push({ path: `${root}/${path}`, content });

  const typeById = new Map(data.entityTypes.map((t) => [t.id, t]));
  const relTypeById = new Map(data.relationshipTypes.map((t) => [t.id, t]));
  const tagById = new Map(data.tags.map((t) => [t.id, t.name]));
  const entityById = new Map(data.entities.map((e) => [e.id, e]));
  const sceneById = new Map(data.manuscript.map((n) => [n.id, n]));
  const mapById = new Map(data.atlas.maps.map((m) => [m.id, m]));

  // Decide every file's path first, so notes can link to each other.
  const entityPath = new Map<string, string>(); // vault-relative, without ".md"
  for (const entity of [...data.entities].sort(byName)) {
    const folder = `Codex/${safeName(typeById.get(entity.typeId)?.name ?? 'Entries', 'Entries')}`;
    entityPath.set(entity.id, `${folder}/${names.unique(folder, entity.name)}`);
  }
  const mapPath = new Map<string, string>();
  for (const map of [...data.atlas.maps].sort(byName)) {
    mapPath.set(map.id, `Atlas/${names.unique('Atlas', map.name)}`);
  }

  // The manuscript: Book / Part / Chapter / Scene, numbered so folders sort in reading order.
  const kids = new Map<string | null, typeof data.manuscript>();
  for (const node of data.manuscript)
    kids.set(node.parentId, [...(kids.get(node.parentId) ?? []), node]);
  for (const list of kids.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  const scenePath = new Map<string, string>();
  const contents: string[] = [];
  const walk = (parentId: string | null, folder: string, depth: number) => {
    (kids.get(parentId) ?? []).forEach((node, index) => {
      const numbered = `${String(index + 1).padStart(2, '0')} ${node.title}`;
      if (node.kind === 'scene') {
        const stem = names.unique(folder, numbered);
        scenePath.set(node.id, `${folder}/${stem}`);
        return;
      }
      const dir = `${folder}/${names.unique(folder, numbered)}`;
      contents.push(`${'  '.repeat(depth)}- ${node.title}`);
      walk(node.id, dir, depth + 1);
    });
  };
  walk(null, 'Manuscript', 0);

  const link = (path: string | undefined, label: string) =>
    path ? `[[${path}|${label.replace(/[\]|]/g, ' ')}]]` : label;
  const entityLink = (id: string) =>
    link(entityPath.get(id), entityById.get(id)?.name ?? 'Unknown');
  const when = (day: number | null) => (day === null ? '' : formatDate(calendar, day));
  const span = (from: number | null, to: number | null) =>
    from === null && to === null
      ? ''
      : `${from === null ? '…' : when(from)} to ${to === null ? '…' : when(to)}`;
  const imageEmbeds = (entityId: string | null) =>
    data.gallery
      .filter((image) => image.entityId === entityId && options.imagePaths?.has(image.id))
      .map((image) => {
        const path = options.imagePaths!.get(image.id)!;
        return `![[${path}]]${image.caption ? `\n*${image.caption}*` : ''}`;
      });

  // ---- Codex ----
  for (const entity of data.entities) {
    const type = typeById.get(entity.typeId);
    const startKey = keyFor(type?.startLabel ?? '', 'start');
    const endKey = keyFor(type?.endLabel ?? '', 'end');
    const fields = Object.fromEntries(
      (type?.fieldSchema ?? [])
        .filter((def) => entity.fields[def.key] !== undefined && entity.fields[def.key] !== null)
        .map((def) => [def.key, entity.fields[def.key]]),
    );
    let note = frontMatter({
      id: entity.id,
      type: type?.name,
      aliases: entity.aliases,
      tags: entity.tagIds.map((id) => tagById.get(id)).filter(Boolean),
      visibility: entity.visibility,
      [startKey]: when(entity.startDay),
      [endKey]: when(entity.endDay),
      [`${startKey}_day`]: entity.startDay,
      [`${endKey}_day`]: entity.endDay,
      fields,
    });
    note += `# ${entity.name}\n\n`;
    if (entity.summary) note += `> ${entity.summary.replace(/\n/g, '\n> ')}\n\n`;
    const body = richTextToMarkdown(entity.body);
    if (body) note += `${body}\n\n`;

    const details = (type?.fieldSchema ?? [])
      .map((def) => [def.label, fieldText(def, entity.fields[def.key])] as const)
      .filter(([, text]) => text);
    if (details.length) {
      note += `## Details\n\n${details.map(([label, text]) => `- **${label}:** ${text}`).join('\n')}\n\n`;
    }

    const links = data.relationships
      .filter((r) => r.sourceId === entity.id || r.targetId === entity.id)
      .map((r) => {
        const outgoing = r.sourceId === entity.id;
        const relType = relTypeById.get(r.typeId);
        const other = outgoing ? r.targetId : r.sourceId;
        const label = (outgoing ? relType?.label : relType?.inverseLabel) ?? 'linked to';
        const period = span(r.validFromDay, r.validToDay);
        return `- ${label} ${entityLink(other)}${period ? ` (${period})` : ''}${r.notes ? ` — ${r.notes}` : ''}`;
      });
    if (links.length) note += `## Relationships\n\n${links.join('\n')}\n\n`;

    const history = data.progressions
      .filter((p) => p.entityId === entity.id)
      .map((p) => {
        const anchor = p.sceneId
          ? link(scenePath.get(p.sceneId), sceneById.get(p.sceneId)?.title ?? 'a deleted scene')
          : p.day !== null
            ? when(p.day)
            : 'not placed';
        const changes = [
          ...Object.entries(p.changes.fields ?? {}).map(([key, value]) => {
            const def = type?.fieldSchema.find((f) => f.key === key);
            const text = def ? fieldText(def, value) : String(value ?? '');
            return text ? `${def?.label ?? key}: ${text}` : `${def?.label ?? key} cleared`;
          }),
          ...(p.changes.summary !== undefined ? ['summary changed'] : []),
        ];
        return `- **${p.title}** (${anchor})${changes.length ? ` — ${changes.join('; ')}` : ''}${p.note ? `\n  ${p.note.replace(/\n/g, '\n  ')}` : ''}`;
      });
    if (history.length) note += `## Changes over time\n\n${history.join('\n')}\n\n`;

    const onMaps = [
      ...data.atlas.maps
        .filter((m) => m.entityId === entity.id)
        .map((m) => `- ${link(mapPath.get(m.id), m.name)} (the map of this place)`),
      ...data.atlas.features
        .filter((f) => f.entityId === entity.id)
        .map(
          (f) =>
            `- ${link(mapPath.get(f.mapId), mapById.get(f.mapId)?.name ?? 'a map')} (${f.kind})`,
        ),
    ];
    if (onMaps.length) note += `## On the map\n\n${onMaps.join('\n')}\n\n`;

    const pictures = imageEmbeds(entity.id);
    if (pictures.length) note += `## Gallery\n\n${pictures.join('\n\n')}\n\n`;
    add(`${entityPath.get(entity.id)}.md`, `${note.trimEnd()}\n`);
  }

  // ---- Manuscript ----
  for (const scene of data.manuscript.filter((n) => n.kind === 'scene')) {
    const parent = (id: string | null, kind: string) => {
      for (
        let n = id ? sceneById.get(id) : undefined;
        n;
        n = n.parentId ? sceneById.get(n.parentId) : undefined
      ) {
        if (n.kind === kind) return n.title;
      }
      return undefined;
    };
    let note = frontMatter({
      id: scene.id,
      book: parent(scene.parentId, 'book'),
      chapter: parent(scene.parentId, 'chapter'),
      pov: scene.povId ? entityById.get(scene.povId)?.name : undefined,
      location: scene.locationId ? entityById.get(scene.locationId)?.name : undefined,
      date: when(scene.inWorldDay) || scene.inWorldDate,
      day: scene.inWorldDay,
      words: scene.wordCount,
    });
    note += `# ${scene.title}\n\n`;
    if (scene.summary) note += `> ${scene.summary.replace(/\n/g, '\n> ')}\n\n`;
    const body = richTextToMarkdown(scene.body);
    if (body) note += `${body}\n`;
    const context = [
      scene.povId && entityPath.has(scene.povId) ? `Point of view: ${entityLink(scene.povId)}` : '',
      scene.locationId && entityPath.has(scene.locationId)
        ? `Location: ${entityLink(scene.locationId)}`
        : '',
    ].filter(Boolean);
    if (context.length) note += `\n---\n${context.join('  \n')}\n`;
    add(`${scenePath.get(scene.id)}.md`, note);
  }
  if (data.manuscript.length) {
    const scenes = data.manuscript.filter((n) => n.kind === 'scene');
    const words = scenes.reduce((sum, s) => sum + s.wordCount, 0);
    add(
      'Manuscript/Contents.md',
      `# Manuscript\n\n${words.toLocaleString('en-US')} words in ${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}.\n\n${contents.join('\n')}\n\n## Scenes\n\n${scenes
        .map((s) => `- ${link(scenePath.get(s.id), s.title)}`)
        .join('\n')}\n`,
    );
  }

  // ---- Atlas ----
  for (const map of data.atlas.maps) {
    const features = data.atlas.features.filter((f) => f.mapId === map.id);
    let note = frontMatter({
      id: map.id,
      parent: map.parentId ? mapById.get(map.parentId)?.name : undefined,
      shows: map.entityId ? entityById.get(map.entityId)?.name : undefined,
      visibility: map.visibility,
      width: map.width,
      height: map.height,
    });
    note += `# ${map.name}\n\n`;
    if (map.description) note += `${map.description}\n\n`;
    note += '*The map image is not included in this export; keep your original file.*\n\n';
    if (map.parentId && mapPath.has(map.parentId))
      note += `Inside: ${link(mapPath.get(map.parentId), mapById.get(map.parentId)!.name)}\n\n`;
    if (map.entityId && entityPath.has(map.entityId))
      note += `Shows: ${entityLink(map.entityId)}\n\n`;
    if (features.length) {
      note += `## On this map\n\n${features
        .map((f) => {
          const name =
            f.label ||
            (f.entityId ? entityById.get(f.entityId)?.name : '') ||
            `(unnamed ${f.kind})`;
          const where =
            f.points.length === 1
              ? ` at ${Math.round(f.points[0]![0] * 100)}% across, ${Math.round(f.points[0]![1] * 100)}% down`
              : ` with ${f.points.length} points`;
          const targets = [
            f.entityId && entityPath.has(f.entityId) ? `about ${entityLink(f.entityId)}` : '',
            f.linkMapId && mapPath.has(f.linkMapId)
              ? `opens ${link(mapPath.get(f.linkMapId), mapById.get(f.linkMapId)!.name)}`
              : '',
          ].filter(Boolean);
          return `- **${name}** (${f.kind})${where}${targets.length ? `, ${targets.join(', ')}` : ''}${f.notes ? ` — ${f.notes}` : ''}`;
        })
        .join('\n')}\n`;
    }
    add(`${mapPath.get(map.id)}.md`, note.trimEnd() + '\n');
  }

  // ---- Timeline ----
  type Moment = { day: number; text: string };
  const moments: Moment[] = [];
  for (const entity of data.entities) {
    const type = typeById.get(entity.typeId);
    const kind = type?.name ?? 'Entry';
    if (entity.startDay !== null) {
      moments.push({
        day: entity.startDay,
        text: `**${type?.startLabel ?? 'Starts'}:** ${entityLink(entity.id)} (${kind})`,
      });
    }
    if (entity.endDay !== null) {
      moments.push({
        day: entity.endDay,
        text: `**${type?.endLabel ?? 'Ends'}:** ${entityLink(entity.id)} (${kind})`,
      });
    }
  }
  for (const scene of data.manuscript.filter((n) => n.kind === 'scene' && n.inWorldDay !== null)) {
    moments.push({
      day: scene.inWorldDay!,
      text: `**Scene:** ${link(scenePath.get(scene.id), scene.title)}`,
    });
  }
  if (moments.length) {
    moments.sort((a, b) => a.day - b.day);
    let body = '# Timeline\n';
    let year: number | null = null;
    for (const moment of moments) {
      const date = dayToDate(calendar, moment.day);
      if (date.year !== year) {
        year = date.year;
        body += `\n## ${formatYear(calendar, year)}\n\n`;
      }
      body += `- ${when(moment.day)} — ${moment.text}\n`;
    }
    add('Timeline.md', body);
  }

  // ---- Calendar ----
  {
    const cal = calendar;
    const leap = cal.leapRules.map((r) => {
      const exceptions = r.skipEvery
        ? `, except every ${r.skipEvery}${r.restoreEvery ? ` unless also every ${r.restoreEvery}` : ''}`
        : '';
      return `- +${r.extraDays} ${r.extraDays === 1 ? 'day' : 'days'} in ${cal.months[r.monthIndex]?.name ?? 'a month'} every ${r.every} years${r.offset ? ` (from year ${r.offset})` : ''}${exceptions}`;
    });
    add(
      'Calendar.md',
      `# ${data.calendar?.name ?? 'Calendar'}\n\n## Months\n\n${cal.months.map((m, i) => `${i + 1}. ${m.name}: ${m.days} days`).join('\n')}\n\n## Week\n\n${cal.weekdays.join(', ')}\n` +
        (leap.length ? `\n## Leap years\n\n${leap.join('\n')}\n` : '') +
        (cal.eras.length
          ? `\n## Eras\n\n${cal.eras.map((e) => `- ${e.name}${e.abbreviation ? ` (${e.abbreviation})` : ''}: year 1 is year ${e.startYear}`).join('\n')}\n`
          : '') +
        (cal.moons.length
          ? `\n## Moons\n\n${cal.moons.map((m) => `- ${m.name}: ${m.cycleDays}-day cycle`).join('\n')}\n`
          : '') +
        `\nDates are stored as a count of days from the first day of year 0.\n`,
    );
  }

  // ---- World gallery ----
  const worldPictures = imageEmbeds(null);
  if (worldPictures.length)
    add('Gallery/Gallery.md', `# Gallery\n\n${worldPictures.join('\n\n')}\n`);

  // ---- Overview ----
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  add(
    'README.md',
    `# ${data.world.name}\n\n${data.world.description ? `${data.world.description}\n\n` : ''}Exported ${data.exportedAt.slice(0, 10)} from Atlas & Ink.\n\n## What is here\n\n- **Codex/**: ${count(data.entities.length, 'entry', 'entries')}, one note each, in a folder per type\n- **Manuscript/**: ${count(data.manuscript.filter((n) => n.kind === 'scene').length, 'scene', 'scenes')} in reading order (start with Contents)\n- **Atlas/**: ${count(data.atlas.maps.length, 'map', 'maps')} with their pins and shapes (images not included)\n- **Timeline.md** and **Calendar.md**\n- **world.json**: everything above in one file, for a lossless copy\n\nOpen this folder as a vault in Obsidian and the links between notes work. Each note's front-matter says who it is visible to in Atlas & Ink (\`visibility\`), so you can filter before sharing anything.\n`,
  );
  return files;
}
