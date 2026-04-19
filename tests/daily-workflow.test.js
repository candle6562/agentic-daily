const fs = require('fs');
const path = require('path');

describe('daily workflow', () => {
  test('runs scraper and markdown generation on schedule', () => {
    const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'daily.yaml');
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('name: Daily Generation');
    expect(workflow).toContain('cron: "0 0 * * *"');
    expect(workflow).toContain('actions/checkout@v4');
    expect(workflow).toContain('pnpm/action-setup@v4');
    expect(workflow).toContain('node index.js');
    expect(workflow).toContain('node generate-daily.js');
  });
});
