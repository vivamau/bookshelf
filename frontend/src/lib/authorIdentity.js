export const normalizeAuthorName = (value) => String(value || '')
  .normalize('NFKC')
  .trim()
  .replace(/\s+/g, ' ');

export const getAuthorFullName = (author = {}) => normalizeAuthorName(
  `${author.author_name || ''} ${author.author_lastname || ''}`
);

export const findExactAuthor = (authors = [], fullName = '') => {
  const normalizedFullName = normalizeAuthorName(fullName).toLocaleLowerCase();
  if (!normalizedFullName) return null;
  return authors.find((author) => (
    getAuthorFullName(author).toLocaleLowerCase() === normalizedFullName
  )) || null;
};
