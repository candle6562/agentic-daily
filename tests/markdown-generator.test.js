const { generateMarkdown } = require('../src/markdown-generator');

describe('generateMarkdown', () => {
  test('handles empty stories without throwing', () => {
    const data = {
      date: '2026-04-19',
      scrapedAt: '2026-04-19T00:00:00.000Z',
      count: 0,
      stories: []
    };

    expect(() => generateMarkdown(data)).not.toThrow();
    const markdown = generateMarkdown(data);
    expect(markdown).toContain('# AI Daily Report — 2026-04-19');
    expect(markdown).toContain('- **Total AI Stories:** 0');
  });
});
