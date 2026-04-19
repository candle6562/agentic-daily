const fs = require('fs');
const path = require('path');

const README_PATH = path.join(__dirname, '..', 'README.md');
const REQUIRED_LINE = 'Verification token: TESTVERIFICATION';

describe('README verification token', () => {
  test('contains the required verification line', () => {
    const readmeContents = fs.readFileSync(README_PATH, 'utf8');

    expect(readmeContents).toContain(REQUIRED_LINE);
  });
});
