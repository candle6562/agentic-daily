const { BlueskyClient, BLUESKY_SERVICE_URL } = require('../src/bluesky-client');

describe('BlueskyClient', () => {
  describe('constructor', () => {
    it('uses default service URL', () => {
      const client = new BlueskyClient();
      expect(client.serviceUrl).toBe(BLUESKY_SERVICE_URL);
    });

    it('accepts custom service URL', () => {
      const client = new BlueskyClient({ serviceUrl: 'https://example.social' });
      expect(client.serviceUrl).toBe('https://example.social');
    });
  });

  describe('getAuthToken', () => {
    it('returns configured access token directly', async () => {
      const client = new BlueskyClient({ accessJwt: 'preset-token' });
      await expect(client.getAuthToken()).resolves.toBe('preset-token');
    });

    it('creates session from identifier/password when token absent', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ accessJwt: 'session-token' })
      });

      const client = new BlueskyClient({
        identifier: 'user@example.com',
        password: 'app-password',
        fetchImpl
      });

      await expect(client.getAuthToken()).resolves.toBe('session-token');
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://bsky.social/xrpc/com.atproto.server.createSession',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
  });

  describe('getAuthorFeed', () => {
    it('fetches author feed with auth header and limit', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ feed: [{ post: { uri: 'at://x/y/z' } }] })
      });

      const client = new BlueskyClient({ accessJwt: 'token-123', fetchImpl });
      const response = await client.getAuthorFeed('alice.bsky.social', 5);

      expect(response.feed).toHaveLength(1);
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?actor=alice.bsky.social&limit=5',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123'
          })
        })
      );
    });
  });
});
