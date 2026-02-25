---
title: "AgentCore×Strands AgentでMarpスライドを自動生成する【3部作 Part2】"
emoji: "🤖"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws", "bedrock", "agentcore", "strandsagents", "tavily"]
published: false
---

# はじめに

本記事は、AWS What's NewをAIで要約・スライド化してCloudflareで公開するシステムの3部作のPart2です。

システム全体の概要は以下のサマリ記事をご覧ください。

<!-- TODO: サマリ記事のURLを追加 -->

Part1ではAWS What's NewをBedrockで要約してSlackに投稿し、ボタンでAgentCoreを呼び出すところまでを解説しました。

このPart2では、**AgentCore上のStrands AgentがSlackスレッドと記事情報をもとにMarpスライドを自動生成し、GitHubリポジトリにコミットするまで**を解説します。

## このPartで扱う範囲

```
[AgentCore呼び出し] ← Part1より
  payload: {articleUrl, channel, thread_ts}
        ↓
[Strands Agent (AgentCore上 / Kimi K2)]
    ├── [slack_read_thread] → Slackスレッド取得
    ├── [tavily_crawl / search / extract] → 記事詳細・関連情報の収集
    ├── [generate_marp_from_thread] → Marpスライド生成
    ├── [generate_summary_markdown] → 要約Markdown生成
    ├── [commit_files_to_github] → GitHubコミット
    └── [slack] → 完了通知
        ↓
[GitHubリポジトリ]
    ├── yyyy/mm/dd/[title]/slide.md
    └── yyyy/mm/dd/[title]/summary.md
            ↓
        → Part3へ続く
```


# 構成

## 使用するサービス・フレームワーク

| サービス/ライブラリ | 役割 |
|---|---|
| **Amazon Bedrock AgentCore** | Strands Agentのマネージドホスティング環境 |
| **Strands Agents (Python)** | Agentのオーケストレーションフレームワーク |
| **Claude Haiku 4.5 (Amazon Bedrock)** | スライド生成に使用するLLM |
| **Tavily** | AIに特化したWeb検索API（crawl/search/extract） |
| **GitHub API (PyGithub)** | 生成したMarpスライドのリポジトリへの保存 |
| **AWS Systems Manager Parameter Store** | Tavily APIキー・GitHubトークンの管理 |

### AgentCoreとStrands Agentsについて

