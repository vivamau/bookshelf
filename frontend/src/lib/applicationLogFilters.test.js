import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApplicationLogRange,
  formatApplicationLogTimestamp
} from './applicationLogFilters.js';

test('buildApplicationLogRange creates an inclusive local-minute range', () => {
  const range = buildApplicationLogRange({
    date: '2026-08-22',
    startTime: '08:30',
    endTime: '10:45'
  });

  assert.equal(range.startTimestamp, new Date(2026, 7, 22, 8, 30).getTime());
  assert.equal(range.endTimestamp, new Date(2026, 7, 22, 10, 46).getTime());
});

test('buildApplicationLogRange rejects reversed and impossible ranges', () => {
  assert.throws(() => buildApplicationLogRange({
    date: '2026-08-22',
    startTime: '12:00',
    endTime: '11:59'
  }), /ending time/i);
  assert.throws(() => buildApplicationLogRange({
    date: '2026-02-30',
    startTime: '08:00',
    endTime: '09:00'
  }), /valid date/i);
});

test('formatApplicationLogTimestamp provides a safe fallback', () => {
  assert.equal(formatApplicationLogTimestamp('not-a-date'), 'Unknown time');
  assert.match(formatApplicationLogTimestamp('2026-08-22T10:30:00.000Z'), /2026/);
});
