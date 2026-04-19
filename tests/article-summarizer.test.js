const { ArticleSummarizer } = require('../src/article-summarizer');

describe('ArticleSummarizer', () => {
  test('summarizes long-form story content with insights, attribution, and quotes', async () => {
    const llmClient = {
      complete: jest.fn().mockResolvedValue(JSON.stringify({
        summaryBullets: ['New benchmark improves tool-use reliability'],
        keyInsights: ['Evaluation uses real-world tasks instead of synthetic prompts'],
        quotes: ['"We observed consistent gains across agentic tasks."']
      }))
    };

    const summarizer = new ArticleSummarizer({ llmClient });
    const stories = [
      {
        title: 'Agentic evaluation methods',
        url: 'https://example.com/evals',
        content: 'Long article body '.repeat(20),
        points: 10,
        comments: 5,
        author: 'alice'
      }
    ];

    const summarizedStories = await summarizer.summarizeStories(stories);

    expect(llmClient.complete).toHaveBeenCalledTimes(1);
    expect(summarizedStories[0].summary).toEqual({
      summaryBullets: ['New benchmark improves tool-use reliability'],
      keyInsights: ['Evaluation uses real-world tasks instead of synthetic prompts'],
      quotes: ['"We observed consistent gains across agentic tasks."'],
      sourceTitle: 'Agentic evaluation methods',
      sourceUrl: 'https://example.com/evals'
    });
  });

  test('skips summarization for short content', async () => {
    const llmClient = {
      complete: jest.fn()
    };
    const summarizer = new ArticleSummarizer({ llmClient });
    const stories = [{ title: 'Short note', url: 'https://example.com/short', content: 'short' }];

    const result = await summarizer.summarizeStories(stories);

    expect(llmClient.complete).not.toHaveBeenCalled();
    expect(result[0].summary).toBeUndefined();
  });
});
