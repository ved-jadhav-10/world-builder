import { describe, expect, it } from 'vitest';
import {
  FAMILY_NODE_H,
  FAMILY_NODE_W,
  layoutFamily,
  type FamilyLinks,
  type FamilyPerson,
} from './family';

const people = (...names: string[]): FamilyPerson[] => names.map((name) => ({ id: name, name }));
const links = (parts: Partial<FamilyLinks> = {}): FamilyLinks => ({
  parentOf: [],
  spouses: [],
  siblings: [],
  ...parts,
});
const p = (parentId: string, childId: string) => ({ parentId, childId });

/**
 *  Grandpa = Grandma
 *        |
 *   Dad = Mum    Aunt
 *      |  \
 *    Kid  Sib
 *      |
 *    Grandkid
 */
const family = () => ({
  folks: people('Grandpa', 'Grandma', 'Dad', 'Mum', 'Aunt', 'Kid', 'Sib', 'Grandkid'),
  links: links({
    parentOf: [
      p('Grandpa', 'Dad'),
      p('Grandma', 'Dad'),
      p('Grandpa', 'Aunt'),
      p('Grandma', 'Aunt'),
      p('Dad', 'Kid'),
      p('Mum', 'Kid'),
      p('Dad', 'Sib'),
      p('Mum', 'Sib'),
      p('Kid', 'Grandkid'),
    ],
    spouses: [
      ['Grandpa', 'Grandma'],
      ['Dad', 'Mum'],
    ],
    siblings: [
      ['Kid', 'Sib'],
      ['Dad', 'Aunt'],
    ],
  }),
});

const at = (layout: ReturnType<typeof layoutFamily>) => new Map(layout.nodes.map((n) => [n.id, n]));

