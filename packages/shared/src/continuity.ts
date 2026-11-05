/**
 * The continuity checker: rules over what the world already knows (dates on entries, dates and
 * point of view on scenes, who is mentioned where, and links with periods) that find things that
 * cannot all be true. It is a pure function of plain data, so the server only loads rows and the
 * tests can set up any story they like.
 *
 * It points out candidates, it does not judge: a flashback, a ghost or a memorial can all
 * "appear after death" on purpose. Every finding has a stable key so a writer can dismiss the
 * ones that are intended, and a dismissed finding only comes back if the facts behind it change.
 */

export const CONTINUITY_RULES = [
  'after_end',
  'before_start',
  'pov_outside_life',
  'parent_after_child',
  'child_after_parent_end',
  'link_outside_life',
  'two_owners',
  'two_places',
] as const;
export type ContinuityRule = (typeof CONTINUITY_RULES)[number];
export type ContinuitySeverity = 'warning' | 'notice';

export const CONTINUITY_RULE_INFO: Record<ContinuityRule, { label: string; explanation: string }> =
  {
    after_end: {
      label: 'Appears after the end',
      explanation:
        'An entry with an end date (a death, a fall) is mentioned in a scene set after it. A memory, a ghost or a ruin can be on purpose: dismiss it.',
    },
    before_start: {
      label: 'Appears before the start',
      explanation:
        'An entry with a start date (a birth, a founding) is mentioned in a scene set before it. Flashbacks and prophecies are fine: dismiss them.',
    },
    pov_outside_life: {
      label: 'Narrates outside their life',
      explanation:
        'A scene is told from the point of view of someone who, by their dates, was not alive and present on the scene’s date.',
    },
    parent_after_child: {
      label: 'Parent born after child',
      explanation: 'A “parent of” link where the parent’s start date is not before the child’s.',
    },
    child_after_parent_end: {
      label: 'Child born long after the parent’s end',
      explanation:
        'A “parent of” link where the child was born more than a year after the parent ended.',
    },
    link_outside_life: {
      label: 'Link outside someone’s life',
      explanation:
        'A link that starts before one of its two entries began, or after it ended, such as a marriage that starts after a death.',
    },
    two_owners: {
      label: 'Two owners at once',
      explanation:
        'Two “owns” links point at the same item and their periods overlap. Add an end date to the earlier one if ownership passed on.',
    },
    two_places: {
      label: 'In two places at once',
      explanation:
        'Scenes told by the same character on the same day are set in different locations. Travel between them may be possible: this only notes it.',
    },
  };

export interface ContinuityEntity {
  id: string;
  name: string;
  /** Characters are held to a stricter standard than places and things: see `severity`. */
  kind: 'person' | 'other';
  startDay: number | null;
  endDay: number | null;
}
export interface ContinuityScene {
  id: string;
  title: string;
  povId: string | null;
  locationId: string | null;
  /** The scene's in-world day; scenes with none are not checked against dates. */
  day: number | null;
}
export interface ContinuityLink {
  id: string;
  sourceId: string;
  targetId: string;
  /** The relationship type's key, such as "parent_of" or "owns". */
  type: string;
  /** Read from the source: "spouse of". */
  label: string;
  fromDay: number | null;
  toDay: number | null;
}
export interface ContinuityInput {
  entities: ContinuityEntity[];
  scenes: ContinuityScene[];
  mentions: { sceneId: string; entityId: string }[];
  links: ContinuityLink[];
  /** About how long a year is in this world's calendar, for "more than a year later". */
  daysPerYear: number;
}

export interface ContinuityFinding {
  /** Stable while the facts behind the finding are unchanged; used to dismiss it. */
  key: string;
  rule: ContinuityRule;
  severity: ContinuitySeverity;
  /** The entries involved, the main one first. */
  entityIds: string[];
  sceneIds: string[];
  linkIds: string[];
  /** The dates involved, for showing in the world's calendar. */
  days: number[];
}

/** A short stable hash, so a key can stand for a list of ids without being as long as the list. */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

const sorted = (ids: string[]) => [...new Set(ids)].sort();

const SEVERITY_ORDER: Record<ContinuitySeverity, number> = { warning: 0, notice: 1 };

