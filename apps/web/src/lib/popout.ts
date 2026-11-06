/** The address of an entry shown on its own, without the sidebar. */
export const popoutPath = (base: string, entityId: string) => `${base}/popout/e/${entityId}`;

/** Is this page a pop-out? Those show just the page, for a small window beside your work. */
export const isPopoutPath = (pathname: string, base: string) =>
  pathname.startsWith(`${base}/popout/`);

/** Opens an entry in a small window of its own, to keep beside a manuscript or another page. */
export function openPopout(base: string, entityId: string) {
  window.open(
    popoutPath(base, entityId),
    `atlas-popout-${entityId}`,
    'popup,width=560,height=820,noopener',
  );
}
