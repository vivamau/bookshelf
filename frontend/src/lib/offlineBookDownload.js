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

export const saveOfflineBookAsFile = async ({
  offlineBook,
  getOfflineFile,
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  scheduleRevoke = (callback) => globalThis.setTimeout(callback, 1000)
}) => {
  if (!offlineBook?.bookId) throw new Error('The offline book record is invalid.');
  if (!getOfflineFile) throw new Error('Offline file access is unavailable.');

  const file = await getOfflineFile(offlineBook);
  if (!file) throw new Error('The offline EPUB file is no longer available on this device.');
  if (!documentRef?.createElement || !documentRef.body || !urlApi?.createObjectURL) {
    throw new Error('File downloads are unavailable in this browser.');
  }

  const filename = String(offlineBook.filename || `book-${offlineBook.bookId}.epub`)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop() || `book-${offlineBook.bookId}.epub`;
  const objectUrl = urlApi.createObjectURL(file);
  const link = documentRef.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  documentRef.body.appendChild(link);

  try {
    link.click();
  } finally {
    if (typeof link.remove === 'function') link.remove();
    else documentRef.body.removeChild(link);
    scheduleRevoke(() => urlApi.revokeObjectURL(objectUrl));
  }

  return { filename };
};

export const removeBookFromOfflineReading = async ({
  offlineBook,
  userId,
  folderHandle,
  ensureFolderPermission,
  removeFolderFile,
  deleteOfflineRecord
}) => {
  if (!offlineBook?.bookId) throw new Error('The offline book record is invalid.');
  if (!userId) throw new Error('Sign in before removing an offline book.');

  const usesFolder = offlineBook.storageType === 'folder' || Boolean(offlineBook.fileHandle);
  if (usesFolder) {
    if (!folderHandle) throw new Error('Select the original offline folder before removing this EPUB file.');
    const permissionGranted = await ensureFolderPermission(folderHandle, true);
    if (!permissionGranted) throw new Error('Bookshelf needs write permission to remove the EPUB file.');
    await removeFolderFile(folderHandle, offlineBook.filename);
  }

  await deleteOfflineRecord(userId, offlineBook.bookId);
  return { storageType: usesFolder ? 'folder' : 'browser' };
};
