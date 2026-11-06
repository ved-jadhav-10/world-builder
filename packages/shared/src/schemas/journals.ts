import { z } from 'zod';

export const MAX_JOURNAL_LENGTH = 10_000;

/** A player's private notes on one entry. An empty body removes the notes. */
export const journalSaveSchema = z.object({ body: z.string().max(MAX_JOURNAL_LENGTH) });
export type JournalSaveInput = z.input<typeof journalSaveSchema>;

export interface Journal {
  body: string;
  /** Null until something has been written. */
  updatedAt: string | null;
}

/** One person's notes on an entry, as the GM sees them. */
export interface PlayerJournal extends Journal {
  author: { id: string; name: string };
}
