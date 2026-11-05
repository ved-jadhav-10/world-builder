/**
 * Family trees from relationship data. A family is people joined by "parent of", "spouse of" and
 * "sibling of" links. The layout puts each generation in a row (parents above children), keeps
 * couples side by side, and centres children under their parents. It is deterministic.
 *
 * Real families are not always a clean tree: someone can marry into the family with no known
 * parents, or two lines can meet. A person is placed in the generation the first path from the
 * focus reaches them, and links that disagree are still drawn, just not as straight drops.
 */

export interface FamilyPerson {
  id: string;
  name: string;
}
export interface FamilyLinks {
  parentOf: { parentId: string; childId: string }[];
  spouses: [string, string][];
  siblings: [string, string][];
}

export interface FamilyNode {
  id: string;
  name: string;
  /** Centre of the box. */
  x: number;
  y: number;
  /** 0 is the oldest generation shown; the focus person is wherever the walk placed them. */
  generation: number;
}

export interface FamilyLayout {
  nodes: FamilyNode[];
  parentLinks: { parentId: string; childId: string }[];
  /** People side by side in a couple. */
  couples: { a: string; b: string }[];
  /** Siblings, drawn lightly, for those with no parent in the picture to join them. */
  siblingLinks: { a: string; b: string }[];
  width: number;
  height: number;
}

export const FAMILY_NODE_W = 148;
export const FAMILY_NODE_H = 44;
const COUPLE_GAP = 14;
const UNIT_GAP = 40;
const ROW_GAP = 72;
const MARGIN = 24;

/** How many generations up and down the walk may go from the focus person. */
export const MAX_FAMILY_GENERATIONS = 5;

