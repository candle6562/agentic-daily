# Agentic Daily

Repository for daily automated content generation.

## Structure

- `content/daily/` - Generated daily markdown output
- `content/sources/` - Source configurations for aggregation
- `src/` - Aggregation code
- `harness/preflight-checklist.md` - Required preflight for long-context runs
- `harness/lessons.md` - Learning rules captured from prior incidents

## Usage

This repository is used by OpenClaw to read and process daily content.

Before long-context agent runs, complete `harness/preflight-checklist.md`.

TESTVERIFICATION
