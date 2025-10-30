# テーマシステム仕様書 (Theme System Specification)

## 概要 (Overview)

このアプリケーションは、グローバルなライト/ダークモードテーマシステムを実装しています。開発者は今後の編集において、テーマモードを明示的に指定する必要はありません。すべてのスタイリングはCSS変数を通じて自動的に両モードに対応します。

This application implements a global light/dark mode theme system. Developers do not need to explicitly specify theme modes in future edits. All styling automatically supports both modes through CSS variables.

## アーキテクチャ (Architecture)

### 1. CSS変数ベースのテーマ (CSS Variable-Based Theming)

テーマシステムは`app/globals.css`で定義されたCSS変数をベースとしています。

#### ダークモード (Dark Mode) - デフォルト
```css
:root {
  --bg: #000000;
  --bg-elevated: #0f0f0f;
  --bg-subtle: #1a1a1a;
  --bg-glass: rgba(20, 20, 20, 0.7);
  --text: #ffffff;
  --text-muted: #8a8a8a;
  --border: #2a2a2a;
  --accent: #facc15;
  --accent-hover: #fbbf24;
  --accent-glow: rgba(250, 204, 21, 0.3);
  --accent-subtle: rgba(250, 204, 21, 0.1);
}
```

#### ライトモード (Light Mode)
```css
[data-theme="light"] {
  --bg: #ffffff;
  --bg-elevated: #f8f9fa;
  --bg-subtle: #f1f3f5;
  --bg-glass: rgba(248, 249, 250, 0.9);
  --text: #1a1a1a;
  --text-muted: #6c757d;
  --border: #dee2e6;
  --accent: #eab308;
  --accent-hover: #ca8a04;
  --accent-glow: rgba(234, 179, 8, 0.2);
  --accent-subtle: rgba(234, 179, 8, 0.08);
}
```

### 2. テーマコンテキスト (Theme Context)

`lib/ThemeContext.tsx`でReact Contextを使用してテーマ状態を管理しています。

**提供される機能:**
- `theme: 'light' | 'dark'` - 現在のテーマ
- `toggleTheme: () => void` - テーマを切り替える関数
- `setTheme: (theme: Theme) => void` - テーマを直接設定する関数

**LocalStorage:**
- ユーザーのテーマ設定は`localStorage`の`'theme'`キーに保存されます
- ページリロード時も設定が保持されます

### 3. グローバル共通スタイル (Global Common Styles)

`app/globals.css`で定義されたクラスは、全てのコンポーネントで使用可能です。これらのクラスは自動的に両テーマに対応しています。

#### 利用可能なクラス:

- **`.card`** - カードコンテナ (背景、ボーダー、シャドウ)
- **`.btn`** - 基本ボタン
- **`.btn-primary`** - プライマリボタン (アクセントカラー)
- **`.input`** - テキスト入力フィールド
- **`.textarea`** - テキストエリア
- **`.select`** - セレクトボックス
- **`.badge`** - バッジ/タグ
- **`.text-muted`** - 控えめなテキスト色
- **`.glow-accent`** - アクセントグロー効果

## 新しいコンポーネント開発時のガイドライン (Guidelines for New Component Development)

### ✅ 推奨される方法 (Recommended Approach)

1. **CSS変数を使用する**
```tsx
// 良い例 - CSS変数を使用
<div style={{ color: 'var(--text)', backgroundColor: 'var(--bg)' }}>
  Content
</div>
```

2. **グローバルクラスを使用する**
```tsx
// 良い例 - グローバルクラスを使用
<div className="card">
  <button className="btn-primary">Submit</button>
</div>
```

3. **インラインスタイルでCSS変数を使用**
```tsx
// 良い例
<div style={{
  padding: '1rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-elevated)'
}}>
  Content
</div>
```

### ❌ 避けるべき方法 (Approaches to Avoid)

1. **ハードコードされた色を使用しない**
```tsx
// 悪い例 - ハードコードされた色
<div style={{ color: '#ffffff', backgroundColor: '#000000' }}>
  Content
</div>
```

2. **テーマに基づく条件分岐を避ける**
```tsx
// 悪い例 - 不必要なテーマ条件分岐
const { theme } = useTheme()
<div style={{ color: theme === 'light' ? '#000' : '#fff' }}>
  Content
</div>

// 良い例 - CSS変数を使用
<div style={{ color: 'var(--text)' }}>
  Content
</div>
```

## CSS変数リファレンス (CSS Variables Reference)

### 背景色 (Background Colors)
- `--bg` - メイン背景色
- `--bg-elevated` - エレベーテッド背景色 (カード、入力フィールド等)
- `--bg-subtle` - 控えめな背景色 (ホバー状態、セカンダリ背景)
- `--bg-glass` - グラスモーフィズム背景色 (半透明)

