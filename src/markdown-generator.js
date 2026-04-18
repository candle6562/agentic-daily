const fs = require('fs');
const path = require('path');

const SOURCES_DIR = path.join(__dirname, '..', 'content', 'sources', 'hn');
const OUTPUT_DIR = path.join(__dirname, '..', 'content', 'daily');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'latest.md');

function getLatestDataFile() {
  if (!fs.existsSync(SOURCES_DIR)) {
    return null;
  }
  const files = fs.readdirSync(SOURCES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return path.join(SOURCES_DIR, files[0]);
}

function generateMarkdown(data) {
  const lines = [];
  lines.push(`# AI Daily Report — ${data.date}`);
  lines.push('');
  lines.push(`*Scraped at ${new Date(data.scrapedAt).toISOString()}*`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- **Total AI Stories:** ${data.count}`);
  const topStory = data.stories.reduce((max, s) => s.points > max.points ? s : max, data.stories[0]);
  lines.push(`- **Top Story:** "${topStory.title}" (${topStory.points} points)`);
  lines.push('');
  lines.push(`## Stories`);
  lines.push('');

  for (const story of data.stories) {
    lines.push(`### ${story.title}`);
    lines.push('');
    lines.push(`- **URL:** ${story.url}`);
    lines.push(`- **Points:** ${story.points} | **Comments:** ${story.comments} | **Author:** ${story.author}`);
    lines.push('');
  }

  return lines.join('\n');
}

class MarkdownGenerator {
  async run() {
    const dataFile = getLatestDataFile();
    if (!dataFile) {
      throw new Error(`No HN data file found in ${SOURCES_DIR}`);
    }

    const rawData = fs.readFileSync(dataFile, 'utf-8');
    const data = JSON.parse(rawData);

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const markdown = generateMarkdown(data);
    fs.writeFileSync(OUTPUT_FILE, markdown);

    return { outputPath: OUTPUT_FILE, storyCount: data.count };
  }
}

module.exports = { MarkdownGenerator, getLatestDataFile, generateMarkdown };

if (require.main === module) {
  const generator = new MarkdownGenerator();
  generator.run()
    .then(({ outputPath, storyCount }) => {
      console.log(`Generated ${outputPath} with ${storyCount} stories`);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}