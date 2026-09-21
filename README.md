# ATTA!

**AIで旅をつくる → 旅先でATTA!を集める → 旅日記になる → 共有する。**

このリポジトリは、旧 `Jasmy Run` を ATTA! のMVP / Golden Pathプロトタイプへ切り替えたものです。

旧Running Appの上書き前状態は Git branch:

`backup/running-app-before-atta-20260921`

に保存しています。

## 現在のプロダクト定義

ATTA! は以下を一つの旅行体験にまとめます。

- AI旅行プランナー
- 旅のしおり
- 地図・ルート記録
- GPS到着判定
- スタンプラリー
- 写真・ひとことのMemory
- AI旅日記
- URL / iOS Share Sheetでの共有

デザインは、旅行写真・地図・余白を主役にした没入型UIを採用しています。

## Golden Path

1. ホーム
2. 新しい旅をつくる
3. AI旅程生成
4. 旅のしおり
5. 旅を確定
6. 旅行開始
7. 位置情報許可
8. Live Trip Map
9. スポット詳細
10. 到着判定
11. ATTA!スタンプ獲得
12. Memory追加
13. 地図更新
14. 旅を終了
15. AI旅日記
16. スタンプ帳
17. 旅を共有
18. Travel Story

詳細仕様は [docs/atta-golden-path.md](docs/atta-golden-path.md) を参照してください。

## 起動

Node.js 22以上を推奨します。

```sh
npm ci
npm test
npm run dev
```

ローカル:

`http://localhost:3000`

## Production Build

```sh
npm run build
```

`atta/` の内容を `dist/` へコピーします。

Vercel設定:

- Build Command: `npm run build`
- Output Directory: `dist`
- Framework Preset: Other

## 実装済み

- ATTA!デザインシステム
- モバイルファースト画面
- Trip状態の端末保存
- AI旅程生成の疑似フロー
- Golden Pathの画面遷移
- Live Mapプロトタイプ
- Spot Detail
- GPS Permission導線
- Stamp GETアニメーション
- 写真アップロード
- AIひとこと候補
- AI旅日記の疑似生成
- Stamp Book
- Web Share API / Clipboard共有
- Travel Storyプレビュー
- Offline表示
- 現在地をリアルタイム共有しないプライバシー表示

## 現在のMVP制約

この段階は**操作可能なプロダクトプロトタイプ**です。

まだ本番接続していないもの:

- 本物のLLM APIによる旅程生成
- Google Maps / Mapbox
- Places API
- バックグラウンドGPS
- 本番Geofence / 訪問認定
- クラウドDB
- 認証
- 写真クラウド保存
- 複数人共同編集
- 本番共有URLの永続化

現在の地図・旅程・AI出力・スタンプはGolden Path検証用のデモデータです。

## MVPで検証するKPI

- AI Trip Creation Rate
- Trip Confirmation Rate
- Real World Activation Rate
- 1個以上スタンプを獲得した割合
- Memory追加率
- AI旅日記生成率
- Trip共有率

最重要ループ:

```text
Plan
→ Travel
→ ATTA!
→ Remember
→ Share
```

## Privacy

- 位置情報は初期状態で非公開
- 共有ページにリアルタイム現在地を表示しない
- 旅行中の詳細ルート共有はMVPでは行わない
- 写真は現プロトタイプでは端末内Data URLとして扱う

## Repository Migration

2026-09-21:

- 旧Jasmy Runの本番Archive buildを停止
- `atta/` を新Production sourceへ変更
- ATTA! Golden Path v1を実装
- 旧Running Appはバックアップbranchに保存

