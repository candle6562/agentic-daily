const fs = require('fs');
const path = require('path');

const mockScraperRun = jest.fn();

jest.mock('../src/scraper', () => {
  return {
    HNScraper: jest.fn().mockImplementation(() => ({ run: mockScraperRun }))
  };
});

jest.mock('../src/daily-markdown', () => {
  return {
    saveDailyMarkdown: jest.fn()
  };
});

const { HNScraper } = require('../src/scraper');
const { saveDailyMarkdown } = require('../src/daily-markdown');
const indexModule = require('../index');

describe('index main workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reads scraper output and saves dated + latest markdown', async () => {
    mockScraperRun.mockResolvedValue({
      filePath: '/tmp/hn.json',
      stories: [{ title: 'A story' }]
    });

    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      date: '2026-04-19',
      count: 1,
      stories: [{ title: 'A story' }]
    }));

    saveDailyMarkdown.mockReturnValue({
      dateFile: '/tmp/daily/2026-04-19.md',
      latestFile: '/tmp/daily/latest.md'
    });

    await indexModule.main();

    expect(HNScraper).toHaveBeenCalledWith({ storyLimit: 100 });
    expect(mockScraperRun).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/hn.json', 'utf-8');
    expect(saveDailyMarkdown).toHaveBeenCalledWith(
      '2026-04-19',
      [{ title: 'A story' }],
      path.join(__dirname, '..', 'content', 'daily')
    );
  });
});
