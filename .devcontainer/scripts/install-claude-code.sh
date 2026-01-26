#!/bin/bash

echo "Claude Code setup (DevContainer Feature version)..."

# DevContainer Feature を使用しているため、CLI は自動的にインストールされる
# devcontainer.json の features セクションで設定:
#   - ghcr.io/anthropics/devcontainer-features/claude-code:1

echo "Claude Code CLI is being installed via DevContainer Feature..."
echo "VSCode extension 'anthropic.claude-code' will also be available."
echo ""
echo "Setup will be complete after container startup."
