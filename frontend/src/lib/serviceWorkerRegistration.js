const CACHE_PREFIX = 'bookshelf-shell-';

const getRegistrations = async (serviceWorker) => {
  if (serviceWorker?.getRegistrations) return serviceWorker.getRegistrations();
  if (serviceWorker?.getRegistration) {
    const registration = await serviceWorker.getRegistration();
    return registration ? [registration] : [];
  }
  return [];
};

export const clearBookshelfShellCaches = async (cacheStorage = globalThis.caches) => {
  if (!cacheStorage?.keys || !cacheStorage?.delete) return [];
  const cacheNames = await cacheStorage.keys();
  const bookshelfCaches = cacheNames.filter((name) => name.startsWith(CACHE_PREFIX));
  await Promise.all(bookshelfCaches.map((name) => cacheStorage.delete(name)));
  return bookshelfCaches;
};

export const configureServiceWorker = async ({
  isProduction,
  serviceWorker = globalThis.navigator?.serviceWorker,
  cacheStorage = globalThis.caches
}) => {
  if (!serviceWorker) return { mode: 'unsupported' };

  if (!isProduction) {
    const registrations = await getRegistrations(serviceWorker);
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const clearedCaches = await clearBookshelfShellCaches(cacheStorage);
    return { mode: 'development', unregistered: registrations.length, clearedCaches };
  }

  const registration = await serviceWorker.register('/service-worker.js');
  if (registration.update) await registration.update();
  return { mode: 'production', registration };
};
