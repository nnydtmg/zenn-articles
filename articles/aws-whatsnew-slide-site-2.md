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

このPart2では、**AgentCore上のStrands AgentがTavilyで情報を補完しながらMarpスライドを自動生成し、GitHubリポジトリにコミットするまで**を解説します。

## このPartで扱う範囲

```
[AgentCore呼び出し] ← Part1より
        ↓
[Strands Agent (AgentCore上)]
    ├── [Tool: tavily_search]
    │       ↓
    │   [Tavily API]
    └── [Tool: save_slide]
            ↓
        [GitHub Client (bootstrap)]
            ↓
    [GitHubリポジトリ: Marpスライド(.md)] → Part3へ続く
```


# 構成

## 使用するサービス・フレームワーク

| サービス/ライブラリ | 役割 |
|---|---|
| **Amazon Bedrock AgentCore** | Strands Agentのマネージドホスティング環境 |
| **Strands Agents (Python)** | Agentのオーケストレーションフレームワーク |
| **Tavily** | AIに特化したWeb検索API（情報補完） |
| **GitHub API (PyGithub)** | 生成したMarpスライドのリポジトリへの保存 |
| **AWS Systems Manager Parameter Store** | Tavily APIキー・GitHubトークンの管理 |

### AgentCoreとStrands Agentsについて

