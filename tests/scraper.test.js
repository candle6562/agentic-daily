const { formatDate, parseStory } = require('../src/scraper');

describe('scraper utilities', () => {
  describe('formatDate', () => {
    it('formats date as YYYY-MM-DD', () => {
      const date = new Date('2026-04-18T12:00:00Z');
      expect(formatDate(date)).toBe('2026-04-18');
    });
  });

  describe('parseStory', () => {
    it('parses HN story to required format', () => {
      const hnStory = {
        id: 12345,
        title: 'Test AI Story',
        url: 'https://example.com/article',
        score: 100,
        descendants: 50,
        by: 'testuser',
        time: 1713465600
      };
      const parsed = parseStory(hnStory);

      expect(parsed.timestamp).toBe(1713465600);
      expect(parsed.author).toBe('testuser');
      expect(parsed.comments).toBe(50);
      expect(parsed.points).toBe(100);
      expect(parsed.title).toBe('Test AI Story');
    });

    it('handles missing optional fields', () => {
      const minimalStory = {
        id: 1,
        title: 'Minimal',
        url: 'https://x.com',
        time: 1713465600
      };
      const parsed = parseStory(minimalStory);

      expect(parsed.points).toBe(0);
      expect(parsed.comments).toBe(0);
      expect(parsed.author).toBeUndefined();
    });
  });
});