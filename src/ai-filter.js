const AI_KEYWORDS = [
  'ai', 'ml', 'machine learning', 'deep learning', 'neural',
  'gpt', 'llm', 'large language model', 'transformer',
  'chatgpt', 'openai', 'anthropic', 'claude',
  'stable diffusion', 'midjourney', 'generative', 'genai',
  'artificial intelligence', 'nlp', 'natural language',
  'computer vision', 'reinforcement learning', 'rlhf',
  'embedding', 'vector database', 'rag', 'retrieval augmented',
  'fine-tuning', 'prompt engineering', 'copilot', 'github copilot'
];

class AIFilter {
  constructor(keywords = AI_KEYWORDS) {
    this.keywords = keywords.map(k => k.toLowerCase());
  }

  isAIRelated(title) {
    if (!title) return false;
    const lowerTitle = title.toLowerCase();
    return this.keywords.some(keyword => lowerTitle.includes(keyword));
  }

  filterStories(stories) {
    return stories.filter(story => this.isAIRelated(story.title));
  }
}

module.exports = { AIFilter, AI_KEYWORDS };