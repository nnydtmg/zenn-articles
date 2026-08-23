---
title: "Amazon Quick on Desktop を Okta のエンタープライズSSOで使う"
emoji: "🔐"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["AWS","AmazonQuick","Okta","OIDC","IAMIdentityCenter"]
published: true
---
# はじめに
みなさんは、`Amazon Quick on Desktop` をもう触られましたか？

私は最近、社内で Amazon Quick を使い始めるにあたってデスクトップアプリを配ろうとしたのですが、ここで一つ勘違いをしていました。てっきり「SSOにしておくと便利だよね」くらいの話だと思っていたのですが、実際は違いました。

:::message
**Enterprise アカウントでは、エンタープライズサインインの設定は「あったほうがいい」ではなく「やらないとログインできない」ものです。**
:::

[公式ドキュメント](https://docs.aws.amazon.com/quick/latest/userguide/getting-started-desktop.html)にも、`Enterprise sign-in is not available until an administrator configures the extension access.` とはっきり書かれています。つまり管理者が先に設定を終えていないと、ユーザーはアプリを入れてもサインイン画面から先に進めません。配布前に済ませておく必要がある作業でした。

そこで Okta と繋いでみたのですが、参考にした記事と実際の管理画面が噛み合わず、地味に時間を溶かしてしまいました。。同じところで止まる方がいそうなので、2026年8月時点の手順として残しておきます。

なお私は Okta が本職ではないので、Okta 側の用語で怪しいところがあればぜひ指摘いただけると嬉しいです！

# 先に結論
先に要点だけ書いておきます。ここで分かった方は読み飛ばしてください！

:::message
1. Quick 側の設定は **「拡張機能アクセス」と「拡張機能」の2つ** を作る。片方だけだとサインインできない
2. **Trusted Token Issuer（TTI）の作成は現在の手順には登場しない**。管理画面にその入力欄がそもそも無い
3. Okta 側は**どの認可サーバーを使うかで難易度が変わる**。`default`（カスタム認可サーバー）を選ぶならアクセスポリシーの追加が必須
:::

設定が終わると、サインイン時にはこういう流れで動くようになります。今は雰囲気だけ掴んでいただければ大丈夫です。

![](https://static.zenn.studio/user-upload/c67a3f783cf5-20260823.png)

# Amazon Quick の認証まわりを3レイヤで整理する
手順に入る前に、ここを整理しておかないと確実に混乱します。私が最初にハマったのもここでした。

Amazon Quick は `Amazon QuickSight` → `Amazon Quick Suite` → `Amazon Quick` と短期間で2回名前が変わっていて、ドキュメントにも新旧の記述が混在しています。「Enterprise」という単語に至っては3つの別々の意味で出てくるので、まずは分解して考えるのがおすすめです。

| レイヤ | 何を決めるか | 選択肢 | 変更可否 |
|---|---|---|---|
| **A. アカウントの認証方式** | 誰が Quick にログインできるか | IAM Identity Center / IAM フェデレーション(SAML) / Active Directory / Quick 管理ユーザー | アカウント作成後は**変更不可** |
| **B. サブスクリプションとロール** | 何ができるか、いくら掛かるか | Quick Professional / Quick Enterprise など | 変更可 |
| **C. デスクトップのエンタープライズサインイン** | デスクトップアプリがどう認証するか | OIDC 対応 IdP を登録 | 作成後、値は**編集不可** |

**今回の記事で扱うのは C だけです。** ここが一番大事なポイントなので、順に見ていきます。

## A. アカウントの認証方式
Quick アカウントそのものにログインする方式です。[Identity and access management in Quick](https://docs.aws.amazon.com/quicksuite/latest/userguide/identity.html) にある通り、IAM Identity Center、IAM フェデレーション、Active Directory、Quick 管理ユーザーといった選択肢があります。

これは**アカウント作成時に決まり、後から変更できません**。私の環境は IAM Identity Center 構成でした。

なお `af-south-1` や `ap-southeast-3` など一部のリージョンでは IAM Identity Center しか選べないので、これから新規に作られる方はご注意ください。

## B. サブスクリプションとロール
Quick の管理画面を開くと、上部にこんな案内が出ています。

![](https://static.zenn.studio/user-upload/f5e2c762e1fe-20260823.png)

> 新しい Quick Professional サブスクリプションは、Reader Pro ロールに対応しています。新しい Quick Enterprise サブスクリプションは、Author Pro と Admin Pro ロールに対応しています。

ここが少し厄介で、ドキュメント側にはまだ QuickSight 時代の `Standard Edition` / `Enterprise Edition` という記述も残っています。私は画面に出ている表記のほうを信じることにしました（実際に課金される単位はこちらのはずなので）。

そしてデスクトップアプリについては、[Amazon Quick on desktop](https://docs.aws.amazon.com/quick/latest/userguide/amazon-quick-desktop.html) に「Plus と Enterprise アカウントで利用可能、Free アカウントは最初の30日間だけ試用可能」と書かれています。

このアカウント種別によって、デスクトップアプリのサインイン画面が変わります。

- **Plus / Free**：Email、Amazon、Apple、Google、GitHub から選んで個別にサインインする
- **Enterprise**：**`Continue with SSO` のみ**

つまり Enterprise アカウントには「とりあえず個人のアカウントでログインしておく」という逃げ道がありません。冒頭に書いた「必須」というのはこういうことでした。

## C. デスクトップのエンタープライズサインイン
そして本題です。ここで一番伝えたいのはこれです。

:::message
**C は A と独立しています。**
デスクトップのエンタープライズサインインは、IdP が返す `email` クレームを Quick 上の既存ユーザーの email と突き合わせているだけです。A で作られたユーザーがどの方式のものであっても関係ありません。
:::

これは Quick のコミュニティでも明言されていて、[Quick 管理ユーザーでもデスクトップアプリを使えるか](https://community.amazonquicksight.com/t/quick-desktop-with-quick-managed-users-is-it-supported/52556) というスレッドで、

- Quick 管理ユーザーのユーザー名/パスワードによるデスクトップ認証は**非対応**
- デスクトップのエンタープライズサインインには**外部の OIDC 対応 IdP が必須**
- ただし**既存ユーザーの移行は不要**で、IdP が同じ email のトークンを発行できればよい

と回答されています。「Quick 管理ユーザーで運用しているから SSO は無理」ではなく、「どんな構成でも OIDC の IdP を1つ用意すればいい」ということですね。ここが腑に落ちると、以降の手順がだいぶ素直に読めるかと思います。

## コラム：Trusted Token Issuer は結局どこへ行ったのか
私が最初に参考にしたのは、AWS Japan さんのこちらの記事でした。

https://zenn.dev/aws_japan/articles/baa6cd89a7b91b

この記事では IAM Identity Center に `Trusted Token Issuer`（TTI）を作成し、Quick 管理画面で「信頼できるトークン発行者 Arn」と「Aud 請求」を入力する、という流れになっています。私もその通りに以下を実行し、ARN を取得しました。

```bash
aws sso-admin create-trusted-token-issuer \
  --instance-arn <IDC_INSTANCE_ARN> \
  --name "AmazonQuickOnDesktop" \
  --trusted-token-issuer-type OIDC_JWT \
  --trusted-token-issuer-configuration '{
    "OidcJwtConfiguration": {
      "IssuerUrl": "https://<OKTA_DOMAIN>/oauth2/default",
      "ClaimAttributePath": "email",
      "IdentityStoreAttributePath": "emails.value",
      "JwksRetrievalOption": "OPEN_ID_DISCOVERY"
    }
  }' \
  --region <IDC_REGION>
```

:::message alert
`--region` は **IAM Identity Center インスタンスがあるリージョン**を指定してください。私はここを勘違いして一度やり直しました。`aws sso-admin list-instances` で確認できます。
:::

ところが、いざ Quick の管理画面を開いたら **「信頼できるトークン発行者 Arn」も「Aud 請求」も項目として存在しませんでした**。入力するのは Issuer URL とエンドポイント3種、そして Client ID だけです。

改めて[現行の公式手順](https://docs.aws.amazon.com/quick/latest/userguide/desktop-enterprise-okta.html)を確認したところ、TTI の作成手順はどこにも出てきませんでした。おそらく仕様が変わったのだと思います。

せっかくなので TTI が何者なのかだけ書いておくと、これは IAM Identity Center の **信頼された ID 伝播（Trusted Identity Propagation）**の部品です。外部 IdP が発行した JWT の中のどのクレームを、IAM Identity Center 上のどの属性と突き合わせるか、というルールを IAM Identity Center 側に持たせるための登録になります。上のコマンドで言えば、`ClaimAttributePath: email` と `IdentityStoreAttributePath: emails.value` の対応がそれですね。

https://aws.amazon.com/blogs/security/simplify-workforce-identity-management-using-iam-identity-center-and-trusted-token-issuers/

Amazon Q Business などでは今も現役の仕組みです。一方 Quick on Desktop については、同じ突合を Quick 側が自前で持つ設計になったようで、TTI は不要になった、と私は理解しています。

:::message
とはいえ「TTI を作らずにゼロから通した」検証まではできていません。私の環境は TTI を作った状態で成功しているので、正確には「**現在の管理画面には TTI を入力する欄が存在しない**」までが確実に言えることになります。
:::

# サインインの流れ
設定に入る前に、裏で何が起きているかを押さえておくと、ハマったときの切り分けが楽になります。

1. ユーザーがデスクトップアプリで **Continue with SSO** を選ぶ
2. ブラウザが開いて Amazon Quick に飛ぶ
3. Quick が、そのアカウントに設定された IdP を判定する
4. IdP の認可エンドポイントへリダイレクトされる
5. **PKCE** を使って認可コードをトークンに交換する
6. トークンが検証され、**`email` クレームでアカウント内のユーザーに紐付けられる**

ポイントは 6 で、**IdP 側の email と Quick 側ユーザーの email が完全に一致している必要があります**。大文字小文字も含めて一致です。ここが後々効いてきます。

:::message
初回サインイン時、ブラウザ側に Quick のセッションが無いと、IdP にリダイレクトされず Quick のサインイン画面が表示されます。一度ブラウザで Quick にサインインしてから、改めてデスクトップアプリで試すと通ります。私はこれを不具合だと思って少し悩みました。。
:::

# 構築
ここから実際の手順です。全体としては4ステップになります。

1. Okta で OIDC アプリを作成する
2. Quick 管理コンソールで**拡張機能アクセス**を追加する
3. Quick コンソールで**拡張機能**を作成する
4. デスクトップアプリで動作確認する

## 前提条件
- Amazon Quick の Enterprise アカウントであること（Plus / Free アカウントは個別サインインなので、この設定は不要です）
- Quick 側に対象ユーザーが登録済みであること
- Okta の管理者権限があること
- **Quick には IAM 認証情報でサインインできること**

最後の項目が地味に重要です。拡張機能アクセスの管理には IAM 管理者権限が必要で、[公式ドキュメント](https://docs.aws.amazon.com/ja_jp/quick/latest/userguide/extension-roles-overview.html)にも次のように書かれています。

> すべての管理者には拡張機能リンクが表示されますが、IAM 認証情報でサインインしていない場合は、拡張機能アクセスを管理するために適切な IAM アクセス許可でサインインする必要があります。

:::message
以降のスクリーンショットで表示されるクライアントIDなどはすでに削除済みのものです。
:::

## Okta で OIDC ネイティブアプリを作成する
Okta の管理コンソールで `Applications` → `Create App Integration` から作成します。設定値はこちらです。

| 項目 | 値 |
|---|---|
| Sign-in method | OIDC - OpenID Connect |
| Application type | **Native Application** |
| クライアント認証 | **なし**（パブリッククライアント） |
| PKCE | 追加の検証として要求する（チェックを入れる） |
| 付与タイプ | 認証コード、**リフレッシュトークン** |
| Sign-in redirect URIs | `http://localhost:18080` |

作成できたら、`一般` タブでクライアントIDを控えておきます。

![](https://static.zenn.studio/user-upload/a2034f037f39-20260823.png)

:::message alert
`割り当て` タブでユーザーまたはグループを割り当てるのを忘れないでください。ここが空だと、後段が全部正しくてもサインインできません。
:::

リダイレクト URI の `http://localhost:18080` は固定値です。ポート番号を変えたくなりますが、デスクトップアプリ側が待ち受けているポートなので、そのまま設定してください。

## 認可サーバーをどちらにするか
ここが今回一番のハマりポイントでした。

Okta には**組織認可サーバー（Org Authorization Server）**と**カスタム認可サーバー**の2種類があり、どちらを使うかでエンドポイントの形も、必要な追加作業も変わります。

| | 組織認可サーバー | カスタム認可サーバー（`default`） |
|---|---|---|
| Issuer URL | `https://<OKTA_DOMAIN>` | `https://<OKTA_DOMAIN>/oauth2/default` |
| 認可エンドポイント | `/oauth2/v1/authorize` | `/oauth2/default/v1/authorize` |
| トークンエンドポイント | `/oauth2/v1/token` | `/oauth2/default/v1/token` |
| JWKS URI | `/oauth2/v1/keys` | `/oauth2/default/v1/keys` |
| アクセスポリシー | **不要** | **必須** |
| 公式手順 | こちら | — |

私は先行記事に合わせて `default` で進めたのですが、[現行の公式手順](https://docs.aws.amazon.com/quick/latest/userguide/desktop-enterprise-okta.html)は組織認可サーバーを使う書き方になっています。

:::message
**本番運用では組織認可サーバーのほうをおすすめします。** アクセスポリシーの設定が不要なぶん、構成がシンプルで事故りにくいためです。
この記事では私が実際にやった `default` の手順で進めますが、組織認可サーバーを使う場合は次のセクションを丸ごと飛ばして構いません。
:::

:::message alert
どちらの場合も、ドメインは `-admin` を**除いた** `xxx.okta.com` を使ってください。管理コンソールを開いているとつい `xxx-admin.okta.com` をコピーしてしまいますが、これでは通りません。
:::

## `default` を使う場合はアクセスポリシーが要る
カスタム認可サーバーは、アクセスポリシーが無いとトークンを発行してくれません。`Security` → `API` → `default` → `アクセスポリシー` から追加します。

![](https://static.zenn.studio/user-upload/371dc6ed2a57-20260823.png)

`新しいアクセスポリシーを追加` でポリシーを作り、その中に `ルールを追加` でルールを1つ作る、という2段構えです。ルールの設定値はこちらにしました。

| 項目 | 値 |
|---|---|
| 付与タイプ | 認証コード |
| ユーザー | アプリに割り当てられているユーザー |
| 要求されたスコープ | `openid` `profile` `email` `offline_access` |
| アクセストークンのライフタイム | 1時間 |
| リフレッシュトークンのライフタイム | 90日 |

![](https://static.zenn.studio/user-upload/8c7f2a7e0e79-20260823.png)

![](https://static.zenn.studio/user-upload/0c03af04597b-20260823.png)

`offline_access` は忘れずに入れてください。これが無いとリフレッシュトークンが発行されず、ユーザーが頻繁に再ログインを求められることになります。公式のトラブルシュートにも「セッションがすぐ切れる場合はリフレッシュトークンの設定を確認」という項目があります。

### ポリシーの割り当て先でつまずいた話
ポリシー作成時、`次に割り当てる` で `次のクライアント` を選んで、先ほど控えたクライアントIDを貼り付けたのですが、エラーになって先に進めませんでした。

![](https://static.zenn.studio/user-upload/96f82ba82607-20260823.png)

何度か試しても改善しなかったので、結局 `すべてのクライアント` に広げて先へ進みました。

![](https://static.zenn.studio/user-upload/e38ba9e91c65-20260823.png)

:::message
**補足：この欄はクライアントIDではなくアプリ名を入れる欄でした。**

[Okta のドキュメント](https://developer.okta.com/docs/guides/configure-access-policy/main/)を読み返したところ、次のように書かれていました。

> Select **The following clients:** and start typing the names of the Okta OpenID Connect apps that you want to cover with the access policy. This field automatically displays a list of apps that match what you type.

つまりこの入力欄は**アプリ統合の「名前」を打って、表示された候補から選ぶ**タイプアヘッドで、クライアントIDの文字列は受け付けません。候補が選択されないまま保存しようとしたのでフォーム検証に弾かれた、というのが真相のようです。

`すべてのクライアント` に広げなくても、アプリ名（私の場合は `Amazon Quick`）で検索して候補をクリックすれば、対象クライアントを限定できるはずです。本番環境ではこちらで設定するのが望ましいと思います。
:::

## Quick 管理コンソールで拡張機能アクセスを追加する
ここからは Quick 側の作業です。IAM 認証情報でサインインした状態で、`アカウントを管理` → `アクセス許可` → `拡張機能へのアクセス` を開きます。

![](https://static.zenn.studio/user-upload/4e42a819d90f-20260823.png)

`拡張機能アクセスを追加` を選ぶと、サービスの選択画面になります。Teams や Slack と並んで **Amazon Quick（Quick 用デスクトップアプリケーション）** があるので、これを選択します。

![](https://static.zenn.studio/user-upload/9f3c97f7582d-20260823.png)

次の画面で、Okta 側で控えた値を入力していきます。

| 項目 | 値 |
|---|---|
| 名前 | 任意（英数字とハイフンのみ） |
| 説明 | 任意 |
| Issuer URL | `https://<OKTA_DOMAIN>/oauth2/default` |
| Authorization Endpoint | `https://<OKTA_DOMAIN>/oauth2/default/v1/authorize` |
| Token Endpoint | `https://<OKTA_DOMAIN>/oauth2/default/v1/token` |
| JWKS URI | `https://<OKTA_DOMAIN>/oauth2/default/v1/keys` |
| Client ID | Okta アプリのクライアントID |

:::message alert
**作成後は値を編集できません。** 特に Issuer URL のタイプミスは後から直せないので、保存前によく確認してください。間違えた場合は作り直しになります。
:::

## 拡張機能を作成する
ここで終わりだと思って動作確認に進むと、`Enterprise sign-in not configured for this account` で弾かれます。私はこれで一度止まりました。

**「拡張機能アクセス」と「拡張機能」は別のオブジェクト**で、両方作って初めてサインインできるようになります。

| | 場所 | 何を設定するか |
|---|---|---|
| 拡張機能アクセス | アカウントを管理 → アクセス許可 → 拡張機能へのアクセス | 外部システムとの**接続そのもの**（OIDC の信頼設定） |
| 拡張機能 | さらに詳しく → 拡張機能 | 上で許可された接続を使う**実体** |

前者が「この IdP を使ってよい」という許可、後者が「実際に有効化する」操作、というイメージですね。ナビゲーションの `さらに詳しく` → `拡張機能` を開いて、`拡張機能を作成` から先ほどの拡張機能アクセスを選択します。

![](https://static.zenn.studio/user-upload/30275afa9b07-20260823.png)

作成すると、一覧に `有効` のバッジが付きます。この状態になっていればOKです。

## 動作確認
デスクトップアプリを起動して `Continue with SSO` を選びます。ブラウザが開いて Okta の認証画面に飛び、認証が通ればアプリに戻ってくる、という流れです。

……が、私はここでこうなりました。

![](https://static.zenn.studio/user-upload/3ac551dea9b4-20260823.png)

> Failed to authorize user: we found 0 users for your email. Please make sure your identity provider is configured to return the email claim.

これは[公式のトラブルシュート](https://docs.aws.amazon.com/quick/latest/userguide/desktop-enterprise-setup-troubleshooting.html)にある `User not found after sign-in` そのものでした。原因は2パターンあります。

1. トークンに `email` クレームが含まれていない
2. Quick 側に同じ email のユーザーが存在しない（**大文字小文字も含めた完全一致**が必要）

1 については、認可サーバーのアクセスポリシーで `email` スコープを許可しているか、Okta の `トークンのプレビュー` タブで実際にトークンを覗いてみるのが早いです。2 については、Quick の `ユーザーを管理` で対象ユーザーの email を確認してください。

サインインが通れば完了です！

# うまくいかない時に見るところ
公式のトラブルシュートから、Okta 構成で当たりそうなものを抜き出しておきます。

| 症状 | 原因 | 対処 |
|---|---|---|
| `redirect_mismatch` | リダイレクト URI の設定ミス | `http://localhost:18080` と完全一致しているか、ネイティブ/パブリッククライアントになっているか |
| `we found 0 users for your email` | email が一致しない / email クレームが返っていない | Quick 側ユーザーの email を確認、スコープに `email` を含める |
| Token validation failure | Issuer URL の不一致 | 拡張機能アクセスの Issuer URL が IdP の OIDC 設定と完全一致しているか |
| `Enterprise sign-in not configured for this account` | 拡張機能を作っていない | `さらに詳しく` → `拡張機能` から作成する |
| セッションがすぐ切れる | リフレッシュトークンが出ていない | 付与タイプにリフレッシュトークン、スコープに `offline_access` を追加 |
| サインイン画面から進まない（初回） | ブラウザに Quick のセッションが無い | 一度ブラウザで Quick にサインインしてから再試行 |

サインイン画面から**アプリケーションログをエクスポート**できるので、切り分けに詰まったらこれを見るのが確実です。

# 最後に
手順自体は素直で、落ち着いてやれば30分ほどで終わる内容だと思います。ただ、Amazon Quick は名前が2回変わっているうえにドキュメントの更新も速く、少し前の記事がもう現行の画面と合わない、という状況になっていました。私が TTI で回り道をしたのもまさにそれです。。

とはいえ、遠回りしたおかげで「デスクトップの OIDC はアカウントの認証方式とは独立していて、email で既存ユーザーに紐付けているだけ」という構造が理解できたので、結果的には良かったかなと思っています（負け惜しみではないですw）。

この記事の内容も、しばらくすると画面が変わっているかもしれません。もし「今はここが違うよ」というのがあれば、ぜひ教えていただけると嬉しいです！

これから Amazon Quick on Desktop を組織に展開される方の助けになれば幸いです。
