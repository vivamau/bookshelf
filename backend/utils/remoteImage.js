const dns = require('dns');
const net = require('net');
const axios = require('axios');

const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REMOTE_IMAGE_REDIRECTS = 3;
const IMAGE_EXTENSIONS_BY_CONTENT_TYPE = Object.freeze({
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
});

class RemoteImageError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'RemoteImageError';
        this.statusCode = statusCode;
    }
}

const isPublicIpv4 = (address) => {
    const octets = address.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return false;
    }

    const [first, second] = octets;
    if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
    if (first === 100 && second >= 64 && second <= 127) return false;
    if (first === 169 && second === 254) return false;
    if (first === 172 && second >= 16 && second <= 31) return false;
    if (first === 192 && (second === 0 || second === 168)) return false;
    if (first === 198 && (second === 18 || second === 19)) return false;
    return true;
};

const isPublicIpAddress = (address) => {
    const normalized = String(address || '').toLowerCase().split('%')[0];
    const family = net.isIP(normalized);
    if (family === 4) return isPublicIpv4(normalized);
    if (family !== 6) return false;

    if (normalized === '::' || normalized === '::1') return false;
    if (normalized.startsWith('::ffff:')) return false;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false;
    if (/^fe[89ab]/.test(normalized)) return false;
    if (normalized.startsWith('ff')) return false;

    return true;
};

const normalizeLookupResults = (result) => {
    if (Array.isArray(result)) return result;
    return result ? [result] : [];
};

const validateRemoteImageUrl = async (urlString, lookup = dns.promises.lookup) => {
    const candidate = String(urlString || '').trim();
    if (!candidate || candidate.length > 2048) {
        throw new RemoteImageError('Enter a valid cover image URL');
    }

    let parsed;
    try {
        parsed = new URL(candidate);
    } catch {
        throw new RemoteImageError('Enter a valid cover image URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new RemoteImageError('Only public HTTP or HTTPS image URLs are allowed');
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
        throw new RemoteImageError('Local or private cover URLs are not allowed');
    }

    const literalFamily = net.isIP(hostname);
    if (literalFamily) {
        if (!isPublicIpAddress(hostname)) {
            throw new RemoteImageError('Local or private cover URLs are not allowed');
        }
        return parsed.toString();
    }

    let addresses;
    try {
        addresses = normalizeLookupResults(await lookup(hostname, { all: true, verbatim: true }));
    } catch {
        throw new RemoteImageError('The cover image host could not be resolved');
    }

    if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
        throw new RemoteImageError('Local or private cover URLs are not allowed');
    }

    return parsed.toString();
};

const downloadRemoteImage = async (
    urlString,
    { httpClient = axios, lookup = dns.promises.lookup } = {}
) => {
    let response;
    let currentUrl = await validateRemoteImageUrl(urlString, lookup);
    for (let redirectCount = 0; redirectCount <= MAX_REMOTE_IMAGE_REDIRECTS; redirectCount += 1) {
        try {
            response = await httpClient({
                method: 'get',
                url: currentUrl,
                responseType: 'arraybuffer',
                timeout: 15000,
                maxRedirects: 0,
                maxContentLength: MAX_REMOTE_IMAGE_BYTES,
                maxBodyLength: MAX_REMOTE_IMAGE_BYTES,
                proxy: false,
                headers: {
                    Accept: 'image/jpeg,image/png,image/webp',
                    'User-Agent': 'Bookshelf/1.1'
                },
                validateStatus: (status) => status >= 200 && status < 400
            });
        } catch {
            throw new RemoteImageError('The cover image could not be downloaded', 502);
        }

        const status = Number(response.status || 200);
        if (status < 300) break;
        if (redirectCount === MAX_REMOTE_IMAGE_REDIRECTS || !response.headers?.location) {
            throw new RemoteImageError('The cover image redirected too many times', 502);
        }

        let redirectUrl;
        try {
            redirectUrl = new URL(response.headers.location, currentUrl).toString();
        } catch {
            throw new RemoteImageError('The cover image returned an invalid redirect', 502);
        }
        currentUrl = await validateRemoteImageUrl(redirectUrl, lookup);
    }

    const contentType = String(response.headers?.['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
    const extension = IMAGE_EXTENSIONS_BY_CONTENT_TYPE[contentType];
    if (!extension) {
        throw new RemoteImageError('The URL must return a JPEG, PNG, or WebP image');
    }

    const data = Buffer.from(response.data || []);
    if (!data.length) throw new RemoteImageError('The cover image is empty');
    if (data.length > MAX_REMOTE_IMAGE_BYTES) {
        throw new RemoteImageError('The cover image must be 10 MB or smaller');
    }

    return { data, extension, contentType };
};

module.exports = {
    IMAGE_EXTENSIONS_BY_CONTENT_TYPE,
    MAX_REMOTE_IMAGE_BYTES,
    MAX_REMOTE_IMAGE_REDIRECTS,
    RemoteImageError,
    downloadRemoteImage,
    isPublicIpAddress,
    validateRemoteImageUrl
};
