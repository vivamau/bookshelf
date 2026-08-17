import test from 'node:test';
import assert from 'node:assert/strict';

import { applyAudiobookUploadConflicts } from './audiobookUploadQueue.js';

test('marks matching audiobook paths as duplicates so they are not uploaded', () => {
  const [duplicate, available] = applyAudiobookUploadConflicts([
    { path: 'Book/audio.m4b', status: 'pending', progress: 0 },
    { path: 'Book/cover.jpg', status: 'pending', progress: 0 }
  ], [
    { relativePath: 'Book/audio.m4b', status: 'duplicate' }
  ]);

  assert.deepEqual(duplicate, {
    path: 'Book/audio.m4b',
    status: 'duplicate',
    progress: 100
  });
  assert.equal(available.status, 'pending');
});

test('marks an occupied path with a different size as a conflict', () => {
  const [conflict] = applyAudiobookUploadConflicts([
    { path: 'Book/audio.m4b', status: 'pending', progress: 0, error: '' }
  ], [
    { relativePath: 'Book/audio.m4b', status: 'conflict' }
  ]);

  assert.equal(conflict.status, 'error');
  assert.match(conflict.error, /different file already exists/i);
});
