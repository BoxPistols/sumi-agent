#!/usr/bin/env bash
# GitHub Labels同期スクリプト
# 使い方:
#   .github/sync-labels.sh              -- ドライラン（変更プレビュー）
#   .github/sync-labels.sh --apply      -- 実際に同期
#   .github/sync-labels.sh --delete     -- 設定にないラベルも削除

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LABELS_FILE="$SCRIPT_DIR/labels.json"
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null)

if [ -z "$REPO" ]; then
  echo "エラー: Gitリポジトリが見つかりません。gh auth login を実行してください。"
  exit 1
fi

echo "対象リポジトリ: $REPO"
echo "設定ファイル: $LABELS_FILE"
echo ""

MODE="${1:---dry-run}"

# 既存ラベルを取得
EXISTING=$(gh label list --repo "$REPO" --json name,color,description --limit 100 2>/dev/null || echo "[]")

# labels.jsonを読み込み
LABELS=$(jq -c '.labels[]' "$LABELS_FILE")

while IFS= read -r label; do
  NAME=$(echo "$label" | jq -r '.name')
  COLOR=$(echo "$label" | jq -r '.color')
  DESC=$(echo "$label" | jq -r '.description')

  EXISTS=$(echo "$EXISTING" | jq -r --arg n "$NAME" '.[] | select(.name == $n) | .name')

  if [ -n "$EXISTS" ]; then
    if [ "$MODE" = "--apply" ] || [ "$MODE" = "--delete" ]; then
      gh label edit "$NAME" --repo "$REPO" --color "$COLOR" --description "$DESC" 2>/dev/null && \
        echo "  更新: $NAME" || echo "  スキップ: $NAME（変更なし）"
    else
      echo "  [更新予定] $NAME ($COLOR) -- $DESC"
    fi
  else
    if [ "$MODE" = "--apply" ] || [ "$MODE" = "--delete" ]; then
      gh label create "$NAME" --repo "$REPO" --color "$COLOR" --description "$DESC" && \
        echo "  作成: $NAME"
    else
      echo "  [作成予定] $NAME ($COLOR) -- $DESC"
    fi
  fi
done <<< "$LABELS"

# --delete モード: 設定にないラベルを削除
if [ "$MODE" = "--delete" ]; then
  echo ""
  echo "設定にないラベルの削除:"
  DEFINED_NAMES=$(jq -r '.labels[].name' "$LABELS_FILE")
  echo "$EXISTING" | jq -r '.[].name' | while IFS= read -r existing_name; do
    if ! echo "$DEFINED_NAMES" | grep -qxF "$existing_name"; then
      gh label delete "$existing_name" --repo "$REPO" --yes && \
        echo "  削除: $existing_name"
    fi
  done
fi

echo ""
if [ "$MODE" = "--dry-run" ]; then
  echo "これはドライランです。実際に同期するには: .github/sync-labels.sh --apply"
else
  echo "完了"
fi
