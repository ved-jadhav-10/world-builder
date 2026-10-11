/** "The Gilded Eel!" -> "the-gilded-eel"; accents are folded ("Ébène" -> "ebene"). */
export function slugify(input: string, separator: '-' | '_' = '-', maxLength = 60): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .slice(0, maxLength);
  const trimEdges = new RegExp(`^${separator}+|${separator}+$`, 'g');
  return slug.replace(trimEdges, '');
}