export function checkContinuity(input: ContinuityInput): ContinuityFinding[] {
  const entity = new Map(input.entities.map((e) => [e.id, e]));
  const sceneById = new Map(input.scenes.map((s) => [s.id, s]));
  const findings: ContinuityFinding[] = [];
  const severityFor = (e: ContinuityEntity): ContinuitySeverity =>
    e.kind === 'person' ? 'warning' : 'notice';

  // Who is the point of view of which scenes, so a narrator is reported once, as a narrator.
  const povScenes = new Map<string, ContinuityScene[]>();
  for (const scene of input.scenes) {
    if (scene.povId && entity.has(scene.povId)) {
      povScenes.set(scene.povId, [...(povScenes.get(scene.povId) ?? []), scene]);
    }
  }
  const isPov = (entityId: string, sceneId: string) =>
    povScenes.get(entityId)?.some((s) => s.id === sceneId) ?? false;

  // ---- Scenes against the dates of the entries they mention ----
  const mentioned = new Map<string, Set<string>>(); // entity -> scenes
  for (const { sceneId, entityId } of input.mentions) {
    if (!entity.has(entityId) || !sceneById.has(sceneId)) continue;
    const set = mentioned.get(entityId) ?? new Set();
    set.add(sceneId);
    mentioned.set(entityId, set);
  }
  for (const e of input.entities) {
    const late: ContinuityScene[] = [];
    const early: ContinuityScene[] = [];
    for (const sceneId of mentioned.get(e.id) ?? []) {
      const scene = sceneById.get(sceneId)!;
      if (scene.day === null || isPov(e.id, scene.id)) continue;
      if (e.endDay !== null && scene.day > e.endDay) late.push(scene);
      if (e.startDay !== null && scene.day < e.startDay) early.push(scene);
    }
    if (late.length > 0) {
      const ids = sorted(late.map((s) => s.id));
      findings.push({
        key: `after_end:${e.id}:${shortHash(ids.join(','))}`,
        rule: 'after_end',
        severity: severityFor(e),
        entityIds: [e.id],
        sceneIds: ids,
        linkIds: [],
        days: [e.endDay!],
      });
    }
    if (early.length > 0) {
      const ids = sorted(early.map((s) => s.id));
      findings.push({
        key: `before_start:${e.id}:${shortHash(ids.join(','))}`,
        rule: 'before_start',
        severity: severityFor(e),
        entityIds: [e.id],
        sceneIds: ids,
        linkIds: [],
        days: [e.startDay!],
      });
    }
  }

  // ---- A narrator outside their own life ----
  for (const [entityId, scenes] of povScenes) {
    const e = entity.get(entityId)!;
    const outside = scenes.filter(
      (s) =>
        s.day !== null &&
        ((e.endDay !== null && s.day > e.endDay) || (e.startDay !== null && s.day < e.startDay)),
    );
    if (outside.length === 0) continue;
    const ids = sorted(outside.map((s) => s.id));
    findings.push({
      key: `pov_outside_life:${entityId}:${shortHash(ids.join(','))}`,
      rule: 'pov_outside_life',
      severity: 'warning',
      entityIds: [entityId],
      sceneIds: ids,
      linkIds: [],
      days: [e.startDay, e.endDay].filter((d): d is number => d !== null),
    });
  }

  // ---- Families ----
  for (const link of input.links) {
    if (link.type !== 'parent_of') continue;
    const parent = entity.get(link.sourceId);
    const child = entity.get(link.targetId);
    if (!parent || !child) continue;
    if (parent.startDay !== null && child.startDay !== null && parent.startDay >= child.startDay) {
      findings.push({
        key: `parent_after_child:${link.id}`,
        rule: 'parent_after_child',
        severity: 'warning',
        entityIds: [parent.id, child.id],
        sceneIds: [],
        linkIds: [link.id],
        days: [parent.startDay, child.startDay],
      });
    } else if (
      parent.endDay !== null &&
      child.startDay !== null &&
      child.startDay - parent.endDay > input.daysPerYear
    ) {
      findings.push({
        key: `child_after_parent_end:${link.id}`,
        rule: 'child_after_parent_end',
        severity: 'warning',
        entityIds: [parent.id, child.id],
        sceneIds: [],
        linkIds: [link.id],
        days: [parent.endDay, child.startDay],
      });
    }
  }

  // ---- Links that start outside the life of either end ----
  for (const link of input.links) {
    if (link.fromDay === null) continue;
    for (const id of [link.sourceId, link.targetId]) {
      const e = entity.get(id);
      if (!e) continue;
      const before = e.startDay !== null && link.fromDay < e.startDay;
      const after = e.endDay !== null && link.fromDay > e.endDay;
      if (!before && !after) continue;
      findings.push({
        key: `link_outside_life:${link.id}:${id}`,
        rule: 'link_outside_life',
        severity: severityFor(e),
        entityIds: [id, id === link.sourceId ? link.targetId : link.sourceId],
        sceneIds: [],
        linkIds: [link.id],
        days: [link.fromDay, ...[e.startDay, e.endDay].filter((d): d is number => d !== null)],
      });
    }
  }

  // ---- An item with two owners at once ----
  const ownersOf = new Map<string, ContinuityLink[]>();
  for (const link of input.links) {
    if (link.type !== 'owns') continue;
    ownersOf.set(link.targetId, [...(ownersOf.get(link.targetId) ?? []), link]);
  }
  for (const [itemId, owns] of ownersOf) {
    if (!entity.has(itemId)) continue;
    for (let i = 0; i < owns.length; i++) {
      for (let j = i + 1; j < owns.length; j++) {
        const a = owns[i]!;
        const b = owns[j]!;
        if (a.sourceId === b.sourceId) continue;
        const aFrom = a.fromDay ?? -Infinity;
        const aTo = a.toDay ?? Infinity;
        const bFrom = b.fromDay ?? -Infinity;
        const bTo = b.toDay ?? Infinity;
        if (aFrom > bTo || bFrom > aTo) continue;
        const from = Math.max(aFrom, bFrom);
        const to = Math.min(aTo, bTo);
        findings.push({
          key: `two_owners:${sorted([a.id, b.id]).join(':')}`,
          rule: 'two_owners',
          severity: 'warning',
          entityIds: [itemId, a.sourceId, b.sourceId],
          sceneIds: [],
          linkIds: sorted([a.id, b.id]),
          days: [from, to].filter((d) => Number.isFinite(d)),
        });
      }
    }
  }

  // ---- A narrator in two places on one day ----
  const byNarratorDay = new Map<string, ContinuityScene[]>();
  for (const scene of input.scenes) {
    if (!scene.povId || scene.day === null || !scene.locationId) continue;
    const key = `${scene.povId}@${scene.day}`;
    byNarratorDay.set(key, [...(byNarratorDay.get(key) ?? []), scene]);
  }
  for (const scenes of byNarratorDay.values()) {
    const places = sorted(scenes.map((s) => s.locationId!));
    if (places.length < 2) continue;
    const ids = sorted(scenes.map((s) => s.id));
    const povId = scenes[0]!.povId!;
    if (!entity.has(povId)) continue;
    findings.push({
      key: `two_places:${povId}:${scenes[0]!.day}:${shortHash(ids.join(','))}`,
      rule: 'two_places',
      severity: 'notice',
      entityIds: [povId, ...places],
      sceneIds: ids,
      linkIds: [],
      days: [scenes[0]!.day!],
    });
  }

  const rank = new Map(CONTINUITY_RULES.map((rule, i) => [rule, i]));
  return findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      rank.get(a.rule)! - rank.get(b.rule)! ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/** What a finding says, in words. The caller supplies names and the world's way of writing dates. */
export interface DescribeContext {
  entityName: (id: string) => string;
  formatDay: (day: number) => string;
}

export function describeFinding(
  finding: ContinuityFinding,
  { entityName, formatDay }: DescribeContext,
  linkLabels: Map<string, string> = new Map(),
): { title: string; detail: string } {
  const [first, second, third] = finding.entityIds.map(entityName);
  const [d1, d2] = finding.days;
  const scenes = (n: number) => `${n} ${n === 1 ? 'scene' : 'scenes'}`;
  const n = finding.sceneIds.length;
  const mention = n === 1 ? 'mentions' : 'mention';
  switch (finding.rule) {
    case 'after_end':
      return {
        title: `${first} appears after their end`,
        detail: `Their end date is ${formatDay(d1!)}, but ${scenes(n)} set later ${mention} them.`,
      };
    case 'before_start':
      return {
        title: `${first} appears before they begin`,
        detail: `Their start date is ${formatDay(d1!)}, but ${scenes(n)} set earlier ${mention} them.`,
      };
    case 'pov_outside_life': {
      const span =
        finding.days.length === 2
          ? `${formatDay(finding.days[0]!)} to ${formatDay(finding.days[1]!)}`
          : finding.days.length === 1
            ? `dated ${formatDay(d1!)}`
            : 'their dates';
      return {
        title: `${first} narrates outside their life`,
        detail: `${scenes(n)} are told from their point of view on dates outside ${span}.`,
      };
    }
    case 'parent_after_child':
      return {
        title: `${first} is a parent of ${second}, but was born after them`,
        detail: `${first} starts ${formatDay(d1!)}; ${second} starts ${formatDay(d2!)}.`,
      };
    case 'child_after_parent_end':
      return {
        title: `${second} was born long after ${first} ended`,
        detail: `${first} ends ${formatDay(d1!)}; ${second} starts ${formatDay(d2!)}, over a year later.`,
      };
    case 'link_outside_life': {
      const label = linkLabels.get(finding.linkIds[0]!) ?? 'is linked to';
      const span = finding.days.slice(1).map(formatDay).join(' to ');
      return {
        title: `A link starts outside the life of ${first}`,
        detail: `${first} ${label} ${second} is dated from ${formatDay(d1!)}${span ? `, but ${first} runs ${span}` : ''}.`,
      };
    }
    case 'two_owners':
      return {
        title: `${first} has two owners at once`,
        detail:
          finding.days.length === 2
            ? `${second} and ${third} both own it between ${formatDay(d1!)} and ${formatDay(d2!)}.`
            : finding.days.length === 1
              ? `${second} and ${third} both own it, overlapping from or until ${formatDay(d1!)}.`
              : `${second} and ${third} both own it, with no dates to tell them apart.`,
      };
    case 'two_places':
      return {
        title: `${first} is in two places on ${formatDay(d1!)}`,
        detail: `${scenes(n)} told by them that day are set in different places.`,
      };
  }
}
