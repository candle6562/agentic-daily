const { AIFilter } = require('../src/ai-filter');

describe('AIFilter', () => {
  let filter;

  beforeEach(() => {
    filter = new AIFilter();
  });

  describe('isAIRelated', () => {
    it('returns true for story with AI keyword', () => {
      expect(filter.isAIRelated('OpenAI releases GPT-5')).toBe(true);
    });

    it('returns true for machine learning story', () => {
      expect(filter.isAIRelated('New machine learning approach beats benchmarks')).toBe(true);
    });

    it('returns true for neural network story', () => {
      expect(filter.isAIRelated('Neural networks explained')).toBe(true);
    });

    it('returns true for case-insensitive matches', () => {
      expect(filter.isAIRelated('LLM OPTIMIZATION TECHNIQUES')).toBe(true);
    });

    it('returns false for unrelated story', () => {
      expect(filter.isAIRelated('Best coffee shops in Brooklyn')).toBe(false);
    });

    it('returns false for null title', () => {
      expect(filter.isAIRelated(null)).toBe(false);
    });

    it('returns false for undefined title', () => {
      expect(filter.isAIRelated(undefined)).toBe(false);
    });

    it('returns false for empty title', () => {
      expect(filter.isAIRelated('')).toBe(false);
    });
  });

  describe('filterStories', () => {
    it('filters out non-AI stories', () => {
      const stories = [
        { title: 'OpenAI announces GPT-4' },
        { title: 'Best pizza recipe' },
        { title: 'Anthropic Claude model analysis' },
        { title: 'JavaScript framework debate' }
      ];
      const result = filter.filterStories(stories);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('OpenAI announces GPT-4');
      expect(result[1].title).toBe('Anthropic Claude model analysis');
    });

    it('returns empty array when no AI stories', () => {
      const stories = [
        { title: 'Home gardening tips' },
        { title: 'New car review' }
      ];
      expect(filter.filterStories(stories)).toHaveLength(0);
    });

    it('returns all stories when all are AI-related', () => {
      const stories = [
        { title: 'ChatGPT usage guide' },
        { title: 'Stable Diffusion tutorial' }
      ];
      expect(filter.filterStories(stories)).toHaveLength(2);
    });
  });

  describe('custom keywords', () => {
    it('uses custom keywords when provided', () => {
      const customFilter = new AIFilter(['rust', 'cargo']);
      expect(customFilter.isAIRelated('Rust 2.0 released')).toBe(true);
      expect(customFilter.isAIRelated('Python tips')).toBe(false);
    });
  });
});