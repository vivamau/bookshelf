export const normalizeAudiobookSeriesSequence = (value) => {
  const sequence = String(value ?? '').trim();
  return sequence || null;
};

export const getAudiobookSeriesLabel = (audiobook = {}) => {
  const name = String(audiobook.series || '').trim();
  if (!name) return '';
  const sequence = normalizeAudiobookSeriesSequence(audiobook.seriesSequence);
  return sequence ? `${name} · Book ${sequence}` : name;
};

export const getAudiobookSeriesCompletion = (series = {}) => {
  const audiobooks = Array.isArray(series.audiobooks) ? series.audiobooks : [];
  return {
    completed: audiobooks.filter((audiobook) => Number(audiobook.progress_percentage) >= 100).length,
    total: audiobooks.length
  };
};

const getAudiobookSeries = (audiobook = {}) => {
  const explicitName = String(audiobook.series || '').trim();
  const segments = String(audiobook.folder || '').split('/').filter(Boolean);
  const inferredName = segments.length >= 3 ? segments.at(-2) : '';
  const name = explicitName || inferredName;
  if (!name) return null;

  const explicitSequence = normalizeAudiobookSeriesSequence(audiobook.seriesSequence);
  const titleSequence = /^\s*(\d+(?:\.\d+)?)\b/.exec(segments.at(-1) || audiobook.title || '');
  return {
    id: `series:${encodeURIComponent(name.normalize('NFC').toLocaleLowerCase())}`,
    name,
    sequence: explicitSequence || titleSequence?.[1] || null
  };
};

const compareSeriesAudiobooks = (left, right) => {
  const leftSequence = getAudiobookSeries(left)?.sequence;
  const rightSequence = getAudiobookSeries(right)?.sequence;
  const leftNumber = leftSequence === null ? Number.NaN : Number(leftSequence);
  const rightNumber = rightSequence === null ? Number.NaN : Number(rightSequence);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  if (Number.isFinite(leftNumber)) return -1;
  if (Number.isFinite(rightNumber)) return 1;
  return String(left.title || '').localeCompare(String(right.title || ''), undefined, { numeric: true });
};

export const buildAudiobookSeriesCatalog = (catalog = []) => {
  const seriesById = new Map();
  catalog.forEach((audiobook) => {
    const series = getAudiobookSeries(audiobook);
    if (!series) return;
    const existing = seriesById.get(series.id) || {
      id: series.id,
      name: series.name,
      audiobooks: []
    };
    existing.audiobooks.push({
      ...audiobook,
      series: series.name,
      seriesSequence: series.sequence
    });
    seriesById.set(series.id, existing);
  });

  return [...seriesById.values()].map((series) => ({
    ...series,
    audiobookCount: series.audiobooks.length,
    totalSize: series.audiobooks.reduce(
      (total, audiobook) => total + Number(audiobook.totalSize || 0),
      0
    ),
    audiobooks: series.audiobooks.sort(compareSeriesAudiobooks)
  })).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
};