describe('layoutFamily', () => {
  it('puts each generation on its own row, parents above children', () => {
    const { folks, links: l } = family();
    const nodes = at(layoutFamily('Kid', folks, l));
    const gen = (id: string) => nodes.get(id)!.generation;
    expect([gen('Grandpa'), gen('Grandma')]).toEqual([0, 0]);
    expect([gen('Dad'), gen('Mum'), gen('Aunt')]).toEqual([1, 1, 1]);
    expect([gen('Kid'), gen('Sib')]).toEqual([2, 2]);
    expect(gen('Grandkid')).toBe(3);
    expect(nodes.get('Grandpa')!.y).toBeLessThan(nodes.get('Dad')!.y);
    expect(nodes.get('Dad')!.y).toBeLessThan(nodes.get('Kid')!.y);
    // Same generation, same height.
    expect(nodes.get('Kid')!.y).toBe(nodes.get('Sib')!.y);
  });

  it('gives the same rows whichever person it is centred on', () => {
    const { folks, links: l } = family();
    const fromKid = at(layoutFamily('Kid', folks, l));
    const fromGrandpa = at(layoutFamily('Grandpa', folks, l));
    for (const id of ['Dad', 'Kid', 'Grandkid']) {
      expect(fromGrandpa.get(id)!.generation).toBe(fromKid.get(id)!.generation);
    }
  });

  it('keeps couples side by side', () => {
    const { folks, links: l } = family();
    const layout = layoutFamily('Kid', folks, l);
    const nodes = at(layout);
    for (const [a, b] of [
      ['Grandpa', 'Grandma'],
      ['Dad', 'Mum'],
    ] as const) {
      const gap = Math.abs(nodes.get(a)!.x - nodes.get(b)!.x);
      expect(gap).toBeLessThan(FAMILY_NODE_W + 30);
      expect(gap).toBeGreaterThanOrEqual(FAMILY_NODE_W);
    }
    expect(layout.couples).toHaveLength(2);
  });

  it('never overlaps two people on a row', () => {
    const { folks, links: l } = family();
    const layout = layoutFamily('Kid', folks, l);
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a.id >= b.id || a.generation !== b.generation) continue;
        expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(FAMILY_NODE_W);
      }
    }
  });

  it('centres children under their parents', () => {
    const { folks, links: l } = family();
    const nodes = at(layoutFamily('Kid', folks, l));
    const parents = (nodes.get('Dad')!.x + nodes.get('Mum')!.x) / 2;
    const kids = (nodes.get('Kid')!.x + nodes.get('Sib')!.x) / 2;
    expect(Math.abs(parents - kids)).toBeLessThan(FAMILY_NODE_W);
  });

  it('puts everyone inside the reported size', () => {
    const { folks, links: l } = family();
    const layout = layoutFamily('Kid', folks, l);
    for (const n of layout.nodes) {
      expect(n.x - FAMILY_NODE_W / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + FAMILY_NODE_W / 2).toBeLessThanOrEqual(layout.width);
      expect(n.y - FAMILY_NODE_H / 2).toBeGreaterThanOrEqual(0);
      expect(n.y + FAMILY_NODE_H / 2).toBeLessThanOrEqual(layout.height);
    }
  });

  it('is deterministic', () => {
    const { folks, links: l } = family();
    expect(layoutFamily('Kid', folks, l)).toEqual(layoutFamily('Kid', folks, l));
  });

  it('draws a sibling line only where the siblings share no parent in the picture', () => {
    const { folks, links: l } = family();
    const layout = layoutFamily('Kid', folks, l);
    // Kid and Sib share Dad and Mum; Dad and Aunt share Grandpa and Grandma. No lines needed.
    expect(layout.siblingLinks).toEqual([]);
    const orphans = layoutFamily('A', people('A', 'B'), links({ siblings: [['A', 'B']] }));
    expect(orphans.siblingLinks).toEqual([{ a: 'A', b: 'B' }]);
  });

  it('places a spouse who married in, with no parents of their own', () => {
    const layout = layoutFamily(
      'Dad',
      people('Dad', 'Mum', 'Kid'),
      links({
        parentOf: [p('Dad', 'Kid'), p('Mum', 'Kid')],
        spouses: [['Dad', 'Mum']],
      }),
    );
    const nodes = at(layout);
    expect(nodes.get('Dad')!.generation).toBe(nodes.get('Mum')!.generation);
    expect(nodes.get('Kid')!.generation).toBe(nodes.get('Dad')!.generation + 1);
  });

  it('handles several spouses in a row', () => {
    const layout = layoutFamily(
      'A',
      people('A', 'B', 'C'),
      links({
        spouses: [
          ['A', 'B'],
          ['A', 'C'],
        ],
      }),
    );
    expect(layout.couples).toHaveLength(2);
    const xs = layout.nodes.map((n) => n.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeGreaterThanOrEqual(FAMILY_NODE_W);
    expect(xs[2]! - xs[1]!).toBeGreaterThanOrEqual(FAMILY_NODE_W);
  });

  it('survives a loop of parents, a person who is their own parent and links to strangers', () => {
    const layout = layoutFamily(
      'A',
      people('A', 'B', 'C'),
      links({
        parentOf: [p('A', 'B'), p('B', 'C'), p('C', 'A'), p('A', 'A'), p('A', 'Nobody')],
        spouses: [
          ['A', 'A'],
          ['A', 'Nobody'],
        ],
        siblings: [['B', 'Nobody']],
      }),
    );
    expect(layout.nodes).toHaveLength(3);
    for (const n of layout.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    // Only links between people in the picture are kept.
    expect(layout.parentLinks.every((l) => l.parentId !== l.childId)).toBe(true);
  });

  it('draws people the walk cannot reach, rather than losing them', () => {
    const layout = layoutFamily('A', people('A', 'Loner'), links());
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(['A', 'Loner']);
  });

  it('copes with no people, and with a focus that is not in the family', () => {
    expect(layoutFamily('x', [], links()).nodes).toEqual([]);
    expect(layoutFamily('missing', people('A'), links()).nodes).toHaveLength(1);
  });
});
