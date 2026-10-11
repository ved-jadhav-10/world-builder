import { join } from 'node:path';
import { env } from '../env';

/** Uploads land here first, until the form has been validated and the file is moved into place. */
export const uploadsDir = () => join(env.storageDir, 'tmp');
