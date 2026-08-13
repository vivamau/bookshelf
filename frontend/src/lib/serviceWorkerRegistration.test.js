import assert from 'node:assert/strict';
import test from 'node:test';
import { configureServiceWorker } from './serviceWorkerRegistration.js';

test('configureServiceWorker removes stale app-shell caches during development', async () => {
  const calls = [];
  const result = await configureServiceWorker({
    isProduction: false,
    serviceWorker: {
      getRegistrations: async () => [
        { unregister: async () => calls.push('unregister-1') },
        { unregister: async () => calls.push('unregister-2') }
      ]
    },
    cacheStorage: {
      keys: async () => ['bookshelf-shell-v3', 'unrelated-cache'],
      delete: async (name) => calls.push(['delete', name])
    }
  });

  assert.deepEqual(result, {
    mode: 'development',
    unregistered: 2,
    clearedCaches: ['bookshelf-shell-v3']
  });
  assert.deepEqual(calls, [
    'unregister-1',
    'unregister-2',
    ['delete', 'bookshelf-shell-v3']
  ]);
});

test('configureServiceWorker registers and checks for updates in production', async () => {
  const calls = [];
  const registration = { update: async () => calls.push('update') };
  const result = await configureServiceWorker({
    isProduction: true,
    serviceWorker: {
      register: async (url) => {
        calls.push(['register', url]);
        return registration;
      }
    }
  });

  assert.deepEqual(result, { mode: 'production', registration });
  assert.deepEqual(calls, [['register', '/service-worker.js'], 'update']);
});
