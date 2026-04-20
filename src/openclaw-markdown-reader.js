const fs = require('fs');
const path = require('path');

const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_POLL_INTERVAL_MINUTES = 5;
const POLL_INTERVAL_MS = DEFAULT_POLL_INTERVAL_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
const MAX_HIGHLIGHT_COUNT = 5;
const BULLET_PREFIX = '- ';
const TITLE_PREFIX = '# ';
const SECTION_PREFIX = '## ';
const DEFAULT_MARKDOWN_PATH = path.join(__dirname, '..', 'content', 'daily', 'latest.md');

function readLatestMarkdown(filePath = DEFAULT_MARKDOWN_PATH) {
  return fs.readFileSync(filePath, 'utf8');
}

function stripPrefix(value, prefix) {
  return value.startsWith(prefix) ? value.slice(prefix.length).trim() : value.trim();
}

function summarizeMarkdown(markdown) {
  const lines = markdown.split('\n');
  const reportTitleLine = lines.find(line => line.startsWith(TITLE_PREFIX)) || '';
  const reportDateLine = lines.find(line => line.startsWith(SECTION_PREFIX)) || '';
  const sectionTitles = lines
    .filter(line => line.startsWith(SECTION_PREFIX))
    .filter(line => line !== reportDateLine)
    .map(line => stripPrefix(line, SECTION_PREFIX));
  const highlights = lines
    .filter(line => line.startsWith(BULLET_PREFIX))
    .map(line => stripPrefix(line, BULLET_PREFIX))
    .slice(0, MAX_HIGHLIGHT_COUNT);

  return {
    reportTitle: stripPrefix(reportTitleLine, TITLE_PREFIX),
    reportDate: stripPrefix(reportDateLine, SECTION_PREFIX),
    sectionCount: sectionTitles.length,
    sections: sectionTitles,
    highlights,
  };
}

function readAndSummarizeLatestMarkdown(options = {}) {
  const filePath = options.filePath || DEFAULT_MARKDOWN_PATH;
  const now = options.now || (() => new Date().toISOString());
  const markdown = readLatestMarkdown(filePath);

  return {
    sourcePath: filePath,
    fetchedAt: now(),
    markdown,
    summary: summarizeMarkdown(markdown),
  };
}

function createMarkdownPoller(options = {}) {
  const filePath = options.filePath || DEFAULT_MARKDOWN_PATH;
  const intervalMs = options.intervalMs || POLL_INTERVAL_MS;
  const onUpdate = options.onUpdate || (() => undefined);
  const scheduleFn = options.scheduleFn || setInterval;
  const clearFn = options.clearFn || clearInterval;

  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new RangeError('intervalMs must be a positive integer');
  }

  let timerId = null;

  const poll = () => {
    const payload = readAndSummarizeLatestMarkdown({ filePath });
    onUpdate(payload);
    return payload;
  };

  const start = () => {
    if (timerId !== null) {
      return timerId;
    }

    timerId = scheduleFn(() => {
      poll();
    }, intervalMs);

    return timerId;
  };

  const stop = () => {
    if (timerId === null) {
      return;
    }

    clearFn(timerId);
    timerId = null;
  };

  return {
    filePath,
    intervalMs,
    poll,
    start,
    stop,
  };
}

module.exports = {
  DEFAULT_MARKDOWN_PATH,
  POLL_INTERVAL_MS,
  readLatestMarkdown,
  summarizeMarkdown,
  readAndSummarizeLatestMarkdown,
  createMarkdownPoller,
};
