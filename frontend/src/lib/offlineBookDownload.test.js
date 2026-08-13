import assert from 'node:assert/strict';
import test from 'node:test';
import {
  downloadCatalogBookAsFile,
  downloadBookForOfflineReading,
  getOfflineCatalogFailureMessage,
  isEpubBook,
  removeBookFromOfflineReading,
  saveOfflineBookAsFile
} from './offlineBookDownload.js';

test('isEpubBook recognizes EPUB metadata and filenames', () => {
  assert.equal(isEpubBook({ book_filename: 'Novel.EPUB' }), true);
  assert.equal(isEpubBook({ format_name: 'EPUB' }), true);
  assert.equal(isEpubBook({ book_filename: 'Novel.pdf', format_name: 'PDF' }), false);
});

test('downloadBookForOfflineReading writes the EPUB to a selected folder', async () => {
  const calls = [];
  const book = { ID: 7, book_title: 'Offline Book', book_filename: 'offline.epub', format_name: 'EPUB' };
  const folderHandle = { name: 'Bookshelf Offline' };
  const fileHandle = { name: 'offline.epub' };
  const blob = { size: 42 };

  const record = await downloadBookForOfflineReading({
    book,
    bookId: 7,
    userId: 3,
    folderHandle,
    downloadFile: async (bookId) => {
      calls.push(['download', bookId]);
      return { data: blob };
    },
    writeOfflineBook: async (folder, filename, data) => {
      calls.push(['write', folder, filename, data]);
      return fileHandle;
    },
    saveOfflineRecords: async (userId, records) => {
      calls.push(['save', userId, records]);
    }
  });

  assert.deepEqual(record, {
    bookId: 7,
    filename: 'offline.epub',
    fileHandle,
    metadata: book,
    storageType: 'folder'
  });
  assert.deepEqual(calls, [
    ['download', 7],
    ['write', folderHandle, 'offline.epub', blob],
    ['save', 3, [record]]
  ]);
});

test('downloadBookForOfflineReading stores the EPUB blob in browser storage without a folder picker', async () => {
  const book = { ID: 8, book_title: 'iPad Book', book_filename: 'ipad.epub', format_name: 'EPUB' };
  const blob = { size: 84 };
  let savedRecords;

  const record = await downloadBookForOfflineReading({
    book,
    bookId: 8,
    userId: 4,
    folderHandle: null,
    downloadFile: async () => ({ data: blob }),
    saveOfflineRecords: async (userId, records) => {
      assert.equal(userId, 4);
      savedRecords = records;
    }
  });

  assert.deepEqual(record, {
    bookId: 8,
    filename: 'ipad.epub',
    metadata: book,
    blob,
    storageType: 'browser'
  });
  assert.deepEqual(savedRecords, [record]);
});

test('downloadBookForOfflineReading rejects unsupported formats before downloading', async () => {
  let downloaded = false;

  await assert.rejects(
    downloadBookForOfflineReading({
      book: { book_filename: 'manual.pdf', format_name: 'PDF' },
      bookId: 2,
      userId: 3,
      folderHandle: { name: 'Offline' },
      downloadFile: async () => {
        downloaded = true;
      },
      writeOfflineBook: async () => {},
      saveOfflineRecords: async () => {}
    }),
    /Only EPUB books/
  );

  assert.equal(downloaded, false);
});

test('getOfflineCatalogFailureMessage keeps a missing optional endpoint silent', () => {
  assert.equal(getOfflineCatalogFailureMessage({ response: { status: 404 } }), null);
  assert.equal(
    getOfflineCatalogFailureMessage({ response: { status: 500, data: { error: 'Catalog failed' } } }),
    'Catalog failed'
  );
});

