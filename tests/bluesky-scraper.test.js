const fs = require('fs');
const os = require('os');
const path = require('path');

const { BlueskyScraper, parseBlueskyPost, formatDate } = require('../src/bluesky-scraper');

describe('bluesky scraper utilities', () => {
  describe('formatDate', () => {
    it('formats date as YYYY-MM-DD', () => {
      const date = new Date('2026-04-19T12:00:00Z');
      expect(formatDate(date)).toBe('2026-04-19');
    });
  });

  describe('parseBlueskyPost', () => {
    it('parses feed view post into normalized shape', () => {
      const parsed = parseBlueskyPost({
        post: {
          uri: 'at://did:plc:abc/app.bsky.feed.post/123',
          indexedAt: '2026-04-19T10:00:00.000Z',
          author: { handle: 'alice.bsky.social', displayName: 'Alice' },
          record: { text: 'OpenAI model evaluation tips', createdAt: '2026-04-19T09:58:00.000Z' },
          likeCount: 20,
          repostCount: 5,
          replyCount: 3,
          quoteCount: 1
        }
      });

      expect(parsed.author).toBe('alice.bsky.social');
      expect(parsed.likes).toBe(20);
      expect(parsed.reposts).toBe(5);
      expect(parsed.replies).toBe(3);
      expect(parsed.quotes).toBe(1);
      expect(parsed.text).toContain('OpenAI');
      expect(parsed.engagementScore).toBe(29);
      expect(parsed.url).toContain('bsky.app/profile/alice.bsky.social/post/123');
    });
  });
});

describe('BlueskyScraper', () => {
  it('filters non-AI posts during scrape', async () => {
    const client = {
      getPosts: jest.fn().mockResolvedValue([
        {
          post: {
            uri: 'at://did:plc:1/app.bsky.feed.post/1',
            author: { handle: 'dev1.bsky.social' },
            record: { text: 'Anthropic released new Claude update' },
            likeCount: 4,
            repostCount: 2,
            replyCount: 1,
            quoteCount: 0,
            indexedAt: '2026-04-19T10:00:00.000Z'
          }
        },
        {
          post: {
            uri: 'at://did:plc:2/app.bsky.feed.post/2',
            author: { handle: 'dev2.bsky.social' },
            record: { text: 'Great weather for hiking today' },
            likeCount: 1,
            repostCount: 0,
            replyCount: 0,
            quoteCount: 0,
            indexedAt: '2026-04-19T11:00:00.000Z'
          }
        }
      ])
    };

    const scraper = new BlueskyScraper({ client, actor: 'ai.bsky.social', postLimit: 10 });
    const posts = await scraper.scrape();

    expect(client.getPosts).toHaveBeenCalledWith({ actor: 'ai.bsky.social', listUri: null, limit: 10 });
    expect(posts).toHaveLength(1);
    expect(posts[0].text).toContain('Claude');
  });

  it('writes date-stamped output JSON', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bluesky-scraper-'));
    const scraper = new BlueskyScraper({ outputDir: tmpDir, client: { getPosts: async () => [] } });
    const date = new Date('2026-04-19T00:00:00.000Z');

    const filePath = await scraper.saveToFile([{ id: 'a' }], date);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    expect(filePath).toBe(path.join(tmpDir, '2026-04-19.json'));
    expect(data.date).toBe('2026-04-19');
    expect(data.count).toBe(1);
    expect(data.posts).toHaveLength(1);
  });
});
