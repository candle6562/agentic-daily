const { generateDailyMarkdown, rankStories } = require('../src/daily-markdown');
const fs = require('fs');
const path = require('path');

describe('generateDailyMarkdown', () => {
  const sampleStories = [
    { title: 'Claude Opus 4.7', url: 'https://anthropic.com/claude-opus-4-7', points: 1945, comments: 1436, author: 'user1' },
    { title: 'Measuring tokenizer costs', url: 'https://example.com/tokenizer', points: 670, comments: 469, author: 'user2' },
    { title: 'Qwen3 beats Opus', url: 'https://simonwillison.net/qwen', points: 457, comments: 94, author: 'user3' },
    { title: 'AI agent costs rising', url: 'https://tobyord.com/agents', points: 281, comments: 112, author: 'user4' },
    { title: 'Japan railways', url: 'https://worksinprogress.co/japan', points: 207, comments: 216, author: 'user5' },
  ];

  test('generates markdown with correct structure', () => {
    const date = '2026-04-18';
    const markdown = generateDailyMarkdown(date, sampleStories);

    expect(markdown).toContain('# Agentic Developments Daily');
    expect(markdown).toContain('## 2026-04-18');
    expect(markdown).toContain('## Top News');
    expect(markdown).toContain('## Growth Hacks');
    expect(markdown).toContain('## AI Researcher Updates');
    expect(markdown).toContain('## Project Ideas');
  });

  test('ranks stories by relevance score', () => {
    const ranked = rankStories(sampleStories);

    expect(ranked[0].title).toBe('Claude Opus 4.7');
    expect(ranked[1].title).toBe('Measuring tokenizer costs');
    expect(ranked[2].title).toBe('Qwen3 beats Opus');
  });

  test('categorizes stories into correct sections', () => {
    const markdown = generateDailyMarkdown('2026-04-18', sampleStories);
    expect(markdown).toContain('## Top News');
    expect(markdown).toContain('## Growth Hacks');
    expect(markdown).toContain('## AI Researcher Updates');
    expect(markdown).toContain('## Project Ideas');
  });

  test('format story as markdown link with summary', () => {
    const markdown = generateDailyMarkdown('2026-04-18', [sampleStories[0]]);
    expect(markdown).toContain('[Claude Opus 4.7](https://anthropic.com/claude-opus-4-7)');
  });
});

describe('rankStories', () => {
  test('scores by points + comments weighted', () => {
    const stories = [
      { title: 'A', url: 'http://a.com', points: 100, comments: 10, author: 'a' },
      { title: 'B', url: 'http://b.com', points: 50, comments: 200, author: 'b' },
    ];
    const ranked = rankStories(stories);
    expect(ranked[0].title).toBe('B');
  });

  test('sorts descending', () => {
    const stories = [
      { title: 'Low', url: 'http://low.com', points: 10, comments: 5, author: 'a' },
      { title: 'High', url: 'http://high.com', points: 1000, comments: 500, author: 'b' },
    ];
    const ranked = rankStories(stories);
    expect(ranked[0].title).toBe('High');
    expect(ranked[1].title).toBe('Low');
  });
});