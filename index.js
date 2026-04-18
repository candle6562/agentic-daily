const { HNScraper } = require('./src/scraper');

async function main() {
  const scraper = new HNScraper({ storyLimit: 100 });
  const result = await scraper.run();
  console.log(`Scraped ${result.stories.length} AI stories to ${result.filePath}`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { HNScraper };