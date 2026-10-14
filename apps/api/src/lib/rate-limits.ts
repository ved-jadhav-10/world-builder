/**
 * Per-route request limits, keyed by the signed-in user (or the client address when there is no
 * session). They are generous for real use and exist to stop scripts: guessing invite links,
 * flooding uploads or searches, or exporting a world in a loop. Sign-in, sign-up and password
 * reset have Better Auth's own, stricter limits.
 *
 * Counters live in this process's memory, which is right for one API instance. Several instances
 * would need a shared store (Redis) so each client is counted once, not once per instance.
 */
const limit = (max: number, timeWindow: string) => ({ rateLimit: { max, timeWindow } });

export const limits = {
  /** Looking up or accepting an invite link: slows down anyone guessing secrets. */
  inviteUse: limit(30, '5 minutes'),
  /** Making invite links, which can also send emails to people outside the app. */
  inviteCreate: limit(20, '1 hour'),
  worldCreate: limit(20, '1 hour'),
  /** Uploading a map or a picture; each one is decoded and re-encoded on the server. */
  upload: limit(30, '10 minutes'),
  /** Search runs as you type, so the allowance is high. */
  search: limit(120, '1 minute'),
  /** An export reads the whole world. */
  export: limit(6, '10 minutes'),
};
