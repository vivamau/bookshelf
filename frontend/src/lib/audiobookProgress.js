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
