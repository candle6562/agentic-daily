const { HNScraper } = require('./src/scraper');
const { saveDailyMarkdown } = require('./src/daily-markdown');
const path = require('path');
const fs = require('fs');

async function main() {
  const scraper = new HNScraper({ storyLimit: 100 });
  const result = await scraper.run();
  console.log(`Scraped ${result.stories.length} AI stories to ${result.filePath}`);

  const data = JSON.parse(fs.readFileSync(result.filePath, 'utf-8'));
  const outputDir = path.join(__dirname, 'content', 'daily');
  const saved = saveDailyMarkdown(data.date, data.stories, outputDir);
  console.log(`Generated ${saved.latestFile} from ${data.count} stories`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, HNScraper, saveDailyMarkdown };
