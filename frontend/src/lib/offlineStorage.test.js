import assert from 'node:assert/strict';
import test from 'node:test';
import { getOfflineStorageEstimate, requestOfflineStoragePersistence } from './offline.js';

test('requestOfflineStoragePersistence reuses an existing persistent grant', async () => {
  let requested = false;
  const result = await requestOfflineStoragePersistence({
    persisted: async () => true,
    persist: async () => {
      requested = true;
      return true;
    }
  });

  assert.equal(result, true);
  assert.equal(requested, false);
});

test('requestOfflineStoragePersistence requests persistence when needed', async () => {
  const result = await requestOfflineStoragePersistence({
    persisted: async () => false,
    persist: async () => true
  });
  assert.equal(result, true);
});

test('getOfflineStorageEstimate normalizes browser storage values', async () => {
  const result = await getOfflineStorageEstimate({
    estimate: async () => ({ usage: 1024, quota: 4096 })
  });
  assert.deepEqual(result, { usage: 1024, quota: 4096 });
});
