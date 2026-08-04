import { unzipSync } from 'fflate';

const DB_NAME = 'bookshelf-offline-v1';
const DB_VERSION = 1;
const BOOKS_STORE = 'books';
const PROGRESS_STORE = 'progress';
const META_STORE = 'meta';
const OFFLINE_USER_KEY = 'offline-user';

const getBookKey = (userId, bookId) => `${userId}:${bookId}`;

const requestAsPromise = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const transactionAsPromise = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error || new Error('Offline storage transaction aborted'));
});

const openDatabase = () => {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Offline storage is not supported by this browser.');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BOOKS_STORE)) {
        database.createObjectStore(BOOKS_STORE, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(PROGRESS_STORE)) {
        database.createObjectStore(PROGRESS_STORE, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const normalizeOfflinePath = (value = '') => value
  .replace(/\\/g, '/')
  .split('/')
  .filter((part) => part && part !== '.')
  .reduce((parts, part) => {
    if (part === '..') parts.pop();
    else parts.push(part);
    return parts;
  }, [])
  .join('/');

const getZipEntry = (zip, entryName) => {
  const normalized = normalizeOfflinePath(entryName);
  if (zip[normalized]) return zip[normalized];

  const match = Object.keys(zip).find((name) => normalizeOfflinePath(name) === normalized);
  return match ? zip[match] : null;
};

const getMimeType = (entryName) => {
  const extension = entryName.split('.').pop()?.toLowerCase();
  const mimeTypes = {
    css: 'text/css',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4'
  };
  return mimeTypes[extension] || 'application/octet-stream';
};

const resolveResourcePath = (chapterPath, resourcePath) => {
  if (!resourcePath || resourcePath.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(resourcePath)) {
    return null;
  }

  try {
    return normalizeOfflinePath(new URL(resourcePath, `https://offline.local/${chapterPath}`).pathname);
  } catch {
    return normalizeOfflinePath(resourcePath);
  }
};

const createZipResourceUrl = (zip, entryName, objectUrls) => {
  const bytes = getZipEntry(zip, entryName);
  if (!bytes) return null;
  const url = URL.createObjectURL(new Blob([bytes], { type: getMimeType(entryName) }));
  objectUrls.push(url);
  return url;
};

const createZipTextUrl = (zip, entryName, objectUrls, mimeType) => {
  const bytes = getZipEntry(zip, entryName);
  if (!bytes) return null;
  const text = new TextDecoder().decode(bytes);
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  objectUrls.push(url);
  return url;
};

const rewriteCssUrls = (css, cssPath, zip, objectUrls) => css.replace(
  /url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi,
  (match, quote, resourcePath) => {
    const resolvedPath = resolveResourcePath(cssPath, resourcePath.trim());
    const resourceUrl = resolvedPath ? createZipResourceUrl(zip, resolvedPath, objectUrls) : null;
    return resourceUrl ? `url("${resourceUrl}")` : match;
  }
);

export const prepareOfflineChapter = (zip, chapterPath, rawHtml) => {
  const objectUrls = [];
  const parser = new DOMParser();
  const document = parser.parseFromString(rawHtml, 'text/html');

  document.querySelectorAll('[src], link[href]').forEach((element) => {
    const attribute = element.hasAttribute('src') ? 'src' : 'href';
    const resourcePath = resolveResourcePath(chapterPath, element.getAttribute(attribute));
    if (!resourcePath) return;

    const isStylesheet = element.tagName === 'LINK' && /\.css$/i.test(resourcePath);
    const resourceUrl = isStylesheet
      ? createZipTextUrl(zip, resourcePath, objectUrls, 'text/css')
      : createZipResourceUrl(zip, resourcePath, objectUrls);
    if (resourceUrl) element.setAttribute(attribute, resourceUrl);
  });

  document.querySelectorAll('style').forEach((element) => {
    element.textContent = rewriteCssUrls(element.textContent || '', chapterPath, zip, objectUrls);
  });

  return {
    html: `<!doctype html>${document.documentElement.outerHTML}`,
    objectUrls
  };
};

export const openOfflineEpub = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return unzipSync(bytes);
};

export const readOfflineEpubEntry = (zip, entryName) => {
  const bytes = getZipEntry(zip, entryName);
  if (!bytes) throw new Error(`Offline EPUB entry not found: ${entryName}`);
  return new TextDecoder().decode(bytes);
};

export const getOfflineBooks = async (userId) => {
  const database = await openDatabase();
  const transaction = database.transaction(BOOKS_STORE, 'readonly');
  const books = await requestAsPromise(transaction.objectStore(BOOKS_STORE).getAll());
  database.close();
  return books.filter((book) => String(book.userId) === String(userId));
};

export const getOfflineBook = async (userId, bookId) => {
  const database = await openDatabase();
  const transaction = database.transaction(BOOKS_STORE, 'readonly');
  const book = await requestAsPromise(transaction.objectStore(BOOKS_STORE).get(getBookKey(userId, bookId)));
  database.close();
  return book || null;
};

export const saveOfflineBooks = async (userId, records) => {
  const database = await openDatabase();
  const transaction = database.transaction(BOOKS_STORE, 'readwrite');
  const store = transaction.objectStore(BOOKS_STORE);
  records.forEach((record) => {
    store.put({
      ...record,
      key: getBookKey(userId, record.bookId),
      userId: String(userId),
      savedAt: Date.now()
    });
  });
  await transactionAsPromise(transaction);
  database.close();
};

export const clearOfflineBooks = async (userId) => {
  const readDatabase = await openDatabase();
  const readTransaction = readDatabase.transaction(BOOKS_STORE, 'readonly');
  const books = await requestAsPromise(readTransaction.objectStore(BOOKS_STORE).getAll());
  readDatabase.close();

  const database = await openDatabase();
  const transaction = database.transaction(BOOKS_STORE, 'readwrite');
  const store = transaction.objectStore(BOOKS_STORE);
  books
    .filter((book) => String(book.userId) === String(userId))
    .forEach((book) => store.delete(book.key));
  await transactionAsPromise(transaction);
  database.close();
};

export const getOfflineProgress = async (userId, bookId) => {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, 'readonly');
  const progress = await requestAsPromise(transaction.objectStore(PROGRESS_STORE).get(getBookKey(userId, bookId)));
  database.close();
  return progress || null;
};

export const saveOfflineProgress = async (userId, bookId, progress) => {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, 'readwrite');
  transaction.objectStore(PROGRESS_STORE).put({
    ...progress,
    key: getBookKey(userId, bookId),
    userId: String(userId),
    bookId: String(bookId),
    updatedAt: Date.now(),
    pending: true
  });
  await transactionAsPromise(transaction);
  database.close();
};

