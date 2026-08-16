export const AUDIOBOOK_TITLE_MAX_LENGTH = 18;

export const truncateAudiobookTitle = (title) => {
  const characters = Array.from(String(title ?? ''));

  if (characters.length <= AUDIOBOOK_TITLE_MAX_LENGTH) {
    return characters.join('');
  }

  return `${characters.slice(0, AUDIOBOOK_TITLE_MAX_LENGTH).join('')}...`;
};
