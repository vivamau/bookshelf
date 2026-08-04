import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadBookToOfflineFolder, isEpubBook } from './offlineBookDownload.js';

test('isEpubBook recognizes EPUB metadata and filenames', () => {
  assert.equal(isEpubBook({ book_filename: 'Novel.EPUB' }), true);
  assert.equal(isEpubBook({ format_name: 'EPUB' }), true);
  assert.equal(isEpubBook({ book_filename: 'Novel.pdf', format_name: 'PDF' }), false);
});

test('downloadBookToOfflineFolder writes the EPUB and registers its metadata', async () => {
  const calls = [];
  const book = { ID: 7, book_title: 'Offline Book', book_filename: 'offline.epub', format_name: 'EPUB' };
  const folderHandle = { name: 'Bookshelf Offline' };
  const fileHandle = { name: 'offline.epub' };
  const blob = { size: 42 };

  const record = await downloadBookToOfflineFolder({
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
    metadata: book
  });
  assert.deepEqual(calls, [
    ['download', 7],
    ['write', folderHandle, 'offline.epub', blob],
    ['save', 3, [record]]
  ]);
});

test('downloadBookToOfflineFolder rejects unsupported formats before downloading', async () => {
  let downloaded = false;

  await assert.rejects(
    downloadBookToOfflineFolder({
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
