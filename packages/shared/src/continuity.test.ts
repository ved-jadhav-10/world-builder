import { describe, expect, it } from 'vitest';
import {
  checkContinuity,
  describeFinding,
  shortHash,
  type ContinuityEntity,
  type ContinuityInput,
  type ContinuityLink,
  type ContinuityScene,
} from './continuity';

const YEAR = 360;
const person = (
  id: string,
  startDay: number | null = null,
  endDay: number | null = null,
): ContinuityEntity => ({ id, name: id, kind: 'person', startDay, endDay });
const thing = (
  id: string,
  startDay: number | null = null,
  endDay: number | null = null,
): ContinuityEntity => ({ id, name: id, kind: 'other', startDay, endDay });
const scene = (
  id: string,
  day: number | null,
  extra: Partial<ContinuityScene> = {},
): ContinuityScene => ({ id, title: id, day, povId: null, locationId: null, ...extra });
const link = (
  id: string,
  type: string,
  sourceId: string,
  targetId: string,
  fromDay: number | null = null,
  toDay: number | null = null,
): ContinuityLink => ({
  id,
  type,
  label: type.replace('_', ' '),
  sourceId,
  targetId,
  fromDay,
  toDay,
});

const run = (input: Partial<ContinuityInput>) =>
  checkContinuity({
    entities: [],
    scenes: [],
    mentions: [],
    links: [],
    daysPerYear: YEAR,
    ...input,
  });
const rules = (input: Partial<ContinuityInput>) => run(input).map((f) => f.rule);

