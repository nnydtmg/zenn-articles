---
title: "AWS上でRocketChatを作るCloudFormation Templateを作ってみた"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","CloudFormation","rocketchat"]
published: true
---
# やったこと

皆さんはちょっとしたイベントの時に、簡単な匿名チャットツールが欲しいなと思ったことはありませんか？
私は社内イベントの時などに、ふと社内チャットだとあまり活性化されてないなと感じ、簡単に作れる匿名チャットツールとしてRocketChatを作ってみました。都度手動もめんどくさいので、CloudFormationでテンプレート化してしまいました。

https://github.com/nnydtmg/aws-rocketchat-cfn

# CloudFormationとは

ご存知の方も多いと思いますが、念の為。
まずCloudFormationとは、AWSのリソースをコードで作成できるIaCツールです。作成したいリソースをyamlかjson形式で宣言し、CloudFormationで作成したテンプレートを実行すると、Stackとして一塊のリソース群が作成されます。
手動での作成よりコードでインフラが管理できたり、一括削除ができて無駄な料金を発生させないなどのメリットがあります。マネジメントコンソールでサービスを作った経験があれば、次の段階として非常に良いツールかと思います。

IaCツールとしては、CDKやTerraformといったものもありますが、今回は環境に依存しないCloudFormationを選定しました。

# RocketChatとは

今回作成するRocketChatとは、チャットツールを自前に作成できるOSSのソフトウェアです。

https://www.rocket.chat/

他にチャットツールとしては、Mattermostなどもありますね。

https://mattermost.com/

今回は永続化する気もないので、匿名で利用でき、インストールもコマンド一つという点でRocketChatを選定しています。

# 構築

実際に構築するリソースについて解説していきます。

## 前提

まず前提として、今回の構成はHTTPS化したALBの背後にEC2をシングルで立てています。また、独自ドメインを利用していますが、ドメイン管理はCloudflareで行い、AWSにはパブリックホストゾーンとACMで発行したパブリック証明書のみ事前に設定した状態となります。

### パブリック証明書発行

ACMでのパブリック証明書の発行は、様々な良記事が出ているのでご参照いただければと思います。
ここでは、Cloudflareを使ってDNS検証している部分のみ記載しています。
今回利用したいサブドメインを使ってパブリック証明書の発行をリクエストすると、「検証中」のステータスとなっているかと思います。その状態でCNAME名・CNAME値をCloudflare側に登録します。
（画像は構築後に整理してキャプチャしているので、すでに成功のステータスになってます。）

