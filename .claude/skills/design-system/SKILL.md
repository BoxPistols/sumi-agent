---
name: design-system
description: Sumi のUI/スタイルを変更するとき必ず読む。カラートークン(T/C)の使い分け、コントラスト基準(4.5:1)、ボタン階層(Primary1つ/画面)、ライト・ダーク両テーマ対応、aria-label規約、進捗表示(n/N)の必須化。UIコンポーネント追加・色変更・CSS編集・ツアー/モーダル変更・ボタン追加のタスクで使用する。
---

# Sumi デザインシステム適用ガイド

UIを変更する前に `docs/DESIGN.md` を読むこと。このスキルは作業手順の要約。

## 変更前

1. `docs/DESIGN.md` の該当セクションを読む（色→§2-3、ボタン→§6、テーマ→§7）
2. 使う色がトークン表にあるか確認。**新色の直書きは原則禁止**
3. 塗り背景 × 文字色の組み合わせは、先にコントラスト比を計算する:

```bash
node -e "
function lum(h){h=h.replace('#','');const v=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(s=>s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4);return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]}
function cr(a,b){const x=lum(a),y=lum(b);return((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)}
console.log(cr(process.argv[1],process.argv[2]))" '#ffffff' '#7c3aed'
```

基準: 本文・ボタン文字 4.5:1 / 大きい文字・UI境界 3:1。グラデーションは両端で満たす。

## 実装時の鉄則

- 色は `T.*` / `var(--rp-*)` 経由。`#fff` 直書きは両テーマ固定と確認できた場合のみ
- Primary ボタンは `background:T.accent` + `color:T.bg`（`#fff`固定はダークで消える）。**1画面に1つ**
- 可視テキストを持つボタンは同じ文言の `aria-label` を明示（`Btn` は title がアクセシブルネームに化ける）
- ステップ型UI・ツアーには「現在地 / 全体数」(`7 / 12`) を数字で表示。`tabular-nums` を使う
- `[data-theme='light']` の上書きは詳細度と記述順に注意（ベース規則より後に、同等以上の詳細度で）
- `currentcolor` は小文字

## 変更後の検証

1. `pnpm build && pnpm test && pnpm lint && pnpm type-check`
2. 新しい色の組み合わせを `src/lib/__tests__/a11y-contrast.test.ts` に追加
3. ライト・ダーク両テーマのスクリーンショットで目視確認（`pnpm dev` またはローカル `next start`）
4. UI構造を変えた場合は `pnpm test:e2e`
5. `docs/DESIGN.md` §8 のチェックリストを通す

## よくある失敗（実例）

- intro.js「次へ」: `[data-theme='light'] .introjs-button` (0,2,0) が `.introjs-nextbutton` (0,1,0) に勝ち、紫地に黒文字 1.79:1 → プライマリ上書きを後段に追加して修正
- `#a78bfa` 塗り + 白文字 = 2.72:1 で不合格。紫の塗りは `#7c3aed`〜`#6d28d9` を使う
- ダークテーマで `color:#fff` 固定 + `background:T.accent`(=白) → 白地に白文字