export const getPendingProgress = async (userId) => {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, 'readonly');
  const progress = await requestAsPromise(transaction.objectStore(PROGRESS_STORE).getAll());
  database.close();
  return progress.filter((item) => String(item.userId) === String(userId) && item.pending);
};

export const markProgressSynced = async (userId, bookId, updatedAt) => {
  const current = await getOfflineProgress(userId, bookId);
  if (!current || current.updatedAt !== updatedAt) return;

  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, 'readwrite');
  const store = transaction.objectStore(PROGRESS_STORE);
  store.put({ ...current, pending: false, syncedAt: Date.now() });
  await transactionAsPromise(transaction);
  database.close();
};

export const syncPendingProgress = async (userId, updateProgress) => {
  if (!userId || !navigator.onLine) return { synced: 0, failed: 0 };
  const pending = await getPendingProgress(userId);
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await updateProgress(item.bookId, {
        current_index: item.current_index,
        current_page: item.current_page,
        progress_percentage: item.progress_percentage
      });
      await markProgressSynced(userId, item.bookId, item.updatedAt);
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  return { synced, failed };
};

export const getOfflineFolderMeta = async (userId) => {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, 'readonly');
  const metadata = await requestAsPromise(transaction.objectStore(META_STORE).get(`folder:${userId}`));
  database.close();
  return metadata || null;
};

export const saveOfflineFolderMeta = async (userId, metadata) => {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, 'readwrite');
  transaction.objectStore(META_STORE).put({ ...metadata, key: `folder:${userId}`, updatedAt: Date.now() });
  await transactionAsPromise(transaction);
  database.close();
};

export const clearOfflineFolderMeta = async (userId) => {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, 'readwrite');
  transaction.objectStore(META_STORE).delete(`folder:${userId}`);
  await transactionAsPromise(transaction);
  database.close();
};

export const saveOfflineUser = async (user) => {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, 'readwrite');
  transaction.objectStore(META_STORE).put({ key: OFFLINE_USER_KEY, user });
  await transactionAsPromise(transaction);
  database.close();
};

export const getOfflineUser = async () => {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, 'readonly');
  const record = await requestAsPromise(transaction.objectStore(META_STORE).get(OFFLINE_USER_KEY));
  database.close();
  return record?.user || null;
};

export const clearOfflineUser = async () => {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, 'readwrite');
  transaction.objectStore(META_STORE).delete(OFFLINE_USER_KEY);
  await transactionAsPromise(transaction);
  database.close();
};

export const saveOfflineFolder = async (userId, folderHandle) => {
  await saveOfflineFolderMeta(userId, {
    name: folderHandle.name,
    folderHandle,
    source: 'filesystem-access-api'
  });
};

export const getOfflineFolderHandle = async (userId) => {
  const metadata = await getOfflineFolderMeta(userId);
  return metadata?.folderHandle || null;
};

export const ensureOfflineFolderPermission = async (folderHandle, request = false) => {
  if (!folderHandle) return false;

  if (typeof folderHandle.queryPermission === 'function') {
    const permission = await folderHandle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') return true;
    if (!request || typeof folderHandle.requestPermission !== 'function') return false;
    return (await folderHandle.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  return true;
};

const getDirectoryForFilePath = async (folderHandle, filePath) => {
  const parts = normalizeOfflinePath(filePath).split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error('A filename is required for an offline book.');

  let directory = folderHandle;
  for (const directoryName of parts) {
    directory = await directory.getDirectoryHandle(directoryName, { create: true });
  }

  return { directory, fileName };
};

export const writeOfflineBookToFolder = async (folderHandle, filePath, blob) => {
  const { directory, fileName } = await getDirectoryForFilePath(folderHandle, filePath);
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  return fileHandle;
};

export const getOfflineBookFile = async (offlineBook) => {
  if (offlineBook?.fileHandle) {
    try {
      return await offlineBook.fileHandle.getFile();
    } catch (error) {
      if (!offlineBook.file && !offlineBook.blob) throw error;
    }
  }

  return offlineBook?.file || offlineBook?.blob || null;
};