describe('appears after the end / before the start', () => {
  it('flags a character mentioned in a scene set after their end date', () => {
    const findings = run({
      entities: [person('mira', 0, 1000)],
      scenes: [scene('s1', 900), scene('s2', 1500), scene('s3', 2000)],
      mentions: [
        { sceneId: 's1', entityId: 'mira' },
        { sceneId: 's2', entityId: 'mira' },
        { sceneId: 's3', entityId: 'mira' },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'after_end',
      severity: 'warning',
      entityIds: ['mira'],
      sceneIds: ['s2', 's3'],
      days: [1000],
    });
  });

  it('flags a mention before the start date', () => {
    const findings = run({
      entities: [person('kid', 500)],
      scenes: [scene('old', 100), scene('new', 600)],
      mentions: [
        { sceneId: 'old', entityId: 'kid' },
        { sceneId: 'new', entityId: 'kid' },
      ],
    });
    expect(findings.map((f) => [f.rule, f.sceneIds])).toEqual([['before_start', ['old']]]);
  });

  it('treats the end day itself as still present', () => {
    expect(
      rules({
        entities: [person('mira', 0, 1000)],
        scenes: [scene('s', 1000)],
        mentions: [{ sceneId: 's', entityId: 'mira' }],
      }),
    ).toEqual([]);
  });

  it('ignores scenes with no date, and entries with no dates', () => {
    expect(
      rules({
        entities: [person('a', 0, 10), person('b')],
        scenes: [scene('undated', null), scene('later', 999)],
        mentions: [
          { sceneId: 'undated', entityId: 'a' },
          { sceneId: 'later', entityId: 'b' },
        ],
      }),
    ).toEqual([]);
  });

  it('is only a notice for places and things, and a warning for people', () => {
    const findings = run({
      entities: [thing('city', 0, 100), person('mira', 0, 100)],
      scenes: [scene('s', 500)],
      mentions: [
        { sceneId: 's', entityId: 'city' },
        { sceneId: 's', entityId: 'mira' },
      ],
    });
    expect(findings.map((f) => [f.entityIds[0], f.severity])).toEqual([
      ['mira', 'warning'],
      ['city', 'notice'],
    ]);
  });

  it('ignores mentions of entries or scenes it does not know', () => {
    expect(
      rules({
        entities: [person('a', 0, 10)],
        scenes: [scene('s', 500)],
        mentions: [
          { sceneId: 's', entityId: 'ghost-entity' },
          { sceneId: 'ghost-scene', entityId: 'a' },
        ],
      }),
    ).toEqual([]);
  });

  it('gives a key that changes when the scenes behind it change, so a dismissal does not hide new problems', () => {
    const base = {
      entities: [person('mira', 0, 1000)],
      scenes: [scene('s1', 1500), scene('s2', 1600)],
    };
    const one = run({ ...base, mentions: [{ sceneId: 's1', entityId: 'mira' }] })[0]!;
    const same = run({ ...base, mentions: [{ sceneId: 's1', entityId: 'mira' }] })[0]!;
    const two = run({
      ...base,
      mentions: [
        { sceneId: 's1', entityId: 'mira' },
        { sceneId: 's2', entityId: 'mira' },
      ],
    })[0]!;
    expect(one.key).toBe(same.key);
    expect(two.key).not.toBe(one.key);
    expect(one.key.startsWith('after_end:mira:')).toBe(true);
  });
});

describe('narrators', () => {
  it('reports a narrator outside their life once, as a narrator, not also as a mention', () => {
    const findings = run({
      entities: [person('mira', 100, 1000)],
      scenes: [
        scene('s1', 1200, { povId: 'mira' }),
        scene('s2', 50, { povId: 'mira' }),
        scene('s3', 500, { povId: 'mira' }),
      ],
      mentions: [
        { sceneId: 's1', entityId: 'mira' },
        { sceneId: 's2', entityId: 'mira' },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'pov_outside_life',
      severity: 'warning',
      sceneIds: ['s1', 's2'],
      days: [100, 1000],
    });
  });

  it('is quiet when the narrator is alive for every scene', () => {
    expect(
      rules({
        entities: [person('mira', 100, 1000)],
        scenes: [scene('s1', 100, { povId: 'mira' }), scene('s2', 1000, { povId: 'mira' })],
      }),
    ).toEqual([]);
  });

  it('notes a narrator in two places on one day, but not the same place or other days', () => {
    const findings = run({
      entities: [person('mira'), thing('docks'), thing('palace')],
      scenes: [
        scene('a', 10, { povId: 'mira', locationId: 'docks' }),
        scene('b', 10, { povId: 'mira', locationId: 'palace' }),
        scene('c', 11, { povId: 'mira', locationId: 'docks' }),
        scene('d', 20, { povId: 'mira', locationId: 'docks' }),
        scene('e', 20, { povId: 'mira', locationId: 'docks' }),
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'two_places',
      severity: 'notice',
      entityIds: ['mira', 'docks', 'palace'],
      sceneIds: ['a', 'b'],
      days: [10],
    });
  });

  it('does not mix up two narrators on the same day', () => {
    expect(
      rules({
        entities: [person('a'), person('b'), thing('x'), thing('y')],
        scenes: [
          scene('1', 5, { povId: 'a', locationId: 'x' }),
          scene('2', 5, { povId: 'b', locationId: 'y' }),
        ],
      }),
    ).toEqual([]);
  });
});

describe('families', () => {
  it('flags a parent born after, or on the same day as, their child', () => {
    const findings = run({
      entities: [person('dad', 5000), person('kid', 4000), person('twin', 5000)],
      links: [link('l1', 'parent_of', 'dad', 'kid'), link('l2', 'parent_of', 'dad', 'twin')],
    });
    expect(findings.map((f) => [f.rule, f.linkIds[0], f.entityIds])).toEqual([
      ['parent_after_child', 'l1', ['dad', 'kid']],
      ['parent_after_child', 'l2', ['dad', 'twin']],
    ]);
  });

  it('flags a child born more than a year after the parent ended, but allows a posthumous birth within it', () => {
    const entities = [person('dad', 0, 1000)];
    expect(
      rules({
        entities: [...entities, person('late', 1000 + YEAR + 1)],
        links: [link('l', 'parent_of', 'dad', 'late')],
      }),
    ).toEqual(['child_after_parent_end']);
    expect(
      rules({
        entities: [...entities, person('posthumous', 1000 + YEAR)],
        links: [link('l', 'parent_of', 'dad', 'posthumous')],
      }),
    ).toEqual([]);
  });

  it('is quiet about a normal family, and about missing dates and other links', () => {
    expect(
      rules({
        entities: [person('dad', 0, 3000), person('kid', 1000), person('mystery')],
        links: [
          link('a', 'parent_of', 'dad', 'kid'),
          link('b', 'parent_of', 'dad', 'mystery'),
          link('c', 'sibling_of', 'kid', 'dad'),
          link('d', 'parent_of', 'dad', 'not-an-entity'),
        ],
      }),
    ).toEqual([]);
  });
});

describe('links outside someone’s life', () => {
  it('flags a link that starts before one end began or after it ended', () => {
    const findings = run({
      entities: [person('a', 100, 500), person('b', 0, 9999)],
      links: [
        link('before', 'spouse_of', 'a', 'b', 50),
        link('after', 'spouse_of', 'a', 'b', 600),
        link('ok', 'spouse_of', 'a', 'b', 300),
        link('open', 'spouse_of', 'a', 'b', null),
      ],
    });
    expect(findings.map((f) => [f.rule, f.linkIds[0], f.entityIds[0]])).toEqual([
      ['link_outside_life', 'after', 'a'],
      ['link_outside_life', 'before', 'a'],
    ]);
    expect(findings[0]!.days).toEqual([600, 100, 500]);
  });

  it('reports each end separately when both are wrong', () => {
    const findings = run({
      entities: [person('a', 100), person('b', 200)],
      links: [link('l', 'ally_of', 'a', 'b', 10)],
    });
    expect(findings.map((f) => f.entityIds[0]).sort()).toEqual(['a', 'b']);
  });
});

describe('two owners', () => {
  it('flags overlapping ownership of one item by different owners', () => {
    const findings = run({
      entities: [person('a'), person('b'), thing('sword')],
      links: [
        link('1', 'owns', 'a', 'sword', 100, 500),
        link('2', 'owns', 'b', 'sword', 400, null),
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'two_owners',
      severity: 'warning',
      entityIds: ['sword', 'a', 'b'],
      linkIds: ['1', '2'],
      days: [400, 500],
    });
  });

  it('accepts ownership that is handed on, even on the same boundary day being distinct', () => {
    expect(
      rules({
        entities: [person('a'), person('b'), thing('sword')],
        links: [
          link('1', 'owns', 'a', 'sword', null, 500),
          link('2', 'owns', 'b', 'sword', 501, null),
        ],
      }),
    ).toEqual([]);
  });

  it('flags two open-ended owners, and treats the same owner twice as fine', () => {
    expect(
      rules({
        entities: [person('a'), person('b'), thing('sword')],
        links: [link('1', 'owns', 'a', 'sword'), link('2', 'owns', 'b', 'sword')],
      }),
    ).toEqual(['two_owners']);
    expect(
      rules({
        entities: [person('a'), thing('sword')],
        links: [link('1', 'owns', 'a', 'sword'), link('2', 'owns', 'a', 'sword', 5)],
      }),
    ).toEqual([]);
  });

  it('keeps different items apart', () => {
    expect(
      rules({
        entities: [person('a'), person('b'), thing('sword'), thing('shield')],
        links: [link('1', 'owns', 'a', 'sword'), link('2', 'owns', 'b', 'shield')],
      }),
    ).toEqual([]);
  });
});

describe('ordering, determinism and wording', () => {
  const messy = (): Partial<ContinuityInput> => ({
    entities: [person('mira', 0, 100), thing('city', 0, 100), person('dad', 50), person('kid', 10)],
    scenes: [scene('s', 500)],
    mentions: [
      { sceneId: 's', entityId: 'city' },
      { sceneId: 's', entityId: 'mira' },
    ],
    links: [link('p', 'parent_of', 'dad', 'kid')],
  });

  it('lists warnings before notices, rules in a fixed order, and always the same way', () => {
    const findings = run(messy());
    expect(findings.map((f) => f.severity)).toEqual(['warning', 'warning', 'notice']);
    expect(findings.map((f) => f.rule)).toEqual(['after_end', 'parent_after_child', 'after_end']);
    expect(JSON.stringify(run(messy()))).toBe(JSON.stringify(findings));
    expect(new Set(findings.map((f) => f.key)).size).toBe(findings.length);
  });

  it('describes each rule in words using the names and dates it is given', () => {
    const names: Record<string, string> = {
      mira: 'Mira',
      dad: 'Dad',
      kid: 'Kid',
      a: 'Ann',
      b: 'Bo',
      sword: 'The Sword',
      docks: 'Docks',
    };
    const ctx = {
      entityName: (id: string) => names[id] ?? id,
      formatDay: (d: number) => `day ${d}`,
    };
    const text = (input: Partial<ContinuityInput>) =>
      run(input).map((f) => describeFinding(f, ctx));

    expect(text(messy())[0]).toEqual({
      title: 'Mira appears after their end',
      detail: 'Their end date is day 100, but 1 scene set later mention them.',
    });
    expect(text(messy())[1]).toEqual({
      title: 'Dad is a parent of Kid, but was born after them',
      detail: 'Dad starts day 50; Kid starts day 10.',
    });
    expect(
      text({
        entities: [person('a'), person('b'), thing('sword')],
        links: [
          link('1', 'owns', 'a', 'sword', 100, 500),
          link('2', 'owns', 'b', 'sword', 400, 900),
        ],
      })[0],
    ).toEqual({
      title: 'The Sword has two owners at once',
      detail: 'Ann and Bo both own it between day 400 and day 500.',
    });
    expect(
      text({
        entities: [person('mira'), thing('docks'), thing('palace')],
        scenes: [
          scene('a', 10, { povId: 'mira', locationId: 'docks' }),
          scene('b', 10, { povId: 'mira', locationId: 'palace' }),
        ],
      })[0]!.title,
    ).toBe('Mira is in two places on day 10');
    const labelled = run({
      entities: [person('a', 100, 500), person('b')],
      links: [link('l', 'spouse_of', 'a', 'b', 600)],
    })[0]!;
    expect(describeFinding(labelled, ctx, new Map([['l', 'spouse of']]))).toEqual({
      title: 'A link starts outside the life of Ann',
      detail: 'Ann spouse of Bo is dated from day 600, but Ann runs day 100 to day 500.',
    });
  });

  it('copes with empty input', () => {
    expect(run({})).toEqual([]);
  });

  it('hashes the same text the same way, and different text differently', () => {
    expect(shortHash('a,b')).toBe(shortHash('a,b'));
    expect(shortHash('a,b')).not.toBe(shortHash('a,c'));
    expect(shortHash('')).toMatch(/^[0-9a-z]+$/);
  });

  it('copes with a thousand scenes and mentions quickly', () => {
    const entities = Array.from({ length: 300 }, (_, i) => person(`e${i}`, 0, 1000));
    const scenes = Array.from({ length: 1000 }, (_, i) => scene(`s${i}`, i * 3));
    const mentions = scenes.flatMap((s, i) => [
      { sceneId: s.id, entityId: `e${i % 300}` },
      { sceneId: s.id, entityId: `e${(i * 7) % 300}` },
    ]);
    const started = Date.now();
    const findings = run({ entities, scenes, mentions });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(findings.length).toBeGreaterThan(0);
  });
});