export function layoutFamily(
  focusId: string,
  people: FamilyPerson[],
  links: FamilyLinks,
): FamilyLayout {
  const byId = new Map(people.map((p) => [p.id, p]));
  const known = (id: string) => byId.has(id);

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  const siblingsOf = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key) ?? [];
    if (!list.includes(value)) list.push(value);
    map.set(key, list);
  };
  const parentLinks = links.parentOf.filter(
    (l) => known(l.parentId) && known(l.childId) && l.parentId !== l.childId,
  );
  for (const { parentId, childId } of parentLinks) {
    add(parentsOf, childId, parentId);
    add(childrenOf, parentId, childId);
  }
  for (const [a, b] of links.spouses) {
    if (!known(a) || !known(b) || a === b) continue;
    add(spousesOf, a, b);
    add(spousesOf, b, a);
  }
  for (const [a, b] of links.siblings) {
    if (!known(a) || !known(b) || a === b) continue;
    add(siblingsOf, a, b);
    add(siblingsOf, b, a);
  }

  // Generations: walk out from the focus. Up through parents, down through children, across
  // through spouses and siblings. The first way a person is reached decides their row.
  const generation = new Map<string, number>();
  const start = known(focusId) ? focusId : people[0]?.id;
  if (start === undefined)
    return { nodes: [], parentLinks: [], couples: [], siblingLinks: [], width: 0, height: 0 };
  generation.set(start, 0);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]!;
    const g = generation.get(id)!;
    const visit = (others: string[] | undefined, next: number) => {
      for (const other of others ?? []) {
        if (generation.has(other)) continue;
        generation.set(other, next);
        queue.push(other);
      }
    };
    visit(parentsOf.get(id), g - 1);
    visit(childrenOf.get(id), g + 1);
    visit(spousesOf.get(id), g);
    visit(siblingsOf.get(id), g);
  }
  // Anyone the walk could not reach still gets drawn, alongside the focus person.
  for (const person of people) if (!generation.has(person.id)) generation.set(person.id, 0);
  const minGen = Math.min(...generation.values());
  for (const [id, g] of generation) generation.set(id, g - minGen);
  const rowCount = Math.max(...generation.values()) + 1;

  // Units: a person, or people joined by spouse links in the same generation.
  const unitOf = new Map<string, number>();
  const units: string[][] = [];
  const nameOf = (id: string) => byId.get(id)!.name;
  const byName = (a: string, b: string) =>
    nameOf(a).localeCompare(nameOf(b)) || (a < b ? -1 : a > b ? 1 : 0);
  for (const person of [...people].sort((a, b) => byName(a.id, b.id))) {
    if (unitOf.has(person.id)) continue;
    const members: string[] = [];
    const stack = [person.id];
    unitOf.set(person.id, units.length);
    while (stack.length) {
      const id = stack.pop()!;
      members.push(id);
      for (const other of spousesOf.get(id) ?? []) {
        if (unitOf.has(other) || generation.get(other) !== generation.get(id)) continue;
        unitOf.set(other, units.length);
        stack.push(other);
      }
    }
    units.push(members.sort(byName));
  }

  const unitWidth = (unit: string[]) =>
    unit.length * FAMILY_NODE_W + (unit.length - 1) * COUPLE_GAP;
  const xOf = new Map<string, number>(); // centre of each person
  const rows: number[][] = Array.from({ length: rowCount }, () => []);
  units.forEach((unit, i) => rows[generation.get(unit[0]!)!]!.push(i));

  for (let row = 0; row < rowCount; row++) {
    // Where a unit would like to sit: under the middle of its parents, if they are already placed.
    const desired = new Map<number, number>();
    for (const u of rows[row]!) {
      const xs: number[] = [];
      for (const member of units[u]!) {
        for (const parent of parentsOf.get(member) ?? []) {
          const px = xOf.get(parent);
          if (px !== undefined) xs.push(px);
        }
      }
      if (xs.length) desired.set(u, xs.reduce((s, v) => s + v, 0) / xs.length);
    }
    const ordered = [...rows[row]!].sort((a, b) => {
      const da = desired.get(a);
      const db = desired.get(b);
      if (da !== undefined && db !== undefined && da !== db) return da - db;
      if (da !== undefined && db === undefined) return -1;
      if (da === undefined && db !== undefined) return 1;
      return byName(units[a]![0]!, units[b]![0]!);
    });

    const lefts = new Map<number, number>();
    let cursor = -Infinity;
    for (const u of ordered) {
      const width = unitWidth(units[u]!);
      const want = desired.has(u) ? desired.get(u)! - width / 2 : cursor;
      const left = cursor === -Infinity ? want : Math.max(want, cursor);
      lefts.set(u, left === -Infinity ? 0 : left);
      cursor = (left === -Infinity ? 0 : left) + width + UNIT_GAP;
    }
    // Slide the row so placed units sit as near their parents as the spacing allowed.
    const shifts = ordered
      .filter((u) => desired.has(u))
      .map((u) => desired.get(u)! - (lefts.get(u)! + unitWidth(units[u]!) / 2));
    const shift = shifts.length ? shifts.reduce((s, v) => s + v, 0) / shifts.length : 0;
    for (const u of ordered) {
      const left = lefts.get(u)! + shift;
      units[u]!.forEach((member, i) => {
        xOf.set(member, left + FAMILY_NODE_W / 2 + i * (FAMILY_NODE_W + COUPLE_GAP));
      });
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  for (const x of xOf.values()) {
    minX = Math.min(minX, x - FAMILY_NODE_W / 2);
    maxX = Math.max(maxX, x + FAMILY_NODE_W / 2);
  }
  const shiftX = MARGIN - minX;
  const nodes: FamilyNode[] = people.map((person) => {
    const g = generation.get(person.id)!;
    return {
      id: person.id,
      name: person.name,
      x: xOf.get(person.id)! + shiftX,
      y: MARGIN + FAMILY_NODE_H / 2 + g * (FAMILY_NODE_H + ROW_GAP),
      generation: g,
    };
  });

  const couples: FamilyLayout['couples'] = [];
  for (const unit of units) {
    for (let i = 1; i < unit.length; i++) couples.push({ a: unit[i - 1]!, b: unit[i]! });
  }
  // A sibling line is only needed when the two do not already meet at a shared parent.
  const siblingLinks: FamilyLayout['siblingLinks'] = [];
  const done = new Set<string>();
  for (const [a, others] of siblingsOf) {
    for (const b of others) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (done.has(key)) continue;
      done.add(key);
      const shared = (parentsOf.get(a) ?? []).some((p) => (parentsOf.get(b) ?? []).includes(p));
      if (!shared) siblingLinks.push({ a, b });
    }
  }

  return {
    nodes,
    parentLinks,
    couples,
    siblingLinks,
    width: maxX - minX + MARGIN * 2,
    height: MARGIN * 2 + rowCount * FAMILY_NODE_H + (rowCount - 1) * ROW_GAP,
  };
}
