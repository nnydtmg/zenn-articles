---
title: "AWS Transfer for FTPを完全閉域環境で使う際の注意点"
emoji: "😺"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["AWS","FTP","IAM"]
published: false
---
# はじめに
みなさんは、AWS上に閉域環境でシステムを構築したことはありますか？
ここで言う閉域環境とは、VPC内にパブリックサブネットがない・デフォルトルートが設定されていない状態を想定しています。
最近、この閉域環境内に`AWS Transfer Family for FTP`を使用して、オンプレミス環境からファイル転送を実現しようとした際に、ちょっとしたハマりごとがあったので、自分自身の備忘として残しておきます。

# 先に結論
まずは先に結論だけ書いておきます。ここで理解できた方は読み飛ばしてください！

:::message
エンドポイントからSTS向けの通信ができるようにする！
:::

1. Transfer FamilyのエンドポイントはFTPサーバーの役割をする
2. S3・EFSへファイル転送を行うにはIAMの権限が必要
3. つまりエンドポイント（FTPサーバー）からSTSへの通信ができるようにする必要がある

これらがどういうことかを順にご説明していきます。


# Transfer Familyとは
Transfer Familyとは、`FTP`や`SFTP`といったファイル転送とデータ管理をAWSがマネージドに提供しているサービスです。
FTPやSFTPを使用して、S3かEFSに対してファイルを転送するためのサーバーの役割をしてくれたり、SFTPコネクタを使用して外部へのファイル送信をすることも可能です。
また、最近は`Transfer Family ウェブアプリケーション`という、WebUIを提供してファイル共有をするサービスも出てきています。

https://aws.amazon.com/jp/aws-transfer-family/

今回はFTPを使用してファイル転送する際にはまったポイントをお伝えできればと思います。

