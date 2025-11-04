# GCP Cloud Run デプロイ手順

このガイドでは、GCP Cloud RunへのデプロイとGitHubからの自動デプロイ設定を説明します。

## 🚀 クイックスタート

### 前提条件
- Googleアカウント
- クレジットカード（無料枠内で使用可能）
- Git / GitHub

---

## ステップ1: GCPプロジェクト作成

### 1.1 GCPコンソールにアクセス
https://console.cloud.google.com/

### 1.2 新しいプロジェクトを作成
1. 画面上部の「プロジェクトを選択」をクリック
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を入力（例: `speech-to-text-app`）
4. 「作成」をクリック

### 1.3 請求先アカウントを設定
1. 左メニュー → 「お支払い」
2. クレジットカード情報を登録
   - **無料枠**: 月200万リクエスト無料
   - 初回$300分のクレジット付与

---

## ステップ2: 必要なAPIを有効化

GCPコンソールで以下のAPIを有効化：

```bash
# Cloud BuildとCloud Runを有効化
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

または、コンソールから手動で有効化：
1. 「APIとサービス」 → 「ライブラリ」
2. 検索して有効化：
   - Cloud Build API
   - Cloud Run API
   - Container Registry API

---

## ステップ3: gcloud CLIのインストール

### Windows
1. https://cloud.google.com/sdk/docs/install からインストーラーをダウンロード
2. インストール後、PowerShellを再起動
3. 初期化:
```powershell
gcloud init
```

### Mac/Linux
```bash
# インストール
curl https://sdk.cloud.google.com | bash

# 再起動後
exec -l $SHELL

# 初期化
gcloud init
```

### 認証とプロジェクト設定
```bash
# Googleアカウントでログイン
gcloud auth login

# プロジェクトを選択
gcloud config set project YOUR_PROJECT_ID

# デフォルトリージョンを設定（日本）
gcloud config set run/region asia-northeast1
```

---

## ステップ4: 手動デプロイ（初回）

### 方法1: シェルスクリプトを使用（推奨）

```bash
# スクリプトに実行権限を付与
chmod +x deploy-gcp.sh

# デプロイ実行
./deploy-gcp.sh
```

### 方法2: 手動コマンド

```bash
# プロジェクトIDを設定
export PROJECT_ID="your-project-id"

# コンテナをビルド
gcloud builds submit --tag gcr.io/$PROJECT_ID/speech-to-text

# Cloud Runにデプロイ
gcloud run deploy speech-to-text \
  --image gcr.io/$PROJECT_ID/speech-to-text \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --max-instances 10
```

デプロイ完了後、URLが表示されます:
```
Service [speech-to-text] revision [speech-to-text-00001-xxx] has been deployed
and is serving 100 percent of traffic.
Service URL: https://speech-to-text-xxxxx-an.a.run.app
```

---

## ステップ5: GitHubからの自動デプロイ設定

### 5.1 Cloud Buildトリガーの作成

1. GCPコンソール → **Cloud Build** → **トリガー**
2. 「トリガーを作成」をクリック
3. 設定:
   - **名前**: `deploy-on-push`
   - **イベント**: `ブランチにpush`
   - **ソース**: GitHubを選択
   - **リポジトリ**: `Asaoman/speechtotext`を接続
   - **ブランチ**: `^main$`
   - **Cloud Build構成ファイル**: `/cloudbuild.yaml`
4. 「作成」をクリック

### 5.2 GitHubリポジトリを接続

初回のみGitHubアカウントの認証が必要:
1. 「GitHubアカウントに接続」
2. GitHubでアクセス許可
3. リポジトリを選択

### 5.3 自動デプロイのテスト

```bash
# 何か変更をコミット＆プッシュ
git add .
git commit -m "Test auto deployment"
git push origin main
```

Cloud Buildが自動的に開始され、デプロイされます。

---

## ステップ6: 環境変数の設定

### Cloud Runコンソールから設定

1. GCPコンソール → **Cloud Run** → サービス選択
2. 「新しいリビジョンの編集とデプロイ」
3. 「変数とシークレット」タブ
4. 環境変数を追加:

```
NODE_ENV=production
NEXT_PUBLIC_BASE_URL=https://your-service-url.a.run.app
```

### コマンドラインから設定

```bash
gcloud run services update speech-to-text \
  --region asia-northeast1 \
  --update-env-vars \
  NODE_ENV=production,\
  NEXT_PUBLIC_BASE_URL=https://your-url.a.run.app
