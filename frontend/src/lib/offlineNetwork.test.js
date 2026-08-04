import assert from 'node:assert/strict';
import test from 'node:test';
import { guardOnlineRequest } from './offlineNetwork.js';

test('guardOnlineRequest preserves requests when the browser is online', () => {
  const config = { url: '/books' };
  assert.equal(guardOnlineRequest(config, { onLine: true }), config);
});

test('guardOnlineRequest prevents API requests when the browser is offline', () => {
  assert.throws(
    () => guardOnlineRequest({ url: '/books' }, { onLine: false }),
    (error) => error.code === 'ERR_OFFLINE' && error.isOffline === true
  );
});
