import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAudiobookFolderCandidates,
  getAudiobookPlaybackError,
  getAudiobookProgressLabel,
  normalizeAudiobookProgress,
  resolveAudiobookResume,
  shouldPersistAudiobookProgress
} from './audiobookProgress.js';

test('turns browser media error codes into useful playback messages', () => {
  assert.match(getAudiobookPlaybackError(2), /server|network/i);
  assert.match(getAudiobookPlaybackError(3), /decode|codec/i);
  assert.match(getAudiobookPlaybackError(4), /not supported/i);
});

test('provides a relative fallback for audiobooks-prefixed detail links', () => {
  assert.deepEqual(
    getAudiobookFolderCandidates('audiobooks/David Foster Wallace - Essays'),
    ['audiobooks/David Foster Wallace - Essays', 'David Foster Wallace - Essays']
  );
  assert.deepEqual(getAudiobookFolderCandidates('Earthsea'), ['Earthsea']);
});

test('resolves a saved audiobook chapter and timestamp', () => {
  const resume = resolveAudiobookResume({
    track_path: 'Book/chapter-02.mp3',
    position_seconds: 42.5,
    progress_percentage: 63
  }, [
    { path: 'Book/chapter-01.mp3' },
    { path: 'Book/chapter-02.mp3' }
  ]);

  assert.deepEqual(resume, {
    trackIndex: 1,
    positionSeconds: 42.5,
    progressPercentage: 63
  });
});

test('falls back safely when a saved chapter no longer exists', () => {
  const resume = resolveAudiobookResume({
    track_path: 'Book/missing.mp3',
    position_seconds: -1,
    progress_percentage: 130
  }, [{ path: 'Book/chapter-01.mp3' }]);

  assert.deepEqual(resume, {
    trackIndex: 0,
    positionSeconds: 0,
    progressPercentage: 0
  });
});

test('persists playback after the configured listening interval', () => {
  assert.equal(shouldPersistAudiobookProgress(19.9, 10), false);
  assert.equal(shouldPersistAudiobookProgress(20, 10), true);
  assert.equal(shouldPersistAudiobookProgress(5, 20), true);
});

test('normalizes and labels audiobook completion percentages', () => {
  assert.equal(normalizeAudiobookProgress(-4), 0);
  assert.equal(normalizeAudiobookProgress(32.4), 32.4);
  assert.equal(normalizeAudiobookProgress(101), 100);
  assert.equal(normalizeAudiobookProgress('invalid'), 0);
  assert.equal(getAudiobookProgressLabel(0), 'Not started');
  assert.equal(getAudiobookProgressLabel(32.4), '32% complete');
  assert.equal(getAudiobookProgressLabel(100), 'Completed');
});
