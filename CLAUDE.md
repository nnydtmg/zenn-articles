# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a content repository for publishing technical articles on [Zenn](https://zenn.dev) and [Qiita](https://qiita.com). Articles are written in Markdown and synchronized across both platforms via CI/CD.

## Common Commands

```bash
# Install dependencies
npm install

# Create a new article (generates a file with a random slug in articles/)
npx zenn new:article

# Create a new book
npx zenn new:book

# Start local preview server (http://localhost:8000)
npx zenn preview
```

## Repository Structure

- `articles/` — Zenn articles in Markdown format with YAML frontmatter
- `qiita/public/` — Qiita articles; synced automatically from Zenn articles on push to `main` via the `zenn-qiita-sync` GitHub Action
- `books/` — Zenn books (multi-chapter content)
- `images/` — Architecture diagrams and screenshots referenced by articles
- `src/` — Supporting source files (e.g., CloudFormation templates) referenced in articles
- `.devcontainer/` — Dev Container configuration for writing in VSCode with Claude Code and textlint

## Article Format

Zenn articles use this frontmatter:

```yaml
---
title: "Article title"
emoji: "🔭"
type: "tech"  # tech: 技術記事 / idea: アイデア
topics: ["aws", "opentelemetry"]
published: false  # true to publish
---
```

Qiita articles use a different frontmatter format (title, tags, private, updated_at, id, organization_url_name, slide, ignorePublish).

## Publishing Flow

- Push to `main` → GitHub Actions runs `zenn-qiita-sync` to sync articles from `articles/` to `qiita/public/` and publish to both platforms
- `QIITA_TOKEN` secret must be set in the repository for Qiita sync to work
- Articles with `published: false` in Zenn frontmatter are drafts and won't be published

## Dev Container

The `.devcontainer/` setup includes:
- Zenn CLI and Node.js
- Claude Code (CLI and VSCode extension)
- textlint with `autoFixOnSave` on Markdown files (config at `.devcontainer/.textlintrc.jsonc`)
- Preview server auto-starts on port 8000 at container start
- Requires `ANTHROPIC_API_KEY` in `.env` or as a local environment variable

## Claude Code GitHub Action

The `.github/workflows/claude-code-pr-review.yaml` enables `@claude` mentions in issues and PRs to trigger Claude Code responses. Requires `ANTHROPIC_API_KEY` secret in the repository.

## Custom Skills

Custom skill definitions are stored in `.claude/skills/`. Invoke them by reading the skill file and following its instructions.

| トリガーワード | スキルファイル | 用途 |
|--------------|--------------|------|
| "トーンを確認", "文体を確認", "tone-check", "自分の文体に合わせて", "書き方を確認", "自分の記事に合っているか" | `.claude/skills/tone-check.md` | 記事のトーン・文体が筆者の書き方に合っているかレビュー |
| "正確性を確認", "fact-check", "技術的に正しいか確認", "内容を確認", "裏取りして" | `.claude/skills/fact-check.md` | 記事内の技術的な正確性をチェック |

When a trigger phrase is detected, read the corresponding skill file and follow its instructions exactly.
