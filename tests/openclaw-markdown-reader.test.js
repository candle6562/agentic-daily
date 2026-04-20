const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  POLL_INTERVAL_MS,
  readLatestMarkdown,
  summarizeMarkdown,
  readAndSummarizeLatestMarkdown,
  createMarkdownPoller,
} = require('../src/openclaw-markdown-reader');

const DAY_TITLE = '# Agentic Developments Daily';
const DAY_DATE = '## 2026-04-18';
const SECTION_TITLE = '## Top News';
const ITEM_ONE = '- [Story One](https://example.com/1) - 100 points, 10 comments';
const ITEM_TWO = '- [Story Two](https://example.com/2) - 90 points, 9 comments';

function makeTempMarkdown(content) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'age-11-'));
  const filePath = path.join(tempDir, 'latest.md');
  fs.writeFileSync(filePath, content, 'utf8');
  return { tempDir, filePath };
}

describe('openclaw markdown reader', () => {
  test('reads latest markdown file content', () => {
    const markdown = [DAY_TITLE, DAY_DATE, '', SECTION_TITLE, ITEM_ONE].join('\n');
    const { filePath } = makeTempMarkdown(markdown);

    const content = readLatestMarkdown(filePath);

    expect(content).toContain(DAY_TITLE);
    expect(content).toContain(ITEM_ONE);
  });

  test('parses markdown into CEO awareness summary', () => {
    const markdown = [
      DAY_TITLE,
      DAY_DATE,
      '',
      SECTION_TITLE,
      ITEM_ONE,
      ITEM_TWO,
    ].join('\n');

    const summary = summarizeMarkdown(markdown);

    expect(summary.reportTitle).toBe('Agentic Developments Daily');
    expect(summary.reportDate).toBe('2026-04-18');
    expect(summary.highlights).toEqual([
      '[Story One](https://example.com/1) - 100 points, 10 comments',
      '[Story Two](https://example.com/2) - 90 points, 9 comments',
    ]);
    expect(summary.sectionCount).toBe(1);
  });

  test('reads and summarizes markdown in one call', () => {
    const markdown = [DAY_TITLE, DAY_DATE, '', SECTION_TITLE, ITEM_ONE].join('\n');
    const { filePath } = makeTempMarkdown(markdown);

    const result = readAndSummarizeLatestMarkdown({ filePath });

    expect(result.markdown).toContain(SECTION_TITLE);
    expect(result.summary.reportTitle).toBe('Agentic Developments Daily');
    expect(result.summary.highlights.length).toBe(1);
  });

  test('creates poller with 5-minute default interval and supports lifecycle', () => {
    const markdown = [DAY_TITLE, DAY_DATE, '', SECTION_TITLE, ITEM_ONE].join('\n');
    const { filePath } = makeTempMarkdown(markdown);
    const updates = [];
    const scheduleCalls = [];
    const clearCalls = [];

    const scheduleFn = (handler, intervalMs) => {
      scheduleCalls.push({ handler, intervalMs });
      return 'timer-id';
    };

    const clearFn = timerId => {
      clearCalls.push(timerId);
    };

    const poller = createMarkdownPoller({
      filePath,
      onUpdate: payload => updates.push(payload),
      scheduleFn,
      clearFn,
    });

    expect(poller.intervalMs).toBe(POLL_INTERVAL_MS);
    const first = poller.poll();
    expect(first.summary.reportDate).toBe('2026-04-18');
    expect(updates.length).toBe(1);

    poller.start();
    expect(scheduleCalls.length).toBe(1);
    expect(scheduleCalls[0].intervalMs).toBe(POLL_INTERVAL_MS);

    poller.stop();
    expect(clearCalls).toEqual(['timer-id']);
  });
});
