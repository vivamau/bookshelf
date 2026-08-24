export const getAudiobookFolderCandidates = (requestedFolder) => {
  const folder = String(requestedFolder || '').replace(/\\/g, '/');
  const relativeFolder = folder.replace(/^audiobooks\//i, '');
  return relativeFolder !== folder ? [folder, relativeFolder] : [folder];
};

export const getAudiobookPlaybackError = (mediaErrorCode) => ({
  1: 'Playback was interrupted.',
  2: 'The audiobook could not be loaded from the server. Check the network connection and try again.',
  3: 'The browser could not decode this audiobook. Its internal audio codec may not be supported.',
  4: 'This audiobook format or source is not supported by the browser.'
}[mediaErrorCode] || 'The audiobook could not be played.');

export const resolveAudiobookResume = (progress, tracks) => {
  if (!tracks?.length) {
    return { trackIndex: 0, positionSeconds: 0, progressPercentage: 0 };
  }

  const matchingTrackIndex = tracks.findIndex(track => track.path === progress?.track_path);
  const hasMatchingTrack = matchingTrackIndex >= 0;
  const trackIndex = hasMatchingTrack ? matchingTrackIndex : 0;
  const rawPosition = Number(progress?.position_seconds);
  const rawPercentage = Number(progress?.progress_percentage);

  return {
    trackIndex,
    positionSeconds: hasMatchingTrack && Number.isFinite(rawPosition) && rawPosition >= 0 ? rawPosition : 0,
    progressPercentage: hasMatchingTrack && Number.isFinite(rawPercentage)
      ? Math.min(100, Math.max(0, rawPercentage))
      : 0
  };
};

export const shouldPersistAudiobookProgress = (positionSeconds, lastSavedPosition, intervalSeconds = 10) => (
  Number.isFinite(positionSeconds)
  && Math.abs(positionSeconds - lastSavedPosition) >= intervalSeconds
);

export const normalizeAudiobookProgress = (value) => {
  const percentage = Number(value);
  return Number.isFinite(percentage) ? Math.min(100, Math.max(0, percentage)) : 0;
};

export const getAudiobookProgressLabel = (value) => {
  const percentage = normalizeAudiobookProgress(value);
  if (percentage >= 100) return 'Completed';
  if (percentage > 0) return `${Math.round(percentage)}% complete`;
  return 'Not started';
};
