import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAudiobookSeriesCatalog,
  getAudiobookSeriesCompletion,
  getAudiobookSeriesLabel,
  normalizeAudiobookSeriesSequence
} from './audiobookSeries.js';

test('formats audiobook series names and positions', () => {
  assert.equal(normalizeAudiobookSeriesSequence(' 2.5 '), '2.5');
  assert.equal(normalizeAudiobookSeriesSequence(''), null);
  assert.equal(getAudiobookSeriesLabel({ series: 'Earthsea', seriesSequence: '2' }), 'Earthsea · Book 2');
  assert.equal(getAudiobookSeriesLabel({ series: 'Earthsea' }), 'Earthsea');
  assert.equal(getAudiobookSeriesLabel({}), '');
});

test('summarizes completed books in a series', () => {
  assert.deepEqual(getAudiobookSeriesCompletion({
    audiobooks: [
      { progress_percentage: 100 },
      { progress_percentage: 32 },
      { progress_percentage: 100 }
    ]
  }), { completed: 2, total: 3 });
});

test('builds homepage series from the lightweight audiobook catalog', () => {
  const second = {
    folder: '@bookshelf-destination-2/Earthsea/2 The Tombs of Atuan',
    title: 'The Tombs of Atuan',
    totalSize: 200,
    progress_percentage: 20
  };
  const first = {
    folder: '@bookshelf-destination-2/Earthsea/A Wizard of Earthsea',
    title: 'A Wizard of Earthsea',
    series: 'Earthsea',
    seriesSequence: '1',
    totalSize: 100,
    progress_percentage: 100
  };

  const result = buildAudiobookSeriesCatalog([second, first]);

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Earthsea');
  assert.equal(result[0].audiobookCount, 2);
  assert.equal(result[0].totalSize, 300);
  assert.deepEqual(
    result[0].audiobooks.map(({ title, seriesSequence }) => ({ title, seriesSequence })),
    [
      { title: 'A Wizard of Earthsea', seriesSequence: '1' },
      { title: 'The Tombs of Atuan', seriesSequence: '2' }
    ]
  );
});
