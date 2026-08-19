import test from 'node:test';
import assert from 'node:assert/strict';
import { countActiveFilters, readSearchParams, toggleCsvValue } from './searchParams.js';

test('readSearchParams applies defaults and clamps pagination', () => {
  assert.deepEqual(readSearchParams('?q=  dune  &page=-2&limit=500'), {
    q: 'dune',
    page: 1,
    limit: 60,
    sort: 'relevance',
    format: '',
    language: '',
    genre: '',
    author: '',
    publisher: '',
    authorName: '',
    publisherName: '',
    genreName: '',
    yearFrom: '',
    yearTo: ''
  });
});

test('toggleCsvValue adds and removes stable filter values', () => {
  assert.equal(toggleCsvValue('EPUB,PDF', 'CBR'), 'EPUB,PDF,CBR');
  assert.equal(toggleCsvValue('EPUB,PDF', 'EPUB'), 'PDF');
});

test('countActiveFilters counts populated filter groups', () => {
  assert.equal(countActiveFilters(readSearchParams('?format=PDF&language=3,4&yearFrom=2020')), 3);
});
