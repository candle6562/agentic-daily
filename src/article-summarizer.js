const MIN_CONTENT_LENGTH = 200;
const MAX_PROMPT_CHARS = 12000;
const EMPTY_ITEMS = Object.freeze([]);

function toArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : EMPTY_ITEMS;
}

function normalizeModelOutput(rawResponse) {
  if (typeof rawResponse === 'string') {
    return rawResponse;
  }
  if (rawResponse && typeof rawResponse.text === 'string') {
    return rawResponse.text;
  }
  throw new Error('LLM response must be a string or an object with text');
}

function parseSummaryPayload(rawResponse) {
  const responseText = normalizeModelOutput(rawResponse);
  const parsed = JSON.parse(responseText);

  return {
    summaryBullets: toArray(parsed.summaryBullets),
    keyInsights: toArray(parsed.keyInsights),
    quotes: toArray(parsed.quotes),
  };
}

function buildPrompt(story, maxPromptChars) {
  const trimmedContent = story.content.slice(0, maxPromptChars);
  return [
    'Summarize the article content and return strict JSON only.',
    'Required keys: summaryBullets (array), keyInsights (array), quotes (array).',
    'summaryBullets: concise, non-generic bullets.',
    'keyInsights: concrete insights with implications.',
    'quotes: exact short quotes from source content.',
    `Title: ${story.title}`,
    `URL: ${story.url}`,
    'Content:',
    trimmedContent,
  ].join('\n');
}

class ArticleSummarizer {
  constructor(options = {}) {
    this.llmClient = options.llmClient;
    this.minContentLength = options.minContentLength || MIN_CONTENT_LENGTH;
    this.maxPromptChars = options.maxPromptChars || MAX_PROMPT_CHARS;
  }

  async summarizeStories(stories) {
    const summaryJobs = stories.map(story => this.summarizeStory(story));
    return Promise.all(summaryJobs);
  }

  async summarizeStory(story) {
    if (!story.content || story.content.length < this.minContentLength) {
      return story;
    }
    if (!this.llmClient || typeof this.llmClient.complete !== 'function') {
      throw new Error('ArticleSummarizer requires llmClient.complete for long-form content');
    }

    const prompt = buildPrompt(story, this.maxPromptChars);
    const rawResponse = await this.llmClient.complete(prompt);
    const parsedSummary = parseSummaryPayload(rawResponse);

    return {
      ...story,
      summary: {
        ...parsedSummary,
        sourceTitle: story.title,
        sourceUrl: story.url,
      },
    };
  }
}

module.exports = {
  ArticleSummarizer,
  MIN_CONTENT_LENGTH,
  MAX_PROMPT_CHARS,
};
