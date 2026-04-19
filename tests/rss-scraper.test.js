const fs = require('fs');
const os = require('os');
const path = require('path');

const { RSSScraper } = require('../src/rss-scraper');
const { RSS_FEEDS } = require('../src/rss-feeds');

const SAMPLE_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>OpenAI Blog</title>
    <item>
      <title>OpenAI launches a new model</title>
      <link>https://openai.com/blog/new-model</link>
      <description>The model improves coding and reasoning quality significantly.</description>
      <pubDate>Sun, 19 Apr 2026 10:00:00 GMT</pubDate>
      <guid>openai-1</guid>
    </item>
  </channel>
</rss>`;

const SAMPLE_ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Anthropic News</title>
  <entry>
    <title>Anthropic ships safer agents</title>
    <link href="https://anthropic.com/news/safer-agents" />
    <summary>New safeguards reduce risky tool actions in production workflows.</summary>
    <updated>2026-04-19T12:30:00Z</updated>
    <id>anthropic-1</id>
  </entry>
</feed>`;

describe('RSS_FEEDS', () => {
  test('defines multiple configured feeds', () => {
    expect(Array.isArray(RSS_FEEDS)).toBe(true);
    expect(RSS_FEEDS.length).toBeGreaterThan(1);

    for (const feed of RSS_FEEDS) {
      expect(feed).toHaveProperty('id');
      expect(feed).toHaveProperty('name');
      expect(feed).toHaveProperty('url');
    }
  });
});

describe('RSSScraper', () => {
  test('scrapes multiple feeds and summarizes stories', async () => {
    const feedResponses = {
      'https://feeds.example/openai.xml': SAMPLE_RSS_XML,
      'https://feeds.example/anthropic.xml': SAMPLE_ATOM_XML
    };

    global.fetch = jest.fn(async url => ({
      ok: true,
      text: async () => feedResponses[url]
    }));

    const fakeHnClient = {
      findDiscussionByUrl: jest.fn(async url => {
        if (url.includes('openai')) {
          return { id: 47775653, title: 'HN discussion', commentsCount: 51 };
        }
        return null;
      }),
      summarizeThreadComments: jest.fn(async threadId => {
        if (threadId === 47775653) {
          return 'Engineers debated eval quality and deployment risk tradeoffs.';
        }
        return null;
      })
    };

    const scraper = new RSSScraper({
      feeds: [
        { id: 'openai', name: 'OpenAI', url: 'https://feeds.example/openai.xml' },
        { id: 'anthropic', name: 'Anthropic', url: 'https://feeds.example/anthropic.xml' }
      ],
      hnClient: fakeHnClient
    });

    const items = await scraper.scrape();

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      sourceId: expect.any(String),
      sourceName: expect.any(String),
      title: expect.any(String),
      url: expect.any(String),
      summary: expect.any(String)
    });

    const openAiItem = items.find(item => item.sourceId === 'openai');
    expect(openAiItem.hnDiscussion).toEqual({
      id: 47775653,
      title: 'HN discussion',
      commentsCount: 51,
      commentSummary: 'Engineers debated eval quality and deployment risk tradeoffs.'
    });

    const anthropicItem = items.find(item => item.sourceId === 'anthropic');
    expect(anthropicItem.hnDiscussion).toBeNull();
  });

  test('writes dated rss source file to content/sources/rss', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rss-scraper-test-'));

    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => SAMPLE_RSS_XML
    }));

    const scraper = new RSSScraper({
      feeds: [{ id: 'openai', name: 'OpenAI', url: 'https://feeds.example/openai.xml' }],
      outputDir: tempDir,
      hnClient: {
        findDiscussionByUrl: jest.fn(async () => null),
        summarizeThreadComments: jest.fn(async () => null)
      }
    });

    const targetDate = new Date('2026-04-19T00:00:00Z');
    const result = await scraper.run(targetDate);

    expect(result.items).toHaveLength(1);
    expect(result.filePath).toBe(path.join(tempDir, '2026-04-19.json'));

    const payload = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));
    expect(payload).toMatchObject({
      date: '2026-04-19',
      count: 1
    });
    expect(payload.items[0].summary.length).toBeGreaterThan(0);
  });
});
