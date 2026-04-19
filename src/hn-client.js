const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';
const ALGOLIA_API_BASE = 'https://hn.algolia.com/api/v1';
const MAX_COMMENT_SNIPPETS = 3;
const TEXT_EMPTY_LENGTH = 0;

class HNClient {
  constructor(baseUrl = HN_API_BASE, options = {}) {
    this.baseUrl = baseUrl;
    this.algoliaBaseUrl = options.algoliaBaseUrl || ALGOLIA_API_BASE;
    this.fetchFn = options.fetchFn || fetch;
  }

  async fetchJSON(path) {
    const response = await this.fetchFn(`${this.baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`HN API error: ${response.status}`);
    }
    return response.json();
  }

  async fetchAlgoliaJSON(path) {
    const response = await this.fetchFn(`${this.algoliaBaseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`HN Algolia API error: ${response.status}`);
    }
    return response.json();
  }

  async getTopStories(limit = 50) {
    const storyIds = await this.fetchJSON('/topstories.json');
    return storyIds.slice(0, limit);
  }

  async getItem(id) {
    return this.fetchJSON(`/item/${id}.json`);
  }

  async getStories(limit = 50) {
    const ids = await this.getTopStories(limit);
    const stories = await Promise.all(ids.map(id => this.getItem(id)));
    return stories.filter(story => story && story.type === 'story' && story.url);
  }

  async findDiscussionByUrl(url) {
    const encodedUrl = encodeURIComponent(url);
    const payload = await this.fetchAlgoliaJSON(`/search?query=${encodedUrl}&tags=story&hitsPerPage=10`);
    const hits = payload.hits || [];
    const matchingHit = hits.find(hit => hit.url === url) || hits[0];

    if (!matchingHit) {
      return null;
    }

    return {
      id: Number(matchingHit.objectID),
      title: matchingHit.title || 'Hacker News Discussion',
      commentsCount: matchingHit.num_comments || 0
    };
  }

  async summarizeThreadComments(storyId) {
    const story = await this.getItem(storyId);
    const commentIds = (story && story.kids ? story.kids : []).slice(0, MAX_COMMENT_SNIPPETS);
    if (commentIds.length === TEXT_EMPTY_LENGTH) {
      return null;
    }

    const comments = await Promise.all(commentIds.map(id => this.getItem(id)));
    const snippets = comments
      .map(comment => normalizeText(comment && comment.text))
      .filter(Boolean);

    if (snippets.length === TEXT_EMPTY_LENGTH) {
      return null;
    }

    return snippets.join(' ');
  }
}

function normalizeText(value) {
  if (!value || value.length === TEXT_EMPTY_LENGTH) {
    return '';
  }

  return decodeHtml(stripTags(value)).trim();
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, ' ');
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

module.exports = { HNClient, HN_API_BASE, ALGOLIA_API_BASE };