```

---

## ステップ7: カスタムドメインの設定（オプション）

### 7.1 ドメインマッピング

1. Cloud Run → サービス → 「ドメインのマッピング」
2. 「ドメインを追加」
3. あなたのドメインを入力
4. 表示されるDNSレコードをドメインプロバイダーに追加

例: `app.yourdomain.com`

### 7.2 DNSレコード

Cloud Consoleに表示される値を設定:
```
タイプ: CNAME
名前: app
値: ghs.googlehosted.com
```

---

## 📊 コストの確認

### リアルタイム監視
GCPコンソール → **請求** → **レポート**

### 無料枠の内容
- **リクエスト**: 200万/月
- **CPU時間**: 360,000 vCPU秒/月
- **メモリ**: 180,000 GiB秒/月
- **ネットワーク（egress）**: 1GB/月（北米）

### 想定コスト（無料枠超過後）
- 10万リクエスト/月: **$0〜5**
- 100万リクエスト/月: **$10〜30**
- 1000万リクエスト/月: **$100〜200**

---

## 🔧 トラブルシューティング

### ビルドエラー

```bash
# ローカルでテストビルド
docker build -t test-image .
docker run -p 8080:8080 test-image
```

### デプロイ失敗

```bash
# ログを確認
gcloud run services logs read speech-to-text --region asia-northeast1

# サービスの詳細を確認
gcloud run services describe speech-to-text --region asia-northeast1
```

### メモリ不足エラー

メモリを増やす:
```bash
gcloud run services update speech-to-text \
  --region asia-northeast1 \
  --memory 4Gi
```

---

## 🎯 ベストプラクティス

### 1. リソース最適化
```yaml
# cloudbuild.yamlで設定
--memory 2Gi    # 通常は2GBで十分
--cpu 2         # CPUは2コア
--max-instances 10  # 最大インスタンス数
```

### 2. タイムアウト設定
```yaml
--timeout 3600  # 1時間（大きなファイル処理用）
```

### 3. リージョン選択
- **日本**: `asia-northeast1` (東京)
- **米国**: `us-central1`
- **ヨーロッパ**: `europe-west1`

### 4. モニタリング
- Cloud Logging: エラーログ
- Cloud Monitoring: パフォーマンス監視
- Cloud Trace: リクエストトレース

---

## 🔐 セキュリティ

### 認証が必要な場合

```bash
# 認証を必須にする
gcloud run services update speech-to-text \
  --region asia-northeast1 \
  --no-allow-unauthenticated
```

### シークレットの管理

Secret Managerを使用:
```bash
# シークレットを作成
echo -n "your-api-key" | gcloud secrets create openai-api-key --data-file=-

# Cloud Runで使用
gcloud run services update speech-to-text \
  --update-secrets OPENAI_API_KEY=openai-api-key:latest
```

---

## 📚 参考リンク

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Pricing Calculator](https://cloud.google.com/products/calculator)
- [GCP Free Tier](https://cloud.google.com/free)

---

## ✅ チェックリスト

- [ ] GCPプロジェクト作成
- [ ] 請求先アカウント設定
- [ ] 必要なAPI有効化
- [ ] gcloud CLI インストール
- [ ] 初回デプロイ成功
- [ ] GitHubトリガー設定
- [ ] カスタムドメイン設定（オプション）
- [ ] 環境変数設定
- [ ] モニタリング設定

---

## 🆘 サポート

問題が発生した場合:
1. [GCP Status Dashboard](https://status.cloud.google.com/)
2. [Stack Overflow](https://stackoverflow.com/questions/tagged/google-cloud-run)
3. [GCP Community](https://www.googlecloudcommunity.com/)
