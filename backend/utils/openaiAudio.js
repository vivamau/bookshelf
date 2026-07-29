const OPENAI_AUDIO_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_TTS_VOICE = 'alloy';
const MAX_TTS_INPUT_CHARS = 3500;

class OpenAIConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OpenAIConfigError';
    }
}

class OpenAIRequestError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'OpenAIRequestError';
        this.status = status;
        this.code = code;
    }
}

function normalizeTtsText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/\s+/g, ' ').trim();
}

function splitTextForSpeech(text, maxChars = MAX_TTS_INPUT_CHARS) {
    const normalized = normalizeTtsText(text);
    if (!normalized) return [];

    const chunks = [];
    let remaining = normalized;

    while (remaining.length > maxChars) {
        let splitAt = remaining.lastIndexOf('.', maxChars);
        if (splitAt < maxChars * 0.5) splitAt = remaining.lastIndexOf(' ', maxChars);
        if (splitAt < maxChars * 0.5) splitAt = maxChars;

        const chunk = remaining.slice(0, splitAt + (splitAt === maxChars ? 0 : 1)).trim();
        if (chunk) chunks.push(chunk);
        remaining = remaining.slice(splitAt + (splitAt === maxChars ? 0 : 1)).trim();
    }

    if (remaining) chunks.push(remaining);
    return chunks;
}

function getTtsConfig() {
    return {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL,
        voice: process.env.OPENAI_TTS_VOICE || DEFAULT_TTS_VOICE
    };
}

async function synthesizeSpeech({ text, voice, speed } = {}) {
    const input = normalizeTtsText(text);
    if (!input) {
        throw new Error('Text is required to synthesize speech');
    }

    const chunks = splitTextForSpeech(input);
    if (chunks.length !== 1) {
        throw new Error(`Text chunk too long; maximum supported size is ${MAX_TTS_INPUT_CHARS} characters`);
    }

    const config = getTtsConfig();
    if (!config.apiKey) {
        throw new OpenAIConfigError('OPENAI_API_KEY is not configured on the server');
    }

    const response = await fetch(OPENAI_AUDIO_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: config.model,
            voice: voice || config.voice,
            input,
            response_format: 'mp3',
            ...(typeof speed === 'number' ? { speed } : {})
        })
    });

    if (!response.ok) {
        let payload;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        const apiError = payload?.error || {};
        const details = apiError.message || `OpenAI speech request failed (${response.status})`;
        throw new OpenAIRequestError(response.status, apiError.code || apiError.type, details);
    }

    return Buffer.from(await response.arrayBuffer());
}

module.exports = {
    DEFAULT_TTS_MODEL,
    DEFAULT_TTS_VOICE,
    MAX_TTS_INPUT_CHARS,
    OpenAIConfigError,
    OpenAIRequestError,
    getTtsConfig,
    normalizeTtsText,
    splitTextForSpeech,
    synthesizeSpeech
};
