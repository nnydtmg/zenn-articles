---
title: "AWS管理のIPが更新された時にプレフィックスリストに登録しいているIPレンジを自動更新する"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","python","lambda","waf"]
published: false
---

# はじめに

皆さんはプレフィックスリスト利用していますか？

私はAmazon WorkSpacesクライアントアプリを利用した通信で、NetworkFirewallのアウトバウンドを厳密に制限する必要がある時に初めて使いました。
（なんでこんな構成になっているかは、詳しく書けないのでご了承ください。。）

が、この「Amazon WorkSpacesクライアントアプリを利用した通信に制限」がなかなか面倒で、要件で指定されるIPレンジが不定期にAWS側で変更され、その都度設定しているプレフィックスリストを更新する必要が出てきました。
毎度手動で更新しても良いですが、数百のレンジに対して差分確認・更新作業は非現実的でした。

そこで、IPレンジが更新された時に自動的にプレフィックスリストを更新する仕組みを作ってみました。

参考程度にコードも載せておきますので、カスタマイズして使ってみてください。（インフラ屋のコードなので全く整っていないですが、多めにみていただければうれしいです。。）


# マネージドプレフィックスリストとは

そもそもプレフィックスリストとは何かから。

[ドキュメント](https://docs.aws.amazon.com/ja_jp/vpc/latest/userguide/managed-prefix-lists.html)には以下のように記載されています。

> マネージドプレフィックスリストは、1 つ以上の CIDR ブロックのセットです。プレフィクスリストを使用すると、セキュリティグループとルートテーブルの設定と管理が容易になります。頻繁に使用する IP アドレスからプレフィクスリストを作成し、それらを個別に参照するのではなく、セキュリティグループのルールおよびルートでセットとして参照できます。例えば、CIDR ブロックは異なるが同じポートとプロトコルを持つセキュリティグループルールを、プレフィクスリストを使用する 1 つのルールに統合できます。ネットワークを拡張し、別の CIDR ブロックからのトラフィックを許可する必要がある場合は、関連するプレフィクスリストを更新し、プレフィクスリストを使用するすべてのセキュリティグループを更新します。Resource Access Manager (RAM) を使用して、他の AWS アカウントでマネージドプレフィックスリストを使用することもできます。

さらに、プレフィックスリストには２種類あります。

> * カスタマー管理プレフィクスリスト ：定義および管理する IP アドレス範囲のセット。プレフィックスリストは、他の AWS アカウントと共有できます。そのアカウントはそのリソース内で、このプレフィックスリストを参照できます。
> 
> * AWS マネージドプレフィクスリスト — AWS サービスの IP アドレス範囲のセット。AWS マネージドプレフィックスリストを作成、変更、共有、削除することはできません。


今回は、WorkSpacesに関するIPアドレス帯をカスタマー管理プレフィックスリストで管理しています。

Amazon WorkSpacesのネットワーク要件は[こちら](https://docs.aws.amazon.com/ja_jp/workspaces/latest/adminguide/workspaces-port-requirements.html)に記載の通り、かなりの量があります。

ここから、必要なCIDRをプレフィックスリストに追加していきます。


# プレフィックスリストの更新方法

プレフィックスリストはVPCのサービスページで管理されます。マネージドプレフィックスリストは初期状態で存在します。

今回は同じ名前のプレフィックスリストに末尾3桁の連番を追加した形で2つ作成してみました。これはプレフィックスリストの最大エントリー数（登録できるCIDR数）がNetworkFirewall等で制限があるためです。

![](https://storage.googleapis.com/zenn-user-upload/f301e9e347a6-20230503.png)

各プレフィックスリストに適当にCIDRを登録しています。最終的にこれが削除され、適当なCIDRに変更されていることを確認したいと思います。

![](https://storage.googleapis.com/zenn-user-upload/c38da2bb70ac-20230503.png)

ちなみに、手動で変更する場合は、この右上の変更から1レコードごと追加・削除・更新が可能です。


## トリガー設定

ip-ranges.jsonの更新を通知するSNSトピックが提供されているので、それを利用します。
ただし、提供リージョンがバージニア北部(us-east-1)のみのため、Lambdaもバージニア北部で作成するようにします。

```
arn:aws:sns:us-east-1:806199016981:AmazonIpSpaceChanged
```

Lambdaの設定タブから、トリガー設定を選択し、以下のように指定して追加をクリックするだけです。

![](https://storage.googleapis.com/zenn-user-upload/b91de7819b3f-20230504.png)



## コード説明

python(boto3)を使ってLambdaを作成します。コードについてはGithubにあげていますのでご参考程度に見てみてください。

https://github.com/nnydtmg/aws-prefixlist-update-lambda/blob/2e44e3e8a2d69515e3117c645f793d000faadfea/lambda_function.py


主要な処理だけ解説してみます。

```python
def get_new_ip_prefix(ipranges, region, service):
    new_prefix = []
    for key in ipranges['prefixes']:
        if key['region'] == region and key['service'] == service:
            new_prefix.append(key['ip_prefix'])
    return new_prefix
```

この部分でip-ranges.jsonから必要なプレフィックスリストを抽出します。ここで必要なキー情報はAWSがサービスごとにネットワーク要件を出しているので参考にしてください。

```python
def get_current_prefix_list(name, i):
    get_prefixlist = ec2.describe_managed_prefix_lists(
        Filters=[
            {
                'Name':'prefix-list-name',
                'Values':[
                    name + str(i).zfill(3)
                ]
            },
        ]
    )
    return get_prefixlist
```

この部分では現在の登録されているプレフィックスリスト情報を取得しています。検証用に連番をつけていたので、zfill()でフォーマットを揃えています。

```python
    # 不要項目削除
    for list_item_desc in current_entries_list:
        if 'Description' in list_item_desc:
            del list_item_desc['Description']
    # Cidrのみのリストを作成
    for list_item in current_entries_list:
        if 'Cidr' in list_item:
            current_entries_ip_list.append(list_item['Cidr'])
    # 登録済のCIDRから削除対象を抽出
    for diff_item in current_entries_ip_list:
        if diff_item not in ips_apne1_amazon:
            del_entries_ip_list.append(diff_item)
    # 新規登録対象のCIDRを抽出
    for diff_item in ips_apne1_amazon:
        if diff_item not in current_entries_ip_list:
            add_entries_ip_list.append(diff_item)
```

lambda_handler内では、新しく取得した情報と、既存の情報を取得した上でCIDRのリストに変形して、全体を比較するようにしています。
これによって、複数のマネージドプレフィックスリストに登録されている同じ抽出条件のCIDRリストから、新規に登録するCIDRと削除するCIDRのリストを作成します。

そのあとは、各プレフィックスリストに対して追加するCIDRがあるか、削除するCIDRがあるかをチェックして、あればアップデートするという流れです。

この辺りの処理はもっと簡潔に書ける気もしていますが、業務の片手間ということもあり、ひとまずよしとしています。。



# 動作確認

実際に動かしてみます。

結果を見てみると、エントリーが更新されていて、バージョンも上がっていることがわかりますね。

![](https://storage.googleapis.com/zenn-user-upload/0f21b23ef01a-20230504.png)

しばらくすると、メールも送信されているので、その中で更新されたリストも確認できました。

![](https://storage.googleapis.com/zenn-user-upload/cec47f19601a-20230504.png)

これで、ip-ranges.jsonの更新を自動的に検知して、プレフィックスリストの更新と通知ができました。

# 最後に

普段業務の中でコードを書くことはないですが、日頃煩雑に思っていることを自分で自動化する・改善するという活動は勉強にもなるしとても楽しいですね。
もっといろんな改善や仕組み作りなどにチャレンジしたいと思える経験でした。

どんどん経験してどんどんアウトプットすることを、今後の目標としていきたいと思います。

もっと素早く関数を綺麗に書けるようになりたい。。。


