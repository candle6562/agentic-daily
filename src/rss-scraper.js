const fs = require('fs');
const path = require('path');
const { RSS_FEEDS } = require('./rss-feeds');
const { HNClient } = require('./hn-client');

const OUTPUT_DIR = path.join(__dirname, '..', 'content', 'sources', 'rss');
const SUMMARY_MAX_CHARS = 200;
const ZERO_ITEMS = 0;

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, ' ');
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeText(value) {
  if (!value) {
    return '';
  }

  return decodeHtml(stripHtml(value)).replace(/\s+/g, ' ').trim();
}

function truncateSummary(text) {
  if (text.length <= SUMMARY_MAX_CHARS) {
    return text;
  }

  return `${text.slice(0, SUMMARY_MAX_CHARS - 3).trim()}...`;
}

function summarizeArticle(title, description) {
  const normalizedDescription = normalizeText(description);
  if (normalizedDescription.length > ZERO_ITEMS) {
    return truncateSummary(normalizedDescription);
  }

  return truncateSummary(`Update from ${title}`);
}

function extractTagValue(block, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(pattern);
  return match ? match[1].trim() : '';
}

function extractAtomLink(block) {
  const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
  return linkMatch ? linkMatch[1] : '';
}

function parseRssItems(xml, feed) {
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return itemMatches.map(match => {
    const block = match[1];
    const title = normalizeText(extractTagValue(block, 'title'));
    const url = normalizeText(extractTagValue(block, 'link'));
    const description = extractTagValue(block, 'description');
    const published = extractTagValue(block, 'pubDate');

    return {
      sourceId: feed.id,
      sourceName: feed.name,
      title,
      url,
      publishedAt: published ? new Date(published).toISOString() : null,
      summary: summarizeArticle(title, description)
    };
  });
}

function parseAtomEntries(xml, feed) {
  const entryMatches = [...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)];
  return entryMatches.map(match => {
    const block = match[1];
    const title = normalizeText(extractTagValue(block, 'title'));
    const url = normalizeText(extractAtomLink(block));
    const summary = extractTagValue(block, 'summary') || extractTagValue(block, 'content');
    const updated = extractTagValue(block, 'updated') || extractTagValue(block, 'published');

    return {
      sourceId: feed.id,
      sourceName: feed.name,
      title,
      url,
      publishedAt: updated ? new Date(updated).toISOString() : null,
      summary: summarizeArticle(title, summary)
    };
  });
}

class RSSScraper {
  constructor(options = {}) {
    this.feeds = options.feeds || RSS_FEEDS;
    this.hnClient = options.hnClient || new HNClient();
    this.outputDir = options.outputDir || OUTPUT_DIR;
    this.fetchFn = options.fetchFn || fetch;
  }

  async fetchFeedXml(url) {
    const response = await this.fetchFn(url);
    if (!response.ok) {
      throw new Error(`RSS feed fetch failed: ${response.status}`);
    }

    return response.text();
  }

  parseFeed(xml, feed) {
    const rssItems = parseRssItems(xml, feed);
    if (rssItems.length > ZERO_ITEMS) {
      return rssItems;
    }

    return parseAtomEntries(xml, feed);
  }

  async enrichWithHnDiscussion(item) {
    const discussion = await this.hnClient.findDiscussionByUrl(item.url);
    if (!discussion) {
      return { ...item, hnDiscussion: null };
    }

    const commentSummary = await this.hnClient.summarizeThreadComments(discussion.id);

    return {
      ...item,
      hnDiscussion: {
        id: discussion.id,
        title: discussion.title,
        commentsCount: discussion.commentsCount,
        commentSummary
      }
    };
  }

  async scrape() {
    const allItems = [];

    for (const feed of this.feeds) {
      const xml = await this.fetchFeedXml(feed.url);
      const parsedItems = this.parseFeed(xml, feed).filter(item => item.title && item.url);
      allItems.push(...parsedItems);
    }

    const enriched = await Promise.all(allItems.map(item => this.enrichWithHnDiscussion(item)));
    return enriched;
  }

  async saveToFile(items, date = new Date()) {
    const dateStr = formatDate(date);
    const filePath = path.join(this.outputDir, `${dateStr}.json`);

    fs.mkdirSync(this.outputDir, { recursive: true });
    const payload = {
      date: dateStr,
      scrapedAt: new Date().toISOString(),
      count: items.length,
      items
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return filePath;
  }

  async run(date = new Date()) {
    const items = await this.scrape();
    const filePath = await this.saveToFile(items, date);
    return { items, filePath };
  }
}

module.exports = {
  RSSScraper,
  OUTPUT_DIR,
  formatDate,
  summarizeArticle
};
