const fs = require('fs');
const path = require('path');
const { BlueskyClient, DEFAULT_POST_LIMIT } = require('./bluesky-client');
const { AIFilter } = require('./ai-filter');

const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'content', 'sources', 'bluesky');
const POSTS_SEGMENT = 'post';
const BLUESKY_APP_BASE_URL = 'https://bsky.app/profile';
const UNKNOWN_AUTHOR = 'unknown';
const DEFAULT_ENGAGEMENT_VALUE = 0;

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function readPostId(uri = '') {
  return uri.split('/').pop() || '';
}

function parseBlueskyPost(feedItem) {
  const post = feedItem && feedItem.post ? feedItem.post : {};
  const author = post.author || {};
  const record = post.record || {};

  const likes = post.likeCount || DEFAULT_ENGAGEMENT_VALUE;
  const reposts = post.repostCount || DEFAULT_ENGAGEMENT_VALUE;
  const replies = post.replyCount || DEFAULT_ENGAGEMENT_VALUE;
  const quotes = post.quoteCount || DEFAULT_ENGAGEMENT_VALUE;

  const authorHandle = author.handle || UNKNOWN_AUTHOR;
  const postId = readPostId(post.uri);
  const createdAt = record.createdAt || post.indexedAt || new Date().toISOString();

  return {
    id: post.uri || post.cid || postId,
    uri: post.uri || null,
    text: record.text || '',
    author: authorHandle,
    authorDisplayName: author.displayName || null,
    likes,
    reposts,
    replies,
    quotes,
    engagementScore: likes + reposts + replies + quotes,
    createdAt,
    timestamp: new Date(createdAt).getTime(),
    url: `${BLUESKY_APP_BASE_URL}/${authorHandle}/${POSTS_SEGMENT}/${postId}`
  };
}

class BlueskyScraper {
  constructor(options = {}) {
    this.client = options.client || new BlueskyClient(options.clientOptions || {});
    this.filter = options.filter || new AIFilter();
    this.postLimit = options.postLimit || DEFAULT_POST_LIMIT;
    this.actor = options.actor || process.env.BLUESKY_ACTOR || null;
    this.listUri = options.listUri || process.env.BLUESKY_LIST_URI || null;
    this.outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  }

  async scrape() {
    const feedItems = await this.client.getPosts({
      actor: this.actor,
      listUri: this.listUri,
      limit: this.postLimit
    });

    return feedItems
      .map(parseBlueskyPost)
      .filter(post => this.filter.isAIRelated(post.text));
  }

  async saveToFile(posts, date = new Date()) {
    const dateStr = formatDate(date);
    const filePath = path.join(this.outputDir, `${dateStr}.json`);
    fs.mkdirSync(this.outputDir, { recursive: true });

    const payload = {
      date: dateStr,
      scrapedAt: new Date().toISOString(),
      count: posts.length,
      posts
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return filePath;
  }

  async run(date = new Date()) {
    const posts = await this.scrape();
    const filePath = await this.saveToFile(posts, date);
    return { posts, filePath };
  }
}

module.exports = {
  BlueskyScraper,
  formatDate,
  parseBlueskyPost,
  DEFAULT_OUTPUT_DIR
};
