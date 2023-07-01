---
title: "EBSのファーストタッチペナルティについて調べてみた"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","ebs","ec2"]
published: false
---

# ファーストタッチペナルティとは

皆さんはEC2をスナップショットから復元した際に極端にI/O性能が落ちて困ってしまったことはありませんか？

私の場合、EC2 AutoScalingで特定のAMIを指定してスケーリングした際に、一部インスタンスへの通信だけ極端にレイテンシーが高まってしまいエラーが発生しました。

これが、***ファーストタッチペナルティ(First Touch Penarty、または、First Touch Ratency)*** の概要です。
もう少し詳細に書くと、スナップショットやAMIからEBSを復元する際、S3からデータをコピーするのですが、これが復元した時に実行されるのではなく、***ブロックへのアクセスを行った時に初めてコピーが実行される***ため、ディスク性能が著しく低下するという事象です。

意外と気付かずにハマるポイントかなと思います。

# 対策

では、対策として何があるのかというと、

- EBSをリストアした時に全てのディスクへアクセスする
- 「[Amazon EBSの高速スナップショット復元](https://docs.aws.amazon.com/ja_jp/AWSEC2/latest/UserGuide/ebs-fast-snapshot-restore.html)」を使用する

高速スナップショット復元を利用した際には料金が追加でかかるので注意が必要です。


# やってみた

簡易的にEBSのリストアのみ実施して、実際にデータ転送を行ってレイテンシーを確認したいと思います。

## 検証環境とシナリオ

1. Windowsサーバを1台用意して、EBSをDドライブ(50GB:gp3)、Eドライブ(60GB:gp3)アタッチします。
2. Dドライブ側に30GBのデータを作成します。
3. Eドライブへ2.で作成したデータをコピーして、速度を計測します。（Eドライブ側のデータは削除します。）
4. Eドライブのスナップショットを作成します。
5. Eドライブをデタッチして、スナップショットから作成したボリュームをDドライブにアタッチします。
6. 3.と同様にデータをコピーして、速度を計測します。（Dドライブ側のデータは削除します。）


## 手順

:::message
基本的にマネジメントコンソールを利用しますが、コマンドは最後にまとめておきます。
:::

### 1. EC2作成

ここはAWSが提供する[チュートリアル](https://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/EC2_GetStarted.html)等を参照してください。

作成したインスタンスはこちらです。

![](https://storage.googleapis.com/zenn-user-upload/5abba844d0fe-20230701.png)

接続に関しては最近リリースされたEC2 Instance Connect Endpointを利用しようと思います。

https://dev.classmethod.jp/articles/rdp-connection-to-windows-server-using-ec2-instance-connect-endpoint-eic/

私のローカルはwsl2上のUbuntu22.04を利用します。

```bash
$ aws --version
aws-cli/2.12.6 Python/3.11.4 Linux/5.10.102.1-microsoft-standard-WSL2 exe/x86_64.ubuntu.22 prompt/off
```

以下の出力があれば、リモートデスクトップが可能になります。
```bash
Listening for connections on port 13389.
```

ディスクをアタッチしただけではOSからファイルシステムとして認識出来ないため、「コンピューターの管理」からマウントしましょう。

https://learn.microsoft.com/ja-jp/windows-server/storage/disk-management/assign-a-mount-point-folder-path-to-a-drive

ディスクのマウントが完了した状態がこちらです。
![](https://storage.googleapis.com/zenn-user-upload/5a612dcf0462-20230701.png)


### 2. テストファイル作成

Dドライブ側に30GBのテストファイルを作成します。

```bash
D:\>fsutil file createNew D:\dummy.data 32212254720
File D:\dummy.data is created
```

### 3. 初回計測

Powershellで以下のコマンドを実行して速度を2回計測してみます。
```powershell
$watch = New-Object System.Diagnostics.StopWatch
$watch.Start()
Copy-Item  D:\dummy.data E:\
$watch.Stop()
$t = $watch.Elapsed
"{0} min {1}.{2} sec" -f $t.Minutes,$t.Seconds,$t.Milliseconds
```

- 計測結果

|回数|経過時間|
|:--|:--|
|1回目|8 min 21.30 sec|
|2回目|8 min 22.501 sec|

### 4. スナップショット取得

:::message
空のボリュームはファーストタッチペナルティが発生しないので、1GBのファイルを残しておきます。
:::

[こちら](https://docs.aws.amazon.com/ja_jp/AWSEC2/latest/UserGuide/EBSSnapshots.html)を参考にスナップショットを取得していきます。

対象のボリュームページに遷移して、「アクション」から「スナップショットを取得」を選択します。

![](https://storage.googleapis.com/zenn-user-upload/1991cbdf6a0b-20230701.png)

スナップショットの取得が完了して、使用可能になればデタッチ・復元に進みます。

![](https://storage.googleapis.com/zenn-user-upload/936c13d50b3e-20230701.png)




### 5. EBSデタッチ・復元

スナップショットからボリュームを作成します。
![](https://storage.googleapis.com/zenn-user-upload/0dd7c59246eb-20230701.png)

完了すると、インスタンスにアタッチして元の状態に戻しましょう。
![](https://storage.googleapis.com/zenn-user-upload/6fe26e5028b4-20230701.png)

アタッチ後にOSから認識も設定することを忘れずに。


### 6. 再アタッチ後計測

再度3.の手順を使ってデータコピーの計測をしてみます。

- 計測結果

|回数|経過時間|
|:--|:--|
|1回目|13 min 39.135 sec|
|2回目||

多少初回が遅くなってます。（正直もっと差が出ると思いました。）
これが正確な計測にはなっていないかもしれませんので、参考程度に見ていただいて、ぜひご自身の環境でも検証してみてください。


# まとめ

意外とハマることの多いファーストタッチペナルティについて、検証も含めてまとめることが出来ました。
各所で発生した、しなかったなどの情報が曖昧になっていますが、常に可能性としてはあるものなので、気になる方は確実にリストア後にディスクアクセスしておくようにしましょう。
費用をかけたくなければ、ddコマンドでのディスクアクセスを実施しておくことをおススメします。RunCommandやbash等が候補になるかと思います。

ここまで読んでいただきありがとうございます。
今回の検証で関係するコマンドリストを以下にまとめておきますので、CLIでやりたいという方はこちら参照してください。



# 参考（コマンド）

### snapshot作成

```bash
aws ec2 describe-volumes
aws ec2 create-snapshot --volume-id <volume_id> --tag-specification 'ResourceType=snapshot, Tags=[{Key=Name,Value=testsnapshot}]' --description "test"
```

https://docs.aws.amazon.com/cli/latest/reference/ec2/create-snapshot.html


### EC2インスタンスからデタッチ

```bash
aws ec2 detach-volume --volume-id <volume_id>
```

https://docs.aws.amazon.com/cli/latest/reference/ec2/detach-volume.html


### Snapshotからリストア

```bash
aws ec2 create-volume --snapshot-id <snapshot_id> --volume-type gp3 --availability-zone ap-northeast-1a
```

https://docs.aws.amazon.com/cli/latest/reference/ec2/create-volume.html


### EC2にアタッチ

```bash
aws ec2 attach-volume --device <device> --instance-id <instance_id> --volume-id <volume_id>
```

https://docs.aws.amazon.com/cli/latest/reference/ec2/attach-volume.html



