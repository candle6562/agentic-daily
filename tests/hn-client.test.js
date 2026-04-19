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

  describe('findDiscussionByUrl', () => {
    it('returns matching discussion metadata', async () => {
      const fetchFn = jest.fn(async url => ({
        ok: true,
        json: async () => ({
          hits: [
            { objectID: '47775653', title: 'Thread title', url: 'https://example.com/post', num_comments: 12 }
          ]
        })
      }));
      const algoliaClient = new HNClient('https://hacker-news.firebaseio.com/v0', {
        fetchFn,
        algoliaBaseUrl: 'https://hn.algolia.com/api/v1'
      });

      const result = await algoliaClient.findDiscussionByUrl('https://example.com/post');
      expect(result).toEqual({
        id: 47775653,
        title: 'Thread title',
        commentsCount: 12
      });
    });

    it('returns null when no discussions exist', async () => {
      const fetchFn = jest.fn(async () => ({
        ok: true,
        json: async () => ({ hits: [] })
      }));
      const algoliaClient = new HNClient('https://hacker-news.firebaseio.com/v0', {
        fetchFn,
        algoliaBaseUrl: 'https://hn.algolia.com/api/v1'
      });

      const result = await algoliaClient.findDiscussionByUrl('https://missing.example/post');
      expect(result).toBeNull();
    });
  });

  describe('summarizeThreadComments', () => {
    it('joins normalized top-level comments from a thread', async () => {
      const itemMap = {
        5000: { id: 5000, kids: [7001, 7002] },
        7001: { id: 7001, type: 'comment', text: '<p>First &amp; useful point.</p>' },
        7002: { id: 7002, type: 'comment', text: '<p>Second point.</p>' }
      };
      const fetchFn = jest.fn(async url => {
        const idMatch = url.match(/\/item\/(\d+)\.json$/);
        const id = Number(idMatch[1]);
        return { ok: true, json: async () => itemMap[id] };
      });
      const threadedClient = new HNClient('https://hacker-news.firebaseio.com/v0', { fetchFn });

      const summary = await threadedClient.summarizeThreadComments(5000);
      expect(summary).toBe('First & useful point. Second point.');
    });

    it('returns null when story has no comments', async () => {
      const fetchFn = jest.fn(async () => ({
        ok: true,
        json: async () => ({ id: 5001, kids: [] })
      }));
      const threadedClient = new HNClient('https://hacker-news.firebaseio.com/v0', { fetchFn });

      const summary = await threadedClient.summarizeThreadComments(5001);
      expect(summary).toBeNull();
    });
  });
});
