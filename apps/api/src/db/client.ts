import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

export const sql = postgres(env.databaseUrl, { max: 10, onnotice: () => {} });
export const db = drizzle(sql, { schema });

export type Db = typeof db;
/** A transaction handle; services accept either so callers can compose them. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
