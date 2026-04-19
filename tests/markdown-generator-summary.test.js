const { generateMarkdown } = require('../src/markdown-generator');

describe('generateMarkdown summaries', () => {
  test('includes article summaries in structured markdown format', () => {
    const data = {
      date: '2026-04-19',
      scrapedAt: '2026-04-19T00:00:00.000Z',
      count: 1,
      stories: [
        {
          title: 'Agentic evals in production',
          url: 'https://example.com/agentic-evals',
          points: 120,
          comments: 45,
          author: 'eva',
          summary: {
            summaryBullets: ['New harness reduced flaky results by 30%'],
            keyInsights: ['Teams should separate discovery and execution checks'],
            quotes: ['"The strongest gains came from stricter verification gates."'],
            sourceTitle: 'Agentic evals in production',
            sourceUrl: 'https://example.com/agentic-evals'
          }
        }
      ]
    };

    const markdown = generateMarkdown(data);

    expect(markdown).toContain('## Article Summaries');
    expect(markdown).toContain('### Agentic evals in production');
    expect(markdown).toContain('- **Key insights**');
    expect(markdown).toContain('- Teams should separate discovery and execution checks');
    expect(markdown).toContain('- **Source:** [Agentic evals in production](https://example.com/agentic-evals)');
    expect(markdown).toContain('> "The strongest gains came from stricter verification gates."');
  });
});
