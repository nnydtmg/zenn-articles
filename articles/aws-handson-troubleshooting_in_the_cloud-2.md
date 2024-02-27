---
title: "AWS Support - Troubleshooting in the cloud Workshopをやってみた②"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","cloudwatch","devops","operation"]
published: false
---
# AWS Support - Troubleshooting in the cloudとは
AWSが提供するWorkshopの一つで、現在(2023/12)は英語版が提供されています。(フィードバックが多ければ日本語化も対応したいとのこと)
クラウドへの移行が進む中でアプリケーションの複雑性も増しています。このワークショップでは様々なワークロードに対応できるトラブルシューティングを学ぶことが出来ます。AWSだけでなく一般的なトラブルシューティングにも繋がる知識が得られるため、非常にためになるWorkshopかと思います。また、セクションごとに分かれているので、興味のある分野だけ実施するということも可能です。

https://catalog.us-east-1.prod.workshops.aws/workshops/fdf5673a-d606-4876-ab14-9a1d25545895/en-US/introduction

学習できるコンテンツ・コンセプトとしては、CI/CD、IaC、Serverless、コンテナ、Network、Database等のシステムに関わる全てのレイヤが網羅されているので、ぜひ一度チャレンジしてみてください。

ここからは各大セクションごとに記事にまとめていきますので、興味のあるセクションにとんでください。
なお、すべてのセクションの前提作業は、Self-Paced Labのタブから必要なリソースのデプロイなどをしてください。

別の章の記事は末尾に追記していきますので、気になる章はリンクから飛んでいただければと思います。

# Containers Troubleshooting

この章では、コンテナワークロードに関してのトラブルシューティングを行います。
コンテナを普段利用しない（EC2でゴリゴリやってます）自分自身にとっては、かなり興味深い内容でとても勉強になりました。

:::message
この記事ではECSやEKSの細かな用語についての解説はしていないので、そちらについては別途AWSブログや他の方のブログをご覧ください。
:::


:::message alert
Cloud9のImageIDパラメータが必須に変更されていて、CloudFormationのテンプレートがうまく動作しないので以下のテンプレートを参考に使ってください。
ポイントは ***Parameters*** の ***ImageID*** 設定と ***EKSWSC9Instance*** での参照です。全量載せているのでコピーで利用してもらっても大丈夫です。全てのデプロイに5-10分ほどかかります。
:::

