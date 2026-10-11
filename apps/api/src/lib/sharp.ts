import sharp from 'sharp';

/*
 * libvips keeps recently used files open in an internal cache. We never repeat an operation, so
 * the cache saves nothing, and on Windows an open file cannot be deleted (EBUSY), which broke
 * removing a map or an image after it had been processed. Turning the cache off avoids that.
 */
sharp.cache(false);

export default sharp;
