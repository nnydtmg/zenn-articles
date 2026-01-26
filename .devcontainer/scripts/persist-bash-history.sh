#!/bin/bash

echo "Setting up bash history persistence..."

# コマンド履歴ディレクトリの所有者を node ユーザーに変更
sudo chown -R node:node /commandhistory 2>/dev/null || true
sudo chmod -R 755 /commandhistory 2>/dev/null || true

# bash history ファイルの作成
touch /commandhistory/.bash_history 2>/dev/null || true
chmod 644 /commandhistory/.bash_history 2>/dev/null || true

# .bashrc に bash history の設定を追加
if ! grep -q "HISTFILE=/commandhistory/.bash_history" /home/node/.bashrc 2>/dev/null; then
  cat >> /home/node/.bashrc << 'EOF'

# コマンド履歴永続化設定
export HISTFILE=/commandhistory/.bash_history
export PROMPT_COMMAND='history -a'
EOF
fi

echo "Bash history persistence setup completed!"