[Amazon Bedrock AgentCore](https://aws.amazon.com/jp/bedrock/agentcore/)は、AIエージェントをサーバーレスで実行・ホスティングできるマネージドランタイムです。インフラ管理なしにエージェントをデプロイし、スケーリングや可用性をAWSに任せることができます。

[Strands Agents](https://strandsagents.com/)はAWSがオープンソースで提供するエージェントフレームワークです。`@tool`デコレータでPython関数をツールとして定義するシンプルなAPIが特徴で、AgentCoreとの統合がネイティブにサポートされています。


# 実装

## 1. Agentのシステムプロンプト

スライド生成の品質を左右する最重要パーツです。Tavilyで検索した内容をもとに、一定のフォーマットでMarpスライドを生成するよう指示します。

```python
SYSTEM_PROMPT = """
あなたはAWSの最新情報をもとにMarpスライドを作成するエキスパートです。

与えられたAWS What's NewのタイトルとURLをもとに、以下の手順でスライドを作成してください。

1. tavily_searchツールを使って、URLの内容と関連情報を検索・収集する
2. 収集した情報をもとに、Marp形式のMarkdownスライドを生成する
3. save_slideツールを使って、生成したスライドをGitHubリポジトリに保存する

## スライドの構成

- 表紙: タイトル、日付
- サービス概要: 何が変わったか（1〜2枚）
- ユースケース: どんなときに役立つか（1〜2枚）
- まとめ

## Marpの記法

- フロントマターに `marp: true` を含める
- スライドの区切りは `---`
- コードブロックは適宜使用する
- 図解が必要な場合はMermaid記法を使用する
"""
```

## 2. ツール定義

Strands Agentsでは、`@tool`デコレータを付けたPython関数がそのままAgentのツールになります。関数のdocstringがツールの説明としてLLMに渡されます。

### Tavily検索ツール

```python
import boto3
import requests
from strands import tool

ssm = boto3.client("ssm")

def _get_param(name: str) -> str:
    return ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]

@tool
def tavily_search(query: str, url: str = "") -> str:
    """
    Web検索を実行してAWS What's Newの詳細情報を収集する。
    URLを指定すると、そのドメインを優先的に検索する。

    Args:
        query: 検索クエリ
        url: 優先的に参照するURL（省略可）

    Returns:
        収集した情報のテキスト
    """
    api_key = _get_param("/whatsnew/tavily_api_key")

    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "advanced",
        "max_results": 5,
    }
    if url:
        payload["include_domains"] = [url.split("/")[2]]

    response = requests.post("https://api.tavily.com/search", json=payload)
    results = response.json().get("results", [])

    return "\n\n".join(
        f"### {r['title']}\n{r['url']}\n{r['content']}" for r in results
    )
```

### スライド保存ツール (GitHub Client)

GitHubへの保存はAgentのbootstrap時に初期化したGitHub Clientを使います。`save_slide`ツールからクロージャ経由でClientを参照できるようにしています。

```python
from github import Github
from datetime import datetime
from strands import tool

def create_save_slide_tool(github_token: str, repo_name: str):
    """GitHub Clientをbootstrap時に初期化してツールとして返す"""
    gh = Github(github_token)
    repo = gh.get_repo(repo_name)

    @tool
    def save_slide(title: str, content: str) -> str:
        """
        生成したMarpスライド（Markdown形式）をGitHubリポジトリに保存する。

        Args:
            title: スライドのタイトル（ファイル名に使用）
            content: Marp形式のMarkdownコンテンツ

        Returns:
            保存先のファイルパス
        """
        date_str = datetime.now().strftime("%Y%m%d")
        safe_title = title[:40].replace(" ", "-").replace("/", "-")
        path = f"slides/{date_str}-{safe_title}.md"

        repo.create_file(
            path=path,
            message=f"Add slide: {title}",
            content=content,
            branch="main",
        )
        return path

    return save_slide
```

## 3. AgentのBootstrapと定義

AgentCoreへのデプロイ時には、エントリーポイントとなる関数でAgentを初期化します。ここでParameter StoreからGitHubトークンを取得し、GitHub Clientをセットアップします。

```python
import boto3
from strands import Agent
from strands_tools import use_aws

ssm = boto3.client("ssm")

def bootstrap() -> Agent:
    """AgentCore起動時に一度だけ呼ばれる初期化処理"""
    github_token = ssm.get_parameter(
        Name="/whatsnew/github_token", WithDecryption=True
    )["Parameter"]["Value"]

    save_slide = create_save_slide_tool(
        github_token=github_token,
        repo_name="your-org/whatsnew-slides",
    )

    agent = Agent(
        model="us.anthropic.claude-sonnet-4-5-20251001",
        system_prompt=SYSTEM_PROMPT,
        tools=[tavily_search, save_slide],
    )
    return agent


# AgentCoreがエントリーポイントとして呼び出す関数
agent = bootstrap()

def handler(event: dict) -> str:
    title = event.get("title", "")
    url = event.get("url", "")
    result = agent(f"タイトル: {title}\nURL: {url}")
    return str(result)
```

## 4. AgentCoreへのデプロイ

Strands Agentsは`agentcore`コマンドでAgentCoreにデプロイできます。

```bash
pip install strands-agents strands-agents-tools agentcore-sdk

# デプロイ
agentcore deploy \
  --entry-point agent:handler \
  --agent-name whatsnew-slide-agent \
  --region ap-northeast-1
```

デプロイが完了するとAgentCore EndpointのARNが発行され、Part1のLambdaから呼び出せるようになります。


# Agentの動作フロー

Strands Agentは渡された入力をもとに、ReActパターンで以下のようにツールを呼び出しながらスライドを生成します。

1. **入力受け取り**: Part1のLambdaから「タイトル + URL」を受け取る
2. **Tavily検索**: URLをもとに`tavily_search`を呼び出し、記事詳細と関連情報を収集
3. **スライド生成**: 収集情報をもとにMarp形式のMarkdownを生成
4. **GitHubへ保存**: `save_slide`を呼び出してリポジトリにコミット

検索結果が不十分だとAgentが判断した場合は、クエリを変えて自律的に再検索することもあります。


# ポイントと注意点

## `@tool`デコレータとdocstringの重要性

Strands Agentsでは、docstringがそのままLLMへのツール説明として使われます。引数の説明が曖昧だとAgentがツールを誤用することがあるため、`Args:`セクションを丁寧に書くことが品質向上のポイントです。

## GitHub Clientのbootstrap初期化

GitHub Clientはリクエストごとに初期化するとAPIレート制限に引っかかる可能性があります。AgentCore起動時の`bootstrap()`で一度だけ初期化し、インスタンスを使い回すことでこれを回避しています。

## Tavilyの`search_depth`

`advanced`にすると各URLのページ内容まで取得するため、What's New記事の詳細を正確に把握できます。一方でレスポンスが遅くなりAPIコストも増えるため、`basic`との使い分けも検討してください。

## ファイル名の衝突

同日に同じタイトルのWhat's Newが来ることはほぼありませんが、`create_file`は同パスが既存だと例外を投げます。本番運用時はタイトルにハッシュを付加する、または`update_file`にフォールバックする対策を入れておくと安心です。


# まとめ

Part2では以下を実装しました。

- **Strands Agentsによるツール定義**: `@tool`デコレータでTavily検索とGitHub保存をシンプルに実装
- **GitHub Clientのbootstrap初期化**: AgentCore起動時にClientを一度だけセットアップ
- **AgentCoreへのデプロイ**: `agentcore deploy`コマンドによるサーバーレスホスティング

次のPart3では、GitHubリポジトリに保存されたMarpスライドをCloudflare PagesとWorkers経由で公開する部分を解説します。
