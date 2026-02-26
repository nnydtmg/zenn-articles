---
title: AgentCore×Strands AgentsでMarpスライドを自動生成する【3部作 Part2】
tags:
  - AWS
  - bedrock
  - Tavily
  - StrandsAgents
  - AgentCore
private: false
updated_at: '2026-02-26T17:01:18+09:00'
id: e2e6328fc00aa2661850
organization_url_name: null
slide: false
ignorePublish: false
---

# はじめに

本記事は、AWS What's NewをAIで要約・スライド化してCloudflareで公開するシステムの3部作のPart2です。

システム全体の概要は以下のサマリ記事をご覧ください。

https://zenn.dev/nnydtmg/articles/aws-whatsnew-slide-site

Part1ではAWS What's NewをBedrockで要約してSlackに投稿し、ボタンでAgentCoreを呼び出すところまでを解説しました。

このPart2では、**AgentCore上のStrands AgentがSlackスレッドと記事情報をもとにMarpスライドを自動生成し、GitHubリポジトリにコミットするまで**を解説します。

## このPartで扱う範囲

```
[AgentCore呼び出し] ← Part1より
  payload: {articleUrl, channel, thread_ts}
        ↓
[Strands Agent (AgentCore上 / Claude Haiku 4.5)]
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

## 3. Slackスレッド取得・解析ツール

Part2のAgentはSlackスレッドを自分で読み込み、そこからタイトル・要約・詳細を取り出します。Part1が投稿したメッセージ構造をPart2が解釈することで、両者がSlackを介して連携しています。

### Part1のメッセージ構造

Part1のLambdaはSlackにBlock Kit形式で3件のメッセージを投稿します。

| インデックス | 内容 | Blockタイプ |
|---|---|---|
| `messages[0]` | タイトル・カテゴリ・公開日・記事URLボタン | header / context / actions |
| `messages[1]` | 要約（`*要約:*\n...`） | section |
| `messages[2]` | 詳細（`*詳細:*\n...`） | section |

### `slack_read_thread`ツール

`conversations.replies` APIでスレッドのメッセージをJSON形式で取得します。

```python
@tool
def slack_read_thread(channel: str, thread_ts: str) -> str:
    """
    Slackスレッドのメッセージを取得

    Args:
        channel: チャンネルID（例: "C0ACMDRQS59"）
        thread_ts: スレッドのタイムスタンプ（例: "1234567890.123456"）

    Returns:
        JSON形式のメッセージリスト
    """
    url = (
        f"https://slack.com/api/conversations.replies"
        f"?channel={channel}&ts={thread_ts}&limit=10"
    )
    headers = {
        "Authorization": f"Bearer {bootstrap.SLACK_BOT_TOKEN}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode())

    if not result.get("ok"):
        return json.dumps({"error": result.get("error", "不明なエラー")})

    return json.dumps(result.get("messages", []), ensure_ascii=False)
```

### `parse_thread_messages`ツール

取得したメッセージのBlock Kit構造をパースし、後続ツールが扱いやすいJSONに変換します。

```python
@tool
def parse_thread_messages(messages_json: str) -> str:
    """
    Slackスレッドメッセージを解析し、タイトル・要約・詳細を抽出

    Returns:
        JSON: {title, category, published_date, article_url, summary, detail}
    """
    messages = json.loads(messages_json)

    main_msg = messages[0]
    blocks   = main_msg.get("blocks", [])

    # Header block → タイトル
    title = next(
        (b["text"]["text"] for b in blocks if b["type"] == "header"), ""
    )

    # Context block → "カテゴリ: AI | 公開日: 2024-01-15" をパース
    category, published_date = "", ""
    for b in blocks:
        if b["type"] == "context":
            text  = b["elements"][0]["text"]
            parts = text.split("|")
            category       = parts[0].replace("カテゴリ:", "").strip()
            published_date = parts[1].replace("公開日:", "").strip() if len(parts) >= 2 else ""
            break

    # Actions block → 記事URLボタン
    article_url = ""
    for b in blocks:
        if b["type"] == "actions":
            for el in b.get("elements", []):
                if el.get("type") == "button" and el.get("url"):
                    article_url = el["url"]
                    break

    # messages[1] → 要約、messages[2] → 詳細
    def extract_text(msg, prefix):
        for b in msg.get("blocks", []):
            if b["type"] == "section":
                text = b["text"]["text"]
                if prefix in text:
                    return text.split(prefix, 1)[-1].strip()
        return ""

    summary = extract_text(messages[1], "*要約:*\n")
    detail  = extract_text(messages[2], "*詳細:*\n")

    return json.dumps({
        "title": title,
        "category": category,
        "published_date": published_date,
        "article_url": article_url,
        "summary": summary,
        "detail": detail,
    }, ensure_ascii=False)
```

このツールの戻り値が`generate_marp_from_thread`と`generate_summary_markdown`の入力になります。

## 4. ファイル名生成

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

## 5. スライド生成ツール（ハイブリッドアプローチ）

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
    slides += [f"# {title}", "", published_date, "", "---", ""]

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

## 7. GitHubコミットツール

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

## 8. Agentの初期化とエントリーポイント

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

## 9. bootstrapモジュール

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

## ストリーミング実行とタイムアウト

`stream_async`でストリーミング実行することで、長時間の処理中もAgentCoreとの接続を維持できます。`asyncio.wait_for`でタイムアウトを設けており、上限を超えた場合はSlackにエラー通知します。エラーハンドリングの多くはシステムプロンプトでAgentに委譲しているため、ここではタイムアウトとAgent起動失敗のみをハンドリングしています。


# おわりに

Part2ではStrands AgentsとAgentCoreを組み合わせて、情報収集からスライド生成・GitHubコミットまでを1つのAgentで完結させました。このパートで特に重要だった設計判断を整理します。

**`@tool`デコレータでツール定義を最小化**
Strands Agentsのツール定義はdocstringがそのままLLMへの説明になります。関数さえ書けばツールになる設計のおかげで、Tavily・GitHub・Slackの連携がボイラープレートなしに実装できました。複雑な入力フォーマットはdocstringにJSONサンプルを添えることでAgentの誤用を防げます。

**Claude Haiku 4.5をAgentのモデルに選んだ理由**
このシステムでは毎日大量のWhat's New記事を処理します。LLMはコンテンツ生成ではなくツールの呼び出し順を決めるオーケストレーターとして使うため、速度とコストが最優先です。Claude Haiku 4.5は指示追従性が高くレスポンスが速いため、このユースケースに適しています。モデルIDは環境変数`MODEL_ID`で管理しており、必要に応じてSonnetなど上位モデルへの切り替えも容易です。

**スライド生成をルールベースにした理由**
`generate_marp_from_thread`のコンテンツ生成はLLMではなくキーワードマッチングで実装しています。LLMに全文生成を任せると出力フォーマットが安定せず、Marpの記法を守らないケースが発生しやすいためです。LLMはオーケストレーターに徹し、コンテンツ生成は決定的なPython処理で行うことで品質と速度を両立しています。

**Tavilyを3ツールに分ける意義**
`crawl`（ページ全文）・`search`（一般検索）・`extract`（特定URL構造化）を別ツールとして持たせることで、コンテンツの性質に応じた情報収集をAgentが自律的に選択できます。1つの汎用ツールにまとめると判断ロジックをAgentに委ねすぎてしまい、ツール呼び出しの精度が下がります。

**`_commit_once_guard`でAgentの二重コミットを防ぐ**
Strands AgentはReActループの中でツールを複数回呼び出すことがあります。コミット操作は冪等ではないため、`_commit_once_guard`フラグで同一実行内での2回目以降の`commit_files_to_github`呼び出しをスキップします。upsertパターンと組み合わせることで、再実行時も安全に動作します。

**`slide.md` + `summary.md` の2ファイル構成**
スライド本体と検索用サマリを分離して保存しています。Part3のメタデータ生成スクリプトが`summary.md`の最初の段落を読み取り、KVの検索インデックスとして活用します。

次のPart3では、GitHubリポジトリにコミットされたMarpスライドをCloudflare Workers経由で公開する部分を解説します。

サイトの方にもアクセスいただいて、気になるポイントがあればコメントいただけると嬉しいです！

https://whatsnew-marp.nnydtmg.com/
