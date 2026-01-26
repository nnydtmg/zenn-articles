# DevContainer - Claude Code 設定

このDevContainerでは、Zennの記事執筆環境とClaude Codeを統合して使用できます。

## 前提条件

- Docker Desktop がインストールされていること
- VSCode に Dev Containers 拡張機能がインストールされていること
- 最小8GBのメモリが利用可能であること

## セットアップ手順

### 1. Anthropic API キーの取得

https://console.anthropic.com/ からAPIキーを取得します。

### 2. 環境変数の設定（いずれかの方法）

#### 方法A: .envファイルを使用（推奨）

```bash
cp .env.example .env
# .env ファイルを編集してAPIキーを設定
```

#### 方法B: ローカル環境変数を使用

```bash
# ~/.zshrc または ~/.bashrc に追加
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

**注**: 両方設定した場合、ローカル環境変数が優先されます。

### 3. DevContainerを開く

1. VSCodeでこのプロジェクトを開く
2. Cmd/Ctrl+Shift+P → "Dev Containers: Reopen in Container" を選択
3. コンテナのビルドと起動を待つ（初回は時間がかかります）

### 4. 設定確認

コンテナ内のターミナルで以下を実行：

```bash
bash .devcontainer/scripts/check-claude-code.sh
```

## 利用可能な機能

### Claude Code

- **CLI版**: `claude-code` コマンドでターミナルから利用可能
- **VSCode拡張機能版**: VSCode内でClaude Codeを使用可能
- 設定ファイルは `/home/node/.claude` に永続化されます

### Zenn CLI

- `npx zenn new:article` - 新しい記事を作成
- `npx zenn new:book` - 新しい本を作成
- `npx zenn preview` - プレビューサーバー起動（自動起動済み、ポート8000）

### textlint

- 保存時に自動校正
- Markdown記事の品質チェック

### その他の機能

- **コマンド履歴の永続化**: `/commandhistory` に保存
- **GitHub Copilotの無効化**: Claude Codeとの競合を避けるため
- **ネットワーク設定**: `--network=host` でホストのネットワークを利用

## トラブルシューティング

### Claude Codeが利用できない

1. 環境変数が正しく設定されているか確認:
   ```bash
   echo $ANTHROPIC_API_KEY
   ```

2. DevContainerを再ビルド:
   - Cmd/Ctrl+Shift+P → "Dev Containers: Rebuild Container"

3. .envファイルの内容を確認:
   ```bash
   cat .env
   ```

### bash historyエラー

コンテナを再ビルドすると、権限設定が自動的に修正されます。

### メモリ不足エラー

Docker Desktopの設定で、最低8GBのメモリを割り当ててください。

## 参考資料

- [Claude Code公式ドキュメント](https://docs.anthropic.com/claude-code)
- [DevContainerでClaude Codeをセットアップする](https://dev.classmethod.jp/articles/setup-claude-code-in-devcontainer/)
- [Zenn CLI](https://zenn.dev/zenn/articles/zenn-cli-guide)
