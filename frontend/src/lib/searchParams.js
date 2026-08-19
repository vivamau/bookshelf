export const SEARCH_DEFAULTS = Object.freeze({
  page: 1,
  limit: 24,
  sort: 'relevance'
});

export const readSearchParams = (value) => {
  const params = value instanceof URLSearchParams ? value : new URLSearchParams(value || '');
  const page = Math.max(1, Number.parseInt(params.get('page') || SEARCH_DEFAULTS.page, 10) || SEARCH_DEFAULTS.page);
  const limit = Math.min(60, Math.max(1, Number.parseInt(params.get('limit') || SEARCH_DEFAULTS.limit, 10) || SEARCH_DEFAULTS.limit));

  return {
    q: (params.get('q') || '').trim(),
    page,
    limit,
    sort: params.get('sort') || SEARCH_DEFAULTS.sort,
    format: params.get('format') || '',
    language: params.get('language') || '',
    genre: params.get('genre') || '',
    author: params.get('author') || '',
    publisher: params.get('publisher') || '',
    authorName: params.get('authorName') || '',
    publisherName: params.get('publisherName') || '',
    genreName: params.get('genreName') || '',
    yearFrom: params.get('yearFrom') || '',
    yearTo: params.get('yearTo') || ''
  };
};

export const toggleCsvValue = (csv, value) => {
  const values = String(csv || '').split(',').filter(Boolean);
  const normalizedValue = String(value);
  return values.includes(normalizedValue)
    ? values.filter((item) => item !== normalizedValue).join(',')
    : [...values, normalizedValue].join(',');
};

export const countActiveFilters = (filters) => [
  filters.format,
  filters.language,
  filters.genre,
  filters.author,
  filters.publisher,
  filters.authorName,
  filters.publisherName,
  filters.genreName,
  filters.yearFrom,
  filters.yearTo
].filter(Boolean).length;