![](https://storage.googleapis.com/zenn-user-upload/21c7a71e5d42-20230902.png)

CloudflareのDNS管理の画面で先ほどメモしたCNAME名とCNAME値を登録します。この際プロキシを無効にしておきます。設定してしばらくすると、AWS側の検証が「成功」に変わるかと思います。この状態でCloudFormationを実行します。

![](https://storage.googleapis.com/zenn-user-upload/9117e1c85ab6-20230902.png)

## 作成リソース

:::details テンプレートはこちら

```
AWSTemplateFormatVersion: 2010-09-09
Description: for practice
#　============== パラメータ ==============
#　パラメータ
Parameters: 
  CertificateArn:
    Type: String
    Description: ACM certificate ARN.
    Default: "arn:aws:acm:<region-name>:<accountid>:certificate/<random-string>"
    MaxLength: 128
    MinLength: 10
#　============== リソース ==============
Resources:
#　-------------- IAM --------------
#　ロール
  MySSMMICRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service:
                - ec2.amazonaws.com
            Action:
              - sts:AssumeRole
      Path: /
      RoleName: !Sub ${AWS::StackName}-MySSMMICRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

#　インスタンスプロファイル
  MyInstanceProfile:
    Type: AWS::IAM::InstanceProfile
    Properties:
      Path: /
      Roles:
        - !Ref MySSMMICRole
#　-------------- VPC --------------
  MyVPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      InstanceTenancy: default
      EnableDnsSupport: true
      EnableDnsHostnames: true
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyVPC
#-------------- インターネットゲートウェイ --------------
#  IGW
  MyIGW:
    Type: AWS::EC2::InternetGateway
    Properties: 
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyIGW
#  アタッチメント
  MyIGWAttach:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties: 
      InternetGatewayId: !Ref MyIGW
      VpcId: !Ref MyVPC
#　-------------- VPCエンドポイント --------------
  MyVPCESSM:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      PrivateDnsEnabled: true
      SecurityGroupIds:
        - !Ref MyVPCESG
      ServiceName: !Sub com.amazonaws.${AWS::Region}.ssm
      SubnetIds:
      - !Ref MyPriSN1
      - !Ref MyPriSN2
      VpcEndpointType: Interface
      VpcId: !Ref MyVPC

  MyVPCESSMMessages:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      PrivateDnsEnabled: true
      SecurityGroupIds:
        - !Ref MyVPCESG
      ServiceName: !Sub com.amazonaws.${AWS::Region}.ssmmessages
      SubnetIds:
      - !Ref MyPriSN1
      - !Ref MyPriSN2
      VpcEndpointType: Interface
      VpcId: !Ref MyVPC 

  MyVPCEEC2Messages:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      PrivateDnsEnabled: true
      SecurityGroupIds:
        - !Ref MyVPCESG
      ServiceName: !Sub com.amazonaws.${AWS::Region}.ec2messages
      SubnetIds:
      - !Ref MyPriSN1
      - !Ref MyPriSN2
      VpcEndpointType: Interface
      VpcId: !Ref MyVPC

  MyVPCES3:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      RouteTableIds:
        - !Ref MyPriRT1
        - !Ref MyPriRT2
      ServiceName: !Sub com.amazonaws.${AWS::Region}.s3
      VpcEndpointType: Gateway
      VpcId: !Ref MyVPC
#　-------------- EIP --------------
  MyNATGW1EIP: 
    Type: AWS::EC2::EIP
    Properties:
      Domain: vpc 
#　-------------- サブネット --------------
#　パブリック
  MyPubSN1:
    Type: AWS::EC2::Subnet
    Properties:
      CidrBlock: 10.0.0.0/24
      VpcId: !Ref MyVPC
      AvailabilityZone: !Select [ 0, !GetAZs ]
      MapPublicIpOnLaunch: true
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyPubSN1

  MyPubSN2:
    Type: AWS::EC2::Subnet
    Properties:
      CidrBlock: 10.0.2.0/24
      VpcId: !Ref MyVPC
      AvailabilityZone: !Select [ 1, !GetAZs ]
      MapPublicIpOnLaunch: true
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyPubSN2

#　プライベート
  MyPriSN1:
    Type: AWS::EC2::Subnet
    Properties:
      CidrBlock: 10.0.1.0/24
      VpcId: !Ref MyVPC
      AvailabilityZone: !Select [ 0, !GetAZs ]
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyPriSN1

  MyPriSN2:
    Type: AWS::EC2::Subnet
    Properties:
      CidrBlock: 10.0.3.0/24
      VpcId: !Ref MyVPC
      AvailabilityZone: !Select [ 1, !GetAZs ]
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyPriSN2
#　-------------- ルートテーブル --------------
#  ルートテーブル
  MyPubRT:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref MyVPC
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyPubRT

  MyPriRT1:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref MyVPC
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyPriRT1

  MyPriRT2:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref MyVPC
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyPriRT2
#  ルート
  MyPubRoute:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref MyPubRT
      DestinationCidrBlock: 0.0.0.0/0
      GatewayId: !Ref MyIGW

  MyPriRoute1: 
    Type: AWS::EC2::Route
    Properties: 
      RouteTableId: !Ref MyPriRT1
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref MyNATGW1

  MyPriRoute2: 
    Type: AWS::EC2::Route
    Properties: 
      RouteTableId: !Ref MyPriRT2 
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref MyNATGW1
#  アソシエーション
  MyPubSN1Assoc:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref MyPubSN1
      RouteTableId: !Ref MyPubRT

  MyPubSN2Assoc:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref MyPubSN2
      RouteTableId: !Ref MyPubRT

  MyPrivateSubne1Assoc: 
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties: 
      SubnetId: !Ref MyPriSN1
      RouteTableId: !Ref MyPriRT1

  MyPriSN2Assoc: 
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties: 
      SubnetId: !Ref MyPriSN2
      RouteTableId: !Ref MyPriRT2
#　-------------- NATゲートウェイ --------------
  MyNATGW1: 
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt MyNATGW1EIP.AllocationId 
      SubnetId: !Ref MyPubSN1
      Tags: 
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyNATGW1
#　-------------- ALB --------------
#　ALB
  MyALB: 
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties: 
      Name: !Sub ${AWS::StackName}-MyALB
      Scheme: internet-facing
      Type: application
      LoadBalancerAttributes: 
        - Key: deletion_protection.enabled
          Value: false
        - Key: idle_timeout.timeout_seconds
          Value: 40
      SecurityGroups:
        - !Ref MyALBSG
      Subnets: 
        - !Ref MyPubSN1
        - !Ref MyPubSN2
#　リスナー
  MyALBListener: 
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties: 
      Port: 443
      Protocol: HTTPS
      Certificates:
        - CertificateArn: !Ref CertificateArn
      DefaultActions:
        - TargetGroupArn: !Ref MyTG
          Type: forward
      LoadBalancerArn: !Ref MyALB
#　ターゲットグループ
  MyTG: 
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties: 
      VpcId: !Ref MyVPC
      Name: !Sub ${AWS::StackName}-MyTG
      Protocol: HTTP
      ProtocolVersion: HTTP1
      Port: 3000
      HealthCheckEnabled: true
      HealthCheckProtocol: HTTP
      HealthCheckPath: /
      HealthCheckPort: 3000
      HealthyThresholdCount: 5
      UnhealthyThresholdCount: 2
      HealthCheckTimeoutSeconds: 5
      HealthCheckIntervalSeconds: 30
      IpAddressType: ipv4
      Matcher: 
        HttpCode: 200
      TargetType: instance
      Targets: 
        - Id: !Ref MyEC2no1
          Port: 3000
      Tags: 
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyTG
#　-------------- EC2インスタンス --------------
  MyEC2no1: 
    Type: AWS::EC2::Instance
    Properties: 
      ImageId: ami-03f4fa076d2981b45
      InstanceType: t2.small
      IamInstanceProfile: !Ref MyInstanceProfile
      BlockDeviceMappings:
        - DeviceName: /dev/xvda
          Ebs:
            VolumeType: gp3
            VolumeSize: 40
      NetworkInterfaces: 
        - AssociatePublicIpAddress: false
          DeviceIndex: 0
          SubnetId: !Ref MyPriSN1
          GroupSet:
            - !Ref MyEC2SG
      UserData: !Base64 |
        #!/bin/bash
        snap install rocketchat-server --channel=4.x/stable
        systemctl status snap.rocketchat-server.rocketchat-server.service
        systemctl status snap.rocketchat-server.rocketchat-mongo.service
      Tags:
          - Key: Name
            Value: !Sub ${AWS::StackName}-MyEC2no1
#　-------------- セキュリティグループ --------------
  MyVPCESG:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !Ref MyVPC
      GroupDescription: for VPCE for Session Manager.
      SecurityGroupIngress:
        - SourceSecurityGroupId: !Ref MyEC2SG
          IpProtocol: tcp
          FromPort: 443
          ToPort: 443  
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyVPCESG

  MyALBSG:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !Ref MyVPC
      GroupName: security group for ALB
      GroupDescription: Allow HTTP access from Internet Only for your Global IP.
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyALBSG
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0
          Description: Allow inbound HTTP access from all IPv4 addresses.

  MyALBEgress:
    Type: AWS::EC2::SecurityGroupEgress
    Properties:
      Description: Allow all protocol for MyEC2SG.
      DestinationSecurityGroupId: !GetAtt MyEC2SG.GroupId
      GroupId: !GetAtt MyALBSG.GroupId
      IpProtocol: -1

  MyEC2SG:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !Ref MyVPC
      GroupName: security group for EC2
      GroupDescription: Allow HTTP access from MyALB, and Allow all protocol for all IPv4 addresses.
      Tags:
        - Key: Name
          Value: !Sub ${AWS::StackName}-MyEC2SG

  MyEC2Ingress:
    Type: AWS::EC2::SecurityGroupIngress
    Properties:
      Description: Allow HTTP access from MyALB
      FromPort: 3000
      ToPort: 3000
      IpProtocol: tcp
      SourceSecurityGroupId: !GetAtt MyALBSG.GroupId
      GroupId: !GetAtt MyEC2SG.GroupId
#　============== アウトプット ==============
Outputs:
  MyALBDomain:
    Value: !GetAtt MyALB.DNSName
    Export: 
      Name: !Sub ${AWS::StackName}-MyALBDNSName
```

:::

これ以降で一部詳細について記載します。

### パラメータ設定

ここに上記で作成したACMのARNを設定します。

```
Parameters: 
  CertificateArn:
    Type: String
    Description: ACM certificate ARN.
    Default: "arn:aws:acm:<region-name>:<accountid>:certificate/<random-string>"
    MaxLength: 128
    MinLength: 10
```

### ALBのHTTPS化

今回はinternet-facingで作成したALBをHTTPS化しているので、テンプレートのリスナー設定にACMを紐づけています。

```diff
MyALBListener: 
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties: 
      Port: 443
      Protocol: HTTPS
+     Certificates:
+       - CertificateArn: !Ref CertificateArn
      DefaultActions:
        - TargetGroupArn: !Ref MyTG
          Type: forward
      LoadBalancerArn: !Ref MyALB
```

### ポート変更

ALBのターゲットグループ、EC2のセキュリティグループに関しては、RocketChatで利用するTCP 3000番を設定しています。


### RocketChatインストール

EC2のユーザーデータを設定する箇所でインストールコマンドを実行しています。このテンプレートでは、snapを使って4系をインストールしています。

```diff
serData: !Base64 |
+    #!/bin/bash
+    snap install rocketchat-server --channel=4.x/stable
+    systemctl status snap.rocketchat-server.rocketchat-server.service
+    systemctl status snap.rocketchat-server.rocketchat-mongo.service
```

### アウトプット

最後にALBのドメイン名を出力するように設定し、この値を最後にRoute53やCloudflareに設定します。

```diff
Outputs:
  MyALBDomain:
    Value: !GetAtt MyALB.DNSName
    Export: 
+     Name: !Sub ${AWS::StackName}-MyALBDNSName
```

## 構築後対応

実行が完了したらALBのドメイン名をRoute53にAレコード(エイリアス)、CloudflareにCNAME登録を行います。

### Cloudflare

DNS管理画面で、ACM発行時に指定したサブドメインと出力されたALBのドメイン名をCNAME登録します。この時もプロキシ設定は不要です。

![](https://storage.googleapis.com/zenn-user-upload/ba7977f6081f-20230902.png)

### Route53

パブリックホストゾーンを独自ドメインで作成し、今回利用するサブドメインにALBのドメインをエイリアスAレコードとして登録します。

![](https://storage.googleapis.com/zenn-user-upload/55cfd01d047d-20230902.png)


ここまでできれば、DNS伝播が完了するまで待ってアクセスすれば、RocketChatの登録画面が開くかと思います。そこからは公式の手順やたくさん記事が出ていますので、それに従ってもらえれば問題ないです。

これで一通り構築が完了したので、以下のようにHTTPSでRocketChatが使えるようになりました！

![](https://storage.googleapis.com/zenn-user-upload/8b694a0c6da2-20230902.png)


# 最後に

ここまで読んでいただきありがとうございます。
結構簡単に構築はできましたが、ドメイン周りで若干ハマったので、自分の備忘も兼ねて記事にしてみました。
ぜひどなたかの参考になっていれば幸いです。