test('downloadCatalogBookAsFile saves one catalog EPUB directly to the laptop', async () => {
  const calls = [];
  const blob = { size: 256, type: 'application/epub+zip' };
  const link = {
    style: {},
    click: () => calls.push('click'),
    remove: () => calls.push('remove')
  };

  const result = await downloadCatalogBookAsFile({
    book: { ID: 17, book_filename: 'catalog/book.epub', format_name: 'EPUB' },
    downloadFile: async (bookId) => {
      calls.push(['download', bookId]);
      return { data: blob };
    },
    documentRef: {
      body: { appendChild: () => calls.push('append') },
      createElement: () => link
    },
    urlApi: {
      createObjectURL: (file) => {
        calls.push(['url', file]);
        return 'blob:catalog-book';
      },
      revokeObjectURL: (url) => calls.push(['revoke', url])
    },
    scheduleRevoke: (callback) => callback()
  });

  assert.deepEqual(result, { filename: 'book.epub' });
  assert.equal(link.download, 'book.epub');
  assert.deepEqual(calls, [
    ['download', 17],
    ['url', blob],
    'append',
    'click',
    'remove',
    ['revoke', 'blob:catalog-book']
  ]);
});

test('saveOfflineBookAsFile downloads a browser-stored EPUB with a reusable filename', async () => {
  const calls = [];
  const link = {
    style: {},
    click: () => calls.push('click'),
    remove: () => calls.push('remove')
  };
  const file = { size: 84, type: 'application/epub+zip' };
  const result = await saveOfflineBookAsFile({
    offlineBook: { bookId: 8, filename: 'nested/ipad.epub', blob: file },
    getOfflineFile: async (offlineBook) => {
      calls.push(['file', offlineBook.bookId]);
      return offlineBook.blob;
    },
    documentRef: {
      body: { appendChild: (element) => calls.push(['append', element]) },
      createElement: (tagName) => {
        calls.push(['element', tagName]);
        return link;
      }
    },
    urlApi: {
      createObjectURL: (blob) => {
        calls.push(['url', blob]);
        return 'blob:offline-book';
      },
      revokeObjectURL: (url) => calls.push(['revoke', url])
    },
    scheduleRevoke: (callback) => callback()
  });

  assert.deepEqual(result, { filename: 'ipad.epub' });
  assert.equal(link.href, 'blob:offline-book');
  assert.equal(link.download, 'ipad.epub');
  assert.deepEqual(calls, [
    ['file', 8],
    ['url', file],
    ['element', 'a'],
    ['append', link],
    'click',
    'remove',
    ['revoke', 'blob:offline-book']
  ]);
});

test('saveOfflineBookAsFile reports when the stored EPUB is unavailable', async () => {
  await assert.rejects(
    saveOfflineBookAsFile({
      offlineBook: { bookId: 9, filename: 'missing.epub' },
      getOfflineFile: async () => null
    }),
    /no longer available/
  );
});

test('removeBookFromOfflineReading deletes a browser-stored EPUB record', async () => {
  const calls = [];
  const result = await removeBookFromOfflineReading({
    offlineBook: { bookId: 8, filename: 'ipad.epub', storageType: 'browser', blob: { size: 84 } },
    userId: 4,
    folderHandle: null,
    ensureFolderPermission: async () => calls.push('permission'),
    removeFolderFile: async () => calls.push('file'),
    deleteOfflineRecord: async (userId, bookId) => calls.push(['record', userId, bookId])
  });

  assert.deepEqual(result, { storageType: 'browser' });
  assert.deepEqual(calls, [['record', 4, 8]]);
});

test('removeBookFromOfflineReading removes a folder-backed EPUB before its record', async () => {
  const calls = [];
  const folderHandle = { name: 'Offline Books' };
  const result = await removeBookFromOfflineReading({
    offlineBook: { bookId: 7, filename: 'folder/book.epub', storageType: 'folder', fileHandle: {} },
    userId: 3,
    folderHandle,
    ensureFolderPermission: async (folder, request) => {
      calls.push(['permission', folder, request]);
      return true;
    },
    removeFolderFile: async (folder, filename) => calls.push(['file', folder, filename]),
    deleteOfflineRecord: async (userId, bookId) => calls.push(['record', userId, bookId])
  });

  assert.deepEqual(result, { storageType: 'folder' });
  assert.deepEqual(calls, [
    ['permission', folderHandle, true],
    ['file', folderHandle, 'folder/book.epub'],
    ['record', 3, 7]
  ]);
});
