const {
    AudiobookProgressError,
    buildAudiobookProgress
} = require('../../utils/audiobookProgress');

const audiobook = {
    tracks: [
        { path: 'Book/chapter-01.mp3' },
        { path: 'Book/chapter-02.mp3' }
    ]
};

describe('audiobook listening progress', () => {
    test('calculates collection progress from the chapter and timestamp', () => {
        const progress = buildAudiobookProgress(audiobook, {
            trackPath: 'Book/chapter-02.mp3',
            trackIndex: 1,
            positionSeconds: 30,
            durationSeconds: 60
        });

        expect(progress.progressPercentage).toBe(75);
        expect(progress.completed).toBe(false);
    });

    test('marks the audiobook complete at the end of its final chapter', () => {
        const progress = buildAudiobookProgress(audiobook, {
            trackPath: 'Book/chapter-02.mp3',
            trackIndex: 1,
            positionSeconds: 59,
            durationSeconds: 60,
            completed: true
        });

        expect(progress.positionSeconds).toBe(60);
        expect(progress.progressPercentage).toBe(100);
        expect(progress.completed).toBe(true);
    });

    test('rejects a track that does not belong at the supplied index', () => {
        expect(() => buildAudiobookProgress(audiobook, {
            trackPath: 'Book/chapter-01.mp3',
            trackIndex: 1,
            positionSeconds: 0,
            durationSeconds: 60
        })).toThrow(AudiobookProgressError);
    });
});
