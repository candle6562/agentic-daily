const BLUESKY_SERVICE_URL = 'https://bsky.social';
const XRPC_PATH = '/xrpc';
const CREATE_SESSION_PATH = 'com.atproto.server.createSession';
const AUTHOR_FEED_PATH = 'app.bsky.feed.getAuthorFeed';
const LIST_FEED_PATH = 'app.bsky.feed.getListFeed';
const CONTENT_TYPE_JSON = 'application/json';
const AUTHORIZATION_HEADER = 'Authorization';
const BEARER_PREFIX = 'Bearer ';
const DEFAULT_POST_LIMIT = 50;

function buildXrpcUrl(serviceUrl, method, params) {
  const base = `${serviceUrl}${XRPC_PATH}/${method}`;
  const search = new URLSearchParams(params);
  return `${base}?${search.toString()}`;
}

class BlueskyClient {
  constructor(options = {}) {
    this.serviceUrl = options.serviceUrl || BLUESKY_SERVICE_URL;
    this.identifier = options.identifier || process.env.BLUESKY_IDENTIFIER || null;
    this.password = options.password || process.env.BLUESKY_APP_PASSWORD || null;
    this.accessJwt = options.accessJwt || process.env.BLUESKY_ACCESS_JWT || null;
    this.fetchImpl = options.fetchImpl || fetch;
    this.cachedAccessJwt = null;
  }

  async getAuthToken() {
    if (this.accessJwt) return this.accessJwt;
    if (this.cachedAccessJwt) return this.cachedAccessJwt;
    if (!this.identifier || !this.password) return null;

    const url = `${this.serviceUrl}${XRPC_PATH}/${CREATE_SESSION_PATH}`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': CONTENT_TYPE_JSON },
      body: JSON.stringify({ identifier: this.identifier, password: this.password })
    });

    if (!response.ok) {
      throw new Error(`Bluesky auth error: ${response.status}`);
    }

    const data = await response.json();
    this.cachedAccessJwt = data.accessJwt;
    return this.cachedAccessJwt;
  }

  async fetchJSON(method, params = {}) {
    const token = await this.getAuthToken();
    const headers = token ? { [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${token}` } : {};

    const response = await this.fetchImpl(buildXrpcUrl(this.serviceUrl, method, params), {
      headers
    });

    if (!response.ok) {
      throw new Error(`Bluesky API error: ${response.status}`);
    }

    return response.json();
  }

  async getAuthorFeed(actor, limit = DEFAULT_POST_LIMIT) {
    return this.fetchJSON(AUTHOR_FEED_PATH, { actor, limit: String(limit) });
  }

  async getListFeed(list, limit = DEFAULT_POST_LIMIT) {
    return this.fetchJSON(LIST_FEED_PATH, { list, limit: String(limit) });
  }

  async getPosts({ actor, listUri = null, limit = DEFAULT_POST_LIMIT }) {
    if (listUri) {
      const result = await this.getListFeed(listUri, limit);
      return Array.isArray(result.feed) ? result.feed : [];
    }

    if (!actor) {
      return [];
    }

    const result = await this.getAuthorFeed(actor, limit);
    return Array.isArray(result.feed) ? result.feed : [];
  }
}

module.exports = {
  BlueskyClient,
  BLUESKY_SERVICE_URL,
  DEFAULT_POST_LIMIT
};