### テキスト色 (Text Colors)
- `--text` - メインテキスト色
- `--text-muted` - 控えめなテキスト色 (ラベル、説明文等)

### ボーダー (Borders)
- `--border` - ボーダー色

### アクセントカラー (Accent Colors)
- `--accent` - メインアクセントカラー (黄色)
- `--accent-hover` - ホバー時のアクセントカラー
- `--accent-glow` - アクセントグロー効果
- `--accent-subtle` - 控えめなアクセント背景

## テーマ切り替えの実装 (Implementing Theme Toggle)

既に`app/page.tsx`のヘッダーにテーマ切り替えボタンが実装されています。

```tsx
import { useTheme } from '@/lib/ThemeContext'

function MyComponent() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button onClick={toggleTheme}>
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )
}
```

## テーマ特有のスタイル調整 (Theme-Specific Style Adjustments)

ほとんどの場合、CSS変数で対応できますが、特定のテーマでのみ調整が必要な場合は、以下のようにセレクタを使用します:

```css
/* 両テーマ共通 */
.my-element {
  padding: 1rem;
  border: 1px solid var(--border);
}

/* ライトモード専用の調整 */
[data-theme="light"] .my-element {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

/* ダークモード専用の調整 */
[data-theme="dark"] .my-element {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}
```

**注意:** `:root`はダークモードのデフォルトなので、`[data-theme="dark"]`セレクタは不要です。

## ファイル構造 (File Structure)

```
app/
├── globals.css           # グローバルCSS変数とスタイル
├── layout.tsx            # ThemeProviderをラップ
├── providers.tsx         # クライアントコンポーネントプロバイダー
└── page.tsx              # テーマ切り替えボタンを含むメインページ

lib/
└── ThemeContext.tsx      # テーマコンテキストとプロバイダー
```

## テスト方法 (Testing)

1. **ブラウザで確認**
   - アプリケーションを起動: `npm run dev`
   - http://localhost:3000 にアクセス
   - ヘッダーの☀️/🌙ボタンをクリックしてテーマを切り替え
   - 全てのページとコンポーネントで可読性を確認

2. **LocalStorage確認**
   - ブラウザのDevToolsを開く
   - Application > Local Storage > http://localhost:3000
   - `theme`キーの値が`'light'`または`'dark'`であることを確認

3. **ページリロード**
   - テーマを切り替え
   - ページをリロード
   - テーマ設定が保持されていることを確認

## トラブルシューティング (Troubleshooting)

### テーマが切り替わらない
- ブラウザのコンソールでエラーを確認
- `document.documentElement.getAttribute('data-theme')`でテーマ属性を確認
- LocalStorageの`theme`キーを確認

### スタイルが適用されない
- CSS変数名のスペルミスを確認
- `var(--変数名)`の構文が正しいか確認
- グローバルクラス名が正しいか確認

### 一部のコンポーネントでテーマが反映されない
- ハードコードされた色が使用されていないか確認
- CSS変数を使用しているか確認
- `globals.css`が正しくインポートされているか確認

## 今後の拡張 (Future Extensions)

システムは以下の拡張に対応できます:

1. **追加テーマ** - 新しい`[data-theme="テーマ名"]`セレクタを追加
2. **システムテーマ連動** - `prefers-color-scheme`メディアクエリを使用
3. **テーマカスタマイズ** - ユーザーが独自のカラーパレットを設定
4. **アニメーション** - テーマ切り替え時のトランジション効果

## マイクロインタラクション (Micro-interactions)

シンプルでモダンなマイクロインタラクションが組み込まれています:

### セレクトボックス
- **カスタム矢印**: ダークモード/ライトモード対応
- **ホバー時**: 矢印が黄色に変化
- **フォーカス時**: 矢印が反転（上向き）＋ アクセントカラーのグロー
- **選択時**: 選択肢の背景色が黄色に（青ではなく）

### 入力フィールド & テキストエリア
- **フォーカス時**: アクセントカラーのグロー
- **選択時**: テキスト選択の背景色が黄色（青ではなく）

### ボタン
- **ホバー時**: ボーダー色変更
- **シンプル**: 過度なアニメーションなし

### トランジション
- すべてのインタラクションに `0.15s ease` を使用
- 控えめでスムーズな動き

## まとめ (Summary)

- ✅ CSS変数を使用してテーマをサポート
- ✅ グローバルクラスを活用
- ✅ ハードコードされた色を避ける
- ✅ LocalStorageで設定を永続化
- ✅ 両テーマで自動的に動作
- ✅ モダンなマイクロインタラクションを全要素に実装

このシステムにより、開発者は「ライトモード」「ダークモード」を意識せずに、CSS変数を使用するだけで自動的に両モードに対応したUIを構築できます。さらに、すべてのインタラクティブ要素が洗練されたマイクロインタラクションで強化されています。
