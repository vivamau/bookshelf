const {
    MAX_REMOTE_IMAGE_BYTES,
    RemoteImageError,
    downloadRemoteImage,
    isPublicIpAddress,
    validateRemoteImageUrl
} = require('../../utils/remoteImage');

describe('remote image download', () => {
    test.each(['127.0.0.1', '10.0.0.8', '169.254.169.254', '192.168.1.20', '::1', '::ffff:7f00:1', 'fd00::1'])(
        'rejects private address %s',
        (address) => expect(isPublicIpAddress(address)).toBe(false)
    );

    test('rejects hostnames that resolve to a private address', async () => {
        const lookup = jest.fn(async () => [{ address: '192.168.1.12', family: 4 }]);

        await expect(validateRemoteImageUrl('https://covers.example/cover.jpg', lookup))
            .rejects.toThrow('Local or private cover URLs are not allowed');
    });

    test('downloads a public image with strict size and redirect limits', async () => {
        const lookup = jest.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
        const httpClient = jest.fn(async () => ({
            data: Buffer.from('fake png'),
            headers: { 'content-type': 'image/png; charset=binary' }
        }));

        const result = await downloadRemoteImage('https://covers.example/cover.png', { httpClient, lookup });

        expect(result).toMatchObject({ extension: 'png', contentType: 'image/png' });
        expect(result.data.toString()).toBe('fake png');
        expect(httpClient).toHaveBeenCalledWith(expect.objectContaining({
            maxRedirects: 0,
            maxContentLength: MAX_REMOTE_IMAGE_BYTES,
            responseType: 'arraybuffer'
        }));
    });

    test('rejects redirects to private hosts', async () => {
        const lookup = jest.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
        const httpClient = jest.fn(async () => ({
            status: 302,
            data: Buffer.alloc(0),
            headers: { location: 'http://127.0.0.1/internal-cover.jpg' }
        }));

        await expect(downloadRemoteImage('https://covers.example/redirect', { httpClient, lookup }))
            .rejects.toThrow('Local or private cover URLs are not allowed');
    });

    test('rejects responses that are not supported images', async () => {
        const lookup = jest.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
        const httpClient = jest.fn(async () => ({
            data: Buffer.from('<html></html>'),
            headers: { 'content-type': 'text/html' }
        }));

        await expect(downloadRemoteImage('https://covers.example/not-an-image', { httpClient, lookup }))
            .rejects.toThrow(RemoteImageError);
    });
});
