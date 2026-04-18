const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

class HNClient {
  constructor(baseUrl = HN_API_BASE) {
    this.baseUrl = baseUrl;
  }

  async fetchJSON(path) {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`HN API error: ${response.status}`);
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
}

module.exports = { HNClient, HN_API_BASE };