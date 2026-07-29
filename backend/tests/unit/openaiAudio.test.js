const {
    MAX_TTS_INPUT_CHARS,
    OpenAIConfigError,
    OpenAIRequestError,
    normalizeTtsText,
    splitTextForSpeech,
    synthesizeSpeech
} = require('../../utils/openaiAudio');

describe('openaiAudio utility', () => {
    afterEach(() => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_TTS_MODEL;
        delete process.env.OPENAI_TTS_VOICE;
        delete global.fetch;
        jest.restoreAllMocks();
    });

    test('normalizeTtsText collapses whitespace', () => {
        expect(normalizeTtsText(' Hello\n\nworld\t there ')).toBe('Hello world there');
    });

    test('splitTextForSpeech splits long text into bounded chunks', () => {
        const text = `${'A'.repeat(MAX_TTS_INPUT_CHARS - 20)}. ${'B'.repeat(200)}`;
        const chunks = splitTextForSpeech(text);

        expect(chunks.length).toBe(2);
        expect(chunks.every(chunk => chunk.length <= MAX_TTS_INPUT_CHARS + 1)).toBe(true);
    });

    test('synthesizeSpeech throws when the API key is missing', async () => {
        await expect(synthesizeSpeech({ text: 'Hello world' })).rejects.toBeInstanceOf(OpenAIConfigError);
    });

    test('synthesizeSpeech posts to the OpenAI speech endpoint', async () => {
        process.env.OPENAI_API_KEY = 'test-key';
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
        });

        const buffer = await synthesizeSpeech({ text: 'Hello world', voice: 'alloy', speed: 1 });

        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.equals(Buffer.from([1, 2, 3]))).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.openai.com/v1/audio/speech',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-key',
                    'Content-Type': 'application/json'
                })
            })
        );
    });

    test('synthesizeSpeech preserves OpenAI quota errors', async () => {
        process.env.OPENAI_API_KEY = 'test-key';
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({ error: { code: 'insufficient_quota', message: 'You exceeded your current quota.' } })
        });

        await expect(synthesizeSpeech({ text: 'Hello world' })).rejects.toMatchObject({
            constructor: OpenAIRequestError,
            status: 429,
            code: 'insufficient_quota'
        });
    });
});
