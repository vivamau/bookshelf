export const isEpubBook = (book) => {
  const filename = String(book?.book_filename || '').toLowerCase();
  const format = String(book?.format_name || '').toLowerCase();
  return filename.endsWith('.epub') || format === 'epub';
};

export const downloadBookToOfflineFolder = async ({
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
  if (!folderHandle) throw new Error('Choose an offline folder before downloading.');

  const response = await downloadFile(bookId);
  if (response?.data == null) throw new Error('The downloaded EPUB was empty.');

  const fileHandle = await writeOfflineBook(folderHandle, book.book_filename, response.data);
  const record = {
    bookId,
    filename: book.book_filename,
    fileHandle,
    metadata: book
  };

  await saveOfflineRecords(userId, [record]);
  return record;
};
