import test from 'node:test';
import assert from 'node:assert/strict';

import { truncateAudiobookTitle } from './audiobookTitle.js';

test('audiobook titles up to 18 characters remain unchanged', () => {
  assert.equal(truncateAudiobookTitle('Exactly 18 chars!!'), 'Exactly 18 chars!!');
});

test('audiobook titles longer than 18 characters are cut and receive an ellipsis', () => {
  assert.equal(truncateAudiobookTitle('The Long Audiobook Title'), 'The Long Audiobook...');
});

test('spaces count toward the 18-character title limit', () => {
  assert.equal(truncateAudiobookTitle('One Two Three Four Five'), 'One Two Three Four...');
});
