#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { generateDailyMarkdown, saveDailyMarkdown } = require('./src/daily-markdown');

async function main() {
  const contentDir = path.join(__dirname, 'content');
  const sourcesDir = path.join(contentDir, 'sources', 'hn');

  const today = new Date().toISOString().split('T')[0];
  const hnFile = path.join(sourcesDir, `${today}.json`);

  if (!fs.existsSync(hnFile)) {
    console.error(`HN source file not found: ${hnFile}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(hnFile, 'utf8'));
  const { dateFile, latestFile } = saveDailyMarkdown(today, data.stories, path.join(contentDir, 'daily'));

  console.log(`Generated: ${dateFile}`);
  console.log(`Updated: ${latestFile}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };