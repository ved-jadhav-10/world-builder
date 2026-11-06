import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, EntityType } from '@atlas/shared';
import { buildApp } from '../src/app';
import { signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

describe('built-in entry types', () => {
  it('start every new world with Religion, Language, Magic or Tech System and Glossary Term', async () => {
    const { api, w } = await signUpWithWorld(app);
    const types = (await api.get(`${w}/entity-types`)).json<EntityType[]>();
    const byKey = new Map(types.map((t) => [t.key, t]));
    expect([...byKey.keys()]).toEqual(
      expect.arrayContaining(['religion', 'language', 'system', 'glossary_term', 'style_guide']),
    );
    expect(byKey.get('religion')).toMatchObject({
      name: 'Religion',
      isBuiltin: true,
      startLabel: 'Founded',
    });
    expect(byKey.get('system')!.name).toBe('Magic or Tech System');
    // Types stay in a fixed order, with no two sharing a place.
    const orders = types.map((t) => t.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('come with ready-made fields that entries can fill in', async () => {
    const ctx = await signUpWithWorld(app);
    const { api, w } = ctx;
    const make = async (type: string, fields: Record<string, unknown>) => {
      const res = await api.post(`${w}/entities`, { typeId: ctx.typeId(type), name: type, fields });
      expect(res.statusCode, res.body).toBe(201);
      return res.json<Entity>();
    };
    expect(
      (await make('religion', { kind: 'Polytheistic', deities: 'The Twelve' })).fields,
    ).toMatchObject({
      kind: 'Polytheistic',
    });
    expect((await make('language', { status: 'Living', script: 'Runic' })).fields).toMatchObject({
      script: 'Runic',
    });
    expect(
      (await make('system', { kind: 'Magic', limits: 'Costs a memory' })).fields,
    ).toMatchObject({
      kind: 'Magic',
    });
    expect((await make('glossary_term', { pronunciation: 'kah-REN' })).fields).toMatchObject({
      pronunciation: 'kah-REN',
    });
    expect(
      (await make('style_guide', { pov: 'Third limited', tense: 'Past', avoid: 'suddenly' }))
        .fields,
    ).toMatchObject({ pov: 'Third limited', tense: 'Past' });
    // The choices are checked like any other select field.
    const bad = await api.post(`${w}/entities`, {
      typeId: ctx.typeId('language'),
      name: 'x',
      fields: { status: 'Imaginary' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('are isolated per world, so editing one world’s type leaves the others alone', async () => {
    const mine = await signUpWithWorld(app);
    const other = await signUpWithWorld(app, 'Elsewhere');
    const res = await mine.api.patch(`${mine.w}/entity-types/${mine.typeId('religion')}`, {
      name: 'Faith',
    });
    expect(res.statusCode, res.body).toBe(200);
    const theirs = (await other.api.get(`${other.w}/entity-types`)).json<EntityType[]>();
    expect(theirs.find((t) => t.key === 'religion')!.name).toBe('Religion');
  });
});

describe('character extras', () => {
  it('give characters a speech sheet, palette, abilities with charges and an interview', async () => {
    const ctx = await signUpWithWorld(app);
    const { api, w } = ctx;
    const types = (await api.get(`${w}/entity-types`)).json<EntityType[]>();
    const keys = (key: string) => types.find((t) => t.key === key)!.fieldSchema.map((f) => f.key);
    expect(keys('character')).toEqual(
      expect.arrayContaining([
        'speech_style',
        'verbal_tics',
        'sample_dialogue',
        'palette',
        'abilities',
        'interview',
      ]),
    );
    expect(keys('species')).toContain('innate_abilities');

    const res = await api.post(`${w}/entities`, {
      typeId: ctx.typeId('character'),
      name: 'Maren',
      fields: {
        palette: ['#AA0000', '#223344'],
        abilities: [
          { name: 'Second wind', charges: { max: 2, current: 2, recharge: 'long rest' } },
        ],
        interview: [{ question: 'What do you fear?', answer: 'Deep water.' }],
        speech_style: 'Clipped and formal.',
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const maren = res.json<Entity>();
    expect(maren.fields.palette).toEqual(['#aa0000', '#223344']);
    expect(maren.fields.abilities).toEqual([
      {
        name: 'Second wind',
        description: '',
        charges: { max: 2, current: 2, recharge: 'long rest' },
      },
    ]);

    // Spending a charge is an ordinary edit, and the words are searchable.
    const spent = await api.patch(`${w}/entities/${maren.id}`, {
      fields: {
        abilities: [
          { name: 'Second wind', charges: { max: 2, current: 1, recharge: 'long rest' } },
        ],
      },
    });
    expect(spent.statusCode, spent.body).toBe(200);
    const found = await api.get(`${w}/search?q=${encodeURIComponent('Second')}`);
    expect(found.json<{ name: string }[]>().map((r) => r.name)).toContain('Maren');

    const bad = await api.patch(`${w}/entities/${maren.id}`, {
      fields: { abilities: [{ name: 'Over', charges: { max: 1, current: 5 } }] },
    });
    expect(bad.statusCode).toBe(400);
  });
});
