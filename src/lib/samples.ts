// ═══ デモ用サンプル文書 ═══
// 「サンプルで試す」ボタンが読み込む架空の履歴書・名簿データ。
// 検出エンジンの挙動確認にも使うため、本文（改行・記号を含む）は変更しないこと。

export type SampleKey = 'pdf' | 'xlsx' | 'csv' | 'text'

export interface SampleDocument {
  /** 画面に表示するファイル名 */
  name: string
  /** 形式ラベル（解析結果のメタ情報として表示される） */
  format: string
  /** ページ数。ページ概念のない形式は null */
  pageCount: number | null
  /** 抽出済みテキストとして扱う本文 */
  text: string
}

export const SAMPLES: Record<SampleKey, SampleDocument> = {
  pdf: {
    name: 'sample_resume.pdf',
    format: 'PDF',
    pageCount: 2,
    text: `--- Page 1 ---\n職務経歴書\n\n氏名：田中 太郎\nフリガナ：タナカ タロウ\n生年月日：1990年4月15日\n住所：東京都渋谷区神宮前3-14-5 メゾンド原宿 402号室\n〒150-0001\n電話番号：090-1234-5678\nメール：tanaka.taro@example.com\nポートフォリオ：https://tanaka-portfolio.vercel.app/works\nGitHub：https://github.com/tanaka-taro-dev\n\n職務要約\nWebアプリケーション開発に10年従事。フロントエンドからバックエンドまで幅広い経験を持つフルスタックエンジニア。\n\n--- Page 2 ---\n職務経歴\n\n株式会社テックフロンティア（2020年4月 - 現在）\n役職：シニアフロントエンドエンジニア / テックリード\n所在地：東京都港区六本木1-8-7\n上司：鈴木 健太（開発部長）\nプロジェクト概要：\n- 大規模ECサイトのフロントエンド刷新（React / TypeScript / Next.js）\n- デザインシステムの構築・運用（Storybook / Figma連携）\n参考URL：https://techfrontier.co.jp/about\n\n株式会社デジタルクリエイト（2015年4月 - 2020年3月）\n役職：Webエンジニア\n所在地：大阪府大阪市北区梅田2-5-10\n担当：佐藤 由美子（プロジェクトマネージャー）\n連絡先メール：sato.yumiko@digitalcreate.co.jp\n\n資格\n- 基本情報技術者試験（2014年取得）\n- AWS Solutions Architect Associate（2019年取得）\nマイナンバー：1234 5678 9012\n\n以上`,
  },
  xlsx: {
    name: 'sample_employee_list.xlsx',
    format: 'Excel',
    pageCount: 1,
    text: `--- Sheet: 社員一覧 ---\n社員番号 | 氏名 | フリガナ | 生年月日 | 住所 | 電話番号 | メール | 部署\nEMP-001 | 高橋 翔太 | タカハシ ショウタ | 1988年7月22日 | 神奈川県横浜市西区みなとみらい2-3-1 | 045-123-4567 | takahashi.shota@company.co.jp | 開発部\nEMP-002 | 山田 美咲 | ヤマダ ミサキ | 1992年11月3日 | 東京都世田谷区三軒茶屋1-28-6 | 03-9876-5432 | yamada.misaki@company.co.jp | デザイン部\nEMP-003 | 佐藤 大介 | サトウ ダイスケ | 1985年2月14日 | 千葉県船橋市本町5-7-3 | 080-5555-1234 | sato.daisuke@company.co.jp | 営業部\nEMP-004 | 渡辺 結衣 | ワタナベ ユイ | 1995年8月30日 | 埼玉県さいたま市浦和区高砂3-1-4 | 090-8765-4321 | watanabe.yui@company.co.jp | 人事部\nEMP-005 | 伊藤 康平 | イトウ コウヘイ | 1990年12月1日 | 東京都品川区大崎1-11-2 | 03-1111-2222 | ito.kohei@company.co.jp | 開発部\n\n管理者 | 連絡先\n鈴木 裕子（人事部長） | suzuki.yuko@company.co.jp\n加藤 誠（総務部長） | kato.makoto@company.co.jp\n参照：https://company-intra.example.com/hr/employee-list`,
  },
  csv: {
    name: 'sample_applicants.csv',
    format: 'CSV (utf-8)',
    pageCount: null,
    text: `応募者ID | 氏名 | 年齢 | 電話番号 | メール | 住所 | 応募職種\nAP-2024-001 | 森田 浩 | 35 | 070-1234-5678 | morita.hiroshi@gmail.com | 東京都中央区日本橋2-7-1 | バックエンドエンジニア\nAP-2024-002 | 小林 陽菜 | 28 | 080-9876-5432 | kobayashi.hina@outlook.jp | 大阪府大阪市中央区難波5-1-60 | UIデザイナー\nAP-2024-003 | 加藤 拓也 | 42 | 090-1111-3333 | kato.takuya@yahoo.co.jp | 愛知県名古屋市中区栄3-18-1 | PM\nAP-2024-004 | 井上 愛 | 31 | 03-4444-7777 | inoue.ai@icloud.com | 福岡県福岡市博多区博多駅前2-1-1 | FE\nAP-2024-005 | 木村 悠人 | 26 | 080-2222-8888 | kimura.yuto@proton.me | 北海道札幌市中央区大通西4丁目 | DE\n担当者: 松本 由美 連絡先: matsumoto.yumi@recruit-agency.co.jp`,
  },
  text: {
    name: 'sample_career.txt',
    format: 'Text (utf-8)',
    pageCount: null,
    text: `職務経歴書\n\n基本情報\n氏名：佐々木 直樹\n生年月日：昭和63年5月20日\n現住所：東京都新宿区西新宿2-8-1 都庁前マンション305号\n〒163-0001\n電話：03-3344-5566\n携帯：090-7788-9900\nE-mail：sasaki.naoki@example.net\nLinkedIn：https://www.linkedin.com/in/naoki-sasaki-tokyo\n\n経歴詳細\n\n(1) 株式会社グローバルテック 2019年1月 - 現在\n所在地：東京都千代田区丸の内1-9-2\n直属上司：山口 慎一（CTO）\n社内ブログ：https://tech.globaltech.co.jp/blog/sasaki\n\n(2) 合同会社クラウドワークス 2014年4月 - 2018年12月\n所在地：大阪府大阪市北区中之島3-2-18\nプロジェクト責任者：中村 和也\n\n(3) 有限会社ウェブデザインラボ 2009年4月 - 2014年3月\n所在地：京都府京都市下京区四条烏丸1-5-3\n連絡先: weblab-hr@designlab.co.jp\n\nスキル\n言語: TypeScript, Python, Go, SQL\nFW: React, Next.js, FastAPI, Echo\n\n以上\nマイナンバー：9876 5432 1098`,
  },
}
