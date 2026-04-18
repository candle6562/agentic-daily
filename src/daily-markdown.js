const fs = require('fs');
const path = require('path');

const RELEVANCE_WEIGHT_POINTS = 1;
const RELEVANCE_WEIGHT_COMMENTS = 0.5;
const MAX_STORIES_PER_SECTION = 5;

function rankStories(stories) {
  return stories
    .map(story => ({
      ...story,
      relevanceScore: story.points * RELEVANCE_WEIGHT_POINTS + story.comments * RELEVANCE_WEIGHT_COMMENTS
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function categorizeStories(rankedStories) {
  const topNews = [];
  const growthHacks = [];
  const aiResearcherUpdates = [];
  const projectIdeas = [];

  for (const story of rankedStories) {
    const title = story.title.toLowerCase();

    if (title.includes('tool') || title.includes('library') || title.includes('framework') || title.includes('open source')) {
      aiResearcherUpdates.push(story);
    } else if (title.includes('startup') || title.includes('growth') || title.includes('business') || title.includes('revenue')) {
      growthHacks.push(story);
    } else if (title.includes('project') || title.includes('show hn') || title.includes('github') || title.includes('launch')) {
      projectIdeas.push(story);
    } else {
      topNews.push(story);
    }
  }

  return { topNews, growthHacks, aiResearcherUpdates, projectIdeas };
}

function formatStory(story) {
  const score = Math.round(story.relevanceScore);
  return `- [${story.title}](${story.url}) - ${story.points} points, ${story.comments} comments`;
}

function generateDailyMarkdown(date, stories) {
  const ranked = rankStories(stories);
  const categorized = categorizeStories(ranked);

  const sections = [
    { title: '## Top News', stories: categorized.topNews },
    { title: '## Growth Hacks', stories: categorized.growthHacks },
    { title: '## AI Researcher Updates', stories: categorized.aiResearcherUpdates },
    { title: '## Project Ideas', stories: categorized.projectIdeas },
  ];

  const lines = [
    '# Agentic Developments Daily',
    `## ${date}`,
    ''
  ];

  for (const section of sections) {
    lines.push(section.title);
    const limitedStories = section.stories.slice(0, MAX_STORIES_PER_SECTION);
    if (limitedStories.length > 0) {
      for (const story of limitedStories) {
        lines.push(formatStory(story));
      }
    } else {
      lines.push('- No items today');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function saveDailyMarkdown(date, stories, outputDir) {
  const markdown = generateDailyMarkdown(date, stories);
  const dateFile = path.join(outputDir, `${date}.md`);
  const latestFile = path.join(outputDir, 'latest.md');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(dateFile, markdown);
  fs.writeFileSync(latestFile, markdown);

  return { dateFile, latestFile };
}

module.exports = {
  rankStories,
  categorizeStories,
  formatStory,
  generateDailyMarkdown,
  saveDailyMarkdown,
  RELEVANCE_WEIGHT_POINTS,
  RELEVANCE_WEIGHT_COMMENTS,
  MAX_STORIES_PER_SECTION
};