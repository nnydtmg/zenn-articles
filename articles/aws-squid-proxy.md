---
title: "AmazonLinux2023上でSquidフォワードプロキシ(SSL Bump)を構築してみた"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","proxy","squid"]
published: false
---
みなさんはProxyを構築したことはありますか？
社内Proxyに阻まれた方は多いかと思いますが、あまり実際に構築したことがある方は多くないのかなと思います。さらに、SSL通信を透過するプロキシ(Transparent Proxy)に関しては関連記事もあまりないので、自分自身の備忘としても残しておこうと思います。

:::message alert
なお、透過的プロキシはSSLの中間者攻撃と同等の構成になるため、構築に関しては関係者との合意と明確な通信経路上で行うようにしましょう。
:::


# はじめに
今回はAWSの***AmazonLinux2023***のイメージを使ってフォワードプロキシを構築します。
EC2を構築したことはあるが、Proxyを構築したことがないという方に向けてまとめていこうと思います。また、通常のHTTPプロキシではなく、HTTPS通信に対応したSSL Bumpを実装します。この部分の記事が少ないのでぜひ参考にしていただければと思います。


# Squidとは
そもそも[Squid](https://www.squid-cache.org/)とは、オープンソースで提供されているプロキシサーバーやウェブキャッシュサーバーを実装するためのソフトウェアです。マルチOSで稼働でき、GNU GPLライセンス下で利用できます。

HTTP通信に限らず、HTTPSやFTPなどの様々なプロトコルに対応しており、プロキシサーバーとしては非常に多くのシェアを持っています。
Squidのプロキシモードとしては4つあります。
1. フォワーディングプロキシ
2. 多段プロキシ
3. リバースプロキシ
4. 透過的プロキシ

## フォワーディングプロキシ
内部NW(LAN)から外部NW(WAN)への通信を中継するための機能です。最もメインの機能になるかと思います。
特定ドメインへのアクセス許可(ホワイトリスト)やアクセス拒否(ブラックリスト)の制御が可能です。

## 多段プロキシ
単一のプロキシで完結せず、内部の通信であれば別の社内プロキシに転送するような制御を行うための機能です。
特定のアクセス先のものを次段のプロキシに転送して外部Saasと連携する(ex:ウイルスチェック)ような動作も実装可能です。

## リバースプロキシ
外部NWから内部NWに通信を受ける際に、代表のエンドポイントとして動作しアクセスを中継する機能です。
内部のWEBサーバーの負荷分散やURLでの振り分けを行うような動作が可能です。また、SSL/TLSオフロード実装も可能なので、SSL終端として証明書を1つに集約することも可能です。

## 透過的プロキシ
利用者がプロキシの存在を意識せずプロキシを利用できる機能です。通常はOSやアプリケーションにプロキシ情報を登録する必要がありますが、透過的プロキシは指定せずともアクセス経路上のプロキシを自動的に通っていくので、利用者が意識せず通信制御を実装することが可能です。

## アクセス制御方式
ドメインリストやIPアドレスリストを用いてACLを設定して、アクセス許可/拒否を行います。さらに外部の認証機構と連携することも可能ですので、既存のユーザー管理システムと連携してユーザー認証を実装することも可能です。


# AmazonLinux2023の注意点
今回はOSにAmazonLinux2023を利用するのですが、その際にいくつかはまりポイントがありましたのでまとめておこうと思います。
これはSquidに限らず影響しますので、ご参考にしていただければと思います。

1. パッケージ管理
2. NICのIDが変化する



# 手順
EC2の構築のために、VPCにPublicサブネット(NATGW)とPrivateサブネット(検証用インスタンス)を構築した状態で、新規サブネットにProxyサーバーを構築していきます。

![アーキテクチャー図](/images/aws-squid-proxy/01-architecture.png)

今回は以下のドメインで検証してみます。なお、各インスタンスにはSSMセッションマネージャーを利用してアクセスしていますので、インスタンスプロファイルには`AmazonSSMManagedInstanceCore`を設定しておきます。
* アクセス許可
  https://www.google.com
* アクセス拒否
  https://www.yahoo.co.jp

また、環境構築にはTerraformを用いています。コードはこちらをご参照ください。
:::details terraformインストール
https://developer.hashicorp.com/terraform/install

```bash
sudo yum install -y yum-utils shadow-utils
sudo yum-config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
sudo yum -y install terraform
```
:::

[基本環境用コードはこちら](https://github.com/nnydtmg/terraform-aws-ec2-proxy/commit/96990019e702f4255911f62f412a0a951a79a028)


## 環境構築
まずは①の経路でインターネットへのアクセスが可能かを確認していきます。
App Instanceサブネットのデフォルトルート(0.0.0.0/0向け)をNAT GatewayのIDに設定しておきます。そうするとNAT Gateway経由でインターネットアクセスが可能です。

App InstanceにSSMでログイン後に以下のコマンドでアクセス確認を行います。
```bash
sh-5.2$ curl "https://www.google.com" -o /dev/null -w '%{http_code}\n' -s
200

sh-5.2$ curl "https://www.yahoo.co.jp" -o /dev/null -w '%{http_code}\n' -s
200
```
問題なくアクセス出来ていることが分かります。


## Proxy Instance構築
続いてProxy Instanceを構築します。この時のポイントはインスタンスの設定で、「***ソース宛先チェックを無効化***する」という点です。これをしておかないと、アクセス元IPがApp InstanceではなくProxy Instanceになってしまいうまく動作しません。NATインスタンスを個別に構築する際はこの設定を確認しましょう。
確認方法は、EC2のコンソールから「アクション」>「ネットワーキング」>「ソース/宛先チェックを変更」と選択すると、以下の画面が出てくるので停止にチェックが入っていればOKです。

![](https://storage.googleapis.com/zenn-user-upload/cadca011b422-20240408.png)

この時点ではまだApp Instanceのデフォルトルートを変更していないので、問題なく通信ができているかと思います。
ここからSquidの設定を行っていきます。

## Squid構築
必要なパッケージをインストールしていきます。なお、squidのバージョン(squid -v)で`--with-openssl`がないものがインストールされる場合がありますので、その際は`squid-openssl`をインストールしてください。
```bash
dnf -y install squid iptables-services
systemctl enable squid
```

自己証明書をインストールします。ここで必要事項が聞かれますが、特に空の状態でも問題ないです。
```bash
openssl req -new -newkey rsa:2048 -sha256 -days 3650 -nodes -x509 -extensions v3_ca -keyout <秘密鍵の出力先>.pem -out <証明書の出力先>.cer
```

Diffie-Hellman アルゴリズムの設定ファイルを生成します。
```bash
openssl dhparam -outform PEM -out /etc/squid/bump_dhparam.pem 2048
chown squid:squid /etc/squid/bump*
chmod 400 /etc/squid/bump*
```

キャッシュ用ディレクトリを作成します。
```bash
mkdir -p /var/lib/squid
rm -rf /var/lib/squid/ssl_db
/usr/lib64/squid/security_file_certgen -c -s /var/lib/squid/ssl_db -M 20MB
chown -R squid:squid /var/lib/squid
```

NAT有効化を行います。今回はHTTPSのプロキシのため、443で受けたものを3129に流すため設定を変更しています。なお、80の通信については特に必要ないですが、念のため3128に変更しています。
```bash
# パケットフォワーディングを有効化
echo 1 > /proc/sys/net/ipv4/ip_forward

# Iptablesの設定(NIC IDに注意)
NIC_ID=$(ip -o link show device-number-0 | awk -F': ' '{print $2}')
iptables -t nat -A PREROUTING -i $NIC_ID -p tcp -m tcp --dport 80 -j REDIRECT --to-ports 3128
iptables -t nat -A PREROUTING -i $NIC_ID -p tcp -m tcp --dport 443 -j REDIRECT --to-ports 3129

# Iptablesの永続化
iptables-save > /etc/sysconfig/iptables
```

ここからSquid自体の設定(/etc/squid/squid.conf)になります。
SSL Bumpを有効にするためには以下の行を追加します。

```conf
# SSL Bump
acl allowlist_ssl ssl::server_name "/etc/squid/list/whitelist.txt"
acl blocklist_ssl ssl::server_name "/etc/squid/list/blacklist.txt"
acl step1 at_step SslBump1
acl step2 at_step SslBump2
acl step3 at_step SslBump3

# アクセスリスト設定
ssl_bump peek step1 all
ssl_bump peek step2 allowlist_ssl
ssl_bump splice step3 allowlist_ssl
ssl_bump terminate step2 blocklist_ssl
ssl_bump bump all

sslcrtd_program /usr/lib64/squid/security_file_certgen -s /var/lib/squid/ssl_db -M 20MB

# Squid normally listens to port 3128
http_port 3128 ###HTTPアクセス用 Tranceparentモードの有効化
https_port 3129 intercept ssl-bump ssl-bump generate-host-certificates=on dynamic_cert_mem_cache_size=20MB cert=/etc/squid/cert.cer key=/etc/squid/key.pem cipher=HIGH:MEDIUM:!LOW:!RC4:!SEED:!IDEA:!3DES:!MD5:!EXP:!PSK:!DSS  ###HTTPSアクセス用 Tranceparentモードの有効化&ssldumpの有効化
```

:::details squid.conf全量
```
#
# Recommended minimum configuration:
#

# Example rule allowing access from your local networks.
# Adapt to list your (internal) IP networks from where browsing
# should be allowed
acl localnet src 10.0.0.0/8     # RFC1918 possible internal network
acl localnet src 172.16.0.0/12  # RFC1918 possible internal network
acl localnet src 192.168.0.0/16 # RFC1918 possible internal network
acl localnet src fc00::/7       # RFC 4193 local private network range
acl localnet src fe80::/10      # RFC 4291 link-local (directly plugged) machines

acl SSL_ports port 443
acl Safe_ports port 80          # http
acl Safe_ports port 21          # ftp
acl Safe_ports port 443         # https
acl Safe_ports port 70          # gopher
acl Safe_ports port 210         # wais
acl Safe_ports port 1025-65535  # unregistered ports
acl Safe_ports port 280         # http-mgmt
acl Safe_ports port 488         # gss-http
acl Safe_ports port 591         # filemaker
acl Safe_ports port 777         # multiling http
acl CONNECT method CONNECT

#
# Recommended minimum Access Permission configuration:
#
# Deny requests to certain unsafe ports
http_access deny !Safe_ports

# Deny CONNECT to other than secure SSL ports
http_access deny CONNECT !SSL_ports

# Only allow cachemgr access from localhost
http_access allow localhost manager
http_access allow localnet
http_access deny manager

# We strongly recommend the following be uncommented to protect innocent
# web applications running on the proxy server who think the only
# one who can access services on "localhost" is a local user
#http_access deny to_localhost

#
# INSERT YOUR OWN RULE(S) HERE TO ALLOW ACCESS FROM YOUR CLIENTS
#

# Example rule allowing access from your local networks.
# Adapt localnet in the ACL section to list your (internal) IP networks
# from where browsing should be allowed
http_access allow localhost

# And finally deny all other access to this proxy
http_access deny all

# SSL Bump
acl allowlist_ssl ssl::server_name "/etc/squid/list/whitelist.txt"
acl blocklist_ssl ssl::server_name "/etc/squid/list/blacklist.txt"
acl step1 at_step SslBump1
acl step2 at_step SslBump2
acl step3 at_step SslBump3

sslproxy_cert_error allow all
ssl_bump peek step1 all
ssl_bump peek step2 allowlist_ssl
ssl_bump splice step3 allowlist_ssl
ssl_bump terminate step2 blocklist_ssl
ssl_bump bump all

tls_outgoing_options capath=/etc/pki/tls/certs options=ALL
sslcrtd_children 3
sslcrtd_program /usr/lib64/squid/security_file_certgen -s /var/lib/squid/ssl_db -M 20MB

# Squid normally listens to port 3128
http_port 8080
http_port 3128 transparent ###HTTPアクセス用 Tranceparentモードの有効化
https_port 3129 intercept ssl-bump generate-host-certificates=on dynamic_cert_mem_cache_size=20MB tls-cert=/etc/squid/cert.cer tls-key=/etc/squid/key.pem cipher=HIGH:MEDIUM:!LOW:!RC4:!SEED:!IDEA:!3DES:!MD5:!EXP:!PSK:!DSS tls-dh=prime256v1:/etc/squid/bump_dhparam.pem ###HTTPSアクセス用 Tranceparentモードの有効化&ssldumpの有効化


# Uncomment and adjust the following to add a disk cache directory.
#cache_dir ufs /var/spool/squid 100 16 256

# Leave coredumps in the first cache dir
coredump_dir /var/spool/squid

#
# Add any of your own refresh_pattern entries above these.
#
refresh_pattern ^ftp:           1440    20%     10080
refresh_pattern ^gopher:        1440    0%      1440
refresh_pattern -i (/cgi-bin/|\?) 0     0%      0
refresh_pattern .               0       20%     4320

#logformat
logformat customlog "time=%{%Y/%m/%d %H:%M:%S}tl","bump_mode=%ssl::bump_mode","sni=%ssl::>sni","un=%un","credentials=%credentials","host=%>la","src_ip=%>a","src_port=%>p","dest_ip=%<a","dest_port=%<p","url=%ru","status=%>Hs","http_method=%rm","referer=%{Referer}>h","user=%ui","duration=%tr","dt=%dt","uri_path=%>rp","byte_in=%<st","byte_out=%>st","http_user_agent=%{User-Agent}>h","content_type=%mt","action=%Ss","product=squid"
access_log /var/log/squid/access.log customlog
```
:::

アクセスリストの設定を行います。
まずは、ホワイトリストとブラックリストを作成します。これは特に指定はないので、任意のテキスト形式で大丈夫です。
今回は以下の構成で作成しています。
```txt:/etc/squid/list/whitelist.txt
.google.com
```

```txt:/etc/squid/list/blacklist.txt
.yahoo.co.jp
```

最後にSquidを起動して正常に起動すればOKです。
```bash
systemctl start squid
```


## RouteTable変更
App InstanceサブネットにアタッチされているルートテーブルのデフォルトルートをProxy InstanceのENIまたはインスタンスIDに変更します。

![](https://storage.googleapis.com/zenn-user-upload/020465e5304d-20240408.png)

この状態で再度アクセス確認を行うと、ホワイトリストに登録したものはアクセスでき、ブラックリストに登録したものはアクセス拒否されているかと思います。Squid側のログ(/var/log/squid/access.log)にも出力されているはずです。

```bash
sh-5.2$ curl -I https://www.google.com
200

sh-5.2$ curl -I https://www.yahoo.co.jp
curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to www.yahoo.co.jp:443 
```


# さいごに


