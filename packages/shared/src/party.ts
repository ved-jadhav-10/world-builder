import type { LootItem, PartyMember } from './schemas/gm-screen';

const MAX_XP = 99_999_999;
const MAX_DOWNTIME = 9_999;

/**
 * Gives XP to the chosen members (or everyone). "each" gives every one the amount; "split" shares
 * it out evenly, with the remainder going to the first ones so no points vanish. A negative
 * amount takes XP away, never below 0.
 */
export function awardXp(
  members: PartyMember[],
  amount: number,
  mode: 'each' | 'split',
  ids?: readonly string[],
): PartyMember[] {
  const chosen = new Set(ids ?? members.map((member) => member.id));
  const count = members.filter((member) => chosen.has(member.id)).length;
  if (count === 0 || amount === 0) return members;
  const base = mode === 'each' ? amount : Math.trunc(amount / count);
  let remainder = mode === 'each' ? 0 : amount - base * count;
  const step = remainder < 0 ? -1 : 1;
  return members.map((member) => {
    if (!chosen.has(member.id)) return member;
    let gain = base;
    if (remainder !== 0) {
      gain += step;
      remainder -= step;
    }
    return { ...member, xp: Math.min(MAX_XP, Math.max(0, member.xp + gain)) };
  });
}

/** Adds (or, if negative, spends) downtime days for everyone, never below 0. */
export function awardDowntime(members: PartyMember[], days: number): PartyMember[] {
  return members.map((member) => ({
    ...member,
    downtime: Math.min(MAX_DOWNTIME, Math.max(0, member.downtime + days)),
  }));
}

/** What each person is carrying, with the party's pack under "Party". */
export function groupByHolder(items: readonly LootItem[]): Map<string, LootItem[]> {
  const groups = new Map<string, LootItem[]>();
  for (const item of items) {
    const key = item.holder.trim() || 'Party';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}
