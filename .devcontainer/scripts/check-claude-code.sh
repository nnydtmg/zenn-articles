#!/bin/bash

echo "=== Claude Code 設定確認 ==="
echo ""

# 環境変数の確認
echo "1. 環境変数 ANTHROPIC_API_KEY:"
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "   ❌ 未設定"
  echo "   対処法: .env ファイルにAPIキーを設定するか、ローカル環境変数を設定してください"
else
  echo "   ✅ 設定済み (${ANTHROPIC_API_KEY:0:10}...)"
fi
echo ""

# Claude Code CLIの確認
echo "2. Claude Code CLI:"
if command -v claude-code &> /dev/null; then
  echo "   ✅ インストール済み"
  claude-code --version 2>/dev/null || echo "   バージョン確認できませんでした"
else
  echo "   ⚠️  CLIが見つかりません（devcontainer featureでインストールされます）"
fi
echo ""

# Claude Code設定ディレクトリの確認
echo "3. Claude Code 設定ディレクトリ:"
if [ -d "/home/node/.claude" ]; then
  echo "   ✅ /home/node/.claude が存在します"
  ls -la /home/node/.claude 2>/dev/null || echo "   （空のディレクトリ）"
else
  echo "   ⚠️  /home/node/.claude が見つかりません（初回起動時に作成されます）"
fi
echo ""

# bash historyの確認
echo "4. Bash history 設定:"
if [ -f "/commandhistory/.bash_history" ]; then
  echo "   ✅ /commandhistory/.bash_history が存在します"
  ls -la /commandhistory/.bash_history
else
  echo "   ⚠️  /commandhistory/.bash_history が見つかりません（初回シェル起動時に作成されます）"
fi
echo ""

echo "=== 確認完了 ==="
echo ""
echo "問題がある場合は、以下を試してください:"
echo "1. devcontainer を再ビルド（Cmd/Ctrl+Shift+P → 'Dev Containers: Rebuild Container'）"
echo "2. .env ファイルにAPIキーが設定されているか確認: cat .env"
echo "3. ローカル環境変数 ANTHROPIC_API_KEY が設定されているか確認"
echo "4. VSCode拡張機能 'Claude Code' がインストールされているか確認"