:::details CloudFormationテンプレート
```
AWSTemplateFormatVersion: "2010-09-09"

Description: "re:invent ECS and EKS Workshop Deployment"
Parameters:
  VPCName:
    Description: VPC
    Type: String
    Default: "EKSECSWorkshopVPC"
  SsmParameterValueawsserviceecsoptimizedamiamazonlinux2recommendedimageidC96584B6F00A464EAD1953AFF4B05118Parameter:
    Default: /aws/service/ecs/optimized-ami/amazon-linux-2/recommended/image_id
    Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>     
  LatestAmiId:
    Type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>'
    Default: '/aws/service/cloud9/amis/amazonlinux-2-x86_64'
  ImageId:
    Type: String
    AllowedValues: [amazonlinux-1-x86_64, amazonlinux-2-x86_64, ubuntu-18.04-x86_64]
    Default: amazonlinux-2-x86_64

  EKSWSC9InstanceType:
    Description: Cloud9 instance type
    Type: String
    Default: t3.small
    AllowedValues:
      - t2.micro
      - t3.micro
      - t3.small
      - t3.medium
    ConstraintDescription: Must be a valid Cloud9 instance type
  EKSWSC9EnvType: 
    Description: Environment type.
    Default: WorkshopStudio
    Type: String
    AllowedValues: 
      - self
      - WorkshopStudio
    ConstraintDescription: must specify self or WorkshopStudio.


  EKSWSEventC9OwnerAssumedRoleArn: 
    Type: String
    Description: The Arn of the Cloud9 Owner to be set if WorkshopStudio deployment. This is the ParticipantAssumedRoleArn.
    Default: ""
  EKSWSEventC9RoleArn:
    Type: String
    Description: The Role Arn of the Cloud9 instance to be set if WorkshopStudio deployment. This is the ParticipantRoleArn.
    Default: ""  
  EKSWSEventC9RoleName: 
    Type: String
    Description: The Role Name of the Cloud9 instance to be set if WorkshopStudio deployment. This is the ParticipantRoleName.
    Default: ""
  EKSWSEventC9AssumedRoleSessionName:
    Type: String
    Description: The Assumed Name created for participants from Event Engine to be set if WorkshopStudio deployment. This is the EKSWSEventC9AssumedRoleSessionName.
    Default: ""


  EKSWSC9InstanceVolumeSize: 
    Type: Number
    Description: The Size in GB of the Cloud9 Instance Volume. 
    Default: 15

  KVERSION:
    Type: String
    Description: Kubernetes Version to deploy the cluster
    Default: "1.27"

Conditions: 
  CreateWorkshopStudioResources: !Equals [ !Ref EKSWSC9EnvType, WorkshopStudio ]

###EKS and ECS Public and Private Subnets###
Mappings:
  SubnetConfig:
    VPC:
      CIDR: "10.0.0.0/16"
    EKS-Public0:
      CIDR: "10.0.0.0/24"
    EKS-Public1:
      CIDR: "10.0.1.0/24"
    EKS-Private0:
      CIDR: "10.0.2.0/24"
    EKS-Private1:
      CIDR: "10.0.3.0/24"
    ECS-Public0:
      CIDR: "10.0.10.0/24"
    ECS-Public1:
      CIDR: "10.0.11.0/24"
    ECS-Private0:
      CIDR: "10.0.12.0/24"
    ECS-Private1:
      CIDR: "10.0.13.0/24"
### AZ Mapping###
  AZRegions:
    ap-northeast-1:
      AZs: ["a", "d"]
    ap-northeast-2:
      AZs: ["a", "b"]
    ap-south-1:
      AZs: ["a", "b"]
    ap-southeast-1:
      AZs: ["a", "b"]
    ap-southeast-2:
      AZs: ["a", "b"]
    ca-central-1:
      AZs: ["a", "b"]
    eu-central-1:
      AZs: ["a", "b"]
    eu-west-1:
      AZs: ["a", "b"]
    eu-west-2:
      AZs: ["a", "b"]
    sa-east-1:
      AZs: ["a", "b"]
    us-east-1:
      AZs: ["a", "b"]
    us-east-2:
      AZs: ["a", "b"]
    us-west-1:
      AZs: ["a", "b"]
    us-west-2:
      AZs: ["a", "b"]

Resources:
###VPC-RESOURCES###
  EKSECSWorkshopVPC:
    Type: "AWS::EC2::VPC"
    Properties:
      EnableDnsSupport: "true"
      EnableDnsHostnames: "true"
      CidrBlock:
        Fn::FindInMap:
          - "SubnetConfig"
          - "VPC"
          - "CIDR"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Public"
        -
          Key: "Name"
          Value: !Ref 'VPCName'
###EKS Subnets###
  EKSWSPublicSubnet0:
    Type: "AWS::EC2::Subnet"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      #AvailabilityZoneId: "use1-az1"
      AvailabilityZone:
        Fn::Sub:
         - "${AWS::Region}${AZ}"
         - AZ: !Select [ 0, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]
      CidrBlock:
        Fn::FindInMap:
          - "SubnetConfig"
          - "EKS-Public0"
          - "CIDR"
      MapPublicIpOnLaunch: "true"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Public"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-public-'
              - !Select [ 0, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]

  EKSWSPublicSubnet1:
    Type: "AWS::EC2::Subnet"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      #AvailabilityZoneId: "use1-az2"
      AvailabilityZone:
        Fn::Sub:
         - "${AWS::Region}${AZ}"
         - AZ: !Select [ 1, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]
      CidrBlock:
        Fn::FindInMap:
          - "SubnetConfig"
          - "EKS-Public1"
          - "CIDR"
      MapPublicIpOnLaunch: "true"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Public"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-public-'
              - !Select [ 1, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]

  EKSWSPrivateSubnet0:
    Type: "AWS::EC2::Subnet"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      AvailabilityZone:
        Fn::Sub:
          - "${AWS::Region}${AZ}"
          - AZ: !Select [ 0, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]
      CidrBlock:
        Fn::FindInMap:
          - "SubnetConfig"
          - "EKS-Private0"
          - "CIDR"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Private"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-private-'
              - !Select [ 0, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]

  EKSWSPrivateSubnet1:
    Type: "AWS::EC2::Subnet"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      AvailabilityZone:
        Fn::Sub:
          - "${AWS::Region}${AZ}"
          - AZ: !Select [ 1, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]
      CidrBlock:
        Fn::FindInMap:
          - "SubnetConfig"
          - "EKS-Private1"
          - "CIDR"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Private"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-private-'
              - !Select [ 1, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]
###ECS Subnets###
  ECSWSPublicSubnet0:
    Type: "AWS::EC2::Subnet"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      AvailabilityZone:
        Fn::Sub:
          - "${AWS::Region}${AZ}"
          - AZ: !Select [ 0, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]
      CidrBlock:
        Fn::FindInMap:
          - "SubnetConfig"
          - "ECS-Public0"
          - "CIDR"
      MapPublicIpOnLaunch: "true"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Public"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-public-'
              - !Select [ 0, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]

  ECSWSPublicSubnet1:
    Type: "AWS::EC2::Subnet"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      AvailabilityZone:
        Fn::Sub:
          - "${AWS::Region}${AZ}"
          - AZ: !Select [ 1, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]
      CidrBlock:
        Fn::FindInMap:
          - "SubnetConfig"
          - "ECS-Public1"
          - "CIDR"
      MapPublicIpOnLaunch: "true"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Public"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-public-'
              - !Select [ 1, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]

  ECSWKSPrivateSubnet0:
    Type: "AWS::EC2::Subnet"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      AvailabilityZone:
        Fn::Sub:
          - "${AWS::Region}${AZ}"
          - AZ: !Select [ 0, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]
      CidrBlock:
        Fn::FindInMap:
          - "SubnetConfig"
          - "ECS-Private0"
          - "CIDR"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Private"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-private-'
              - !Select [ 0, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]

  ECSWKSPrivateSubnet1:
    Type: "AWS::EC2::Subnet"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      AvailabilityZone:
        Fn::Sub:
          - "${AWS::Region}${AZ}"
          - AZ: !Select [ 1, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]
      CidrBlock:
        Fn::FindInMap:
          - "SubnetConfig"
          - "ECS-Private1"
          - "CIDR"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Private"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-private-'
              - !Select [ 1, !FindInMap [ "AZRegions", !Ref "AWS::Region", "AZs" ] ]
###Internet Gateway###

  WSInternetGateway:
    Type: "AWS::EC2::InternetGateway"
    Properties:
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Public"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-IGW'

###Gateway VPC Attachment###

  GatewayToInternet:
    Type: "AWS::EC2::VPCGatewayAttachment"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      InternetGatewayId:
        Ref: "WSInternetGateway"

###########Route tables###########

########EKS##########
  PublicRouteTableEKS:
    Type: "AWS::EC2::RouteTable"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Public"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-public-route-table'
  
  PublicRoute:
    Type: "AWS::EC2::Route"
    DependsOn: "GatewayToInternet"
    Properties:
      RouteTableId:
        Ref: "PublicRouteTableEKS"
      DestinationCidrBlock: "0.0.0.0/0"
      GatewayId:
        Ref: "WSInternetGateway"

###Route table to Public Subnet Assosication###

  PublicSubnetRouteTableAssociation0:
    Type: "AWS::EC2::SubnetRouteTableAssociation"
    Properties:
      SubnetId:
        Ref: "EKSWSPublicSubnet0"
      RouteTableId:
        Ref: "PublicRouteTableEKS"

  PublicSubnetRouteTableAssociation1:
    Type: "AWS::EC2::SubnetRouteTableAssociation"
    Properties:
      SubnetId:
        Ref: "EKSWSPublicSubnet1"
      RouteTableId:
        Ref: "PublicRouteTableEKS"

###Public Subnet NACL###

  PublicNetworkAcl:
    Type: "AWS::EC2::NetworkAcl"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Public"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-public-nacl'

  InboundHTTPPublicNetworkAclEntry:
    Type: "AWS::EC2::NetworkAclEntry"
    Properties:
      NetworkAclId:
        Ref: "PublicNetworkAcl"
      RuleNumber: "100"
      Protocol: "-1"
      RuleAction: "allow"
      Egress: "false"
      CidrBlock: "0.0.0.0/0"
      PortRange:
        From: "0"
        To: "65535"

  OutboundPublicNetworkAclEntry:
    Type: "AWS::EC2::NetworkAclEntry"
    Properties:
      NetworkAclId:
        Ref: "PublicNetworkAcl"
      RuleNumber: "100"
      Protocol: "-1"
      RuleAction: "allow"
      Egress: "true"
      CidrBlock: "0.0.0.0/0"
      PortRange:
        From: "0"
        To: "65535"

  PublicSubnetNetworkAclAssociation0:
    Type: "AWS::EC2::SubnetNetworkAclAssociation"
    Properties:
      SubnetId:
        Ref: "EKSWSPublicSubnet0"
      NetworkAclId:
        Ref: "PublicNetworkAcl"

  PublicSubnetNetworkAclAssociation1:
    Type: "AWS::EC2::SubnetNetworkAclAssociation"
    Properties:
      SubnetId:
        Ref: "EKSWSPublicSubnet1"
      NetworkAclId:
        Ref: "PublicNetworkAcl"
    
###Private Subnet Route Table ####

  PrivateRouteTable0:
    Type: "AWS::EC2::RouteTable"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      Tags:
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-private-route-table-0'



  PrivateRouteTable1:
    Type: "AWS::EC2::RouteTable"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      Tags:
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-private-route-table-1'
  
  PrivateSubnetRouteTableAssociation0:
    Type: "AWS::EC2::SubnetRouteTableAssociation"
    Properties:
      SubnetId:
        Ref: "EKSWSPrivateSubnet0"
      RouteTableId:
        Ref: "PrivateRouteTable0"

  PrivateSubnetRouteTableAssociation1:
    Type: "AWS::EC2::SubnetRouteTableAssociation"
    Properties:
      SubnetId:
        Ref: "EKSWSPrivateSubnet1"
      RouteTableId:
        Ref: "PrivateRouteTable1"



#######ECS##########

  
  PublicRouteTableECS:
    Type: "AWS::EC2::RouteTable"
    Properties:
      VpcId:
        Ref: "EKSECSWorkshopVPC"
      Tags:
        -
          Key: "Application"
          Value:
            Ref: "AWS::StackName"
        -
          Key: "Network"
          Value: "Public"
        -
          Key: "Name"
          Value: !Join
            - ''
            - - !Ref "VPCName"
              - '-public-route-table'

###EIP

  ECSWSPublicSubnet0EIP:
    Properties:
      Domain: vpc
      Tags:
      - Key: Name
        Value: EcsStack/WorkVPC/PublicSubnet1
    Type: AWS::EC2::EIP

###NAT Gateway- ECS


  WSNATGateway:
    Properties:
      AllocationId:
        Fn::GetAtt:
        - ECSWSPublicSubnet0EIP
        - AllocationId
      SubnetId:
        Ref: ECSWSPublicSubnet0
      Tags:
      - Key: Name
        Value: EcsStack/WorkVPC/PublicSubnet1
    Type: AWS::EC2::NatGateway

###Public Route Table using same VPC as EKS (WSInternetGateway)
  PublicRouteTableDefaultECS:
    Type: "AWS::EC2::Route"
    DependsOn: "GatewayToInternet"
    Properties:
      RouteTableId:
        Ref: "PublicRouteTableECS"
      DestinationCidrBlock: "0.0.0.0/0"
      GatewayId:
        Ref: "WSInternetGateway"
###PublicSubnet Route Table association

  PublicSubnet0RouteTableAssociation0ECS:
    Type: "AWS::EC2::SubnetRouteTableAssociation"
    Properties:
      SubnetId:
        Ref: "ECSWSPublicSubnet0"
      RouteTableId:
        Ref: "PublicRouteTableECS"

  PublicSubnet1RouteTableAssociation1ECS:
    Type: "AWS::EC2::SubnetRouteTableAssociation"
    Properties:
      SubnetId:
        Ref: "ECSWSPublicSubnet1"
      RouteTableId:
        Ref: "PublicRouteTableECS"



###Private Route Table

  PrivateRouteTableECS:
    Properties:
      Tags:
      - Key: Name
        Value: EcsStack/WorkVPC/PrivateSubnet2
      VpcId:
        Ref: EKSECSWorkshopVPC
    Type: AWS::EC2::RouteTable
  
  PrivateRouteTableECSDefaultRoute:
    Properties:
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId:
        Ref: WSNATGateway
      RouteTableId:
        Ref: PrivateRouteTableECS
    Type: AWS::EC2::Route

###Private Route Table assocation.

  PrivateSubnet0RouteTableAssociationECS:
    Properties:
      RouteTableId:
        Ref: PrivateRouteTableECS
      SubnetId:
        Ref: ECSWKSPrivateSubnet0
    Type: AWS::EC2::SubnetRouteTableAssociation

  PrivateSubnet1RouteTableAssociationECS:
    Properties:
      RouteTableId:
        Ref: PrivateRouteTableECS
      SubnetId:
        Ref: ECSWKSPrivateSubnet1
    Type: AWS::EC2::SubnetRouteTableAssociation

########EKS Main Resources######

###Security Groups for Endpoints, Cluster, Cloud9


  C9ToEndpointDummySG:
    Type: AWS::EC2::SecurityGroup
    DependsOn: 
     - EKSECSWorkshopVPC
    Properties:
      GroupDescription: Allow Ingress to private endpoints
      VpcId: !Ref EKSECSWorkshopVPC
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 
            Fn::FindInMap:
              - "SubnetConfig"
              - "VPC"
              - "CIDR"  
      SecurityGroupEgress:
        - IpProtocol: tcp
          FromPort: 0
          ToPort: 0
          CidrIp: 0.0.0.0/32
                   
  C9ToEndpointSG:
    Type: AWS::EC2::SecurityGroup
    DependsOn:
     - EKSECSWorkshopVPC
    Properties:
      GroupDescription: Allow Ingress to private endpoints
      VpcId: !Ref EKSECSWorkshopVPC
      SecurityGroupIngress:
       - IpProtocol: -1
         SourceSecurityGroupId: !Ref C9ToEndpointDummySG
      SecurityGroupEgress:
       - IpProtocol: -1
         CidrIp: 0.0.0.0/0         


####VPC Endpoints####

  VPCEndpointEC2:
    Type: "AWS::EC2::VPCEndpoint"
    Properties: 
      #PolicyDocument: Json
      PrivateDnsEnabled: true
      #RouteTableIds: 
        #- String
      SecurityGroupIds: 
        - !GetAtt EKSECSWorkshopVPC.DefaultSecurityGroup
        - !Ref C9ToEndpointDummySG
        - !Ref C9ToEndpointSG
      ServiceName: !Sub 'com.amazonaws.${AWS::Region}.ec2'
      SubnetIds: 
        - !Ref EKSWSPrivateSubnet0
        - !Ref EKSWSPrivateSubnet1
      VpcEndpointType: Interface
      VpcId: !Ref EKSECSWorkshopVPC
    DependsOn: 
    - EKSWSPrivateSubnet0
    - EKSWSPrivateSubnet1
    - EKSWSPublicSubnet0
    - EKSWSPublicSubnet1
    - C9ToEndpointDummySG
    - C9ToEndpointSG

  VPCEndpointLogs:
    Type: "AWS::EC2::VPCEndpoint"
    Properties: 
      #PolicyDocument: Json
      PrivateDnsEnabled: true
      #RouteTableIds: 
        #- String
      SecurityGroupIds: 
        - !GetAtt EKSECSWorkshopVPC.DefaultSecurityGroup
        - !Ref C9ToEndpointDummySG
        - !Ref C9ToEndpointSG
      ServiceName: !Sub 'com.amazonaws.${AWS::Region}.logs'
      SubnetIds: 
        - !Ref EKSWSPrivateSubnet0
        - !Ref EKSWSPrivateSubnet1
      VpcEndpointType: Interface
      VpcId: !Ref EKSECSWorkshopVPC
    DependsOn: 
    - EKSWSPrivateSubnet0
    - EKSWSPrivateSubnet1
    - EKSWSPublicSubnet0
    - EKSWSPublicSubnet1
    - C9ToEndpointDummySG
    - C9ToEndpointSG
      
  VPCEndpointECRAPI:
    Type: "AWS::EC2::VPCEndpoint"
    Properties: 
      #PolicyDocument: Json
      PrivateDnsEnabled: true
      #RouteTableIds: 
        #- String
      SecurityGroupIds: 
        - !GetAtt EKSECSWorkshopVPC.DefaultSecurityGroup
        - !Ref C9ToEndpointDummySG
        - !Ref C9ToEndpointSG
      ServiceName: !Sub 'com.amazonaws.${AWS::Region}.ecr.api'
      SubnetIds: 
        - !Ref EKSWSPrivateSubnet0
        - !Ref EKSWSPrivateSubnet1
      VpcEndpointType: Interface
      VpcId: !Ref EKSECSWorkshopVPC
    DependsOn: 
    - EKSWSPrivateSubnet0
    - EKSWSPrivateSubnet1
    - EKSWSPublicSubnet0
    - EKSWSPublicSubnet1
    - C9ToEndpointDummySG
    - C9ToEndpointSG
      
  VPCEndpointECRDKR:
    Type: "AWS::EC2::VPCEndpoint"
    Properties: 
      #PolicyDocument: Json
      PrivateDnsEnabled: true
      #RouteTableIds: 
        #- String
      SecurityGroupIds: 
        - !GetAtt EKSECSWorkshopVPC.DefaultSecurityGroup
        - !Ref C9ToEndpointDummySG
        - !Ref C9ToEndpointSG
      ServiceName: !Sub 'com.amazonaws.${AWS::Region}.ecr.dkr'
      SubnetIds: 
        - !Ref EKSWSPrivateSubnet0
        - !Ref EKSWSPrivateSubnet1
      VpcEndpointType: Interface
      VpcId: !Ref EKSECSWorkshopVPC
    DependsOn: 
    - EKSWSPrivateSubnet0
    - EKSWSPrivateSubnet1
    - EKSWSPublicSubnet0
    - EKSWSPublicSubnet1
    - C9ToEndpointDummySG
    - C9ToEndpointSG

  VPCEndpointSTS:
    Type: "AWS::EC2::VPCEndpoint"
    Properties: 
      #PolicyDocument: Json
      PrivateDnsEnabled: true
      #RouteTableIds: 
        #- String
      SecurityGroupIds: 
        - !GetAtt EKSECSWorkshopVPC.DefaultSecurityGroup
        - !Ref C9ToEndpointDummySG
        - !Ref C9ToEndpointSG
      ServiceName: !Sub 'com.amazonaws.${AWS::Region}.sts'
      SubnetIds: 
        - !Ref EKSWSPrivateSubnet0
        - !Ref EKSWSPrivateSubnet1
      VpcEndpointType: Interface
      VpcId: !Ref EKSECSWorkshopVPC
    DependsOn: 
    - EKSWSPrivateSubnet0
    - EKSWSPrivateSubnet1
    - EKSWSPublicSubnet0
    - EKSWSPublicSubnet1
    - C9ToEndpointDummySG
    - C9ToEndpointSG

  VPCEndpointS3:
    Type: "AWS::EC2::VPCEndpoint"
    Properties: 
      #PolicyDocument: Json
      #PrivateDnsEnabled: true
      #RouteTableIds: 
        #- String
      #SecurityGroupIds: 
        #- String - Will attach default VPC security group by default
      ServiceName: !Sub 'com.amazonaws.${AWS::Region}.s3'
      RouteTableIds: 
        - !Ref PrivateRouteTable0
        - !Ref PrivateRouteTable1
      #VpcEndpointType: Interface
      VpcId: !Ref EKSECSWorkshopVPC

################## PERMISSIONS AND ROLES #################

###Role if self run workshop
  EKSWSC9Role:
    Type: AWS::IAM::Role
    Properties:
      Tags:
        - Key: Environment
          Value: AWSEKSWS
        - Key: Role
          Value: Main
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
        - Effect: Allow
          Principal:
            Service:
            - ec2.amazonaws.com
            - ssm.amazonaws.com
            - eks.amazonaws.com
            - ecs.amazonaws.com
            - cloudformation.amazonaws.com
            - s3.amazonaws.com
            - iam.amazonaws.com
          Action:
          - sts:AssumeRole
      Path: "/"
      Policies:
        - PolicyName: SSMEKSAccess
          PolicyDocument:
            Version: 2012-10-17
            Statement:
              - Action:
                  - 's3:*'
                  - 'eks:*'
                  - 'ec2:*'
                  - 'cloudformation:*'
                  - 'ecs:*'
                  - 'ecr:*'
                  - 'iam:*'
                Effect: Allow
                Resource: '*'
      ManagedPolicyArns:
      - arn:aws:iam::aws:policy/AdministratorAccess
      - arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

  EKSWSC9LambdaExecutionRole:
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
      Path: "/"
      Policies:
      - PolicyName:
          Fn::Join:
          - ''
          - - EKSWSC9LambdaPolicy-
            - Ref: AWS::Region
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
          - Effect: Allow
            Action:
            - logs:CreateLogGroup
            - logs:CreateLogStream
            - logs:PutLogEvents
            Resource: arn:aws:logs:*:*:*
          - Effect: Allow
            Action:
            - cloudformation:DescribeStacks
            - cloudformation:DescribeStackEvents
            - cloudformation:DescribeStackResource
            - cloudformation:DescribeStackResources
            - ec2:DescribeInstances
            - ec2:AssociateIamInstanceProfile
            - ec2:ModifyInstanceAttribute
            - ec2:ReplaceIamInstanceProfileAssociation
            - ec2:DescribeIamInstanceProfileAssociations
            - ec2:ReplaceIamInstanceProfileAssociation 
            - iam:ListInstanceProfiles
            - iam:PassRole
            Resource: "*"

##BROKEN ROLE FOR Scenario #1

  EKSDevOpsTeamRole:
    Type: AWS::IAM::Role
    Properties:
      Tags:
        - Key: Environment
          Value: AWSEKSWS
        - Key: Role
          Value: EKSDevOpsTeamRole
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
        - Effect: Allow
          Principal:
            Service:
            - ec2.amazonaws.com
            - ssm.amazonaws.com
          Action:
          - sts:AssumeRole
      ManagedPolicyArns:
      - arn:aws:iam::aws:policy/AdministratorAccess
      - arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
      Path: "/"

  EKSDevOpsTeamInstanceProfile:
    Type: AWS::IAM::InstanceProfile
    Properties:
      Path: "/"
      Roles: 
        - 
          Ref: EKSDevOpsTeamRole
    DependsOn: EKSDevOpsTeamRole


##Private Repo to push troubleshooting pod

  EKSPrivateRepo: 
    Type: AWS::ECR::Repository
    Properties: 
      RepositoryName: "eksprivaterepo"


################## LAMBDA BOOTSTRAP FUNCTION ################

  EKSWSC9BootstrapLambda:
    Description: Bootstrap Cloud9 instance
    Type: Custom::EKSWSC9BootstrapLambda
    DependsOn:
    - EKSWSC9BootstrapLambdaFunction
    - EKSWSC9Instance
    - EKSC9InstanceProfile
    - EKSWSC9LambdaExecutionRole
    Properties:
      Tags:
        - Key: Environment
          Value: AWSEKSWS
      ServiceToken:
        Fn::GetAtt:
        - EKSWSC9BootstrapLambdaFunction
        - Arn
      REGION:
        Ref: AWS::Region
      StackName:
        Ref: AWS::StackName
      EnvironmentId:
        Ref: EKSWSC9Instance
      LabIdeInstanceProfileName:
        Ref: EKSC9InstanceProfile
      LabIdeInstanceProfileArn:
        Fn::GetAtt:
        - EKSC9InstanceProfile
        - Arn

##Lambda function to identify Cloud9 instance and attach instance profile to and security groups 

  EKSWSC9BootstrapLambdaFunction:
    Type: AWS::Lambda::Function
    Properties:
      Tags:
        - Key: Environment
          Value: AWSEKSWS
      Handler: index.lambda_handler
      Role:
        Fn::GetAtt:
        - EKSWSC9LambdaExecutionRole
        - Arn
      Runtime: python3.9
      MemorySize: 256
      Timeout: '600'
      Code:
        ZipFile: !Sub |
          from __future__ import print_function
          import boto3
          import json
          import os
          import time
          import traceback
          import cfnresponse
          
          def lambda_handler(event, context):
              # logger.info('event: {}'.format(event))
              # logger.info('context: {}'.format(context))
              responseData = {}

              status = cfnresponse.SUCCESS
              
              if event['RequestType'] == 'Delete':
                  responseData = {'Success': 'Custom Resource removed'}
                  cfnresponse.send(event, context, status, responseData, 'CustomResourcePhysicalID')              
          
              if event['RequestType'] == 'Create':
                  try:
                      # Open AWS clients
                      ec2 = boto3.client('ec2')
          
                      # Get the InstanceId of the Cloud9 IDE
                      instance = ec2.describe_instances(Filters=[{'Name': 'tag:Name','Values': ['aws-cloud9-'+event['ResourceProperties']['StackName']+'-'+event['ResourceProperties']['EnvironmentId']]}])['Reservations'][0]['Instances'][0]
                      #logger.info('instance: {}'.format(instance))
                      
                      ####### Get the GroupId for Security Group
                      instance_sg = ec2.describe_instances(Filters=[{'Name': 'tag:Name','Values': ['aws-cloud9-'+event['ResourceProperties']['StackName']+'-'+event['ResourceProperties']['EnvironmentId']]}])['Reservations'][0]['Instances'][0]['SecurityGroups'][0]
          
                      # Create the IamInstanceProfile request object
                      iam_instance_profile = {
                          'Arn': event['ResourceProperties']['LabIdeInstanceProfileArn'],
                          'Name': event['ResourceProperties']['LabIdeInstanceProfileName']
                      }
                      # logger.info('iam_instance_profile: {}'.format(iam_instance_profile))
          
                      # Wait for Instance to become ready before adding Role & SG
                      instance_state = instance['State']['Name']
                      # logger.info('instance_state: {}'.format(instance_state))
                      while instance_state != 'running':
                          time.sleep(5)
                          instance_state = ec2.describe_instances(InstanceIds=[instance['InstanceId']])
                          # logger.info('instance_state: {}'.format(instance_state))
  
  
                      ####
                      #Find instance profile association ID (in order to replace it with new role)
                      assocation_id = ec2.describe_iam_instance_profile_associations(Filters=[{'Name': 'instance-id','Values': [instance['InstanceId']]}])
                      
                      # Replace instance profile
                      response = ec2.replace_iam_instance_profile_association(IamInstanceProfile=iam_instance_profile, AssociationId=assocation_id['IamInstanceProfileAssociations'][0]['AssociationId'])
                      ####    
          
          
                      # attach instance profile
                      #response = ec2.associate_iam_instance_profile(IamInstanceProfile=iam_instance_profile, InstanceId=instance['InstanceId'])
                      #logger.info('response - associate_iam_instance_profile: {}'.format(response))
                      r_ec2 = boto3.resource('ec2')
                       

                      # attach security groups (Private Endpoint and EKS access)
                      response = ec2.modify_instance_attribute(InstanceId=instance['InstanceId'],Groups=[instance_sg['GroupId'],'${C9ToEndpointDummySG}','${C9ToEndpointSG}'])
  
                      responseData = {'Success': 'Started bootstrapping for instance: '+instance['InstanceId']}
                      cfnresponse.send(event, context, status, responseData, 'CustomResourcePhysicalID')
                      
                  except Exception as e:
                      status = cfnresponse.FAILED
                      print(traceback.format_exc())
                      responseData = {'Error': traceback.format_exc(e)}
                  finally:
                      cfnresponse.send(event, context, status, responseData, 'CustomResourcePhysicalID')

###S3 bucket to log lambda activity
  EKSWSC9OutputBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Delete
    Properties: 
      VersioningConfiguration:
        Status: Enabled
      BucketEncryption: 
        ServerSideEncryptionConfiguration: 
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256

###SSM document to runcommand against the Cloud9 environment when it starts up

  EKSWSC9SSMDocument: 
    Type: AWS::SSM::Document
    Properties: 
      Tags:
        - Key: Environment
          Value: AWSEKSWS
      DocumentType: Command
      DocumentFormat: YAML
      Content: 
        schemaVersion: '2.2'
        description: Bootstrap Cloud9 Instance
        mainSteps:
        - action: aws:runShellScript
          name: EKSWSC9bootstrap
          inputs:
           runCommand:
            - "#!/bin/bash"
            - date
            - echo LANG=en_US.utf-8 >> /etc/environment
            - echo LC_ALL=en_US.UTF-8 >> /etc/environment            
            - AWS_CLI_VERSION=$(aws --version 2>&1 | cut -d "." -f1 | cut -d "/" -f2)
            - if (( $AWS_CLI_VERSION <= 1 )) ; then
            -   systemctl disable packagekit --now
            -   yum -y remove aws-cli
            -   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
            -   unzip awscliv2.zip
            -   sudo ./aws/install
            - fi           
            - yum -y install sqlite telnet jq strace tree gcc glibc-static python3 python3-pip gettext bash-completion moreutils
            - echo '=== CONFIGURE default python version ==='
            - PATH=$PATH:/usr/bin
            - alternatives --set python /usr/bin/python3
            - echo '=== INSTALL and CONFIGURE default software components ==='
            - sudo -H -u ec2-user bash -c "pip install --user -U boto boto3 botocore"            
            - echo '=== Resizing the Instance volume'
            - !Sub export REGION=${AWS::Region}
            - export INSTANCEID=$(curl http://169.254.169.254/latest/meta-data/instance-id)
            - !Sub SIZE=${EKSWSC9InstanceVolumeSize}
            - !Sub export PARTICIPANT_ROLE_ARN=${EKSWSEventC9RoleArn}
            - !Sub export KVERSION=${KVERSION}
            - !Sub export PARTICIPANT_ASSUMED_SESSION_NAME=${EKSWSEventC9AssumedRoleSessionName}
            - !Sub export PARTICIPANT_ROLE_NAME=${EKSWSEventC9RoleName}
            - !Sub export CLOUD9_ROLE_NAME=${EKSWSC9Role}
            - !Sub export CLOUD9_TEAM_ROLE_NAME=${EKSDevOpsTeamRole}
            - !Sub export CLOUD9_TEAM_ROLE_ARN=${EKSDevOpsTeamRole.Arn}            
            - !Sub export NET_SHOOT_IMAGE=${EKSPrivateRepo.RepositoryUri}:original
            - echo 'Set Environment Variables for EKS Workshop'
            - export C9_EnvID=$(aws ec2 describe-tags --filters "Name=resource-id,Values=$INSTANCEID" "Name=key,Values=aws:cloud9:environment" --region=$REGION --output=text | cut -f5)
            - export ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)            
            - export AZS=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[].ZoneName' --output text --region $REGION)
            - export EKS_CLUSTER_NAME="EKSWorkshop"
            - export EKS_NODE_GROUP="EKSWorkshopNodegroup"
            - export INSTANCEID=$(curl http://169.254.169.254/latest/meta-data/instance-id)
            - echo "export ACCOUNT_ID=$ACCOUNT_ID" | tee -a /home/ec2-user/.bash_profile            
            - echo "export REGION=$REGION" | tee -a /home/ec2-user/.bash_profile
            - echo "export AZS=$AZS" | tee -a /home/ec2-user/.bash_profile
            - echo "export EKS_CLUSTER_NAME=$EKS_CLUSTER_NAME" | tee -a /home/ec2-user/.bash_profile
            - echo "export EKS_NODE_GROUP=$EKS_NODE_GROUP" | tee -a /home/ec2-user/.bash_profile
            - echo "export KVERSION=$KVERSION" | tee -a /home/ec2-user/.bash_profile     
            - echo "export MAIN_ROLE_ARN=$PARTICIPANT_ROLE_ARN" | tee -a /home/ec2-user/.bash_profile
            - echo "export PARTICIPANT_ROLE_NAME=$PARTICIPANT_ROLE_NAME" | tee -a /home/ec2-user/.bash_profile
            - echo "export PARTICIPANT_ASSUMED_SESSION_NAME=$PARTICIPANT_ASSUMED_SESSION_NAME" | tee -a /home/ec2-user/.bash_profile 
            - echo "export CLOUD9_ROLE_NAME=$CLOUD9_ROLE_NAME" | tee -a /home/ec2-user/.bash_profile 
            - echo "export CLOUD9_TEAM_ROLE_NAME=$CLOUD9_TEAM_ROLE_NAME" | tee -a /home/ec2-user/.bash_profile 
            - echo "export DEVOPS_TEAM_ROLE_ARN=$CLOUD9_TEAM_ROLE_ARN" | tee -a /home/ec2-user/.bash_profile  
            - echo "export C9_ID=$C9_EnvID" | tee -a /home/ec2-user/.bash_profile   
            - echo "export INSTANCEID=$INSTANCEID" | tee -a /home/ec2-user/.bash_profile 
            - echo "export NET_SHOOT_IMAGE=$NET_SHOOT_IMAGE" | tee -a /home/ec2-user/.bash_profile
            - echo "alias k=kubectl" | tee -a /home/ec2-user/.bash_profile       
            - |
              INSTANCEID=$(curl http://169.254.169.254/latest/meta-data/instance-id)
              VOLUMEID=$(aws ec2 describe-instances \
                --instance-id $INSTANCEID \
                --query "Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId" \
                --output text --region $REGION)
              aws ec2 modify-volume --volume-id $VOLUMEID --size $SIZE --region $REGION
              while [ \
                "$(aws ec2 describe-volumes-modifications \
                  --volume-id $VOLUMEID \
                  --filters Name=modification-state,Values="optimizing","completed" \
                  --query "length(VolumesModifications)"\
                  --output text --region $REGION)" != "1" ]; do
              sleep 1
              done
              if [ $(readlink -f /dev/xvda) = "/dev/xvda" ]
              then
                sudo growpart /dev/xvda 1
                STR=$(cat /etc/os-release)
                SUB="VERSION_ID=\"2\""
                if [[ "$STR" == *"$SUB"* ]]
                then
                  sudo xfs_growfs -d /
                else
                  sudo resize2fs /dev/xvda1
                fi
              else
                sudo growpart /dev/nvme0n1 1
                STR=$(cat /etc/os-release)
                SUB="VERSION_ID=\"2\""
                if [[ "$STR" == *"$SUB"* ]]
                then
                  sudo xfs_growfs -d /
                else
                  sudo resize2fs /dev/nvme0n1p1
                fi
              fi
          
            - echo 'PATH=$PATH:/usr/local/bin' >> /home/ec2-user/.bashrc
            - echo 'export PATH' >> /home/ec2-user/.bashrc
            - echo '=== Installing EKSCTL ==='
            - curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
            - sudo mv /tmp/eksctl /usr/local/bin
            - sudo chmod 755 /usr/local/bin/eksctl
            - echo '=== Installing KUBECTL ==='
            - sudo curl --silent --location -o /usr/local/bin/kubectl https://s3.us-west-2.amazonaws.com/amazon-eks/1.27.5/2023-09-14/bin/linux/amd64/kubectl
            - sudo chmod +x /usr/local/bin/kubectl
           #Enabled Bash completion - check 
            - kubectl completion bash | sudo tee /etc/bash_completion.d/kubectl > /dev/null
            - eksctl completion bash | sudo tee /etc/bash_completion.d/eksctl > /dev/null
            - echo "complete -C '/usr/local/bin/aws_completer' aws" >> /home/ec2-user/.bashrc
            - echo "complete -C '/usr/local/bin/aws_completer' aws" >> ~/.bashrc
            - echo '=== Installing SSM Session Manager Plugin ==='
            - echo "Install SSM Session Manager"
            - curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_64bit/session-manager-plugin.rpm" -o "session-manager-plugin.rpm"
            - sudo yum install -y session-manager-plugin.rpm
            - session-manager-plugin
            - aws configure set default.region $REGION
            - aws configure get default.region
            - echo '=== Creating Cluster in BackGround ==='
            - echo 'Cluster created with idenity:'
            - aws sts get-caller-identity  --query 'Arn' --output text
            - echo 'user:'
            - echo '1'
            - whoami
            - cd /home/ec2-user/environment
            - !Sub |
              cat << EOF > eksworkshop.yaml              
              ---
              apiVersion: eksctl.io/v1alpha5
              kind: ClusterConfig

              metadata:
                name: $EKS_CLUSTER_NAME
                region: $REGION
                version: "${KVERSION}"

              privateCluster:
                enabled: true
                skipEndpointCreation: true

              vpc:
                id: ${EKSECSWorkshopVPC}
                subnets:
                  private:
                    private-one:
                        id: ${EKSWSPrivateSubnet0}
                    private-two:
                        id: ${EKSWSPrivateSubnet1}
                securityGroup: ${C9ToEndpointSG}
                manageSharedNodeSecurityGroupRules: true

              managedNodeGroups:
                - name: $EKS_NODE_GROUP
                  desiredCapacity: 2
                  instanceType: t3.small
                  ssh:
                    enableSsm: true
                  privateNetworking: true
                  securityGroups: 
                    attachIDs: ["${C9ToEndpointDummySG}"]
              addons:
              - name: vpc-cni
                # all below properties are optional
                version: "1.14"
              - name: coredns
                version: "v1.9.3-eksbuild.6"
              - name: kube-proxy
                version: "v1.26.6-eksbuild.2"
              cloudWatch:
                clusterLogging:
                  enableTypes: ["*"] 
              EOF
            - chmod 755 eksworkshop.yaml
            - echo 'Cluster creator is identity below...'
            - aws sts get-caller-identity
            - aws eks update-kubeconfig --name $EKS_CLUSTER_NAME --region $REGION
            - export EKS_CREATOR_ARN=$(aws sts get-caller-identity --query Arn)
            - export C9_INSTANCE_PROFILE_ARN=$(aws ec2 describe-instances --instance-ids $INSTANCEID --query "Reservations[].Instances[].IamInstanceProfile[].Arn[]" --output text)
            - echo "export EKS_CREATOR_ARN=$EKS_CREATOR_ARN" | tee -a /home/ec2-user/.bash_profilev
            - echo "export C9_INSTANCE_PROFILE_ARN=$C9_INSTANCE_PROFILE_ARN" | tee -a /home/ec2-user/.bash_profile
            - eksctl create cluster -f /home/ec2-user/environment/eksworkshop.yaml
            - eksctl utils write-kubeconfig --cluster $EKS_CLUSTER_NAME
            - mkdir -p /home/ec2-user/.kube/
            - cp .kube/config /home/ec2-user/.kube/config
            - chown ec2-user:ec2-user /home/ec2-user/.kube/config
            - kubectl get nodes -o wide
            - kubectl get pods -A -o wide
            - |
              aws eks update-addon --cluster-name $EKS_CLUSTER_NAME --addon-name vpc-cni --addon-version v1.14.0-eksbuild.3 --resolve-conflicts PRESERVE --configuration-values '{"enableNetworkPolicy": "true"}' --region $REGION
          
            ###Creating image, pushing to repo and creating netshoot deployment pod for 3rd scenario###
            - mkdir /home/ec2-user/.build
            - |
              cat << EOF > /home/ec2-user/.build/Dockerfile
              FROM nicolaka/netshoot
              EOF
            - export DOCKER_IMAGE_NAME=netshoot
            - docker image build -t $DOCKER_IMAGE_NAME /home/ec2-user/.build/
            - docker image ls
            - export DOCKER_IMAGE_ID=$(docker images -q $DOCKER_IMAGE_NAME)
            - aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
            - !Sub docker tag $DOCKER_IMAGE_ID ${EKSPrivateRepo.RepositoryUri}:original
            - !Sub docker push ${EKSPrivateRepo.RepositoryUri}:original
            - |  
              kubectl create -f  >/dev/null 2>&1 - <<EOF
              kind: NetworkPolicy
              apiVersion: networking.k8s.io/v1
              metadata:
                name: networkpolicy
                namespace: kube-system
              spec:
                podSelector:
                  matchLabels: {}
              EOF
 
            ###For 2nd scenario - creating s3 gateway policy preventing cloud9 and node access ###
            - !Sub export S3_ENDPOINT_ID=${VPCEndpointS3}
            - export NODEGROUP_ROLE_ARN=$(aws eks describe-nodegroup --cluster-name $EKS_CLUSTER_NAME --nodegroup-name $EKS_NODE_GROUP --region $REGION --query 'nodegroup.nodeRole' --output text)
            - !Sub |
              aws ec2 modify-vpc-endpoint --vpc-endpoint-id $S3_ENDPOINT_ID --remove-route-table-ids ${PrivateRouteTable0}
            #Run commands that will terminate worker node ec2 instances.
            - export NodeInstance1=$(aws ec2 describe-instances --filter Name=tag:eks:nodegroup-name,Values=EKSWorkshopNodegroup --query 'Reservations[0].Instances[].InstanceId' --output text)
            - export NodeInstance2=$(aws ec2 describe-instances --filter Name=tag:eks:nodegroup-name,Values=EKSWorkshopNodegroup --query 'Reservations[1].Instances[].InstanceId' --output text)
            - aws ec2 terminate-instances --instance-ids "$NodeInstance1" "$NodeInstance2"
            
           ### Attaching non-creator role to Cloud9 for scenario 1 ###
            - export PROFILE_ID=$(aws ec2 describe-iam-instance-profile-associations --filters Name=instance-id,Values=$INSTANCEID --query IamInstanceProfileAssociations[].AssociationId[] --output text)
            - !Sub aws ec2 replace-iam-instance-profile-association --iam-instance-profile Name=${EKSDevOpsTeamInstanceProfile} --association-id $PROFILE_ID

          ###WILL need to ask participants to manually disable CLoud9 creds when they first login

  EKSWSC9bootstrapAssociation: 
    Type: AWS::SSM::Association
    DependsOn: 
      - EKSWSC9OutputBucket
      - EKSWSC9BootstrapLambdaFunction
      - EKSWSC9Instance
 #    - EKSWSC9BootstrapLambda
      # Trying to add bootstraplambda, so ensure it changed c9's role becure runcommand tries
    Properties: 
      Name: !Ref EKSWSC9SSMDocument
      OutputLocation: 
        S3Location:
          OutputS3BucketName: !Ref EKSWSC9OutputBucket
          OutputS3KeyPrefix: bootstrapoutput
      Targets:
        - Key: tag:Environment
          Values:
          - AWSEKSWS

  


  ################## Cloud9 Environment #####################
  
  AWSCloud9SSMAccessRole:
    Type: AWS::IAM::Role
    Properties: 
      AssumeRolePolicyDocument:
        Version: 2012-10-17
        Statement:
          - Effect: Allow
            Principal:
              Service:
              - cloud9.amazonaws.com
              - ec2.amazonaws.com
            Action:
              - 'sts:AssumeRole'
      Description: 'Service linked role for AWS Cloud9'
      Path: '/service-role/'
      ManagedPolicyArns: 
        - arn:aws:iam::aws:policy/AWSCloud9SSMInstanceProfile
      RoleName: 'AWSCloud9SSMAccessRole'
  
  EKSC9InstanceProfile:
    Type: AWS::IAM::InstanceProfile
    Properties:
      Path: "/"
      Roles:
        -  
          Ref: EKSWSC9Role 
      
  WSCloud9SSMInstanceProfile:
    Type: "AWS::IAM::InstanceProfile"
    Properties: 
      InstanceProfileName: AWSCloud9SSMInstanceProfile
      Path: "/cloud9/"
      Roles: 
        - 
          Ref: AWSCloud9SSMAccessRole

  EKSWSC9Instance:
    Description: "-"
    Type: AWS::Cloud9::EnvironmentEC2
    Properties:
      Description: AWS Cloud9 instance for EKS Workshop
      AutomaticStopTimeMinutes: 3600
      InstanceType:
        Ref: EKSWSC9InstanceType
      SubnetId: 
        Ref: EKSWSPublicSubnet0
      Name:
        Ref: AWS::StackName
      ImageId: !Ref ImageId
      #OwnerArn: !If [CreateWorkshopStudioResources, !Ref EKSWSEventC9OwnerAssumedRoleArn, !Ref "AWS::NoValue" ]
      ConnectionType: CONNECT_SSM
      ##This is possibly causing issue for lambda? 
      Tags: 
        - 
          Key: SSMBootstrap
          Value: Active
        - 
          Key: Environment
          Value: AWSEKSWS
    DependsOn: 
      - EKSWSPublicSubnet0
      - EKSWSPrivateSubnet1

##########################ECS MAIN RESOURCES#################################     

####ASG
  ASGCapProvider3F59AEED:
    Properties:
      AutoScalingGroupProvider:
        AutoScalingGroupArn:
          Ref: EcsASG4AB2616D
        ManagedScaling:
          Status: ENABLED
          TargetCapacity: 100
        ManagedTerminationProtection: DISABLED
      Name: ASGCapProvider
    Type: AWS::ECS::CapacityProvider

###EC2 Role Policy
  EC2roleDefaultPolicy18D02E20:
    Properties:
      PolicyDocument:
        Statement:
        - Action:
          - ecs:DeregisterContainerInstance
          - ecs:RegisterContainerInstance
          - ecs:Submit*
          Effect: Allow
          Resource:
            Fn::GetAtt:
            - EcsCluster97242B84
            - Arn
        - Action:
          - ecs:Poll
          - ecs:StartTelemetrySession
          Condition:
            ArnEquals:
              ecs:cluster:
                Fn::GetAtt:
                - EcsCluster97242B84
                - Arn
          Effect: Allow
          Resource: '*'
        - Action:
          - ecr:GetAuthorizationToken
          - ecs:DiscoverPollEndpoint
          - logs:CreateLogStream
          - logs:PutLogEvents
          Effect: Allow
          Resource: '*'
        - Action: ssm:GetParameter
          Effect: Allow
          Resource:
            Fn::Join:
            - ''
            - - 'arn:'
              - Ref: AWS::Partition
              - ':ssm:'
              - Ref: AWS::Region
              - ':'
              - Ref: AWS::AccountId
              - :parameter/
              - Ref: ECSWorkshopLogsParamEC576756
        Version: '2012-10-17'
      PolicyName: EC2roleDefaultPolicy18D02E20
      Roles:
      - Ref: EC2roleF5D13A76
    Type: AWS::IAM::Policy
  EC2roleF5D13A76:
    Properties:
      RoleName: ECSEC2Role
      AssumeRolePolicyDocument:
        Statement:
        - Action: sts:AssumeRole
          Effect: Allow
          Principal:
            Service: ec2.amazonaws.com
        Version: '2012-10-17'
      Description: Role for EC2 instances
      ManagedPolicyArns:
      - Fn::Join:
        - ''
        - - 'arn:'
          - Ref: AWS::Partition
          - :iam::aws:policy/AmazonSSMManagedInstanceCore
      - Fn::Join:
        - ''
        - - 'arn:'
          - Ref: AWS::Partition
          - :iam::aws:policy/CloudWatchAgentServerPolicy
    Type: AWS::IAM::Role
  ECSWorkshopAsgSGAE6CBA7D:
    Properties:
      GroupDescription: EcsStack/ECSWorkshopAsgSG
      GroupName: ECSWorkshopAsg
      SecurityGroupIngress:
        - CidrIp: 172.15.1.0/24
          Description: Allow HTTP traffic to private subnet
          FromPort: 80
          ToPort: 80
          IpProtocol: tcp
        - CidrIp: 172.15.2.0/24
          Description: Allow HTTP traffic to private subnet
          FromPort: 80
          ToPort: 80
          IpProtocol: tcp
      SecurityGroupEgress:
        - CidrIp: 0.0.0.0/0
          Description: Allow all outbound traffic by default
          IpProtocol: '-1'
      VpcId:
        Ref: EKSECSWorkshopVPC
      Tags:
        - Key: Name
          Value: ECSWorkshopAsg
    Type: AWS::EC2::SecurityGroup

  ### ECS Instance Launch Template 
  ECSWorkshopBE91AE17:
    Properties:
      LaunchTemplateData:
        IamInstanceProfile:
          Arn:
            Fn::GetAtt:
            - ECSWorkshopProfile162615DC
            - Arn
        ImageId:
          Ref: SsmParameterValueawsserviceecsoptimizedamiamazonlinux2recommendedimageidC96584B6F00A464EAD1953AFF4B05118Parameter
        InstanceType: t3.medium
        SecurityGroupIds:
        - Fn::GetAtt:
          - ECSWorkshopAsgSGAE6CBA7D
          - GroupId
        TagSpecifications:
        - ResourceType: instance
          Tags:
          - Key: Name
            Value: EcsStack/ECS_Workshop
        - ResourceType: volume
          Tags:
          - Key: Name
            Value: EcsStack/ECS_Workshop
        UserData:
          Fn::Base64:
            Fn::Join:
            - ''
            - - '#!/bin/bash

                yum -y install amazon-cloudwatch-agent

                /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a
                fetch-config -m ec2 -s -c ssm:'
              - Ref: ECSWorkshopLogsParamEC576756
              - '

                echo ECS_CLUSTER='
              - Empty
              - ' >> /etc/ecs/ecs.config

                sudo iptables --insert FORWARD 1 --in-interface docker+ --destination
                169.254.169.254/32 --jump DROP

                sudo service iptables save

                echo ECS_AWSVPC_BLOCK_IMDS=true >> /etc/ecs/ecs.config'
      LaunchTemplateName: ECSWorkshopLaunchTemplate
      TagSpecifications:
      - ResourceType: launch-template
        Tags:
        - Key: Name
          Value: EcsStack/ECS_Workshop
    Type: AWS::EC2::LaunchTemplate

### ECS Logs
  ECSWorkshopECSLogs81C3E584:
    DeletionPolicy: Delete
    Properties:
      LogGroupName: ECSWorkshopECSInstanceLogs
      RetentionInDays: 1
    Type: AWS::Logs::LogGroup
    UpdateReplacePolicy: Delete
  ECSWorkshopECSTaskDef74ACB4BB:
    Properties:
      ContainerDefinitions:
      - Essential: true
        Image: public.ecr.aws/nginx/nginxlatest
        LogConfiguration:
          LogDriver: awslogs
          Options:
            awslogs-group:
              Ref: ECSWorkshopTaskLogsD168AB49
            awslogs-region:
              Ref: AWS::Region
            awslogs-stream-prefix: ECSWorkshopContainer
            mode: non-blocking
        Memory: 256
        Name: ECSWorkshopContainer
        PortMappings:
        - ContainerPort: 80
          HostPort: 80
          Protocol: tcp
      Family: ECSWorkshopECSTaskDefinition
      NetworkMode: bridge
      RequiresCompatibilities:
      - EC2
      TaskRoleArn:
        Fn::GetAtt:
        - ECSWorkshopECSTaskDefTaskRole26B6E9FF
        - Arn
    Type: AWS::ECS::TaskDefinition
  
  ### ECS Task Policy and Role
  ECSWorkshopECSTaskDefTaskRole26B6E9FF:
    Properties:
      RoleName: ECSTaskDefRole
      AssumeRolePolicyDocument:
        Statement:
        - Action: sts:AssumeRole
          Effect: Allow
          Principal:
            Service: ecs-tasks.amazonaws.com
        Version: '2012-10-17'
    Type: AWS::IAM::Role

  ECSWorkshopECSTaskDefExecutionRoleDefaultPolicyF90F0503:
    Properties:
      PolicyDocument:
        Statement:
        - Action:
          - logs:CreateLogStream
          - logs:PutLogEvents
          Effect: Allow
          Resource:
            Fn::GetAtt:
            - ECSWorkshopTaskLogsD168AB49
            - Arn
        Version: '2012-10-17'
      PolicyName: ECSWorkshopECSTaskDefExecutionRoleDefaultPolicyF90F0503
      Roles:
      - Ref: ECSWorkshopECSTaskDefTaskRole26B6E9FF
    Type: AWS::IAM::Policy
  
  ### Log Config
  ECSWorkshopLogsParamEC576756:
    Properties:
      Name: ECS_Workshop_Logs_Param
      Type: String
      Value:
        Fn::Join:
        - ''
        - - "{\n                \"agent\": {\n                    \"run_as_user\"\
            : \"cwagent\"\n                },\n                \"logs\": {\n     \
            \               \"logs_collected\": {\n                        \"files\"\
            : {\n                            \"collect_list\": [\n               \
            \                 {\n                                    \"file_path\"\
            : \"/var/log/ecs/ecs-agent.log\",\n                                  \
            \  \"log_group_name\": \""
          - Ref: ECSWorkshopECSLogs81C3E584
          - "\",\n                                    \"log_stream_name\": \"ecs-agent_{instance_id}\"\
            ,\n                                    \"retention_in_days\": 1\n    \
            \                            },\n                                {\n \
            \                                   \"file_path\": \"/var/log/ecs/ecs-init.log\"\
            ,\n                                    \"log_group_name\": \""
          - Ref: ECSWorkshopECSLogs81C3E584
          - "\",\n                                    \"log_stream_name\": \"ecs-init_{instance_id}\"\
            ,\n                                    \"retention_in_days\": 1\n    \
            \                            },\n                                {\n \
            \                                   \"file_path\": \"/var/log/ecs/ecs-volume-plugin.log\"\
            ,\n                                    \"log_group_name\": \""
          - Ref: ECSWorkshopECSLogs81C3E584
          - "\",\n                                    \"log_stream_name\": \"ecs-volume-plugin_{instance_id}\"\
            ,\n                                    \"retention_in_days\": 1\n    \
            \                            }\n                            ]\n      \
            \                  }\n                    }\n                }\n     \
            \       }\n            "
    Type: AWS::SSM::Parameter

  ###EC2 IAM Profile
  ECSWorkshopProfile162615DC:
    Properties:
      Roles:
      - Ref: EC2roleF5D13A76
    Type: AWS::IAM::InstanceProfile
  ### ECS Task Log Group
  ECSWorkshopTaskLogsD168AB49:
    DeletionPolicy: Delete
    Properties:
      LogGroupName: ECSWorkshopTaskLogs
      RetentionInDays: 1
    Type: AWS::Logs::LogGroup
    UpdateReplacePolicy: Delete
  ###VPC Flow logs
  ECSWorkshopVPCFlowLogsFlowLog41688058:
    Properties:
      DeliverLogsPermissionArn:
        Fn::GetAtt:
        - ECSWorkshopVPCLogsRoleE2AB4B90
        - Arn
      LogDestinationType: cloud-watch-logs
      LogGroupName:
        Ref: ECSWorkshopVPCLogs8A24D5C1
      ResourceId:
        Ref: EKSECSWorkshopVPC
      ResourceType: VPC
      TrafficType: ALL
    Type: AWS::EC2::FlowLog
  ECSWorkshopVPCLogs8A24D5C1:
    DeletionPolicy: Delete
    Properties:
      LogGroupName: ECSWorkshopVPCLogs
      RetentionInDays: 1
    Type: AWS::Logs::LogGroup
    UpdateReplacePolicy: Delete
    ###VPC flow logs IAM role
  ECSWorkshopVPCLogsRoleDefaultPolicy49BCAC8A:
    Properties:
      PolicyDocument:
        Statement:
        - Action:
          - logs:CreateLogStream
          - logs:DescribeLogStreams
          - logs:PutLogEvents
          Effect: Allow
          Resource:
            Fn::GetAtt:
            - ECSWorkshopVPCLogs8A24D5C1
            - Arn
        - Action: iam:PassRole
          Effect: Allow
          Resource:
            Fn::GetAtt:
            - ECSWorkshopVPCLogsRoleE2AB4B90
            - Arn
        Version: '2012-10-17'
      PolicyName: ECSWorkshopVPCLogsRoleDefaultPolicy49BCAC8A
      Roles:
      - Ref: ECSWorkshopVPCLogsRoleE2AB4B90
    Type: AWS::IAM::Policy
  ECSWorkshopVPCLogsRoleE2AB4B90:
    Properties:
      AssumeRolePolicyDocument:
        Statement:
        - Action: sts:AssumeRole
          Effect: Allow
          Principal:
            Service: vpc-flow-logs.amazonaws.com
        Version: '2012-10-17'
    Type: AWS::IAM::Role
###Auto Scaling Group  
  EcsASG4AB2616D:
    Properties:
      AutoScalingGroupName: EcsASG
      MaxSize: '4'
      MinSize: '2'
      MixedInstancesPolicy:
        InstancesDistribution:
          OnDemandPercentageAboveBaseCapacity: 100
        LaunchTemplate:
          LaunchTemplateSpecification:
            LaunchTemplateId:
              Ref: ECSWorkshopBE91AE17
            Version:
              Fn::GetAtt:
              - ECSWorkshopBE91AE17
              - LatestVersionNumber
          Overrides:
          - InstanceType: t3.small
          - InstanceType: t3.medium
          - InstanceType: t3a.micro
          - InstanceType: t3a.small
          - InstanceType: m5a.large
          - InstanceType: m5.large
          - InstanceType: t2.small
          - InstanceType: t2.medium
      VPCZoneIdentifier:
      - Ref: ECSWKSPrivateSubnet0
      - Ref: ECSWKSPrivateSubnet1
    Type: AWS::AutoScaling::AutoScalingGroup
    UpdatePolicy:
      AutoScalingScheduledAction:
        IgnoreUnmodifiedGroupSizeProperties: true
  
  ###ASG Hook Lambda Function

  EcsASGDrainECSHookFunctionADC6321F:
    DependsOn:
    - EcsASGDrainECSHookFunctionServiceRoleDefaultPolicy13584EBA
    - EcsASGDrainECSHookFunctionServiceRoleB5883215
    Properties:
      Code:
        ZipFile: "import boto3, json, os, time\n\necs = boto3.client('ecs')\nautoscaling\
          \ = boto3.client('autoscaling')\n\n\ndef lambda_handler(event, context):\n\
          \  print(json.dumps(dict(event, ResponseURL='...')))\n  cluster = os.environ['CLUSTER']\n\
          \  snsTopicArn = event['Records'][0]['Sns']['TopicArn']\n  lifecycle_event\
          \ = json.loads(event['Records'][0]['Sns']['Message'])\n  instance_id = lifecycle_event.get('EC2InstanceId')\n\
          \  if not instance_id:\n    print('Got event without EC2InstanceId: %s',\
          \ json.dumps(dict(event, ResponseURL='...')))\n    return\n\n  instance_arn\
          \ = container_instance_arn(cluster, instance_id)\n  print('Instance %s has\
          \ container instance ARN %s' % (lifecycle_event['EC2InstanceId'], instance_arn))\n\
          \n  if not instance_arn:\n    return\n\n  task_arns = container_instance_task_arns(cluster,\
          \ instance_arn)\n\n  if task_arns:\n    print('Instance ARN %s has task\
          \ ARNs %s' % (instance_arn, ', '.join(task_arns)))\n\n  while has_tasks(cluster,\
          \ instance_arn, task_arns):\n    time.sleep(10)\n\n  try:\n    print('Terminating\
          \ instance %s' % instance_id)\n    autoscaling.complete_lifecycle_action(\n\
          \        LifecycleActionResult='CONTINUE',\n        **pick(lifecycle_event,\
          \ 'LifecycleHookName', 'LifecycleActionToken', 'AutoScalingGroupName'))\n\
          \  except Exception as e:\n    # Lifecycle action may have already completed.\n\
          \    print(str(e))\n\n\ndef container_instance_arn(cluster, instance_id):\n\
          \  \"\"\"Turn an instance ID into a container instance ARN.\"\"\"\n  arns\
          \ = ecs.list_container_instances(cluster=cluster, filter='ec2InstanceId=='\
          \ + instance_id)['containerInstanceArns']\n  if not arns:\n    return None\n\
          \  return arns[0]\n\ndef container_instance_task_arns(cluster, instance_arn):\n\
          \  \"\"\"Fetch tasks for a container instance ARN.\"\"\"\n  arns = ecs.list_tasks(cluster=cluster,\
          \ containerInstance=instance_arn)['taskArns']\n  return arns\n\ndef has_tasks(cluster,\
          \ instance_arn, task_arns):\n  \"\"\"Return True if the instance is running\
          \ tasks for the given cluster.\"\"\"\n  instances = ecs.describe_container_instances(cluster=cluster,\
          \ containerInstances=[instance_arn])['containerInstances']\n  if not instances:\n\
          \    return False\n  instance = instances[0]\n\n  if instance['status']\
          \ == 'ACTIVE':\n    # Start draining, then try again later\n    set_container_instance_to_draining(cluster,\
          \ instance_arn)\n    return True\n\n  task_count = None\n\n  if task_arns:\n\
          \    # Fetch details for tasks running on the container instance\n    tasks\
          \ = ecs.describe_tasks(cluster=cluster, tasks=task_arns)['tasks']\n    if\
          \ tasks:\n      # Consider any non-stopped tasks as running\n      task_count\
          \ = sum(task['lastStatus'] != 'STOPPED' for task in tasks) + instance['pendingTasksCount']\n\
          \n  if not task_count:\n    # Fallback to instance task counts if detailed\
          \ task information is unavailable\n    task_count = instance['runningTasksCount']\
          \ + instance['pendingTasksCount']\n\n  print('Instance %s has %s tasks'\
          \ % (instance_arn, task_count))\n\n  return task_count > 0\n\ndef set_container_instance_to_draining(cluster,\
          \ instance_arn):\n  ecs.update_container_instances_state(\n      cluster=cluster,\n\
          \      containerInstances=[instance_arn], status='DRAINING')\n\n\ndef pick(dct,\
          \ *keys):\n  \"\"\"Pick a subset of a dict.\"\"\"\n  return {k: v for k,\
          \ v in dct.items() if k in keys}\n"
      Environment:
        Variables:
          CLUSTER:
            Ref: EcsCluster97242B84
      Handler: index.lambda_handler
      Role:
        Fn::GetAtt:
        - EcsASGDrainECSHookFunctionServiceRoleB5883215
        - Arn
      Runtime: python3.9
      Timeout: 310
    Type: AWS::Lambda::Function
  EcsASGDrainECSHookFunctionAllowInvokeEcsStackEcsASGLifecycleHookDrainHookTopic67F646C626C9F7CB:
    Properties:
      Action: lambda:InvokeFunction
      FunctionName:
        Fn::GetAtt:
        - EcsASGDrainECSHookFunctionADC6321F
        - Arn
      Principal: sns.amazonaws.com
      SourceArn:
        Ref: EcsASGLifecycleHookDrainHookTopicC008C587
    Type: AWS::Lambda::Permission
  ### IAM Role ASG function
  EcsASGDrainECSHookFunctionServiceRoleB5883215:
    Properties:
      AssumeRolePolicyDocument:
        Statement:
        - Action: sts:AssumeRole
          Effect: Allow
          Principal:
            Service: lambda.amazonaws.com
        Version: '2012-10-17'
      ManagedPolicyArns:
      - Fn::Join:
        - ''
        - - 'arn:'
          - Ref: AWS::Partition
          - :iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    Type: AWS::IAM::Role
  
  ###Lambda function service role default policy

  EcsASGDrainECSHookFunctionServiceRoleDefaultPolicy13584EBA:
    Properties:
      PolicyDocument:
        Statement:
        - Action:
          - ec2:DescribeHosts
          - ec2:DescribeInstanceAttribute
          - ec2:DescribeInstanceStatus
          - ec2:DescribeInstances
          Effect: Allow
          Resource: '*'
        - Action: autoscaling:CompleteLifecycleAction
          Effect: Allow
          Resource:
            Fn::Join:
            - ''
            - - 'arn:'
              - Ref: AWS::Partition
              - ':autoscaling:'
              - Ref: AWS::Region
              - ':'
              - Ref: AWS::AccountId
              - :autoScalingGroup:*:autoScalingGroupName/
              - Ref: EcsASG4AB2616D
        - Action:
          - ecs:DescribeContainerInstances
          - ecs:DescribeTasks
          - ecs:ListTasks
          - ecs:UpdateContainerInstancesState
          Condition:
            ArnEquals:
              ecs:cluster:
                Fn::GetAtt:
                - EcsCluster97242B84
                - Arn
          Effect: Allow
          Resource: '*'
        - Action:
          - ecs:ListContainerInstances
          - ecs:SubmitContainerStateChange
          - ecs:SubmitTaskStateChange
          Effect: Allow
          Resource:
            Fn::GetAtt:
            - EcsCluster97242B84
            - Arn
        Version: '2012-10-17'
      PolicyName: EcsASGDrainECSHookFunctionServiceRoleDefaultPolicy13584EBA
      Roles:
      - Ref: EcsASGDrainECSHookFunctionServiceRoleB5883215
    Type: AWS::IAM::Policy
  ###Auto scaling lifecycle
  EcsASGDrainECSHookFunctionTopic189EEEFC:
    Properties:
      Endpoint:
        Fn::GetAtt:
        - EcsASGDrainECSHookFunctionADC6321F
        - Arn
      Protocol: lambda
      TopicArn:
        Ref: EcsASGLifecycleHookDrainHookTopicC008C587
    Type: AWS::SNS::Subscription
  EcsASGLifecycleHookDrainHookE615118C:
    DependsOn:
    - EcsASGLifecycleHookDrainHookRoleDefaultPolicy5CEDC36B
    - EcsASGLifecycleHookDrainHookRoleF133046C
    Properties:
      AutoScalingGroupName:
        Ref: EcsASG4AB2616D
      DefaultResult: CONTINUE
      HeartbeatTimeout: 300
      LifecycleTransition: autoscaling:EC2_INSTANCE_TERMINATING
      NotificationTargetARN:
        Ref: EcsASGLifecycleHookDrainHookTopicC008C587
      RoleARN:
        Fn::GetAtt:
        - EcsASGLifecycleHookDrainHookRoleF133046C
        - Arn
    Type: AWS::AutoScaling::LifecycleHook
###IAM policy
  EcsASGLifecycleHookDrainHookRoleDefaultPolicy5CEDC36B:
    Properties:
      PolicyDocument:
        Statement:
        - Action: sns:Publish
          Effect: Allow
          Resource:
            Ref: EcsASGLifecycleHookDrainHookTopicC008C587
        Version: '2012-10-17'
      PolicyName: EcsASGLifecycleHookDrainHookRoleDefaultPolicy5CEDC36B
      Roles:
      - Ref: EcsASGLifecycleHookDrainHookRoleF133046C
    Type: AWS::IAM::Policy
###IAM Role
  EcsASGLifecycleHookDrainHookRoleF133046C:
    Properties:
      AssumeRolePolicyDocument:
        Statement:
        - Action: sts:AssumeRole
          Effect: Allow
          Principal:
            Service: autoscaling.amazonaws.com
        Version: '2012-10-17'
    Type: AWS::IAM::Role
###SNS Topic
  EcsASGLifecycleHookDrainHookTopicC008C587:
    Type: AWS::SNS::Topic
  EcsCluster72B17558:
    Properties:
      CapacityProviders:
      - Ref: ASGCapProvider3F59AEED
      Cluster:
        Ref: EcsCluster97242B84
      DefaultCapacityProviderStrategy: []
    Type: AWS::ECS::ClusterCapacityProviderAssociations
###ECS Cluster
  EcsCluster97242B84:
    Properties:
      ClusterName: ECSWorkshopCluster
    Type: AWS::ECS::Cluster

###ALB
  ECSWorkshopALB16FD2A0F:
    DependsOn:
    - PublicRouteTableDefaultECS
    - PublicSubnet0RouteTableAssociation0ECS
    - PublicSubnet1RouteTableAssociation1ECS
    Properties:
      LoadBalancerAttributes:
      - Key: deletion_protection.enabled
        Value: 'false'
      Name: ECSWorkshopALB
      Scheme: internet-facing
      SecurityGroups:
      - Fn::GetAtt:
        - ECSWorkshopALBSecurityGroupDF6B3F51
        - GroupId
      Subnets:
      - Ref: ECSWSPublicSubnet0
      - Ref: ECSWSPublicSubnet1
      Type: application
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
  ECSWorkshopALBECSWorkshopALBListenerA8610FAD:
    Properties:
      DefaultActions:
      - TargetGroupArn:
          Ref: ECSWorkshopALBECSWorkshopALBListenerECSGroup3924351B
        Type: forward
      LoadBalancerArn:
        Ref: ECSWorkshopALB16FD2A0F
      Port: 80
      Protocol: HTTP
    Type: AWS::ElasticLoadBalancingV2::Listener
  ECSWorkshopALBECSWorkshopALBListenerECSGroup3924351B:
    Properties:
      Port: 80
      Protocol: HTTP
      TargetGroupAttributes:
      - Key: stickiness.enabled
        Value: 'false'
      TargetType: instance
      Name: ECSWorkshopTargetGroup
      VpcId:
        Ref: EKSECSWorkshopVPC
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
###ALB Security Group
  ECSWorkshopALBSecurityGroupDF6B3F51:
    Properties:
      GroupDescription: Automatically created Security Group for ELB EcsStackECSWorkshopALB40B7F620
      GroupName: ECSWorkshopALBSecurityGroup
      SecurityGroupEgress:
        - CidrIp: 0.0.0.0/0
          Description: Allow all outbound traffic by default
          IpProtocol: '-1'
      SecurityGroupIngress:
      - CidrIp: 0.0.0.0/0
        Description: Allow from anyone on port 80
        FromPort: 80
        IpProtocol: tcp
        ToPort: 80
      VpcId:
        Ref: EKSECSWorkshopVPC
      Tags:
        - Key: Name
          Value: ECSWorkshopALBSecurityGroup
    Type: AWS::EC2::SecurityGroup
    
  ServiceD69D759B:
    DependsOn:
    - ECSWorkshopALBECSWorkshopALBListenerECSGroup3924351B
    - ECSWorkshopALBECSWorkshopALBListenerA8610FAD
    Properties:
      Cluster:
        Ref: EcsCluster97242B84
      DeploymentConfiguration:
        MaximumPercent: 200
        MinimumHealthyPercent: 50
      DesiredCount: 0
      EnableECSManagedTags: false
      HealthCheckGracePeriodSeconds: 60
      LaunchType: EC2
      LoadBalancers:
      - ContainerName: ECSWorkshopContainer
        ContainerPort: 80
        TargetGroupArn:
          Ref: ECSWorkshopALBECSWorkshopALBListenerECSGroup3924351B
      SchedulingStrategy: REPLICA
      ServiceName: ECSWorkshopService
      TaskDefinition:
        Ref: ECSWorkshopECSTaskDef74ACB4BB
    Type: AWS::ECS::Service
Outputs:
  ClusterCreatorRole:
    Description: EKS Cluster Role
    Value: !Ref EKSWSC9Role
```
:::

