import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
