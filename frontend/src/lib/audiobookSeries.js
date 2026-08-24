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
