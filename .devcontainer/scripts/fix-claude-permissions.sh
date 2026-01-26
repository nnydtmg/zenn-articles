#!/bin/bash

echo "Fixing Claude Code directory permissions..."

# .claude ディレクトリが存在しない場合は作成
if [ ! -d "/home/node/.claude" ]; then
  echo "Creating /home/node/.claude directory..."
  sudo mkdir -p /home/node/.claude
fi

# 所有者をnodeユーザーに変更
echo "Setting ownership to node:node..."
sudo chown -R node:node /home/node/.claude

# 書き込み権限を付与
echo "Setting permissions to 755..."
sudo chmod -R 755 /home/node/.claude

# debugディレクトリも明示的に作成
if [ ! -d "/home/node/.claude/debug" ]; then
  echo "Creating /home/node/.claude/debug directory..."
  mkdir -p /home/node/.claude/debug
  chmod 755 /home/node/.claude/debug
fi

echo "Claude Code directory permissions fixed!"
ls -la /home/node/.claude