なお、FTPで使用できるのはパッシブモードのみで、ポート設定も若干特殊なのでご注意ください。
プロトコル制限は[こちら](https://docs.aws.amazon.com/ja_jp/transfer/latest/userguide/transfer-file.html)の記事をご確認ください。
> ファイル転送プロトコル (FTP) と ではFTPS、パッシブモードのみがサポートされています。

ポート制限は[こちら](https://docs.aws.amazon.com/ja_jp/transfer/latest/userguide/create-server-ftp.html)をご確認ださい。
> FTP Transfer Family の サーバーは、ポート 21 (コントロールチャネル) とポート範囲 8192～8200 (データチャネル) で動作します。

また、FTPのユーザー認証には、IDプロバイダーとしてディレクトリサービスかLambdaやAPI Gatewayを使うカスタムIDプロバイダーのどちらかを設定可能です。SFTPではマネージドIDとしてユーザー設定ができますが、FTPではできないので注意が必要です。


# 検証
## 今回の初期構成
今回は以下の構成を前提に記事を書いていきます。

![](/images/aws-transfer-ftp-iam/01_architecture.png)

擬似的にClient-VPCにオンプレミス環境のFTPクライアントを模したEC2サーバーを配置し、Transfer for FTPが閉域環境内に構築されている状態にします。また、この時Transfer for FTP以外のエンドポイントは現時点では作成しません。
Transfer for FTPは[カスタムIDプロバイダー](https://docs.aws.amazon.com/ja_jp/transfer/latest/userguide/custom-identity-provider-users.html)を使用して、ID/PW認証をします。


## ベース環境構築
VPCの構築は構成図の通り行います。
Client-VPCとFTP-VPCはIPリーチャブルなCIDRで構築し、VPC Peeringで接続します。

FTP-VPCのCfnテンプレートは[こちら](https://github.com/nnydtmg/aws-cloudformation-templates/blob/main/01.aws-vpc-nopublic.yaml)です。
Client-VPCのCfnテンプレートは[こちら](https://github.com/nnydtmg/aws-cloudformation-templates/blob/main/02.aws-vpc-nopublic-ec2.yaml)です。ご参考まで。

Client-EC2に関しては事前準備として、Client-VPCにはInstance Connectエンドポイントを作成し、インスタンスにSSH接続できるようにしておきます。また、Amazon Linux2023にはFTPクライアントが入っていないので、S3のGatewayエンドポイント経由でdnfインストールできるようにしています。
ここは本題と異なるので省略しています。詳しくは[こちら](https://repost.aws/ja/knowledge-center/ec2-troubleshoot-yum-errors-al1-al2)の記事をご覧ください。
（今回はコスト優先でこの構成にしましたが、手間に感じる方はパブリックサブネット+NAT Gatewayの構成で作成してください。）


## カスタムIDプロバイダーの作成
IDプロバイダーを事前に作成しておく必要があるため、AWSが公式に出しているCloudFormation Templateを使用します。

https://s3.amazonaws.com/aws-transfer-resources/custom-idp-templates/aws-transfer-custom-idp-secrets-manager-lambda.template.yml

:::details テンプレート
```yaml
---
AWSTemplateFormatVersion: '2010-09-09'
Description: A basic template that uses AWS Lambda with an AWS Transfer Family server
  to integrate SecretsManager as an identity provider. It authenticates against an
  entry in AWS Secrets Manager of the format SFTP/username. Additionally, the secret
  must hold the key-value pairs for all user properties returned to AWS Transfer Family.
  You can also modify the AWS Lambda function code to update user access.
Parameters:
  CreateServer:
    AllowedValues:
      - 'true'
      - 'false'
    Type: String
    Description: Whether this stack creates a server internally or not. If a server is created internally,
      the customer identity provider is automatically associated with it.
    Default: 'true'
  SecretsManagerRegion:
    Type: String
    Description: (Optional) The region the secrets are stored in. If this value is not provided, the
      region this stack is deployed in will be used. Use this field if you are deploying this stack in
      a region where SecretsManager is not available.
    Default: ''
Conditions:
  CreateServer:
    Fn::Equals:
      - Ref: CreateServer
      - 'true'
  NotCreateServer:
    Fn::Not:
      - Condition: CreateServer
  SecretsManagerRegionProvided:
    Fn::Not:
      - Fn::Equals:
          - Ref: SecretsManagerRegion
          - ''
Outputs:
  ServerId:
    Value:
      Fn::GetAtt: TransferServer.ServerId
    Condition: CreateServer
  StackArn:
    Value:
      Ref: AWS::StackId
Resources:
  TransferServer:
    Type: AWS::Transfer::Server
    Condition: CreateServer
    Properties:
      EndpointType: PUBLIC
      IdentityProviderDetails:
        Function:
          Fn::GetAtt: GetUserConfigLambda.Arn
      IdentityProviderType: AWS_LAMBDA
      LoggingRole:
        Fn::GetAtt: CloudWatchLoggingRole.Arn
  CloudWatchLoggingRole:
    Description: IAM role used by Transfer  to log API requests to CloudWatch
    Type: AWS::IAM::Role
    Condition: CreateServer
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service:
                - transfer.amazonaws.com
            Action:
              - sts:AssumeRole
      Policies:
        - PolicyName: TransferLogsPolicy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - logs:CreateLogGroup
                  - logs:CreateLogStream
                  - logs:DescribeLogStreams
                  - logs:PutLogEvents
                Resource:
                  Fn::Sub: '*'
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
        - Effect: Allow
          Principal:
            Service:
            - lambda.amazonaws.com
          Action:
          - sts:AssumeRole
      ManagedPolicyArns:
      - Fn::Sub: arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
      - PolicyName: LambdaSecretsPolicy
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
          - Effect: Allow
            Action:
            - secretsmanager:GetSecretValue
            Resource:
              Fn::Sub:
                - arn:${AWS::Partition}:secretsmanager:${SecretsRegion}:${AWS::AccountId}:secret:aws/transfer/*
                - SecretsRegion:
                    Fn::If:
                      - SecretsManagerRegionProvided
                      - Ref: SecretsManagerRegion
                      - Ref: AWS::Region
  GetUserConfigLambda:
    Type: AWS::Lambda::Function
    Properties:
      Code:
        ZipFile:
          Fn::Sub: |
            import os
            import json
            import boto3
            import base64
            from botocore.exceptions import ClientError

            def lambda_handler(event, context):
                resp_data = {}

                if 'username' not in event or 'serverId' not in event:
                    print("Incoming username or serverId missing  - Unexpected")
                    return response_data

                # It is recommended to verify server ID against some value, this template does not verify server ID
                input_username = event['username']
                input_serverId = event['serverId']
                print("Username: {}, ServerId: {}".format(input_username, input_serverId));

                if 'password' in event:
                    input_password = event['password']
                    if input_password == '' and (event['protocol'] == 'FTP' or event['protocol'] == 'FTPS'):
                      print("Empty password not allowed")
                      return response_data
                else:
                    print("No password, checking for SSH public key")
                    input_password = ''

                # Lookup user's secret which can contain the password or SSH public keys
                resp = get_secret("aws/transfer/" + input_serverId + "/" + input_username)

                if resp != None:
                    resp_dict = json.loads(resp)
                else:
                    print("Secrets Manager exception thrown")
                    return {}

                if input_password != '':
                    if 'Password' in resp_dict:
                        resp_password = resp_dict['Password']
                    else:
                        print("Unable to authenticate user - No field match in Secret for password")
                        return {}

                    if resp_password != input_password:
                        print("Unable to authenticate user - Incoming password does not match stored")
                        return {}
                else:
                    # SSH Public Key Auth Flow - The incoming password was empty so we are trying ssh auth and need to return the public key data if we have it
                    if 'PublicKey' in resp_dict:
                        resp_data['PublicKeys'] = resp_dict['PublicKey'].split(",")
                    else:
                        print("Unable to authenticate user - No public keys found")
                        return {}

                # If we've got this far then we've either authenticated the user by password or we're using SSH public key auth and
                # we've begun constructing the data response. Check for each key value pair.
                # These are required so set to empty string if missing
                if 'Role' in resp_dict:
                    resp_data['Role'] = resp_dict['Role']
                else:
                    print("No field match for role - Set empty string in response")
                    resp_data['Role'] = ''

                # These are optional so ignore if not present
                if 'Policy' in resp_dict:
                    resp_data['Policy'] = resp_dict['Policy']

                if 'HomeDirectoryDetails' in resp_dict:
                    print("HomeDirectoryDetails found - Applying setting for virtual folders")
                    resp_data['HomeDirectoryDetails'] = resp_dict['HomeDirectoryDetails']
                    resp_data['HomeDirectoryType'] = "LOGICAL"
                elif 'HomeDirectory' in resp_dict:
                    print("HomeDirectory found - Cannot be used with HomeDirectoryDetails")
                    resp_data['HomeDirectory'] = resp_dict['HomeDirectory']
                else:
                    print("HomeDirectory not found - Defaulting to /")

                print("Completed Response Data: "+json.dumps(resp_data))
                return resp_data

            def get_secret(id):
                region = os.environ['SecretsManagerRegion']
                print("Secrets Manager Region: "+region)

                client = boto3.session.Session().client(service_name='secretsmanager', region_name=region)

                try:
                    resp = client.get_secret_value(SecretId=id)
                    # Decrypts secret using the associated KMS CMK.
                    # Depending on whether the secret is a string or binary, one of these fields will be populated.
                    if 'SecretString' in resp:
                        print("Found Secret String")
                        return resp['SecretString']
                    else:
                        print("Found Binary Secret")
                        return base64.b64decode(resp['SecretBinary'])
                except ClientError as err:
                    print('Error Talking to SecretsManager: ' + err.response['Error']['Code'] + ', Message: ' + str(err))
                    return None
      Description: A function to lookup and return user data from AWS Secrets Manager.
      Handler: index.lambda_handler
      Role:
        Fn::GetAtt: LambdaExecutionRole.Arn
      Runtime: python3.11
      Environment:
        Variables:
          SecretsManagerRegion:
            Fn::If:
              - SecretsManagerRegionProvided
              - Ref: SecretsManagerRegion
              - Ref: AWS::Region
  GetUserConfigLambdaPermission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: lambda:invokeFunction
      FunctionName:
        Fn::GetAtt: GetUserConfigLambda.Arn
      Principal: transfer.amazonaws.com
      SourceArn:
        Fn::If:
          - CreateServer
          - Fn::GetAtt: TransferServer.Arn
          - Fn::Sub: arn:${AWS::Partition}:transfer:${AWS::Region}:${AWS::AccountId}:server/*   
```
:::

パラメータは以下で入力します。

* スタックの名前: 任意
* CreateServer: false
* SecretsManagerRegion: ap-northeast-1

この状態でスタックを作成すると、カスタムIDプロバイダー用のLambdaが作成されます。`CreateServer`をTrueにするとパブリックエンドポイントのTransfer for FTPが作られてしまうので注意です。


## S3とS3へのアクセス権を持つIAMロールの作成
S3を作成し、そのS3へのアクセス権を持つTransfer for FTP用のIAMロールを作成します。
手順は省きますが、以下のポリシーを参考にしてください。

:::details IAMポリシー
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "s3:*",
            "Resource": [
                "arn:aws:s3:::your-bucket-name",
                "arn:aws:s3:::your-bucket-name/*"
            ]
        },
        {
            "Effect": "Deny",
            "Action": [
                "s3:DeleteBucket",
                "s3:CreateBucket"
            ],
            "Resource": [
                "*"
            ]
        }
    ]
}
```
:::

:::details 信頼ポリシー
``` json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": [
                    "transfer.amazonaws.com"
                ]
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```
:::


## SecretsManagerへのシークレット登録
LambdaのカスタムIDプロバイダーでは、SecretsManagerにアクセスし、そこに格納されているPWを入力値と比較して、問題なければIAMロールを返すという挙動をします。
そのため、SecretsManagerに適切なPrefixでシークレットを登録する必要があります。
詳細は[こちら](https://docs.aws.amazon.com/ja_jp/transfer/latest/userguide/custom-lambda-idp.html)のホワイトペーパーをご参照ください。

シークレットの名前だけは注意が必要です。Lambda関数内でシークレットのキー文字列を指定しているのですが、`get_secret("aws/transfer/" + input_serverId + "/" + input_username)`になっているので、この形式で指定してください。任意の形式にする場合はLambdaの該当箇所を変更してください。

Roleは必須です。ID/PWで認証したい場合は、Passwordというシークレットキーを作成して、適切なパスワードを設定してください。
今回は`aws/transfer/s-xxxxxxxxx/user1`の名前で、以下のように登録しました。
![](https://storage.googleapis.com/zenn-user-upload/7137118a2447-20250224.png)


## Transfer for FTPの構築
今回はマネジメントコンソールから作成します。

FTPのみを有効にしたサーバーを作成します。
![](https://storage.googleapis.com/zenn-user-upload/6011757a8acb-20250224.png)

カスタムIDプロバイダーを選択し、上記で作成したLambda関数を選択します。
![](https://storage.googleapis.com/zenn-user-upload/3008abd6d77e-20250224.png)

あとは、`VPCでホスト`を選択して`内部`アクセスで構築したいVPCを選択すればOKです。ドメインの選択はS3用のサーバーかEFS用のサーバーかを選択するので、今回はS3を選択していきます。
他はデフォルトのままで作成を進めます。

作成が完了すれば、赤枠内のエンドポイントからエンドポイントのDNS名を保存しておきます。
![](https://storage.googleapis.com/zenn-user-upload/b0644c4969f2-20250224.png)

なお、エンドポイントにはデフォルトのSecurityGroupがアタッチされているので、要件に合わせて適宜変更してください。


## ユーザー情報のテスト
FTPサーバーを作成すると、右上のアクションからユーザー認証のテストができます。
![](https://storage.googleapis.com/zenn-user-upload/b4b8ee989ed0-20250224.png)

以下のとおり指定したユーザーで各種レスポンスが取得できていることが分かります。
![](https://storage.googleapis.com/zenn-user-upload/eeaf963b3761-20250224.png)

:::details パスワード間違えの時のレスポンス
```json
{
    "Response": "{}",
    "StatusCode": 200,
    "Message": "Lambda IDP authentication failure"
}
```
:::

## EC2からのFTP実行
Client-VPC内のEC2から先ほど構築したTransfer for FTPへアクセスしてみます。
その前に、FTPクライアントが入っていないので、インストールします。

```bash
yum install lftp
```

lftpで接続してみます。
```bash
lftp -u user1 vpce-xxxxx.vpce-svc-xxxx.ap-northeast-1.vpce.amazonaws.com
```

対話モードになってログインできていそうです。lsコマンドを実行してみましょう。
```bash
`ls' at 0 [Connecting...]
```
と表示されて、一向に進まないと思います。
そうです、今の状態ではFTPサーバーとしては正しく機能していません。







