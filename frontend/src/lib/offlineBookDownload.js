export const isEpubBook = (book) => {
  const filename = String(book?.book_filename || '').toLowerCase();
  const format = String(book?.format_name || '').toLowerCase();
  return filename.endsWith('.epub') || format === 'epub';
};

export const downloadBookForOfflineReading = async ({
  book,
  bookId,
  userId,
  folderHandle,
  downloadFile,
  writeOfflineBook,
  saveOfflineRecords
}) => {
  if (!isEpubBook(book)) throw new Error('Only EPUB books can be saved for offline reading.');
  if (!book?.book_filename) throw new Error('This book does not have a downloadable filename.');
  if (!userId) throw new Error('Sign in before saving a book for offline reading.');

  const response = await downloadFile(bookId);
  if (response?.data == null) throw new Error('The downloaded EPUB was empty.');

  const record = {
    bookId,
    filename: book.book_filename,
    metadata: book
  };

  if (folderHandle) {
    if (!writeOfflineBook) throw new Error('Offline folder storage is unavailable.');
    record.fileHandle = await writeOfflineBook(folderHandle, book.book_filename, response.data);
    record.storageType = 'folder';
  } else {
    record.blob = response.data;
    record.storageType = 'browser';
  }

  await saveOfflineRecords(userId, [record]);
  return record;
};

export const downloadBookToOfflineFolder = downloadBookForOfflineReading;
