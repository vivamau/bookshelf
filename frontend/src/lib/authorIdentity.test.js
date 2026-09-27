import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findExactAuthor,
  getAuthorFullName,
  normalizeAuthorName
} from './authorIdentity.js';

test('normalizes author names for reliable comparisons', () => {
  assert.equal(normalizeAuthorName('  Ursula   K.  '), 'Ursula K.');
  assert.equal(getAuthorFullName({ author_name: 'Ursula K.', author_lastname: 'Le Guin' }), 'Ursula K. Le Guin');
});

test('finds an existing author regardless of case and extra spaces', () => {
  const author = { ID: 7, author_name: 'Ursula K.', author_lastname: 'Le Guin' };
  assert.equal(findExactAuthor([author], ' ursula  k. LE GUIN '), author);
  assert.equal(findExactAuthor([author], 'Ursula Le Guin'), null);
});
