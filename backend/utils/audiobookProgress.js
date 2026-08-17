class AudiobookProgressError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AudiobookProgressError';
    }
}

const normalizeNonNegativeNumber = (value, field) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new AudiobookProgressError(`${field} must be a non-negative number`);
    }
    return value;
};

const buildAudiobookProgress = (audiobook, input = {}) => {
    if (!audiobook?.tracks?.length) {
        throw new AudiobookProgressError('Audiobook has no playable tracks');
    }

    const trackIndex = input.trackIndex;
    if (!Number.isSafeInteger(trackIndex) || trackIndex < 0 || trackIndex >= audiobook.tracks.length) {
        throw new AudiobookProgressError('trackIndex is invalid');
    }

    const track = audiobook.tracks[trackIndex];
    if (input.trackPath !== track.path) {
        throw new AudiobookProgressError('trackPath does not match the selected audiobook track');
    }

    const durationSeconds = normalizeNonNegativeNumber(input.durationSeconds, 'durationSeconds');
    const requestedPosition = normalizeNonNegativeNumber(input.positionSeconds, 'positionSeconds');
    const positionSeconds = input.completed === true && durationSeconds > 0
        ? durationSeconds
        : durationSeconds > 0
            ? Math.min(requestedPosition, durationSeconds)
            : requestedPosition;
    const trackFraction = input.completed === true
        ? 1
        : durationSeconds > 0
            ? positionSeconds / durationSeconds
            : 0;
    const progressPercentage = Math.min(
        100,
        Math.max(0, ((trackIndex + trackFraction) / audiobook.tracks.length) * 100)
    );

    return {
        trackPath: track.path,
        trackIndex,
        positionSeconds,
        durationSeconds,
        progressPercentage,
        completed: progressPercentage >= 100
    };
};

module.exports = {
    AudiobookProgressError,
    buildAudiobookProgress
};
