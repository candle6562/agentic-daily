const { HNClient } = require('../src/hn-client');

describe('HNClient', () => {
  let client;

  beforeEach(() => {
    client = new HNClient('https://hacker-news.firebaseio.com/v0');
  });

  describe('constructor', () => {
    it('uses default base URL', () => {
      const defaultClient = new HNClient();
      expect(defaultClient.baseUrl).toBe('https://hacker-news.firebaseio.com/v0');
    });

    it('accepts custom base URL', () => {
      const customClient = new HNClient('http://localhost:8080');
      expect(customClient.baseUrl).toBe('http://localhost:8080');
    });
  });

  describe('fetchJSON', () => {
    it('throws error on non-ok response', async () => {
      const badClient = new HNClient('https://httpbin.org');
      await expect(badClient.fetchJSON('/status/500')).rejects.toThrow();
    });
  });

  describe('getTopStories', () => {
    it('returns array of story IDs', async () => {
      const ids = await client.getTopStories(5);
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeLessThanOrEqual(5);
      ids.forEach(id => expect(typeof id).toBe('number'));
    });
  });

  describe('getItem', () => {
    it('returns item object for valid id', async () => {
      const item = await client.getItem(1);
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('type');
    });
  });
});