# ECS編概要
一般的なECS on EC2のワークロードに対してトラブルシューティングをしていきます。
構成は以下のようになっています。ここまでのリソースはCloudFormationで作成済みとなります。
![](https://storage.googleapis.com/zenn-user-upload/1c40d2d6c78c-20240119.png)

## Issue1
EC2インスタンスで自動スケーリングを作成しているにも関わらず、ECSクラスターとして登録されていないので、解決していきます。

Auto Scalingグループの設定はこちらです。

![](https://storage.googleapis.com/zenn-user-upload/51a7a6d61873-20240227.png)

しかし、実際のコンテナインスタンスは登録されていないことがECSコンソール画面から確認できます。
![](https://storage.googleapis.com/zenn-user-upload/e23b3b4579e6-20240227.png)

トラブルシューティングのプロセスにも記載されている通り、クラスターに登録するための前提条件を満たしているか、NW構成は適切か等を順に確認していきます。

何はともあれ、まずはログを確認していきましょう。
このセクションではCloudWatch Logsに***ecs-agentログ***と***ecs-initログ***が出力されているはずですので、その内容を読み取っていきます。

***ecs-agentログ***にerrorの文言があるログが出ているかと思います。以下はその例です。
```
level=error time=2024-02-27T03:56:19Z msg="Error registering container instance" error="AccessDeniedException: User: arn:aws:sts::xxxxxxxxxxxx:assumed-role/ECSEC2Role/i-056dca48216db8a88 is not authorized to perform: ecs:RegisterContainerInstance on resource: arn:aws:ecs:us-east-1:xxxxxxxxxxxx:cluster/Empty because no identity-based policy allows the ecs:RegisterContainerInstance action"
```

これから読み取れるのは、IAMの権限不足です。***AmazonEC2ContainerServiceforEC2Role***をEC2に割り当てられているロールに付与してあげます。
IAMコンソールから***ECSEC2Role***を検索し、ポリシーを追加します。

追加するとすぐにCloudWatch Logsの***ecs-agentログ***のエラーメッセージが変わります。
```
level=error time=2024-02-27T04:05:34Z msg="Error registering container instance" error="ClientException: Cluster not found."
```
[こちら](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_RegisterContainerInstance.html#API_RegisterContainerInstance_Errors)のドキュメントを見ると、まだ権限が足りていないと言われています。しかし、上述したロールにはEC2でECSを運用するために必要な権限は許可されているはずです。つまり、EC2がこのロールをうまく利用できていないということになります。

では、EC2がインスタンスに割り当てられたロールをうまく利用するとはどういうことでしょうか。EC2にはユーザーデータと呼ばれる、EC2が起動時する際に実行するスクリプト(bash形式orcloud-init形式)が指定できます。このスクリプトでyumアップデート等で必要なパッケージ更新が可能になっています。この中でインスタンスに関するメタデータ(IMDS)をチェックすることも可能となっています。
今回のワークショップではテンプレート内でスクリプトを定義しているので、ここを更新していきます。

EC2コンソールから起動テンプレート(ECSWorkshopLaunchTemplate)を選択し、アクションから以下のテンプレートに更新します。

変更点としては、以下の部分です。
```diff
- echo ECS_CLUSTER=Empty >> /etc/ecs/ecs.config
+ echo ECS_CLUSTER=ECSWorkshopCluster >> /etc/ecs/ecs.config
```
これはECS_CLUSTERという環境変数にクラスター名を指定してecs.configを書き換えています。こうすることで、ECSエージェントが実際のクラスター名を認識し、正常に起動できるようになります。

このテンプレートを使ってインスタンスを起動するために、Auto Scalingグループからインスタンスの更新を実行します。その際に起動テンプレートを先ほど更新したバージョンのものに置き換えてあげます。完了には十数分かかりますが、完了次第ECSクラスタインスタンスのコンソールを見てみると、登録されていることが確認できます。

![](https://storage.googleapis.com/zenn-user-upload/473de1cf6210-20240227.png)

以上でIssue1は完了です。

## Issue2
クラスターの起動が完了したので、実際にタスクを起動して確認しようとすると、タスクが停止されたという事象への対応になります。これは実務でもよくある内容かと思うので、非常に参考になる章かと思います。

「新しいタスクを実行」から***ECSWorkshopECSTaskDefinition***を指定してタスク起動すると、以下のエラーコードが起動したタスクID内に出力されます。
```
CannotPullContainerError: Error response from daemon: repository public.ecr.aws/nginx/nginxlatest not found: name unknown: The repository with name 'nginxlatest' does not exist in the registry with id 'nginx'
```
ここから、***nginxlatest***がリポジトリに見つからないと言われているので、[ECRパブリックリポジトリ](https://gallery.ecr.aws/nginx/nginx)から正式なイメージ情報を確認します。
結果以下のようにタスク定義を更新します。
```diff
- public.ecr.aws/nginx/nginxlatest
+ public.ecr.aws/nginx/nginx:latest
```
このタスク定義を利用して、再度タスクを起動してみます。コンテナのステータスがrunningになっていればIssue2は完了です。

![](https://storage.googleapis.com/zenn-user-upload/e430a4525f42-20240227.png)


## Issue3
サービス定義から先ほどのタスク定義を利用して、サービスを起動します。
タスク数を1に定義してサービスを起動すると、イベントタブから状況を確認できます。すると、ターゲットの登録解除が複数回行われています。

![](https://storage.googleapis.com/zenn-user-upload/77db29854e95-20240227.png)

ALBのアドレス(例：ECSWorkshopALB-96242924.us-east-1.elb.amazonaws.com)にアクセスすると、***503***か***504***が表示されているかと思います。これはサーバー側のタイムアウトが原因であり、クライアント側には問題がないエラーコードとなっています。つまり、ECSサービス側でうまく疎通が出来ていないものと推察できます。

ALBのターゲットグループの設定を確認します。すると、ターゲットのヘルスチェックに失敗しているので、ここを解決してあげる必要がありそうです。

今回のリソースとしては、ALBとECS(EC2)の通信なのでNW的に問題ないかを確認します。まずはSecurity Groupです。
ALBのSGを確認するとすべてのアウトバウンドが許可されているので、良し悪しは置いといて問題なさそうです。
![](https://storage.googleapis.com/zenn-user-upload/26858575cf27-20240227.png)

ECSのSGを確認するとインバウンドにLB(10.0.11.0/24,10.0.10.0/24)からの通信が許可されていないことが分かります。ここにアクセス元にLBのSGを指定したルールを追加してあげます。

![](https://storage.googleapis.com/zenn-user-upload/33c4f1024fb2-20240227.png)

追加するとECSのサービスコンソールで以下のメッセージが出力されていればこのIssueも完了となります。
```
service ECSWorkshopService has reached a steady state.
```

# EKS編概要


## Issue1


## Issue2


## Issue3


# リンク

https://zenn.dev/nnydtmg/articles/aws-handson-troubleshooting_in_the_cloud-1