[Amazon Bedrock AgentCore](https://aws.amazon.com/jp/bedrock/agentcore/)は、AIエージェントをサーバーレスで実行・ホスティングできるマネージドランタイムです。`BedrockAgentCoreApp`に`@app.entrypoint`デコレータを付けた関数をエントリーポイントとして定義するだけで、スケーリングや可用性をAWSに任せることができます。

[Strands Agents](https://strandsagents.com/)はAWSがオープンソースで提供するエージェントフレームワークです。`@tool`デコレータでPython関数をツールとして定義するシンプルなAPIが特徴で、AgentCoreとの統合がネイティブにサポートされています。


# 実装

## 1. システムプロンプト

システムプロンプトは`system_prompt.md`（骨格）と`marp_rules.md`（Marpルール）の2ファイルに分けて管理し、起動時に結合して使います。ファイル分割によってMarpのルールを独立してメンテナンスできるようにしています。

```python
with open("system_prompt.md", encoding="utf-8") as f:
    _prompt_template = f.read()
with open("marp_rules.md", encoding="utf-8") as f:
    _marp_rules = f.read()

SYSTEM_PROMPT = _prompt_template.replace("{MARP_RULES}", _marp_rules)
```

`system_prompt.md`の概要は以下のとおりです。

```markdown
あなたはAWSの最新情報からMarpスライドを作成するエキスパートです。

以下の手順で作業してください：

1. slack_read_threadでSlackスレッドを取得し、記事の要約や背景情報を把握する
2. tavily_crawlで記事URLの内容を取得する
3. tavily_searchで関連する最近のAWSアップデートを検索する
4. generate_marp_from_threadでMarpスライドを生成する
5. generate_summary_markdownで要約Markdownを生成する
6. commit_files_to_githubでGitHubにコミットする
7. slackで完了通知を送信する

{MARP_RULES}
```

## 2. ツール一覧

Agent に渡すツールは、Strands提供のものとカスタム実装の2種類に分かれます。

| ツール | 種別 | 役割 |
|---|---|---|
| `current_time` | strands_tools | 現在時刻の取得 |
| `tavily_crawl` | strands_tools | 記事URLのクロールによるコンテンツ取得 |
| `tavily_search` | strands_tools | 関連情報のWeb検索 |
| `tavily_extract` | strands_tools | URLからの構造化コンテンツ抽出 |
| `slack` | strands_tools | Slackメッセージの送受信 |
| `slack_read_thread` | カスタム | Slackスレッドの取得・整形 |
| `parse_thread_messages` | カスタム | スレッドメッセージのパース |
| `generate_marp_from_thread` | カスタム | Marpスライドの生成 |
| `generate_summary_markdown` | カスタム | 要約Markdownの生成 |
| `commit_files_to_github` | カスタム | GitHubへのコミット |

Tavilyは`tavily_crawl`（ページ全文取得）・`tavily_search`（Web検索）・`tavily_extract`（構造化抽出）の3種類を用意し、コンテンツの性質に応じてAgentが使い分けます。

## 3. ファイル名生成

保存先のディレクトリパスとファイル名は`generate_filename`で一元管理しています。Agentが生成したパスを使わず、bootstrapのメタデータから正規化して生成することで、パスの揺れを防いでいます。

```python
def generate_filename(title: str, published_date: str) -> tuple[str, str, str]:
    """
    タイトルと公開日からディレクトリパスとファイル名を生成

    Returns:
        (ディレクトリパス, スライドファイル名, 要約ファイル名) のタプル
        例: ("2026/01/15/Amazon-Bedrock-Claude-45", "slide.md", "summary.md")
    """
    try:
        date_obj = datetime.strptime(published_date, '%Y-%m-%d')
        date_path = date_obj.strftime('%Y/%m/%d')
    except ValueError:
        date_path = datetime.now().strftime('%Y/%m/%d')

    short_title = re.sub(r'[^\w\s-]', '', title)
    short_title = re.sub(r'\s+', '-', short_title)
    short_title = short_title[:50].strip('-')

    dir_path = f"{date_path}/{short_title}"
    return (dir_path, "slide.md", "summary.md")
```

## 4. スライド生成ツール（ハイブリッドアプローチ）

Marpスライドの内容生成は**LLMではなくPythonのキーワード抽出**で行っています。LLMはツールの呼び出し順を決めるオーケストレーターとして働き、実際のコンテンツ生成はルールベースの処理に委ねます。これにより出力の安定性と速度を確保しています。

### SlideSection

スライドの各セクションは`SlideSection`クラスで宣言的に定義します。

```python
class SlideSection:
    def __init__(
        self,
        title: str,
        extractor_fn: Callable,  # (summary, detail, search_results) -> str
        max_length: int = 300,
        required: bool = True,
    ):
        ...
```

セクションの一覧は以下のとおりです。

```python
SLIDE_SECTIONS = [
    SlideSection("概要",         lambda s, d, sr: extract_overview(s, d),          required=True),
    SlideSection("前提・背景",   lambda s, d, sr: extract_background(d, sr),        required=False),
    SlideSection("変更内容・新機能", lambda s, d, sr: extract_changes(s, d),        required=True),
    SlideSection("効果・メリット", lambda s, d, sr: extract_benefits(s, d),         required=False),
    SlideSection("ユースケース", lambda s, d, sr: extract_use_cases(d),             required=False),
]
```

各extractor関数はSlackスレッドの`summary`・`detail`テキストとTavily検索結果を受け取り、日本語・英語のキーワードマッチングで関連段落を抽出します。`required=False`のセクションは内容が空の場合スキップされます。

### `generate_marp_from_thread`ツール

セクション定義をもとにMarpスライドを組み立てます。

```python
@tool
def generate_marp_from_thread(
    thread_info_json: str,
    search_results_json: str = "",
    max_slides: int = 12,
) -> str:
    """
    スレッド情報とTavily検索結果から構造化されたMarpスライドを生成

    Args:
        thread_info_json: parse_thread_messages()の戻り値
        search_results_json: tavily_search()の戻り値（オプション）
        max_slides: 最大スライド数
    """
    thread_info = json.loads(thread_info_json)
    title          = thread_info.get("title", "")
    published_date = thread_info.get("published_date", "")
    article_url    = thread_info.get("article_url", "")
    summary        = thread_info.get("summary", "")
    detail         = thread_info.get("detail", "")

    # commit_files_to_github が参照するメタデータをここでセット
    bootstrap._generated_marp_metadata.update({
        "title": title,
        "published_date": published_date,
        "article_url": article_url,
    })

    search_results = json.loads(search_results_json) if search_results_json else []

    slides = ["---", "marp: true", "theme: default", "paginate: true", "---", ""]

    # タイトルスライド
    slides += [f"# {title}", "", f"**{category}** | {published_date}", "", "---", ""]

    # 各セクション
    for section in SLIDE_SECTIONS:
        content = section.extractor_fn(summary, detail, search_results)
        if not content and not section.required:
            continue
        slides += [f"## {section.title}", "", content[:section.max_length], "", "---", ""]

    # まとめ + 参考URL
    slides += ["## まとめ", "", f"- {title} について紹介しました", "", "---", ""]
    slides += ["## 参考URL", "", f"- [元記事]({article_url})", ""]

    return "\n".join(slides)
```

### `generate_summary_markdown`ツール

`summary.md`は`summary`・`detail`テキストをそのまま構造化するシンプルなMarkdown生成です。

```python
@tool
def generate_summary_markdown(thread_info_json: str) -> str:
    """スレッド情報から要約mdファイルを生成"""
    thread_info = json.loads(thread_info_json)
    title = thread_info.get("title", "")
    ...

    # generate_marp_from_thread が先に呼ばれていなければここでもメタデータをセット
    bootstrap._generated_marp_metadata.update({
        "title": title,
        "published_date": published_date,
        "article_url": article_url,
    })
    ...
```

## 6. GitHubコミットツール

`commit_files_to_github`はStrands Agentのツールとして定義し、`slide.md`と`summary.md`を1回のコミットで保存します。

```python
@tool
def commit_files_to_github(files_json: str, commit_message: str) -> str:
    """
    複数ファイルをGitHubにコミット

    Args:
        files_json: JSON形式のファイルリスト
            [{"path": "2026/02/05/Amazon-Bedrock-Claude-45/slide.md", "content": "..."},
             {"path": "2026/02/05/Amazon-Bedrock-Claude-45/summary.md", "content": "..."}]
            ※ パスはyyyy/mm/dd/[タイトル]/形式のディレクトリ配下に保存
            ※ ファイル名は固定（slide.md, summary.md）
        commit_message: コミットメッセージ

    Returns:
        成功メッセージまたはエラーメッセージ
    """
    try:
        # 同一実行内での二重コミットを防止
        if bootstrap._commit_once_guard:
            return "スキップ: 既にコミット済み（同一実行）"

        files = json.loads(files_json)
        if not files:
            return "エラー: コミットするファイルがありません"

        # 保存先パスはエージェントの入力ではなくbootstrapのメタデータから生成
        title = bootstrap._generated_marp_metadata.get("title", "タイトル不明")
        published_date = bootstrap._generated_marp_metadata.get(
            "published_date", datetime.now().strftime("%Y-%m-%d")
        )
        dir_path, slide_filename, summary_filename = generate_filename(title, published_date)

        slide_path   = f"{dir_path}/{slide_filename}"
        summary_path = f"{dir_path}/{summary_filename}"

        # エージェントが渡したパスのファイル名でスライド/要約を判別
        slide_content, summary_content = "", ""
        for file_info in files:
            content = file_info.get("content", "")
            if not content:
                continue
            path = (file_info.get("path") or "").lower()
            if "summary.md" in path and not summary_content:
                summary_content = content
            elif "slide.md" in path and not slide_content:
                slide_content = content

        if not slide_content or not summary_content:
            return "エラー: スライドまたは要約の内容が不足しています"

        repo = bootstrap.github_client.get_repo(bootstrap.GITHUB_REPO)

        commit_results = []

        def upsert(path: str, content: str):
            """ファイルが存在すれば更新、なければ作成"""
            try:
                try:
                    existing = repo.get_contents(path)
                    repo.update_file(path, commit_message, content, existing.sha)
                    commit_results.append(f"更新: {path}")
                except Exception:
                    repo.create_file(path, commit_message, content)
                    commit_results.append(f"作成: {path}")
            except Exception as e:
                commit_results.append(f"エラー: {path} - {str(e)}")

        upsert(slide_path, slide_content)
        upsert(summary_path, summary_content)

        bootstrap._commit_once_guard = True
        return "\n".join(commit_results)

    except Exception as e:
        return f"GitHubコミットエラー: {str(e)}"
```

### 設計上のポイント

**保存パスをbootstrapメタデータから生成する理由**

Agentが生成するパスは表記ゆれや日付ミスが発生しやすいため、実際の保存先は`bootstrap._generated_marp_metadata`（Part1から渡されたタイトルと公開日）をもとに`generate_filename`で正規化して生成します。Agentが渡した`files_json`のパスはスライドか要約かの判別にのみ使います。

**`_commit_once_guard`による二重コミット防止**

Strands AgentはReActループの中でツールを複数回呼び出すことがあります。コミット操作は冪等ではないため、`_commit_once_guard`フラグで同一実行内での2回目以降の呼び出しをスキップします。

**upsertパターン**

再実行時や開発中の動作確認でも安全に使えるよう、`update_file`（既存ファイルの更新）を先に試み、失敗した場合は`create_file`（新規作成）にフォールバックするupsertパターンを採用しています。

## 7. Agentの初期化とエントリーポイント

AgentCoreへのデプロイは`BedrockAgentCoreApp`を使います。`@app.entrypoint`デコレータを付けた非同期関数がリクエストの受け口になります。

```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel

import bootstrap  # 副作用のあるimport（Slack環境変数設定など）

app = BedrockAgentCoreApp()

bedrock_model = BedrockModel(
    model_id=bootstrap.MODEL_ID,  # 環境変数で設定（Claude Haiku 4.5）
    region_name="us-east-1"
)

strands_agent = Agent(
    model=bedrock_model,
    tools=[
        current_time,
        tavily_crawl, tavily_search, tavily_extract,
        slack,
        slack_read_thread, parse_thread_messages,
        generate_marp_from_thread, generate_summary_markdown,
        commit_files_to_github,
    ],
    system_prompt=SYSTEM_PROMPT,
)
```

エントリーポイントでは、受け取ったペイロードからパラメータを取り出してAgentを呼び出します。Agentはシステムプロンプトに従って各ステップのエラーハンドリングを自律的に行うため、ここではAgent起動自体の失敗とタイムアウトのみをハンドリングしています。

```python
@app.entrypoint
async def invoke(payload: dict) -> dict:
    article_url = payload.get('articleUrl', '')
    channel     = payload.get('channel', '')
    thread_ts   = payload.get('thread_ts', '')

    if not article_url or not channel:
        return {"error": "必須パラメータが不足しています（articleUrl, channel）"}

    await process_agent_async(payload)

    return {
        "status": "completed",
        "channel": channel,
        "thread_ts": thread_ts,
    }
```

`process_agent_async`ではAgentをストリーミング実行し、タイムアウト時のみSlackにエラー通知します。

```python
async def process_agent_async(payload: dict):
    agent_prompt = (
        f"slackのスレッドの情報を元にMarp形式のスライドを作成してください。\n"
        f"記事URL: {payload['articleUrl']}\n"
        f"チャンネル {payload['channel']} のスレッド {payload.get('thread_ts', '')} に返信してください。"
    )

    stream = strands_agent.stream_async(agent_prompt)

    async def consume():
        async for event in stream:
            if event.get("reasoning"):
                continue
            if "current_tool_use" in event:
                print(f"[Stream] Tool: {event['current_tool_use'].get('name')}")

    try:
        await asyncio.wait_for(consume(), timeout=bootstrap.STREAM_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        _send_error_to_slack(
            payload['channel'],
            payload.get('thread_ts', ''),
            f"❌ タイムアウト（{bootstrap.STREAM_TIMEOUT_SECONDS}秒）"
        )
```

## 8. bootstrapモジュール

`bootstrap.py`はモジュールロード時に副作用として実行される初期化処理をまとめたモジュールです。GitHub ClientやSlack環境変数はここでセットアップし、ツール関数からモジュール変数として参照します。

```python
# bootstrap.py
import boto3
from github import Github

ssm = boto3.client("ssm")

def _get_param(name: str) -> str:
    return ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]

# モデルID（環境変数で設定）
MODEL_ID = os.environ["MODEL_ID"]  # 例: us.anthropic.claude-haiku-4-5-20251001

# GitHub Client（起動時に一度だけ初期化）
GITHUB_REPO = "your-org/whatsnew-slides"
github_client = Github(_get_param("/whatsnew/github_token"))

# タイムアウト設定
STREAM_TIMEOUT_SECONDS = 300

# コミット済みフラグ（リクエストごとにリセット）
_commit_once_guard: bool = False

# エージェント実行時にセットされるメタデータ（リクエストごとにリセット）
_generated_marp_metadata: dict = {}

# Slack環境変数のセットアップ
def setup_slack_environment():
    ...

setup_slack_environment()
```

エントリーポイントでは、リクエストごとにコミットガードとメタデータをリセットします。

```python
@app.entrypoint
async def invoke(payload: dict) -> dict:
    # リクエストごとに状態をリセット
    bootstrap._commit_once_guard = False
    bootstrap._generated_marp_metadata = {
        "title": payload.get("title", ""),
        "published_date": payload.get("published_date", ""),
    }
    ...
```


# Agentの動作フロー

Strands Agentは渡された入力をもとに、ReActパターンで以下のようにツールを呼び出しながらスライドを生成します。

1. **Slackスレッド取得**: `slack_read_thread`でPart1が投稿した要約・背景情報を取得
2. **記事コンテンツ取得**: `tavily_crawl`で記事URLの全文を取得
3. **関連情報収集**: `tavily_search` / `tavily_extract`で関連するAWSアップデートを補完
4. **スライド生成**: `generate_marp_from_thread`でMarp形式のMarkdownを生成
5. **要約生成**: `generate_summary_markdown`で要約Markdownを生成
6. **GitHubコミット**: `commit_files_to_github`で`yyyy/mm/dd/[title]/`配下にコミット
7. **Slack通知**: `slack`でスレッドに完了通知を送信


# ポイントと注意点

## モデルにClaude Haiku 4.5を選んだ理由

モデルIDは環境変数`MODEL_ID`で管理しており、今回はClaude Haiku 4.5（`us.anthropic.claude-haiku-4-5-20251001`）を使用しています。Haiku 4.5はレスポンスが速くコストが低い一方、Markdown生成や指示追従性も十分高いため、定常的に大量実行するこのユースケースに適しています。環境変数で切り替え可能にしておくことで、必要に応じてSonnetなど上位モデルへの変更も容易です。

## スライド生成をルールベースにした理由

`generate_marp_from_thread`のコンテンツ生成はLLMではなくキーワードマッチングで実装しています。LLMに全文生成を任せると出力フォーマットが安定せず、Marpの記法を守らないケースが発生しやすいためです。LLMはツールの呼び出し順を決めるオーケストレーター役に徹し、コンテンツ生成は決定的なPython処理で行うことで、品質と速度を両立しています。

## `bootstrap._generated_marp_metadata`の設定タイミング

`commit_files_to_github`が参照する`bootstrap._generated_marp_metadata`は、`generate_marp_from_thread`または`generate_summary_markdown`の中でセットされます。AgentがSlackスレッドのパースで得たタイトルと公開日をメタデータとして持ち回す仕組みです。どちらのツールが先に呼ばれても対応できるよう、両方で`update()`しています。

## `@tool`デコレータとdocstringの重要性

Strands Agentsでは、docstringがそのままLLMへのツール説明として使われます。`commit_files_to_github`の`files_json`のような複雑な入力フォーマットは、docstringにJSONの例を直接記載することでAgentの誤用を防げます。

## bootstrapの副作用importの順序

`import bootstrap`はSlack環境変数の設定など副作用を持つimportです。`strands_tools`のslackがSlack環境変数を参照するため、`bootstrap`を先にimportする必要があります。コメントで`# FIRST`/`# SECOND`と明示することでこの依存関係を読み手に伝えています。

## Tavilyを3ツールに分ける理由

- `tavily_crawl`: ページ全文をMarkdown形式で取得。What's New記事の詳細把握に使用
- `tavily_search`: 一般的なWeb検索。関連するAWSアップデートの探索に使用
- `tavily_extract`: URLから構造化コンテンツを抽出。公式ドキュメントなど特定URLの詳細取得に使用

3種類を使い分けることで、コンテンツの性質に応じた最適な情報収集をAgentが自律的に選択できます。

## ストリーミング実行とタイムアウト

`stream_async`でストリーミング実行することで、長時間の処理中もAgentCoreとの接続を維持できます。`asyncio.wait_for`でタイムアウトを設けており、上限を超えた場合はSlackにエラー通知します。エラーハンドリングの多くはシステムプロンプトでAgentに委譲しているため、ここではタイムアウトとAgent起動失敗のみをハンドリングしています。


# まとめ

Part2では以下を実装しました。

- **`BedrockAgentCoreApp` + `@app.entrypoint`**: AgentCoreへのデプロイパターン
- **Kimi K2**: 長文・Markdown生成に適したモデルをBedrock経由で利用
- **Strands Agentsによるツール定義**: `@tool`デコレータでTavily/GitHub/Slackをシンプルに実装
- **Tavilyの3ツール使い分け**: `crawl`/`search`/`extract`でコンテンツ性質に応じた情報収集
- **`commit_files_to_github`**: `slide.md`と`summary.md`を1コミットで保存、upsertとコミットガードで安全に運用

次のPart3では、GitHubリポジトリにコミットされたMarpスライドをCloudflare PagesとWorkers経由で公開する部分を解説します。
