const { HNClient } = require('./hn-client');
const { AIFilter } = require('./ai-filter');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'content', 'sources', 'hn');

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function parseStory(story) {
  return {
    id: story.id,
    title: story.title,
    url: story.url,
    points: story.score || 0,
    comments: story.descendants || 0,
    author: story.by,
    date: new Date(story.time * 1000).toISOString(),
    timestamp: story.time
  };
}

class HNScraper {
  constructor(options = {}) {
    this.client = options.client || new HNClient();
    this.filter = options.filter || new AIFilter();
    this.storyLimit = options.storyLimit || 100;
  }

  async scrape() {
    const allStories = await this.client.getStories(this.storyLimit);
    const aiStories = this.filter.filterStories(allStories);
    return aiStories.map(parseStory);
  }

  async saveToFile(stories, date = new Date()) {
    const dateStr = formatDate(date);
    const filePath = path.join(OUTPUT_DIR, `${dateStr}.json`);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      date: dateStr,
      scrapedAt: new Date().toISOString(),
      count: stories.length,
      stories: stories
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return filePath;
  }

  async run(date = new Date()) {
    const stories = await this.scrape();
    const filePath = await this.saveToFile(stories, date);
    return { stories, filePath };
  }
}

module.exports = { HNScraper, formatDate, parseStory };