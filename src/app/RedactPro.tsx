// @ts-nocheck
/* eslint-disable */
"use client"

/**
 * RedactPro v0.9 - Monolith (migrating to modular architecture)
 * TODO: Decompose into modules (see docs/REFACTOR_PLAN.md)
 */

// ═══ Storage Compatibility Layer ═══
// Artifact environment uses window.storage API, Next.js uses localStorage
const storage = {
  async get(key) {
    try {
      if (typeof window !== 'undefined' && window.storage?.get) {
        const r = await window.storage.get(key);
        return r?.value || null;
      }
      return localStorage.getItem(key);
    } catch { return null; }
  },
  async set(key, val) {
    try {
      if (typeof window !== 'undefined' && window.storage?.set) {
        try { await window.storage.delete(key); } catch {}
        await window.storage.set(key, val);
        return;
      }
      localStorage.setItem(key, val);
    } catch (e) { console.warn('storage set failed:', key, e); }
  },
  async del(key) {
    try {
      if (typeof window !== 'undefined' && window.storage?.delete) {
        await window.storage.delete(key);
        return;
      }
      localStorage.removeItem(key);
    } catch {}
  }
};

import { useState, useRef, useCallback, useMemo, useEffect, createContext, useContext } from "react";
import * as mammoth from "mammoth";
import * as Papa from "papaparse";
import * as XLSX from "xlsx";

// ═══ Theme System (CSS Custom Properties) ═══
const C={accent:"#4C85F6",accentDim:"rgba(76,133,246,0.12)",red:"#F05656",redDim:"rgba(240,86,86,0.1)",green:"#36C78A",greenDim:"rgba(54,199,138,0.1)",amber:"#DDA032",amberDim:"rgba(221,160,50,0.1)",purple:"#9B6DFF",purpleDim:"rgba(155,109,255,0.1)",cyan:"#22D3EE",cyanDim:"rgba(34,211,238,0.1)",font:"'Noto Sans JP','DM Sans',system-ui,sans-serif",mono:"'JetBrains Mono','Fira Code',monospace"};
const T={...C,bg:"var(--rp-bg)",bg2:"var(--rp-bg2)",surface:"var(--rp-surface)",surfaceAlt:"var(--rp-surfaceAlt)",border:"var(--rp-border)",text:"var(--rp-text)",text2:"var(--rp-text2)",text3:"var(--rp-text3)",diffAdd:"var(--rp-diffAdd)",diffDel:"var(--rp-diffDel)",diffAddBorder:"var(--rp-diffAddBorder)",diffDelBorder:"var(--rp-diffDelBorder)"};

// ═══ Multi-Provider AI Models ═══
const AI_PROVIDERS=[
  {id:"anthropic",label:"Claude",icon:"C",color:"#D97706",needsKey:false,models:[
    {id:"claude-haiku-4-5-20251001",label:"Haiku 4.5",desc:"高速・低コスト",tier:1},
    {id:"claude-sonnet-4-20250514",label:"Sonnet 4",desc:"バランス型（推奨）",tier:2},
    {id:"claude-sonnet-4-5-20250929",label:"Sonnet 4.5",desc:"高精度",tier:3},
  ],defaultModel:"claude-sonnet-4-20250514"},
  {id:"openai",label:"OpenAI",icon:"O",color:"#10A37F",needsKey:false,models:[
    {id:"gpt-4.1-nano",label:"GPT-4.1 Nano",desc:"旧世代・超軽量",tier:1},
    {id:"gpt-4.1-mini",label:"GPT-4.1 Mini",desc:"旧世代・低コスト",tier:2},
    {id:"gpt-5-nano",label:"GPT-5 Nano",desc:"最速・最安（推奨）",tier:1},
    {id:"gpt-5-mini",label:"GPT-5 Mini",desc:"高速・高精度",tier:2},
  ],defaultModel:"gpt-5-nano"},
  {id:"google",label:"Gemini",icon:"G",color:"#4285F4",needsKey:true,models:[
    {id:"gemini-2.0-flash",label:"2.0 Flash",desc:"軽量・高速",tier:1},
    {id:"gemini-2.5-flash",label:"2.5 Flash",desc:"バランス型",tier:2},
    {id:"gemini-2.5-pro",label:"2.5 Pro",desc:"高精度",tier:3},
  ],defaultModel:"gemini-2.5-flash"},
];

// Backward-compat flat list
const AI_MODELS=AI_PROVIDERS.flatMap(p=>p.models.map(m=>({...m,provider:p.id})));

function getProviderConfig(providerId) {
    return AI_PROVIDERS.find((p) => p.id === providerId) || null
}

function getProviderMaxTier(providerId) {
    const prov = getProviderConfig(providerId)
    if (!prov || !prov.models || prov.models.length === 0) return 1
    return Math.max(...prov.models.map((m) => m.tier || 1))
}

function getPreferredTierModel(providerId, tier) {
    const prov = getProviderConfig(providerId)
    if (!prov || !prov.models || prov.models.length === 0) return null
    const candidates = prov.models.filter((m) => (m.tier || 1) === tier)
    if (candidates.length === 0) return null
    return candidates[candidates.length - 1].id
}

function getModelTier(providerId, modelId) {
    const prov = getProviderConfig(providerId)
    const m = prov?.models?.find((mm) => mm.id === modelId)
    return m?.tier || null
}

function pickFormatModelForProfile(providerId, profile) {
    const prov = getProviderConfig(providerId)
    if (!prov || !prov.models || prov.models.length === 0) return null
    const maxTier = getProviderMaxTier(providerId)
    const targetTier =
        profile === 'speed' ? 1 : profile === 'balanced' ? 2 : maxTier
    return (
        getPreferredTierModel(providerId, targetTier) ||
        getPreferredTierModel(providerId, Math.min(2, maxTier)) ||
        prov.defaultModel ||
        prov.models[prov.models.length - 1]?.id ||
        null
    )
}

function getModelsForRun(settings) {
    const providerId =
        settings?.provider || getProviderForModel(settings?.model)
    const profile = settings?.aiProfile || 'balanced'
    const maxTier = getProviderMaxTier(providerId)
    const formatModel =
        settings?.model ||
        pickFormatModelForProfile(providerId, profile) ||
        'gpt-5-nano'
    const formatTier = getModelTier(providerId, formatModel) || 1
    const formatFallbackModel =
        formatTier <= 1
            ? getPreferredTierModel(providerId, Math.min(2, maxTier))
            : null
    const detectTier = profile === 'quality' ? Math.min(2, maxTier) : 1
    const detectModel =
        getPreferredTierModel(providerId, detectTier) ||
        getPreferredTierModel(providerId, 1) ||
        formatModel
    const detectFallbackModel =
        detectTier < maxTier
            ? getPreferredTierModel(providerId, detectTier + 1)
            : null
    return {
        providerId,
        profile,
        detectModel,
        detectFallbackModel,
        formatModel,
        formatFallbackModel,
    }
}

const CATEGORIES={name:{label:"氏名",color:C.red,bg:C.redDim},contact:{label:"連絡先",color:C.accent,bg:C.accentDim},address:{label:"住所・地名",color:C.amber,bg:C.amberDim},personal:{label:"個人情報",color:C.purple,bg:C.purpleDim},web:{label:"URL",color:C.cyan,bg:C.cyanDim},organization:{label:"組織名",color:"#8490A8",bg:"rgba(132,144,168,0.1)"},photo:{label:"顔写真",color:C.red,bg:C.redDim}};

const DEFAULT_MASK={name:true,contact:true,address:true,personal:true,web:true,organization:false,keepPrefecture:true,nameInitial:false};
const MASK_PRESETS=[
  {id:"basic",label:"基本",desc:"氏名 + 連絡先のみ",level:1,mask:{name:true,contact:true,address:false,personal:false,web:false,organization:false,keepPrefecture:true,nameInitial:false}},
  {id:"std",label:"標準",desc:"+ 住所・年月日・URL",level:2,mask:{name:true,contact:true,address:true,personal:true,web:true,organization:false,keepPrefecture:true,nameInitial:false}},
  {id:"strict",label:"厳格",desc:"組織名含む全項目",level:3,mask:{name:true,contact:true,address:true,personal:true,web:true,organization:true,keepPrefecture:false,nameInitial:false}},
];

const EXPORT_FORMATS=[
  {id:"txt",label:"Text",ext:".txt",icon:"T"},
  {id:"md",label:"Markdown",ext:".md",icon:"M"},
  {id:"csv",label:"CSV",ext:".csv",icon:"C"},
  {id:"xlsx",label:"Excel",ext:".xlsx",icon:"X"},
  {id:"pdf",label:"PDF (印刷)",ext:"",icon:"P"},
  {id:"docx",label:"Word",ext:".docx",icon:"W"},
];

const CSS = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
[data-theme="dark"]{--rp-bg:#181A21;--rp-bg2:#1F222B;--rp-surface:#262A36;--rp-surfaceAlt:#2D3240;--rp-border:#3D4258;--rp-text:#D3D6E0;--rp-text2:#9DA1B3;--rp-text3:#6E7388;--rp-diffAdd:#1B3326;--rp-diffDel:#331B1B;--rp-diffAddBorder:#2A5A3A;--rp-diffDelBorder:#5A2A2A;--rp-scrollThumb:#3D4258}
[data-theme="light"]{--rp-bg:#F5F6FA;--rp-bg2:#FFFFFF;--rp-surface:#FFFFFF;--rp-surfaceAlt:#EDEEF4;--rp-border:#D5D8E0;--rp-text:#1C1E27;--rp-text2:#5C6173;--rp-text3:#838799;--rp-diffAdd:#E8F5E9;--rp-diffDel:#FFEBEE;--rp-diffAddBorder:#A5D6A7;--rp-diffDelBorder:#EF9A9A;--rp-scrollThumb:#C4C7D0}
body{background:var(--rp-bg);font-size:14px}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--rp-scrollThumb);border-radius:3px}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes slideIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
@keyframes detFlashA{0%{box-shadow:0 0 0 0 rgba(76,133,246,0);filter:saturate(1)}20%{box-shadow:0 0 0 2px rgba(76,133,246,.45),0 0 0 10px rgba(76,133,246,.12);filter:saturate(1.2)}60%{box-shadow:0 0 0 2px rgba(76,133,246,.28),0 0 0 14px rgba(76,133,246,.06);filter:saturate(1.15)}100%{box-shadow:0 0 0 0 rgba(76,133,246,0);filter:saturate(1)}}
@keyframes detFlashB{0%{box-shadow:0 0 0 0 rgba(76,133,246,0);filter:saturate(1)}20%{box-shadow:0 0 0 2px rgba(76,133,246,.45),0 0 0 10px rgba(76,133,246,.12);filter:saturate(1.2)}60%{box-shadow:0 0 0 2px rgba(76,133,246,.28),0 0 0 14px rgba(76,133,246,.06);filter:saturate(1.15)}100%{box-shadow:0 0 0 0 rgba(76,133,246,0);filter:saturate(1)}}
@media(max-width:768px){.rp-header-badges{display:none!important}.rp-editor-wrap{flex-direction:column!important}.rp-editor-left{border-right:none!important;border-bottom:1px solid var(--rp-border)!important;max-height:45vh!important}.rp-editor-right{max-width:none!important;min-width:0!important}.rp-upload-grid{grid-template-columns:1fr!important}.rp-upload-main{grid-template-columns:1fr!important}.rp-modal-inner{max-width:100%!important;max-height:100vh!important;border-radius:0!important}.rp-settings-models{grid-template-columns:1fr!important}.rp-view-tabs{flex-wrap:wrap!important}.rp-cat-grid{grid-template-columns:1fr!important}.rp-input-tabs button{font-size:12px!important;padding:10px 4px!important}.rp-design-controls{width:100%!important;max-height:40vh!important;border-right:none!important;border-bottom:1px solid var(--rp-border)!important}}
@media(max-width:480px){.rp-header{padding:0 12px!important}.rp-header h1{font-size:14px!important}}`

// ═══ Unified AI Call (via server-side proxy) ═══
async function callAI({provider,model,messages,maxTokens=4000,apiKey,system}){
  const res=await fetch("/api/ai",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({provider,model,messages,maxTokens,system,apiKey}),
  });
  if(!res.ok){
    const e=await res.json().catch(()=>({error:`HTTP ${res.status}`}));
    throw new Error(e.error||`AI API error: ${res.status}`);
  }
  const d=await res.json();
  return d.text||"";
}

function getProviderForModel(modelId){
  for(const p of AI_PROVIDERS){if(p.models.some(m=>m.id===modelId))return p.id;}
  return 'openai'
}

// ═══ Name Dictionaries (expanded) ═══
const SURNAMES=["佐藤","鈴木","高橋","田中","伊藤","渡辺","山本","中村","小林","加藤","吉田","山田","佐々木","松本","井上","木村","林","斎藤","清水","山口","森","池田","橋本","阿部","石川","山崎","中島","藤田","小川","後藤","岡田","長谷川","村上","近藤","石井","斉藤","坂本","遠藤","青木","藤井","西村","福田","太田","三浦","藤原","岡本","松田","中川","中野","原田","小野","田村","竹内","金子","和田","中山","石田","上田","森田","原","柴田","酒井","工藤","横山","宮崎","宮本","内田","高木","安藤","谷口","大野","丸山","今井","河野","藤本","村田","武田","上野","杉山","増田","平野","大塚","千葉","久保","松井","小島","岩崎","桜井","野口","松尾","野村","木下","菊地","佐野","大西","杉本","新井","浜田","菅原","市川","水野","小松","島田","古川","前田","東","熊谷","小山","石原","望月","永井","平田","森本","久保田","大島","渡部","山内","飯田","内藤","川口","矢野","吉川","辻","星野","関","岩田","馬場","西田","川崎","堀","関口","片山","横田","秋山","本田","土屋","吉村","荒木","黒田","安田","奥村","大久保","野田","川上","松岡","田口","須藤","中田","荒井","小池","山下","松原","福島","福井","尾崎","服部","篠原","西川","五十嵐","北村","細川","浅野","宮田","大石","白石","南","大谷","平井","児玉","富田","松村","吉岡","大橋","中西","津田","大山","黒木","田島","栗原","今村","西山","沢田","榎本","堀内","永田","植田","向井","若林","北川","堀田","米田","広瀬","土井","梅田","高野","早川","本間","桑原","滝沢","奥田","秋元","川村","松下","竹田","大森","福本","三宅","落合","田辺","岸","栗田","横井","成田","小泉","窪田","大竹","坂口","牧野","三好","倉田","平山","高田","上原","丹羽","根本","宮川","稲葉","岩本","古賀","大平","伊東","安部","河合","河村","柳","水谷","小野寺","門田","沖田","萩原","柳田","塚本","笠原","尾上","相田","倉本","峯","戸田","北野","桑田","日高","有田","瀬戸","宗","津村","古田","柏木","友田","神田","鶴田","梶原","生田","相馬","亀山","畑","浦田"];
const GIVEN_NAMES=["太郎","一郎","二郎","三郎","健太","翔太","大輝","拓也","直樹","和也","達也","哲也","雄太","裕太","康平","大介","俊介","慎一","誠","隆","浩","豊","茂","勝","清","正","進","博","修","剛","翔","蓮","悠真","陽翔","湊","朝陽","蒼","律","悠人","大翔","陸","結翔","颯真","悠斗","樹","奏太","陽太","駿","暖","柊","花子","洋子","和子","恵子","幸子","節子","京子","美智子","由美子","真理子","裕子","順子","直子","久美子","智子","典子","康子","明美","由美","真由美","美咲","陽菜","結衣","さくら","美月","莉子","結菜","凛","葵","楓","芽依","紬","澪","心春","陽葵","詩","杏","琴音","美優","彩花","愛","優子","麻衣","里美","千尋","綾","舞","遥","彩","茜","翼","海斗","颯","悠","碧","暁","涼太","健","優","亮","純","聡","学","光","力","実","守","昇","登","望","瑛太","蒼太","大和","悠希","春樹","遼","拓海","奏","凪","煌","真央","美羽","日菜","七海","千夏","風花","美桜","瑠奈","希","柚","恵","薫","忍","操","静","光子","文子","芳子","弘子","信子","篤志","篤","敦","淳","潤","亘","渉","徹","哲","稔","満","充","均","仁","義","勇","武","章","彰","昭","明","晃","宏","弘","広","裕","祐","雄","勲","薫","馨","敬","啓","慶","恭","恵一","賢一","健一","幸一","孝一","浩一","宗一","正一","善一","泰一","忠一","哲一","徳一","秀一","英一","文一","雅之","正之","秀之","裕之","浩之","和之","隆之","博之","義之","敬之"];

const SAMPLES={
pdf:{name:"sample_resume.pdf",format:"PDF",pageCount:2,text:`--- Page 1 ---\n職務経歴書\n\n氏名：田中 太郎\nフリガナ：タナカ タロウ\n生年月日：1990年4月15日\n住所：東京都渋谷区神宮前3-14-5 メゾンド原宿 402号室\n〒150-0001\n電話番号：090-1234-5678\nメール：tanaka.taro@example.com\nポートフォリオ：https://tanaka-portfolio.vercel.app/works\nGitHub：https://github.com/tanaka-taro-dev\n\n職務要約\nWebアプリケーション開発に10年従事。フロントエンドからバックエンドまで幅広い経験を持つフルスタックエンジニア。\n\n--- Page 2 ---\n職務経歴\n\n株式会社テックフロンティア（2020年4月 - 現在）\n役職：シニアフロントエンドエンジニア / テックリード\n所在地：東京都港区六本木1-8-7\n上司：鈴木 健太（開発部長）\nプロジェクト概要：\n- 大規模ECサイトのフロントエンド刷新（React / TypeScript / Next.js）\n- デザインシステムの構築・運用（Storybook / Figma連携）\n参考URL：https://techfrontier.co.jp/about\n\n株式会社デジタルクリエイト（2015年4月 - 2020年3月）\n役職：Webエンジニア\n所在地：大阪府大阪市北区梅田2-5-10\n担当：佐藤 由美子（プロジェクトマネージャー）\n連絡先メール：sato.yumiko@digitalcreate.co.jp\n\n資格\n- 基本情報技術者試験（2014年取得）\n- AWS Solutions Architect Associate（2019年取得）\nマイナンバー：1234 5678 9012\n\n以上`},
xlsx:{name:"sample_employee_list.xlsx",format:"Excel",pageCount:1,text:`--- Sheet: 社員一覧 ---\n社員番号 | 氏名 | フリガナ | 生年月日 | 住所 | 電話番号 | メール | 部署\nEMP-001 | 高橋 翔太 | タカハシ ショウタ | 1988年7月22日 | 神奈川県横浜市西区みなとみらい2-3-1 | 045-123-4567 | takahashi.shota@company.co.jp | 開発部\nEMP-002 | 山田 美咲 | ヤマダ ミサキ | 1992年11月3日 | 東京都世田谷区三軒茶屋1-28-6 | 03-9876-5432 | yamada.misaki@company.co.jp | デザイン部\nEMP-003 | 佐藤 大介 | サトウ ダイスケ | 1985年2月14日 | 千葉県船橋市本町5-7-3 | 080-5555-1234 | sato.daisuke@company.co.jp | 営業部\nEMP-004 | 渡辺 結衣 | ワタナベ ユイ | 1995年8月30日 | 埼玉県さいたま市浦和区高砂3-1-4 | 090-8765-4321 | watanabe.yui@company.co.jp | 人事部\nEMP-005 | 伊藤 康平 | イトウ コウヘイ | 1990年12月1日 | 東京都品川区大崎1-11-2 | 03-1111-2222 | ito.kohei@company.co.jp | 開発部\n\n管理者 | 連絡先\n鈴木 裕子（人事部長） | suzuki.yuko@company.co.jp\n加藤 誠（総務部長） | kato.makoto@company.co.jp\n参照：https://company-intra.example.com/hr/employee-list`},
csv:{name:"sample_applicants.csv",format:"CSV (utf-8)",pageCount:null,text:`応募者ID | 氏名 | 年齢 | 電話番号 | メール | 住所 | 応募職種\nAP-2024-001 | 森田 浩 | 35 | 070-1234-5678 | morita.hiroshi@gmail.com | 東京都中央区日本橋2-7-1 | バックエンドエンジニア\nAP-2024-002 | 小林 陽菜 | 28 | 080-9876-5432 | kobayashi.hina@outlook.jp | 大阪府大阪市中央区難波5-1-60 | UIデザイナー\nAP-2024-003 | 加藤 拓也 | 42 | 090-1111-3333 | kato.takuya@yahoo.co.jp | 愛知県名古屋市中区栄3-18-1 | PM\nAP-2024-004 | 井上 愛 | 31 | 03-4444-7777 | inoue.ai@icloud.com | 福岡県福岡市博多区博多駅前2-1-1 | FE\nAP-2024-005 | 木村 悠人 | 26 | 080-2222-8888 | kimura.yuto@proton.me | 北海道札幌市中央区大通西4丁目 | DE\n担当者: 松本 由美 連絡先: matsumoto.yumi@recruit-agency.co.jp`},
text:{name:"sample_career.txt",format:"Text (utf-8)",pageCount:null,text:`職務経歴書\n\n基本情報\n氏名：佐々木 直樹\n生年月日：昭和63年5月20日\n現住所：東京都新宿区西新宿2-8-1 都庁前マンション305号\n〒163-0001\n電話：03-3344-5566\n携帯：090-7788-9900\nE-mail：sasaki.naoki@example.net\nLinkedIn：https://www.linkedin.com/in/naoki-sasaki-tokyo\n\n経歴詳細\n\n(1) 株式会社グローバルテック 2019年1月 - 現在\n所在地：東京都千代田区丸の内1-9-2\n直属上司：山口 慎一（CTO）\n社内ブログ：https://tech.globaltech.co.jp/blog/sasaki\n\n(2) 合同会社クラウドワークス 2014年4月 - 2018年12月\n所在地：大阪府大阪市北区中之島3-2-18\nプロジェクト責任者：中村 和也\n\n(3) 有限会社ウェブデザインラボ 2009年4月 - 2014年3月\n所在地：京都府京都市下京区四条烏丸1-5-3\n連絡先: weblab-hr@designlab.co.jp\n\nスキル\n言語: TypeScript, Python, Go, SQL\nFW: React, Next.js, FastAPI, Echo\n\n以上\nマイナンバー：9876 5432 1098`},
};

// ═══ Text Normalization ═══
function normalizeText(text){
  let t=text.replace(/[\uff10-\uff19]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));
  t=t.replace(/[\uff21-\uff3a\uff41-\uff5a]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));
  t=t.replace(/\uff1a/g,"：").replace(/\uff1b/g,";");
  t=t.replace(/[ \t]{2,}/g," ");
  return t;
}

// ═══ Detection ═══
const REGEX_PATTERNS=[
  {id:"email",label:"メールアドレス",category:"contact",regex:/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g},
  {id:"url",label:"URL",category:"web",regex:/https?:\/\/[^\s\u3000\u3001\u3002\uff0c\uff0e<>"')\]）」』】]{4,}/g},
  // Phone: must start with 0, NOT preceded by another digit (prevents matching inside years like "2003-...")
  {id:"phone",label:"電話番号",category:"contact",regex:/(?<!\d)(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|\(0\d{1,4}\)\s?\d{1,4}[-\s]?\d{3,4}|0\d{9,10})(?!\d)/g},
  // Postal: 〒 prefix required OR 3-digit + hyphen + 4-digit NOT preceded/followed by digit or hyphen+digit
  {id:"postal",label:"郵便番号",category:"address",regex:/(?:〒\s?\d{3}[-ー]\d{4}|(?<!\d)(?<![-ー])\d{3}[-ー]\d{4}(?![-ー]\d)(?!\d))/g},
  // Date: full Y/M/D format — filtered in detectRegex to exclude recent dates (document creation dates)
  {id:"birthday",label:"年月日",category:"personal",regex:/(?:(?:19|20)\d{2}\s?[年/\-\.]\s?\d{1,2}\s?[月/\-\.]\s?\d{1,2}\s?日?|(?:昭和|平成|令和)\s?\d{1,2}\s?年\s?\d{1,2}\s?月\s?\d{1,2}\s?日)/g},
  {id:"address",label:"住所",category:"address",regex:/(?:北海道|(?:東京|京都|大阪)(?:都|府)|.{2,3}県)[^\n\r,、。]{3,40}?(?:\d+[-ー]\d+(?:[-ー]\d+)?|丁目|番地|号)(?:[ \t\u3000]+[^\n\r,、。]{1,30}?\d+(?:号(?:室)?|階))?/g},
  {id:"name_label",label:"氏名（ラベル近傍）",category:"name",regex:/(?:氏\s?名|フリガナ|ふりがな|名\s?前)\s*[：:・\s]\s*([\u4e00-\u9fff][\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]*(?:[\s\u3000][\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]{1,4})?)/g,group:1},
  {id:"mynumber",label:"マイナンバー候補",category:"personal",regex:/(?<!\d)\d{4}\s?\d{4}\s?\d{4}(?!\d)/g},
  {id:"name_kana",label:"フリガナ",category:"name",regex:/(?:フリガナ|ふりがな|カナ)\s*[：:・\s]\s*([\u30a0-\u30ffー]+(?:[\s\u3000][\u30a0-\u30ffー]+)?)/g,group:1},
];

// --- Year/date pattern (used to filter false-positive detections) ---
const YEAR_LIKE=/^(?:19|20)\d{2}$/;
// Matches: "2020年4月 - 2024年3月", "2020-2024", "2020年〜現在", "2023年4月～至 現在"
const YEAR_RANGE_CONTEXT=/(?:19|20)\d{2}\s*(?:年\s*\d{0,2}\s*月?\s*)?[-–—~〜～]\s*(?:(?:19|20)\d{2}|現在|至|present)/i;

// --- Prefecture extraction ---
const PREFECTURE_RE=/^(北海道|東京都|京都府|大阪府|.{2,3}県)/;
function extractPrefecture(addr){const m=addr.match(PREFECTURE_RE);return m?m[1]:"";}

// --- Katakana → Romaji Initial ---
const KANA_INITIAL_MAP={'ア':'A','イ':'I','ウ':'U','エ':'E','オ':'O','カ':'K','キ':'K','ク':'K','ケ':'K','コ':'K','ガ':'G','ギ':'G','グ':'G','ゲ':'G','ゴ':'G','サ':'S','シ':'S','ス':'S','セ':'S','ソ':'S','ザ':'Z','ジ':'Z','ズ':'Z','ゼ':'Z','ゾ':'Z','タ':'T','チ':'C','ツ':'T','テ':'T','ト':'T','ダ':'D','ヂ':'D','ヅ':'D','デ':'D','ド':'D','ナ':'N','ニ':'N','ヌ':'N','ネ':'N','ノ':'N','ハ':'H','ヒ':'H','フ':'F','ヘ':'H','ホ':'H','バ':'B','ビ':'B','ブ':'B','ベ':'B','ボ':'B','パ':'P','ピ':'P','プ':'P','ペ':'P','ポ':'P','マ':'M','ミ':'M','ム':'M','メ':'M','モ':'M','ヤ':'Y','ユ':'Y','ヨ':'Y','ラ':'R','リ':'R','ル':'R','レ':'R','ロ':'R','ワ':'W','ヲ':'W','ン':'N'};
// Hiragana support: convert hiragana to katakana first
function hiraToKata(c){const cp=c.charCodeAt(0);return(cp>=0x3041&&cp<=0x3096)?String.fromCharCode(cp+0x60):c;}
function charToInitial(c){return KANA_INITIAL_MAP[c]||KANA_INITIAL_MAP[hiraToKata(c)]||null;}

// Build reading map: scans text for 氏名/フリガナ line pairs → {kanjiName: katakanaReading}
function buildReadingMap(text){
  const map=new Map();
  const lines=text.split(/\n/);
  for(let i=0;i<lines.length;i++){
    const nameM=lines[i].match(/(?:氏\s?名|名\s?前)\s*[：:・]\s*(.+)/);
    if(nameM){
      const kanji=nameM[1].trim();
      // Look ahead 1-3 lines for フリガナ
      for(let j=i+1;j<Math.min(i+4,lines.length);j++){
        const kanaM=lines[j].match(/(?:フリガナ|ふりがな|カナ)\s*[：:・]\s*([\u30a0-\u30ffー\u3040-\u309f\s\u3000]+)/);
        if(kanaM){map.set(kanji,kanaM[1].trim());break;}
      }
    }
  }
  return map;
}

// Convert name to initials: "タナカ タロウ" → "T.T." or kanji fallback "田.太."
function nameToInitial(name,readingMap){
  // If the name itself is katakana/hiragana
  const isKana=/^[\u30a0-\u30ff\u3040-\u309fー\s\u3000]+$/.test(name);
  let reading=isKana?name:(readingMap?.get(name)||"");
  if(reading){
    const parts=reading.split(/[\s\u3000]+/).filter(Boolean);
    const initials=parts.map(p=>charToInitial(p[0])||p[0]).join(".");
    return initials?initials+".":"";
  }
  // Fallback: use first char of each kanji part
  const parts=name.split(/[\s\u3000]+/).filter(Boolean);
  if(parts.length>=2)return parts.map(p=>p[0]).join(".")+".";
  if(name.length>=2)return name[0]+"."+name[1]+"."; // 田中→田.中.
  return name[0]+".";
}

function detectRegex(text){
  const r=[],seen=new Set();
  for(const p of REGEX_PATTERNS){
    const re=new RegExp(p.regex.source,p.regex.flags);
    let m;
    while((m=re.exec(text))!==null){
      const v=(p.group?m[p.group]:m[0]).trim();
      const k=`${p.id}:${v}`;
      if(seen.has(k)||v.length<2)continue;

      // --- False positive filter: year/date context ---
      if(p.id==="phone"||p.id==="postal"||p.id==="mynumber"){
        // Narrow context: only check text immediately around the match (not broad window)
        const mStart=m.index;
        const mEnd=m.index+m[0].length;
        // Get 8 chars before and after the match for tight context
        const tightBefore=text.slice(Math.max(0,mStart-8),mStart);
        const tightAfter=text.slice(mEnd,Math.min(text.length,mEnd+8));
        const tightCtx=tightBefore+m[0]+tightAfter;
        // Skip if match is embedded within a year range expression
        if(YEAR_RANGE_CONTEXT.test(tightCtx))continue;
        // Find the line containing this match
        const lineStart=text.lastIndexOf("\n",mStart)+1;
        const lineEnd=text.indexOf("\n",mEnd);
        const line=text.slice(lineStart,lineEnd===-1?text.length:lineEnd);
        // Skip if line starts with a year pattern (timeline entry) AND match is not after a PII label
        const hasPIILabel=/(?:電話|TEL|tel|Tel|携帯|FAX|fax|連絡先|〒|郵便)\s*[：:・]?\s*$/.test(text.slice(Math.max(0,mStart-20),mStart));
        if(!hasPIILabel&&/^\s*(?:(?:19|20)\d{2}|(?:昭和|平成|令和)\s?\d{1,2})\s*[年/.\-]/.test(line))continue;
        // Skip postal if preceded by digit (part of a larger number)
        if(p.id==="postal"&&!v.startsWith("〒")){
          const charBefore=mStart>0?text[mStart-1]:"";
          if(/\d/.test(charBefore))continue;
        }
        // Skip phone if followed by 年 or 月
        if(p.id==="phone"){
          const after1=text.slice(mEnd,mEnd+1);
          if(/[年月]/.test(after1))continue;
        }
      }

      // --- False positive filter: date as birthday vs document date ---
      if(p.id==="birthday"){
        const mStart=m.index;
        const before30=text.slice(Math.max(0,mStart-30),mStart);
        // If near a birthday-specific label, always keep
        const isBirthdayLabel=/(?:生年月日|誕生日|生まれ|DOB|Date of Birth)\s*[：:・]?\s*$/i.test(before30);
        // If near a document-date label, always skip
        const isDocDateLabel=/(?:作成日|提出日|更新日|記入日|発行日|印刷日|出力日|日付|現在|応募日|送付日|記載日)\s*[：:・]?\s*$/i.test(before30);
        if(isDocDateLabel)continue;
        // Extract year to check age
        if(!isBirthdayLabel){
          let year=null;
          const westernM=v.match(/^((?:19|20)\d{2})/);
          if(westernM)year=parseInt(westernM[1]);
          const eraM=v.match(/^(昭和|平成|令和)\s?(\d{1,2})/);
          if(eraM){
            const base=eraM[1]==="昭和"?1925:eraM[1]==="平成"?1988:2018;
            year=base+parseInt(eraM[2]);
          }
          const currentYear=new Date().getFullYear();
          // If the date is within the last 20 years, it's likely NOT a birthday
          if(year&&year>currentYear-20)continue;
        }
      }

      seen.add(k);
      r.push({id:`re_${p.id}_${m.index}`,type:p.id,label:p.label,category:p.category,value:v,source:"regex",confidence:.95,enabled:true});
    }
  }
  return r;
}

// Boundary check: character before surname position
const NAME_BEF_OK=/[：:・、。，．\s\u3000\n\r\t|｜/／()（）「」『』【】\-–—~\d.,;!?'"]/;
const LABEL_ENDS=/[名者当員長任師生客様方人]/;

// False positive blocklist for heuristic name detection
const NON_NAME_WORDS=new Set(["株式会社","有限会社","合同会社","一般社団","特定非営利","事業部","開発部","営業部","総務部","人事部","経理部","企画部","技術部","管理部","製造部","品質管理","情報システム","エンジニア","マネージャー","ディレクター","プロジェクト","アシスタント","コンサルタント","デザイナー","マーケター","プログラマー","アナリスト","インターン","フロントエンド","バックエンド","フルスタック","テックリード","アドバイザー","クリエーター","プランナー","リサーチャー","スペシャリスト","コーディネーター","マーケティング","ブランディング","コンサルティング","エグゼクティブ","プレジデント","チーフ","シニア","ジュニア","リード","ヘッド","美容師","薬剤師","看護師","弁護士","税理士","会計士","司法書士","行政書士","社労士","建築士","技術者","研究者","教授","講師","助手","学生","院生","新卒","中途","派遣","契約","正社員","パート","アルバイト","代表取締役","取締役","監査役","執行役員","副社長","専務","常務","部長代理","次長","主幹","係長補佐","班長","組長","チームリーダー","グループリーダー","セクションリーダー",
  // 役職・肩書き
  "技術顧問","顧問","相談役","参与","特別顧問","社外取締役","非常勤","嘱託","名誉会長","名誉顧問","最高顧問","経営顧問","法律顧問","技術担当","事業担当","統括責任者","統括部長","本部長","副本部長","支社長","支店長","工場長","所長","室長","センター長","部門長","課長代理","主任技師","主任研究員","技術主任","開発主任",
  // IT・ビジネス役職
  "プロダクトマネージャー","スクラムマスター","テクニカルリード","アーキテクト","データサイエンティスト","機械学習エンジニア","インフラエンジニア","セキュリティエンジニア","品質保証","テスター","カスタマーサクセス","アカウントマネージャー","事業開発","経営企画","広報担当","人事担当","法務担当","財務担当","経理担当","総務担当","情報管理",
  // 一般的な漢字2-4文字の役職
  "会長","社長","副社長","専務","常務","部長","課長","係長","主任","班長","組長","店長","院長","園長","館長","署長","局長","議長","委員長","理事長","学長","校長","教頭","学部長","研究室長",
]);

function isLikelyName(text){
  if(!text||text.length<2||text.length>10)return false;
  const clean=text.replace(/[\s\u3000]/g,"");
  if(NON_NAME_WORDS.has(clean))return false;
  // Must contain at least one kanji
  if(!/[\u4e00-\u9fff]/.test(clean))return false;
  // Should not be all katakana (job titles)
  if(/^[\u30a0-\u30ff\s\u3000]+$/.test(clean))return false;
  return true;
}

function detectJapaneseNames(text){
  const r=[],seen=new Set();

  // 1. Dictionary match: SURNAME + optional space + GIVEN_NAME
  for(const sn of SURNAMES){
    let p=0;
    while((p=text.indexOf(sn,p))!==-1){
      const a=p+sn.length;
      const rest=text.slice(a,a+10);
      const sp=rest.match(/^[\s\u3000]*/);
      const ns=a+(sp?sp[0].length:0);
      const nr=text.slice(ns,ns+6);
      let matched=false;
      for(const gn of GIVEN_NAMES){
        if(nr.startsWith(gn)){
          const full=text.slice(p,ns+gn.length);
          const k=`name:${full}`;
          if(!seen.has(k)&&isLikelyName(full)){
            const bef=p>0?text[p-1]:" ";
            const ok=p===0||NAME_BEF_OK.test(bef)||LABEL_ENDS.test(bef);
            if(ok){
              seen.add(k);
              r.push({
                  id: `nd_${p}_${gn.length}`,
                  type: 'name_dict',
                  label: '氏名（辞書）',
                  category: 'name',
                  value: full,
                  source: 'dict',
                  confidence: 0.92,
                  enabled: true,
              })
              matched=true;
            }
          }
        }
      }
      // Surname-only match near labels
      if(!matched){
        const before30=text.slice(Math.max(0,p-30),p);
        const hasLabel=/(?:氏名|名前|担当|著者|記入者|申請者|連絡先|責任者|作成者|報告者|代表者|上司|部長|課長|主任|対応者)[：:・\s\u3000/|]*$/.test(before30);
        if(hasLabel){
          const after=text.slice(a,a+8);
          const gnMatch=after.match(/^[\s\u3000]*([\u4e00-\u9fff]{1,4})/);
          const fullName=gnMatch?text.slice(p,a+gnMatch.index+gnMatch[0].length).trim():sn;
          if(isLikelyName(fullName)){
            const k=`nc2:${fullName}:${p}`;
            if(!seen.has(k)){
              seen.add(k);
              r.push({id:`nc2_${p}`,type:"name_context",label:"氏名（文脈）",category:"name",value:fullName,source:"dict",confidence:.88,enabled:true});
            }
          }
        }
      }
      p++;
    }
  }

  // 2. Label-based context detection
  const lre=/(?:氏名|名前|担当者?|著者|記入者|申請者|連絡先|責任者|作成者|報告者|代表者|上司|所属長|管理者|承認者)\s*[：:・\s\u3000/|｜\t]\s*/g;
  let lm;
  while((lm=lre.exec(text))!==null){
    const afterLabel=text.slice(lm.index+lm[0].length,lm.index+lm[0].length+16);
    let found=false;
    for(const sn of SURNAMES){
      if(afterLabel.startsWith(sn)){
        const k=`nc:${sn}:${lm.index}`;
        if(!seen.has(k)){
          const rn=afterLabel.slice(sn.length);
          const nm=rn.match(/^[\s\u3000]*([\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]{1,4})/);
          const fv=nm?afterLabel.slice(0,sn.length+nm[0].length):sn;
          if(isLikelyName(fv.trim())){
            seen.add(k);
            r.push({id:`nc_${lm.index}`,type:"name_context",label:"氏名（文脈）",category:"name",value:fv.trim(),source:"dict",confidence:.90,enabled:true});
            found=true;
          }
        }
        break;
      }
    }
    // Heuristic: CJK text after label (require kanji)
    if(!found){
      const nameGuess=afterLabel.match(/^([\u4e00-\u9fff]{2,4}[\s\u3000]?[\u4e00-\u9fff]{1,4})/);
      if(nameGuess&&isLikelyName(nameGuess[1].trim())){
        const val=nameGuess[1].trim();
        const k=`ng:${val}:${lm.index}`;
        if(!seen.has(k)){
          seen.add(k);
          r.push({id:`ng_${lm.index}`,type:"name_context",label:"氏名（推定）",category:"name",value:val,source:"heuristic",confidence:.75,enabled:true});
        }
      }
    }
  }
  return r;
}

function ensureUniqueDetectionIds(detections) {
    const seenIds = new Map()
    return detections.map((d, index) => {
        const baseId =
            typeof d.id === 'string' && d.id.trim() ? d.id : `d_${index}`
        const count = seenIds.get(baseId) || 0
        seenIds.set(baseId, count + 1)
        return count === 0
            ? { ...d, id: baseId }
            : { ...d, id: `${baseId}__${count}` }
    })
}

// ═══ AI-Based PII Detection ═══
function parseAIDetectionJson(raw) {
    if (!raw || typeof raw !== 'string') return { ok: false, reason: 'empty' }
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return { ok: false, reason: 'no_json' }
    try {
        const items = JSON.parse(jsonMatch[0])
        if (!Array.isArray(items)) return { ok: false, reason: 'not_array' }
        return { ok: true, items }
    } catch {
        return { ok: false, reason: 'json_parse' }
    }
}

async function detectWithAI(text, apiKey, model, fallbackModel, onProgress) {
    const truncated = text.slice(0, 8000)
    const prompt = `以下の日本語テキストから個人を特定できる情報（PII）を全て抽出してJSON配列で返してください。

検出対象：
- person_name: 人名（姓名、フルネーム。フリガナも別エントリで）
  重要：「マーケター」「エンジニア」「デザイナー」等の職種名は人名ではありません
  重要：「朝霧デザイン」等の屋号・サービス名は人名ではありません
- sns_account: SNSアカウント名・ユーザーID
  検出パターン例：
  - @username（Twitter/X、Instagram等）
  - GitHub: username または @username
  - LinkedIn: /in/username
  - Facebook: ユーザー名
  - その他 @ で始まるユーザー名
  重要：メールアドレスの @ は検出しない（別途検出済み）
  重要：URL内の @ は検出しない（別途検出済み）

以下の情報は検出不要（別途正規表現で検出済み）：
- メールアドレス、電話番号、住所、URL、生年月日、郵便番号、マイナンバー

レスポンス形式（JSON配列のみ、他のテキスト不要）：
[{"type":"person_name","value":"検出した文字列"},{"type":"sns_account","value":"@xxx"}]

テキスト：
${truncated}`

    const runOnce = async (m) => {
        const provider = getProviderForModel(m)
        const raw = await callAI({
            provider,
            model: m || 'gpt-5-nano',
            apiKey,
            maxTokens: 1000,
            messages: [{ role: 'user', content: prompt }],
        })
        const parsed = parseAIDetectionJson(raw)
        if (!parsed.ok)
            return {
                ok: false,
                reason: parsed.reason,
                rawLen: (raw || '').length,
            }
        const results = []
        const seen = new Set()
        for (const item of parsed.items) {
            if (!item || typeof item !== 'object') continue
            if (typeof item.value !== 'string' || item.value.length < 2)
                continue
            if (typeof item.type !== 'string') continue
            const k = `ai:${item.type}:${item.value}`
            if (seen.has(k)) continue
            seen.add(k)
            if (item.type === 'person_name') {
                if (text.includes(item.value)) {
                    results.push({
                        id: `ai_${results.length}`,
                        type: 'name_ai',
                        label: '氏名（AI検出）',
                        category: 'name',
                        value: item.value,
                        source: 'ai',
                        confidence: 0.95,
                        enabled: true,
                    })
                }
            } else if (item.type === 'sns_account') {
                if (text.includes(item.value)) {
                    results.push({
                        id: `ai_sns_${results.length}`,
                        type: 'sns_ai',
                        label: 'SNSアカウント',
                        category: 'contact',
                        value: item.value,
                        source: 'ai',
                        confidence: 0.9,
                        enabled: true,
                    })
                }
            }
        }
        return { ok: true, results, rawLen: (raw || '').length }
    }

    let primary
    try {
        primary = await runOnce(model)
        if (primary.ok)
            return {
                detections: primary.results,
                usedModel: model,
                fallbackUsed: false,
            }
    } catch (e) {
        primary = { ok: false, reason: e?.message || 'error', rawLen: 0 }
    }

    if (fallbackModel && fallbackModel !== model) {
        try {
            if (onProgress)
                onProgress(`AI PII検出: ${fallbackModel} で再試行中...`)
            const fb = await runOnce(fallbackModel)
            if (fb.ok)
                return {
                    detections: fb.results,
                    usedModel: fallbackModel,
                    fallbackUsed: true,
                }
            return {
                detections: [],
                usedModel: fallbackModel,
                fallbackUsed: true,
                error: `AI検出失敗(${model}→${fallbackModel}): ${primary.reason || '不明'}`,
            }
        } catch (e) {
            return {
                detections: [],
                usedModel: fallbackModel,
                fallbackUsed: true,
                error: `AI検出失敗(${model}→${fallbackModel}): ${e?.message || '不明'}`,
            }
        }
    }

    return {
        detections: [],
        usedModel: model,
        fallbackUsed: false,
        error: `AI検出失敗(${model}): ${primary.reason || '不明'}`,
    }
}

function detectAll(text){
  const nt=normalizeText(text);
  const all=[...detectRegex(nt),...detectJapaneseNames(nt)];
  const seen=new Set();
  return all.filter(d=>{const k=`${d.category}:${d.value}`;if(seen.has(k))return false;seen.add(k);return true;});
}

function mergeDetections(base, aiResults){
  const seen=new Set(base.map(d=>`${d.category}:${d.value}`));
  const merged=[...base];
  for(const d of aiResults){
    const k=`${d.category}:${d.value}`;
    if(!seen.has(k)){seen.add(k);merged.push(d);}
  }
  return merged;
}

// ═══ Redaction ═══
const PH={email:"[メール非公開]",url:"[URL非公開]",phone:"[電話番号非公開]",postal:"[郵便番号非公開]",birthday:"[年月日非公開]",address:"[住所非公開]",name_label:"[氏名非公開]",name_dict:"[氏名非公開]",name_context:"[氏名非公開]",name_ai:"[氏名非公開]",name_kana:"[氏名非公開]",sns_ai:"[SNS非公開]",sns_twitter:"[Twitter/X非公開]",sns_github:"[GitHub非公開]",sns_linkedin:"[LinkedIn非公開]",sns_instagram:"[Instagram非公開]",sns_facebook:"[Facebook非公開]",mynumber:"[番号非公開]",ner_person:"[氏名非公開]",ner_org:"[組織名非公開]",face:"[顔写真削除]"};
const PH_RE=/\[(?:メール非公開|URL非公開|電話番号非公開|郵便番号非公開|年月日非公開|生年月日非公開|住所非公開|住所詳細非公開|氏名非公開|番号非公開|SNS非公開|Twitter\/X非公開|GitHub非公開|LinkedIn非公開|Instagram非公開|Facebook非公開|地名非公開|場所非公開|組織名非公開|日付非公開|国名非公開|顔写真削除|非公開|Name Redacted|Email Redacted|Phone Redacted|Address Redacted|DOB Redacted|URL Redacted)\]/g;

function applyRedaction(text,dets,opts){
  const keepPref=opts?.keepPrefecture||false;
  const nameInit=opts?.nameInitial||false;
  const readingMap=nameInit?buildReadingMap(text):null;
  let r=text;
  const s=[...dets].filter(d=>d.enabled).sort((a,b)=>(b.value?.length||0)-(a.value?.length||0));
  for(const d of s){
    if(!d.value)continue;
    const isNameType=d.category==="name";
    const isAddrType=d.type==="address";
    let replacement;
    if(isNameType&&nameInit){
      // Initial mode: convert name to initials
      replacement=nameToInitial(d.value,readingMap)||PH[d.type]||"[非公開]";
    }else if(isAddrType&&keepPref){
      // Prefecture preservation: keep prefecture, mask the rest
      const pref=extractPrefecture(d.value);
      replacement=pref?(pref+"[住所詳細非公開]"):"[住所非公開]";
    }else{
      replacement=PH[d.type]||"[非公開]";
    }
    r=r.split(d.value).join(replacement);
  }
  return r;
}

function buildNonOverlappingMatches(text,dets,occupied){
  const matches=[];
  const occ=occupied||[];
  const overlaps=(s,e)=>occ.some(o=>!(e<=o.s||s>=o.e));
  for(const d of dets){
    const v=d?.value;
    if(typeof v!=="string"||v.length<2)continue;
    let idx=0;
    while(true){
      const p=text.indexOf(v,idx);
      if(p===-1)break;
      const s=p,e=p+v.length;
      if(!overlaps(s,e)){
        matches.push({s,e,det:d});
        occ.push({s,e});
      }
      idx=p+v.length;
    }
  }
  matches.sort((a,b)=>a.s-b.s);
  return matches;
}

/**
 * buildAnnotations - セグメント分割ロジック
 * テキストを検出値で分割し、プレーンテキストセグメントと検出セグメントの
 * 配列を返す。重複排除済み。
 *
 * 戻り値: Array<{type:"text",text:string}|{type:"det",text:string,det:object}>
 */
function buildAnnotations(text,dets,opts){
  if(typeof text!=="string"||!text||!dets||dets.length===0){
    return [{type:"text",text:text||""}];
  }
  const showRedacted=opts?.showRedacted||false;
  const keepPref=opts?.keepPrefecture||false;
  const nameInit=opts?.nameInitial||false;

  const all=[...dets].filter(d=>d&&typeof d.value==="string"&&d.value.length>=2)
    .sort((a,b)=>(b.value?.length||0)-(a.value?.length||0));
  if(all.length===0)return [{type:"text",text}];

  // nameInitial用のフリガナマップ構築
  const readingMap=nameInit?buildReadingMap(text):null;

  // 全検出値のマッチ位置を一括収集（長い値優先で重複排除）
  const rawMatches=[];
  for(const d of all){
    const v=d.value;
    let idx=0;
    while(idx<text.length){
      const p=text.indexOf(v,idx);
      if(p===-1)break;
      rawMatches.push({s:p,e:p+v.length,det:d});
      idx=p+v.length;
    }
  }
  // 開始位置でソート、同一開始なら長い方を優先
  rawMatches.sort((a,b)=>a.s-b.s||(b.e-b.s)-(a.e-a.s));

  // 重複排除: 長い値優先のグリーディ選択
  const selected=[];
  let lastEnd=0;
  for(const m of rawMatches){
    if(m.s>=lastEnd){
      selected.push(m);
      lastEnd=m.e;
    }
  }

  // セグメント配列に変換
  const segments=[];
  let cur=0;
  for(const m of selected){
    if(m.s>cur){
      segments.push({type:"text",text:text.slice(cur,m.s)});
    }
    const d=m.det;
    if(showRedacted&&d.enabled){
      const isNameType=d.category==="name";
      const isAddrType=d.type==="address";
      let masked;
      if(isNameType&&nameInit){
        masked=nameToInitial(d.value,readingMap)||PH[d.type]||"[非公開]";
      }else if(isAddrType&&keepPref){
        const pref=extractPrefecture(d.value);
        masked=pref?(pref+"[住所詳細非公開]"):"[住所非公開]";
      }else{
        masked=PH[d.type]||"[非公開]";
      }
      segments.push({type:"det",text:masked,original:d.value,det:d,masked:true});
    }else{
      // enabled:false または showRedacted:false → 元テキスト表示、disabledDetフラグ付与
      segments.push({type:"det",text:text.slice(m.s,m.e),det:d,masked:false,disabledDet:!d.enabled});
    }
    cur=m.e;
  }
  if(cur<text.length){
    segments.push({type:"text",text:text.slice(cur)});
  }
  return segments;
}

function renderTextWithDetectionAnchors(text,dets,opts,showRedacted,focusId,focusPulse){
  if(typeof text!=="string"||!text)return text||"";
  const all=[...dets].filter(d=>d&&typeof d.value==="string"&&d.value.length>=2).sort((a,b)=>(b.value?.length||0)-(a.value?.length||0));
  if(all.length===0)return text;

  const keepPref=opts?.keepPrefecture||false;
  const nameInit=opts?.nameInitial||false;
  const readingMap=nameInit?buildReadingMap(text):null;

  const placeholderStyle={background:T.redDim,color:T.red,padding:"1px 6px",borderRadius:4,fontWeight:600,fontSize:"0.92em"};
  const rawHitStyle={background:"rgba(76,133,246,0.16)",borderRadius:3,boxShadow:"inset 0 -1px 0 rgba(76,133,246,0.55)"};

  let matches=[];
  if(showRedacted){
    const occ=[];
    const en=all.filter(d=>d.enabled);
    const dis=all.filter(d=>!d.enabled);
    const m1=buildNonOverlappingMatches(text,en,occ);
    const m2=buildNonOverlappingMatches(text,dis,occ);
    matches=[...m1,...m2].sort((a,b)=>a.s-b.s);
  }else{
    matches=buildNonOverlappingMatches(text,all);
  }
  if(matches.length===0)return text;

  const out=[];
  let cur=0;
  const animName=focusPulse%2? "detFlashA":"detFlashB";

  for(const m of matches){
    if(m.s>cur)out.push(text.slice(cur,m.s));
    const d=m.det;
    const focused=!!(focusId&&d?.id===focusId);
    const anim=focused?{animation:`${animName} 1.25s ease-in-out 1`}:{};

    if(showRedacted){
      if(d.enabled){
        // Masked rendering (keeps privacy; value is not shown)
        let node=null;
        const isNameType=d.category==="name";
        const isAddrType=d.type==="address";
        if(isNameType&&nameInit){
          const rep=nameToInitial(d.value,readingMap)||PH[d.type]||"[非公開]";
          node=<span style={placeholderStyle}>{rep}</span>;
        }else if(isAddrType&&keepPref){
          const pref=extractPrefecture(d.value);
          node=pref?(<><span>{pref}</span><span style={placeholderStyle}>[住所詳細非公開]</span></>):(<span style={placeholderStyle}>[住所非公開]</span>);
        }else{
          const rep=PH[d.type]||"[非公開]";
          node=<span style={placeholderStyle}>{rep}</span>;
        }
        out.push(
          <span key={`det_${d.id}_${m.s}`} data-det-id={d.id} style={{borderRadius:6,...anim}}>
            {node}
          </span>
        );
      }else{
        // Unmasked detection: keep original text; only highlight when focused
        const hit=text.slice(m.s,m.e);
        out.push(
          <span key={`det_${d.id}_${m.s}`} data-det-id={d.id} style={{...(focused?rawHitStyle:{}),...anim}}>
            {hit}
          </span>
        );
      }
    }else{
      // Raw/original rendering (value is visible; highlight only when focused)
      const hit=text.slice(m.s,m.e);
      out.push(
        <span key={`det_${d.id}_${m.s}`} data-det-id={d.id} style={{...(focused?rawHitStyle:{}),...anim}}>
          {hit}
        </span>
      );
    }
    cur=m.e;
  }
  if(cur<text.length)out.push(text.slice(cur));
  return out;
}

// ═══ File Parsers ═══
function detectEncoding(b){if(b.length>=3&&b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)return"utf-8";if(b.length>=2&&b[0]===0xff&&b[1]===0xfe)return"utf-16le";let sj=0,eu=0,u8=0;for(let i=0;i<Math.min(b.length,10000);i++){const v=b[i];if(v<=0x7f)continue;if(v>=0xc0&&v<=0xdf&&i+1<b.length&&(b[i+1]&0xc0)===0x80){u8+=2;i++;continue;}if(v>=0xe0&&v<=0xef&&i+2<b.length&&(b[i+1]&0xc0)===0x80&&(b[i+2]&0xc0)===0x80){u8+=3;i+=2;continue;}if(v>=0xa1&&v<=0xfe&&i+1<b.length&&b[i+1]>=0xa1&&b[i+1]<=0xfe){eu+=2;i++;continue;}if(((v>=0x81&&v<=0x9f)||(v>=0xe0&&v<=0xfc))&&i+1<b.length){const b2=b[i+1];if((b2>=0x40&&b2<=0x7e)||(b2>=0x80&&b2<=0xfc)){sj+=2;i++;continue;}}}if(sj===0&&eu===0&&u8===0)return"utf-8";if(u8>=sj&&u8>=eu)return"utf-8";return sj>=eu?"shift_jis":"euc-jp";}
function decodeText(ab){const b=new Uint8Array(ab);const e=detectEncoding(b);return{text:new TextDecoder(e,{fatal:false}).decode(b),encoding:e};}
function readBuf(f){return new Promise((r,j)=>{const x=new FileReader();x.onload=()=>r(x.result);x.onerror=j;x.readAsArrayBuffer(f);});}

// PDF parsing watchdogs (prevents "never-ending" extraction)
const PDF_PARSE_TIMEOUT_MS=60_000; // total wall time
const PDFJS_LOAD_TIMEOUT_MS=15_000; // pdf.js script load
const PDF_DOCUMENT_TIMEOUT_MS=25_000; // getDocument() phase
const PDF_PAGE_TIMEOUT_MS=20_000; // getPage()/getTextContent() phase per page

function withTimeout(p,timeoutMs,msg,onTimeout){
  const ms=typeof timeoutMs==="number"&&timeoutMs>0?timeoutMs:0;
  if(!ms)return p;
  let t=null;
  return new Promise((resolve,reject)=>{
    t=setTimeout(()=>{
      try{onTimeout&&onTimeout();}catch{}
      reject(new Error(msg));
    },ms);
    Promise.resolve(p).then(
      (v)=>{if(t)clearTimeout(t);resolve(v);},
      (e)=>{if(t)clearTimeout(t);reject(e);}
    );
  });
}

async function loadPdfJs(opts){
  if(window.pdfjsLib)return;
  const timeoutMs=opts?.timeoutMs??PDFJS_LOAD_TIMEOUT_MS;
  const onProgress=opts?.onProgress;
  if(onProgress)onProgress("PDF: PDF.js読込中...");
  await withTimeout(new Promise((r,j)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.async=true;
    s.onload=()=>r(true);
    s.onerror=()=>j(new Error("PDF.jsの読み込みに失敗しました"));
    document.head.appendChild(s);
  }),timeoutMs,`PDF.jsの読み込みがタイムアウトしました（${Math.round(timeoutMs/1000)}秒）`);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

async function parsePDF(f,opts){
  const onProgress=opts?.onProgress;
  const totalTimeoutMs=opts?.timeoutMs??PDF_PARSE_TIMEOUT_MS;
  const deadline=Date.now()+totalTimeoutMs;
  const sec=Math.round(totalTimeoutMs/1000);
  const remain=()=>Math.max(0,deadline-Date.now());
  const cap=(ms)=>Math.min(ms,remain());
  const timeUp=()=>remain()<=0;

  const abortMsg=`PDFのテキスト抽出がタイムアウトしました（最大${sec}秒）。\n\n対処:\n- PDFが大きい/破損/保護されている可能性があります\n- 画像PDFの場合は「AI OCR」を有効にして再実行してください`;

  if(onProgress)onProgress("PDF: ファイル読込中...");
  const ab=await withTimeout(readBuf(f),cap(totalTimeoutMs),abortMsg);
  if(timeUp())throw new Error(abortMsg);
  await loadPdfJs({timeoutMs:cap(PDFJS_LOAD_TIMEOUT_MS),onProgress});
  // Clone buffer before pdf.js consumes it (ArrayBuffer gets detached)
  const abCopy=ab.slice(0);
  // Try with CMap for better Japanese text extraction, fall back without
  let pdf=null;
  let loadingTask=null;
  const destroy=()=>{
    try{loadingTask?.destroy?.();}catch{}
    try{pdf?.destroy?.();}catch{}
  };
  try{
    if(onProgress)onProgress("PDF: 読み込み中（CMap）...");
    loadingTask=window.pdfjsLib.getDocument({data:ab,cMapUrl:"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",cMapPacked:true});
    pdf=await withTimeout(loadingTask.promise,cap(PDF_DOCUMENT_TIMEOUT_MS),abortMsg,()=>{try{loadingTask.destroy();}catch{}});
  }catch(e){
    console.warn("PDF with CMap failed, retrying without:",e);
    const ab2=abCopy.slice(0);
    if(onProgress)onProgress("PDF: 読み込み再試行（通常）...");
    loadingTask=window.pdfjsLib.getDocument({data:ab2});
    pdf=await withTimeout(loadingTask.promise,cap(PDF_DOCUMENT_TIMEOUT_MS),abortMsg,()=>{try{loadingTask.destroy();}catch{}});
  }
  let fullText="";
  const sparsePages=[];
  for(let i=1;i<=pdf.numPages;i++){
    if(timeUp()){destroy();throw new Error(abortMsg);}
    if(onProgress){
      const pct=Math.round((i/pdf.numPages)*100);
      onProgress(`PDF: ${pct}% (${i}/${pdf.numPages}) ページ抽出中...`);
    }
    const pg=await withTimeout(pdf.getPage(i),cap(PDF_PAGE_TIMEOUT_MS),abortMsg,destroy);
    const c=await withTimeout(pg.getTextContent(),cap(PDF_PAGE_TIMEOUT_MS),abortMsg,destroy);
    const vp=pg.getViewport({scale:1});
    const pageW=vp.width;

    // Collect all text items with position info
    const items=[];
    for(const it of c.items){
      if(!it.str||it.str.trim()==="")continue;
      const x=it.transform[4];
      const y=it.transform[5];
      const w=it.width||0;
      const h=it.height||Math.abs(it.transform[3])||12;
      const fs=Math.abs(it.transform[0])||12;
      items.push({x,y,w,h,fs,text:it.str});
    }
    if(items.length===0){fullText+=`--- Page ${i} ---\n\n`;continue;}

    // Step 1: Y-tolerance grouping (items within fs*0.4 of each other = same row)
    items.sort((a,b)=>b.y-a.y||a.x-b.x);
    const rows=[];
    let curRow=[items[0]];
    for(let j=1;j<items.length;j++){
      const prev=curRow[curRow.length-1];
      const cur=items[j];
      const tolerance=Math.max(prev.fs,cur.fs)*0.4;
      if(Math.abs(cur.y-prev.y)<=tolerance){
        curRow.push(cur);
      }else{
        rows.push(curRow);
        curRow=[cur];
      }
    }
    if(curRow.length>0)rows.push(curRow);

    // Step 2: Detect vertical text sequences (single CJK chars stacked vertically at similar X)
    // Identify columns of single chars with same X (±5px) and small Y gaps
    const verticalGroups=[];
    const usedInVertical=new Set();
    // Only detect if we have many single-char items at similar X
    const singleCharItems=items.filter(it=>it.text.trim().length===1&&/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(it.text));
    if(singleCharItems.length>3){
      // Group by X proximity
      const xGroups={};
      for(const it of singleCharItems){
        const xKey=Math.round(it.x/6)*6;
        if(!xGroups[xKey])xGroups[xKey]=[];
        xGroups[xKey].push(it);
      }
      for(const [,group] of Object.entries(xGroups)){
        if(group.length<3)continue;
        // Sort by Y descending (top to bottom)
        group.sort((a,b)=>b.y-a.y);
        // Check if Y gaps are consistent (vertical text)
        let isVertical=true;
        for(let k=1;k<group.length;k++){
          const gap=group[k-1].y-group[k].y;
          if(gap>group[k].fs*2.5||gap<group[k].fs*0.3){isVertical=false;break;}
        }
        if(isVertical){
          const combined=group.map(g=>g.text).join("");
          verticalGroups.push({text:combined,items:group});
          for(const g of group)usedInVertical.add(g);
        }
      }
    }

    // Step 3: Rebuild rows excluding vertical text items
    const filteredRows=rows.map(row=>row.filter(it=>!usedInVertical.has(it))).filter(r=>r.length>0);

    // Step 4: Smart line reconstruction with column detection
    const pageLines=[];

    // Add vertical text groups as header/label info
    if(verticalGroups.length>0){
      // These are typically table headers - combine them
      const vTexts=verticalGroups.map(vg=>vg.text).filter(t=>t.length>=2);
      if(vTexts.length>0){
        pageLines.push("[" + vTexts.join(" / ") + "]");
      }
    }

    for(const row of filteredRows){
      row.sort((a,b)=>a.x-b.x);

      // Detect gaps between items to determine column breaks vs word joins
      const segments=[];
      let seg=[row[0]];
      for(let k=1;k<row.length;k++){
        const prev=seg[seg.length-1];
        const cur=row[k];
        const prevEnd=prev.x+(prev.w||prev.text.length*prev.fs*0.55);
        const gap=cur.x-prevEnd;
        // Large gap = column break, use separator
        const gapThreshold=cur.fs*2.5;
        if(gap>gapThreshold){
          segments.push(seg);
          seg=[cur];
        }else{
          seg.push(cur);
        }
      }
      if(seg.length>0)segments.push(seg);

      // Build line from segments
      const lineParts=segments.map(s=>{
        return s.map((it,idx)=>{
          if(idx===0)return it.text;
          const prev=s[idx-1];
          const prevEnd=prev.x+(prev.w||prev.text.length*prev.fs*0.55);
          const gap=it.x-prevEnd;
          // Small gap between CJK chars = no space needed
          const prevIsCJK=/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]$/.test(prev.text);
          const curIsCJK=/^[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(it.text);
          if(prevIsCJK&&curIsCJK&&gap<it.fs*0.8)return it.text;
          if(gap>it.fs*0.3)return " "+it.text;
          return it.text;
        }).join("");
      });

      // Join segments with clear separator for multi-column content
      const line=lineParts.length>1?lineParts.join(" | "):lineParts[0];
      if(line&&line.trim())pageLines.push(line.trim());
    }

    // Step 5: Post-process - merge orphan lines, clean artifacts
    const cleaned=[];
    for(const line of pageLines){
      // Skip lines that are just single chars or purely symbols
      if(line.length===1&&/[\s\u3000]/.test(line))continue;
      // Skip lines that are just column separators
      if(/^[|／\/\s]+$/.test(line))continue;
      cleaned.push(line);
    }

    fullText+=`--- Page ${i} ---\n${cleaned.join("\n")}\n\n`;

    // Track pages with very little extractable text (likely image/outlined text)
    const realContent=cleaned.filter(l=>l.length>3).join("");
    if(realContent.length<30)sparsePages.push(i);

    // Yield to UI/event loop (prevents long sync blocks)
    await new Promise((r)=>setTimeout(r,0));
  }
  // Detect CMap failure: if Japanese PDF has very few Japanese characters, text extraction failed
  const jpChars=(fullText.match(/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/g)||[]).length;
  const totalChars=fullText.replace(/[\s\-|/]/g,"").length;
  const cmapFailed=pdf.numPages>2&&totalChars>20&&jpChars<totalChars*0.05;
  // If CMap failed, mark ALL pages with content potential as sparse (force OCR)
  if(cmapFailed){
    for(let i=1;i<=pdf.numPages;i++){
      if(!sparsePages.includes(i))sparsePages.push(i);
    }
    sparsePages.sort((a,b)=>a-b);
  }
  const numPages=pdf.numPages;
  // Cleanup (avoid leaking workers/memory)
  try{pdf.cleanup?.();}catch{}
  try{pdf.destroy?.();}catch{}
  try{loadingTask?.destroy?.();}catch{}
  return{text:fullText,pageCount:numPages,format:"PDF",sparsePages,pdfData:abCopy,cmapFailed};
}

// OCR: Send PDF directly to Claude Vision API (no canvas rendering — reliable in artifact env)
async function ocrSparsePages(pdfData,sparsePages,apiKey,model,onProgress){
  if(!sparsePages||sparsePages.length===0)return{};
  if(!pdfData||pdfData.byteLength===0){if(onProgress)onProgress("OCR: PDFデータなし");return{};}
  const provider=getProviderForModel(model);
  
  const h={"Content-Type":"application/json"};
  if(apiKey&&provider==="anthropic"){h["x-api-key"]=apiKey;h["anthropic-version"]="2023-06-01";}
  
  // Convert PDF ArrayBuffer to base64 for direct API submission
  if(onProgress)onProgress("OCR: PDF→Base64変換中...");
  let pdfB64;
  try{
    const bytes=new Uint8Array(pdfData.slice(0));
    const chunks=[];
    const chunkSize=8192;
    for(let i=0;i<bytes.length;i+=chunkSize){
      chunks.push(String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunkSize,bytes.length))));
    }
    pdfB64=btoa(chunks.join(""));
  }catch(e){
    if(onProgress)onProgress(`OCR: Base64変換エラー: ${e.message}`);
    return{};
  }
  
  const pdfSizeMB=(pdfB64.length*0.75/1024/1024).toFixed(1);
  if(onProgress)onProgress(`OCR: PDF ${pdfSizeMB}MB — ${sparsePages.length}ページを解析中...`);
  console.log(`OCR: PDF direct mode — ${pdfSizeMB}MB, ${sparsePages.length} sparse pages: [${sparsePages.join(",")}]`);
  
  // Size check (Claude API limit ~25MB for base64 documents)
  if(pdfB64.length>32*1024*1024){
    if(onProgress)onProgress(`OCR: PDFが大きすぎます (${pdfSizeMB}MB > 25MB)`);
    return{};
  }
  
  const results={};
  
  // Send PDF directly to Claude Vision API in page batches (no canvas rendering)
  const batchSize=6;
  for(let b=0;b<sparsePages.length;b+=batchSize){
    const batch=sparsePages.slice(b,b+batchSize);
    const pct=Math.round(((b+batch.length)/sparsePages.length)*100);
    const pageList=batch.join(", ");
    if(onProgress)onProgress(`OCR: ${pct}% — Page ${pageList} (${Math.min(b+batch.length,sparsePages.length)}/${sparsePages.length})`);
    
    try{
      const ocrPrompt=`このPDFのページ ${pageList} からテキストを抽出してください。

ルール：
1. 指定ページのテキストのみ抽出（他のページは無視）
2. 各ページを「--- Page N ---」で区切る（Nはページ番号）
3. レイアウト構造（見出し、本文、リスト、表組み等）をなるべく保持
4. URLやメールアドレスは正確に抽出
5. UIスクリーンショットやデザイン画像内の文字も読み取れる範囲で抽出
6. テキストのみ出力（説明文や前置きは一切不要）
7. テキストが無いページは「--- Page N ---」の後に「[画像のみ]」と記載`;
      const txt = await callAI({
          provider,
          model: model || 'gpt-5-nano',
          apiKey,
          maxTokens: 8000,
          messages: [
              {
                  role: 'user',
                  content: [
                      {
                          type: 'document',
                          source: {
                              type: 'base64',
                              media_type: 'application/pdf',
                              data: pdfB64,
                          },
                      },
                      { type: 'text', text: ocrPrompt },
                  ],
              },
          ],
      })
      console.log(`OCR API response (pages ${pageList}): ${txt.length} chars`);
      
      // Parse per-page results
      const sections=txt.split(/---\s*Page\s*(\d+)\s*---/);
      for(let s=1;s<sections.length;s+=2){
        const pn=parseInt(sections[s]);
        const pt=(sections[s+1]||"").trim();
        if(pt.length>3&&!isNaN(pn)&&pt!=="[画像のみ]"){
          results[pn]=pt;
        }
      }
      
      // Single page fallback
      if(batch.length===1&&!results[batch[0]]){
        const cleaned=txt.replace(/---\s*Page\s*\d+\s*---/g,"").trim();
        if(cleaned.length>5&&cleaned!=="[画像のみ]")results[batch[0]]=cleaned;
      }
      
    }catch(e){
      console.error("OCR fetch error:",e);
      if(onProgress)onProgress(`OCR通信エラー: ${e.message||"不明"}`);
    }
  }
  
  if(onProgress)onProgress(`OCR完了: ${Object.keys(results).length}/${sparsePages.length}ページからテキスト復元`);
  console.log(`OCR results: ${Object.keys(results).length} pages, keys: [${Object.keys(results).join(",")}]`);
  return results;
}

// Merge OCR results into extracted text
function mergeOcrResults(baseText,ocrResults){
  if(!ocrResults||Object.keys(ocrResults).length===0)return baseText;
  const pages=baseText.split(/(?=--- Page \d+ ---)/);
  const merged=pages.map(page=>{
    const match=page.match(/---\s*Page\s*(\d+)\s*---/);
    if(!match)return page;
    const pageNum=parseInt(match[1]);
    if(ocrResults[pageNum]){
      // Replace sparse page content with OCR result
      return `--- Page ${pageNum} ---\n${ocrResults[pageNum]}\n`;
    }
    return page;
  });
  return merged.join("\n");
}

// AI-based PDF text cleanup - processes per-page, non-destructive
async function aiCleanupText(
    rawText,
    apiKey,
    model,
    onProgress,
    fallbackModel,
) {
    const primaryModel = model || 'gpt-5-nano'
    const fbModel =
        fallbackModel && fallbackModel !== primaryModel ? fallbackModel : null

    // Split into pages
    const pageChunks = rawText.split(/(?=--- Page \d+ ---)/)
    if (pageChunks.length === 0) return null

    // Group pages into batches (~5000 chars each to stay within token limits)
    const batches = []
    let cur = []
    let curLen = 0
    for (const chunk of pageChunks) {
        const trimmed = chunk.trim()
        if (!trimmed) continue
        if (curLen + trimmed.length > 5000 && cur.length > 0) {
            batches.push(cur.join('\n\n'))
            cur = [trimmed]
            curLen = trimmed.length
        } else {
            cur.push(trimmed)
            curLen += trimmed.length
        }
    }
    if (cur.length > 0) batches.push(cur.join('\n\n'))

    const results = []
    for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi]
        const pct = Math.round(((bi + 1) / batches.length) * 100)
        if (onProgress)
            onProgress(`AI再構成: ${pct}% (${bi + 1}/${batches.length}バッチ)`)
        // Skip batches that are mostly just page headers with no real content
        const contentLines = batch
            .split('\n')
            .filter((l) => !/^---\s*Page\s*\d+/.test(l) && l.trim().length > 0)
        if (contentLines.length < 2) {
            results.push(batch)
            continue
        }

        const runCleanup = async (m) => {
            const provider = getProviderForModel(m)
            return await callAI({
                provider,
                model: m,
                apiKey,
                maxTokens: 4000,
                messages: [
                    {
                        role: 'user',
                        content: `以下はPDFから機械的に抽出したテキストです。レイアウト崩れを修正してください。

ルール：
1. 元の情報を変更・追加・削除しない。情報量を減らさない
2. 崩れた文字列を修正（例：「企 画」→「企画」、「デ ザ イ ン」→「デザイン」）
3. テーブル構造が崩れている場合、列と行を正しく対応させる
4. 「--- Page N ---」の区切りを必ず維持する
5. URLはそのまま維持
6. 空のページ（テキストが無いページ）でも「--- Page N ---」は残す
7. 再構成テキストのみを出力（説明文や前置きは不要）

テキスト：
${batch}`,
                    },
                ],
            })
        }

        const normalizeCleaned = (rawCleaned) => {
            if (!rawCleaned || typeof rawCleaned !== 'string') return ''
            // Strip AI preamble before first "--- Page" marker
            let cleaned = rawCleaned
            const firstPage = rawCleaned.indexOf('--- Page')
            if (firstPage > 0) cleaned = rawCleaned.slice(firstPage)
            return cleaned.trim()
        }

        const isValidCleaned = (cleaned) => {
            if (!cleaned) return false
            const origLines = batch
                .split('\n')
                .filter((l) => l.trim().length > 0).length
            const cleanLines = cleaned
                .split('\n')
                .filter((l) => l.trim().length > 0).length
            return (
                cleanLines >= origLines * 0.6 &&
                cleaned.length > batch.length * 0.4
            )
        }

        try {
            let rawCleaned = await runCleanup(primaryModel)
            let cleaned = normalizeCleaned(rawCleaned)

            // If invalid and we have a fallback model, retry once
            if (!isValidCleaned(cleaned) && fbModel) {
                if (onProgress)
                    onProgress(`AI再構成: ${pct}% — ${fbModel} で再試行中...`)
                try {
                    rawCleaned = await runCleanup(fbModel)
                    const fbCleaned = normalizeCleaned(rawCleaned)
                    if (isValidCleaned(fbCleaned)) cleaned = fbCleaned
                } catch {}
            }

            if (isValidCleaned(cleaned)) results.push(cleaned)
            else results.push(batch)
        } catch (e) {
            // Network/model error: fallback once if available
            if (fbModel) {
                try {
                    if (onProgress)
                        onProgress(
                            `AI再構成: ${pct}% — ${fbModel} で再試行中...`,
                        )
                    const rawCleaned = await runCleanup(fbModel)
                    const cleaned = normalizeCleaned(rawCleaned)
                    if (isValidCleaned(cleaned)) {
                        results.push(cleaned)
                        continue
                    }
                } catch {}
            }
            results.push(batch)
        }
    }

    const final = results.join('\n\n').trim()
    // Final validation: result must retain most of original content
    const origLineCount = rawText
        .split('\n')
        .filter((l) => l.trim().length > 0).length
    const finalLineCount = final
        .split('\n')
        .filter((l) => l.trim().length > 0).length
    if (finalLineCount < origLineCount * 0.5) {
        return null // Too much content lost, reject AI cleanup
    }
    return final
}
// ═══ HTML Text Extraction (shared by parseHTML + URL scraping) ═══
function extractTextFromHTML(html){
  const doc=new DOMParser().parseFromString(html,"text/html");
  // Remove noise elements
  const noise=doc.querySelectorAll("script,style,noscript,svg,path,nav,iframe,link,meta");
  noise.forEach(el=>el.remove());
  const body=doc.body;
  if(!body)return"";
  function walk(node){
    if(node.nodeType===3)return node.textContent;
    if(node.nodeType!==1)return"";
    const tag=node.tagName.toLowerCase();
    const block=new Set(["div","p","h1","h2","h3","h4","h5","h6","li","tr","br","hr","section","article","header","footer","blockquote","pre","table","thead","tbody","main","aside","figcaption","dt","dd"]);
    let t="";
    for(const c of node.childNodes)t+=walk(c);
    if(tag==="br")return"\n";
    if(tag==="hr")return"\n---\n";
    if(tag==="li")return"・"+t.trim()+"\n";
    if(tag==="tr")return t.trim()+"\n";
    if(tag==="td"||tag==="th")return t.trim()+" | ";
    if(tag==="a"){const href=node.getAttribute("href");return href&&href.startsWith("http")?`${t.trim()} (${href}) `:`${t} `;}
    if(block.has(tag))return"\n"+t.trim()+"\n";
    return t;
  }
  // Also extract page title and meta description
  const title=doc.querySelector("title")?.textContent?.trim()||"";
  const metaDesc=doc.querySelector('meta[name="description"]')?.getAttribute("content")||"";
  const ogTitle=doc.querySelector('meta[property="og:title"]')?.getAttribute("content")||"";
  let prefix="";
  if(title)prefix+=title+"\n";
  if(ogTitle&&ogTitle!==title)prefix+=ogTitle+"\n";
  if(metaDesc)prefix+=metaDesc+"\n";
  if(prefix)prefix+="\n---\n\n";
  const bodyText=walk(body).replace(/\n{3,}/g,"\n\n").replace(/[ \t]{2,}/g," ").trim();
  return prefix+bodyText;
}

// ═══ URL Scraping ═══
// 2025年実態調査結果:
// corsproxy.io → HTML無効化(フィッシング対策)。JSON/XML/CSVのみ。使用不可
// allorigins.win → 動作するが50%の確率でCORSヘッダー欠落(GitHub issue #135)
// cors.lol → 2025-05-25にサービス終了
// corsfix.com → 動作。無料(開発用60req/min)。本番は有料
// everyorigin → 動作。無料。レート制限なし。Netlifyホスト
// codetabs → 不安定
const CORS_PROXIES=[
  url=>`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url=>`https://everyorigin.jwvbremen.nl/api/get?url=${encodeURIComponent(url)}`,
  url=>`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  url=>`https://proxy.corsfix.com/?${encodeURIComponent(url)}`,
];

async function fetchURL(url,onProgress,customProxy){
  if(!/^https?:\/\//i.test(url))url="https://"+url;
  if(onProgress)onProgress("URL取得中...");
  
  // 0. Auto-detect Next.js environment: use /api/scrape if available
  if(!customProxy && typeof window!=='undefined' && window.location?.origin){
    const localProxy=window.location.origin+"/api/scrape?url={url}";
    try{
      if(onProgress)onProgress("サーバー経由で取得中...");
      const proxyUrl=localProxy.replace("{url}",encodeURIComponent(url));
      const res=await fetch(proxyUrl,{signal:AbortSignal.timeout(15000)});
      if(res.ok){const html=await res.text();if(html.length>100&&!html.startsWith('{"error')){if(onProgress)onProgress("サーバー経由で取得成功");return html;}}
    }catch(e){console.log("Local /api/scrape not available:",e.message);}
  }
  
  // 1. Custom proxy (self-hosted, most reliable)
  if(customProxy){
    if(onProgress)onProgress("自前プロキシ経由で取得中...");
    try{
      const proxyUrl=customProxy.replace("{url}",encodeURIComponent(url));
      const res=await fetch(proxyUrl,{signal:AbortSignal.timeout(15000)});
      if(res.ok){const html=await res.text();if(html.length>100){if(onProgress)onProgress("自前プロキシ経由で取得成功");return html;}}
    }catch(e){console.log("Custom proxy failed:",e.message);}
  }
  
  // 2. Direct fetch (works for CORS-enabled sites)
  try{
    const res=await fetch(url,{headers:{"Accept":"text/html,*/*"},signal:AbortSignal.timeout(8000)});
    if(res.ok){
      const ct=res.headers.get("content-type")||"";
      if(ct.includes("text/html")||ct.includes("text/plain")||!ct){
        const html=await res.text();
        if(html.length>100){if(onProgress)onProgress("直接取得成功");return html;}
      }
    }
  }catch(e){console.log("Direct fetch failed:",e.message);}
  
  // 3. CORS proxies (try all in parallel for speed, use first success)
  if(onProgress)onProgress(`CORSプロキシ経由で取得中 (${CORS_PROXIES.length}件並列)...`);
  const results=await Promise.allSettled(
    CORS_PROXIES.map(async(mkUrl,i)=>{
      const proxyUrl=mkUrl(url);
      const res=await fetch(proxyUrl,{signal:AbortSignal.timeout(12000)});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const html=await res.text();
      // Validate: must be real HTML, not error JSON
      if(html.length<100||html.startsWith('{"error'))throw new Error("Invalid response");
      return{html,proxy:i};
    })
  );
  const success=results.find(r=>r.status==="fulfilled");
  if(success){
    const proxyNames=["allOrigins","everyOrigin","CodeTabs","Corsfix"];
    if(onProgress)onProgress(`${proxyNames[success.value.proxy]}経由で取得成功`);
    return success.value.html;
  }
  
  throw new Error("URLの取得に失敗しました。CORSポリシーによりブロックされた可能性があります。\n\n代替手段：\n・ブラウザでページを開き Ctrl+A → Ctrl+C でコピー\n・「テキスト/HTML貼付」タブに貼り付けてください\n・Ctrl+U でHTMLソースをコピーするとより高精度です");
}

// SPA sites that can't be scraped — require PDF download first
const SPA_DOMAINS=["canva.com","figma.com","notion.so","docs.google.com","drive.google.com","adobe.com","miro.com"];
function isSPADomain(url){try{const h=new URL(url).hostname.replace(/^www\./,"");return SPA_DOMAINS.some(d=>h===d||h.endsWith("."+d));}catch(e){return false;}}

async function scrapeURL(url,onProgress,customProxy){
  // Pre-check: SPA sites that won't yield text via scraping
  if(isSPADomain(url)){
    const domain=new URL(url).hostname.replace(/^www\./,"");
    throw new Error(`${domain} はJavaScript描画のSPAサイトのため、URLスクレイピングではテキストを取得できません。\n\n代替手段：\n1. サイト上で「PDFダウンロード」→「ファイル」タブからアップロード\n2. テキストをコピー →「テキスト/HTML貼付」タブに貼り付け\n3. ブラウザで Ctrl+P → PDF保存 → アップロード`);
  }
  const html=await fetchURL(url,onProgress,customProxy);
  if(onProgress)onProgress("テキスト抽出中...");

  const text=extractTextFromHTML(html);
  if(!text||text.length<20)throw new Error("ページからテキストを抽出できませんでした。JavaScript描画のSPAサイトの場合、HTMLコピー＆ペーストをお試しください。");

  // Extract domain for naming
  let domain="";
  try{domain=new URL(url).hostname.replace(/^www\./,"");}catch(e){}

  return{text,format:`Web (${domain})`,fileName:domain?`${domain}_scraped.html`:"web_scraped.html",pageCount:null};
}

async function parseXLSX(f){const ab=await readBuf(f);const wb=XLSX.read(ab,{type:"array",codepage:932,raw:false,cellDates:true});let t="";for(const sn of wb.SheetNames){const csv=XLSX.utils.sheet_to_csv(wb.Sheets[sn],{FS:" | ",blankrows:false});const cl=csv.split("\n").filter(l=>l.replace(/[\s|]/g,"").length>0).join("\n");if(cl)t+=`--- Sheet: ${sn} ---\n${cl}\n\n`;}return{text:t,pageCount:wb.SheetNames.length,format:"Excel"};}
async function parseCSV(f){const ab=await readBuf(f);const{text,encoding}=decodeText(ab);const p=Papa.parse(text,{header:false,skipEmptyLines:true});return{text:p.data.filter(r=>r.some(c=>c.trim())).map(r=>r.join(" | ")).join("\n"),pageCount:null,format:`CSV (${encoding})`};}
async function parseTXT(f){const ab=await readBuf(f);const{text,encoding}=decodeText(ab);return{text,pageCount:null,format:`Text (${encoding})`};}
async function parseMD(f){const ab=await readBuf(f);const{text,encoding}=decodeText(ab);return{text,pageCount:null,format:`Markdown (${encoding})`};}
async function parseHTML(f){const ab=await readBuf(f);const{text}=decodeText(ab);
  const extracted=extractTextFromHTML(text);
  return{text:extracted,pageCount:null,format:"HTML"};}
async function parseRTF(f){const ab=await readBuf(f);const{text}=decodeText(ab);
  // Basic RTF text extraction: strip control words, extract text
  let result=text;
  // Remove RTF header/font tables etc inside { } groups (greedy for nested)
  result=result.replace(/\{\\fonttbl[^}]*(\{[^}]*\})*[^}]*\}/g,"");
  result=result.replace(/\{\\colortbl[^}]*\}/g,"");
  result=result.replace(/\{\\stylesheet[^}]*(\{[^}]*\})*[^}]*\}/g,"");
  result=result.replace(/\{\\info[^}]*(\{[^}]*\})*[^}]*\}/g,"");
  // Handle common RTF control words
  result=result.replace(/\\par[d]?\s?/g,"\n");
  result=result.replace(/\\line\s?/g,"\n");
  result=result.replace(/\\tab\s?/g,"\t");
  result=result.replace(/\\\n/g,"\n");
  // Handle Unicode characters: \'XX (hex) and \uNNNN
  result=result.replace(/\\'([0-9a-fA-F]{2})/g,(m,h)=>String.fromCharCode(parseInt(h,16)));
  result=result.replace(/\\u(\d+)\s?\??/g,(m,n)=>String.fromCharCode(parseInt(n)));
  // Strip remaining control words and braces
  result=result.replace(/\\[a-z]+[-]?\d*\s?/g,"");
  result=result.replace(/[{}]/g,"");
  result=result.replace(/\n{3,}/g,"\n\n").trim();
  return{text:result,pageCount:null,format:"RTF"};}
async function parseJSON(f){const ab=await readBuf(f);const{text}=decodeText(ab);
  try{
    const obj=JSON.parse(text);
    // Recursively extract string values for PII scanning
    function extract(o,path=""){
      if(typeof o==="string")return`${path}: ${o}`;
      if(Array.isArray(o))return o.map((v,i)=>extract(v,`${path}[${i}]`)).filter(Boolean).join("\n");
      if(o&&typeof o==="object")return Object.entries(o).map(([k,v])=>extract(v,path?`${path}.${k}`:k)).filter(Boolean).join("\n");
      if(o!==null&&o!==undefined)return`${path}: ${String(o)}`;
      return"";
    }
    return{text:extract(obj),pageCount:null,format:"JSON"};
  }catch(e){
    return{text,pageCount:null,format:"JSON (raw)"};
  }}
async function parseDOCX(f){
  const ab=await readBuf(f);
  try{
    const result=await mammoth.extractRawText({arrayBuffer:ab});
    const text=result.value||"";
    if(text.trim().length<5)throw new Error("テキストが抽出できませんでした");
    // Clean up: normalize whitespace, preserve paragraph breaks
    const cleaned=text.split("\n").map(l=>l.trimEnd()).filter((l,i,a)=>{
      // Collapse 3+ blank lines into 2
      if(!l.trim()&&i>0&&!a[i-1].trim()&&i>1&&!a[i-2].trim())return false;
      return true;
    }).join("\n");
    // Count approximate "pages" by character count (A4 ≈ 1500 chars)
    const approxPages=Math.max(1,Math.ceil(cleaned.length/1500));
    return{text:cleaned,pageCount:approxPages,format:"Word (DOCX)"};
  }catch(e){
    // Fallback: try as ZIP and extract document.xml text content
    try{
      const bytes=new Uint8Array(ab);
      const decoder=new TextDecoder("utf-8");
      const raw=decoder.decode(bytes);
      const textContent=raw.replace(/<[^>]+>/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/\s{2,}/g," ").trim();
      if(textContent.length>20)return{text:textContent,pageCount:null,format:"Word (basic)"};
    }catch(e2){}
    throw new Error("DOCX解析エラー: "+e.message+"\nファイルが破損している可能性があります");
  }
}
async function parseODT(f){
  // ODT is a ZIP file. Try mammoth first (partial ODT support), then fallback to raw XML extraction
  const ab=await readBuf(f);
  try{
    const r=await mammoth.extractRawText({arrayBuffer:ab});
    if(r.value&&r.value.trim().length>10)return{text:r.value.split("\n").map(l=>l.trimEnd()).join("\n"),pageCount:null,format:"ODT"};
  }catch(e){}
  // Fallback: try to find content.xml in the ZIP manually (basic ZIP parsing)
  try{
    const bytes=new Uint8Array(ab);
    // Find PK signature and locate content.xml
    const decoder=new TextDecoder("utf-8");
    const raw=decoder.decode(bytes);
    // Extract text between XML tags (very basic)
    const textContent=raw.replace(/<[^>]+>/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/\s{2,}/g," ").trim();
    // Filter out binary garbage - keep only printable text runs
    const lines=textContent.split(/\s+/).filter(w=>/^[\u0020-\u007E\u00A0-\uFFFF]{2,}$/.test(w));
    if(lines.length>5)return{text:lines.join(" "),pageCount:null,format:"ODT (basic)"};
    throw new Error("テキスト抽出失敗");
  }catch(e){
    throw new Error("ODTの解析に失敗しました。Word(.docx)形式での保存を推奨します。");
  }}
async function parseFile(file,onProgress){const ext=file.name.split(".").pop().toLowerCase();const P={pdf:parsePDF,docx:parseDOCX,doc:parseDOCX,xlsx:parseXLSX,xls:parseXLSX,ods:parseXLSX,csv:parseCSV,txt:parseTXT,tsv:parseTXT,md:parseMD,markdown:parseMD,html:parseHTML,htm:parseHTML,rtf:parseRTF,json:parseJSON,odt:parseODT};if(!P[ext])throw new Error("未対応: ."+ext+"\n対応形式: PDF, Word(.docx/.doc), Excel(.xlsx/.xls), ODS, CSV, TSV, TXT, Markdown, HTML, RTF, JSON, ODT");const r=await P[ext](file,{onProgress});r.text=normalizeText(r.text.replace(/[^\S\n]+$/gm,"").replace(/\n{3,}/g,"\n\n").replace(/^\n+/,"").trimEnd());return r;}

// ═══ AI Reformat ═══
async function aiReformat(redactedText,instruction,apiKey,model){
  const provider=getProviderForModel(model);
  return await callAI({
      provider,
      model: model || 'gpt-5-nano',
      apiKey,
      maxTokens: 4000,
      messages: [
          {
              role: 'user',
              content: `あなたは人材紹介エージェントの書類作成アシスタントです。以下は個人情報をマスキング済みの職務経歴書テキストです。指定されたフォーマット指示に従って再構成してください。\n\n【重要】\n- [氏名非公開]等のマスキング箇所はそのまま維持\n- 新たな個人情報を推測・追加しない\n- 内容の事実を変更しない\n\n【フォーマット指示】\n${instruction}\n\n【マスキング済みテキスト】\n${redactedText.slice(0, 6000)}`,
          },
      ],
  })
}

// ═══ Export helpers ═══
function fileTimestamp(){const d=new Date();return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}_${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;}

// ═══ Export generators ═══
function generateExport(rawContent,format,baseName){
  const bom="\uFEFF",ts=new Date().toLocaleString("ja-JP");
  // Strip page/sheet markers from export output
  const content=rawContent.replace(/^-{2,}\s*(?:Page\s+\d+|Sheet:\s*.+)\s*-{2,}\s*\n?/gm,"").replace(/^\n+/,"");
  switch(format){
    case"txt":return{data:bom+content,mime:"text/plain;charset=utf-8",name:baseName+".txt"};
    case"md":return{data:bom+`# ${baseName}\n\n> Exported: ${ts}\n\n---\n\n${content}`,mime:"text/markdown;charset=utf-8",name:baseName+".md"};
    case"csv":{const rows=content.split("\n").map((l,i)=>`"${i+1}","${l.replace(/"/g,'""')}"`);return{data:bom+"行番号,内容\n"+rows.join("\n"),mime:"text/csv;charset=utf-8",name:baseName+".csv"};}
    case"xlsx":{const lines=content.split("\n");const ws=XLSX.utils.aoa_to_sheet(lines.map((l,i)=>[i+1,l]));ws["!cols"]=[{wch:6},{wch:100}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"マスキング済み");const out=XLSX.write(wb,{type:"base64",bookType:"xlsx"});return{dataUri:"data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"+out,name:baseName+".xlsx"};}
    case"pdf":{
      const doc=`# ${baseName}\n\n**出力日時:** ${ts}\n\n---\n\n${content}`;
      const html=generatePDFHTML(doc,"gothic",{stripRedactions:false,highlightRedactions:true,removeRedactionOnlyLines:false});
      const printHTML=html.replace("</body>",`<script>window.onload=function(){window.print();setTimeout(()=>{window.close()},1000)}<\/script></body>`);
      return{data:printHTML,mime:"text/html;charset=utf-8",name:baseName+".html",isPrintPdf:true};
    }
    case"docx":{const esc=content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");const doc=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:'Noto Sans JP','MS Gothic',sans-serif;font-size:10.5pt;line-height:1.8;color:#222}h1{font-size:14pt;border-bottom:1.5pt solid #333;padding-bottom:4pt}.rd{background:#fee;color:#c33;font-weight:bold}</style></head><body><h1>${baseName}</h1><p style="font-size:8pt;color:#888">出力: ${ts}</p><div>${esc.replace(/\[([^\]]*非公開[^\]]*|[^\]]*Redacted[^\]]*)\]/g,'<span class="rd">[$1]</span>')}</div></body></html>`;return{data:bom+doc,mime:"application/msword;charset=utf-8",name:baseName+".docx"};}
    default:return{data:content,mime:"text/plain;charset=utf-8",name:baseName+".txt"};
  }
}
function triggerDownload(ex){try{if(ex.isPrintPdf){const blob=new Blob([ex.data],{type:ex.mime});const url=URL.createObjectURL(blob);const win=window.open(url,"_blank");if(win)win.focus();return;}const a=document.createElement("a");a.href=ex.dataUri||("data:"+ex.mime+","+encodeURIComponent(ex.data));a.download=ex.name;document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(e){}}

// ═══ UI primitives ═══
function Badge({ children, color, bg, style: sx }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color,
                background: bg,
                whiteSpace: 'nowrap',
                ...sx,
            }}
        >
            {children}
        </span>
    )
}
function Btn({children,variant="primary",onClick,disabled,style:sx}){const base={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,padding:"11px 22px",borderRadius:10,fontSize:14,fontWeight:600,fontFamily:T.font,cursor:disabled?"default":"pointer",border:"none",transition:"all .15s",opacity:disabled?.35:1};const v={primary:{background:T.accent,color:"#fff"},ghost:{background:"transparent",color:T.text2,border:`1px solid ${T.border}`},danger:{background:T.redDim,color:T.red},success:{background:T.greenDim,color:T.green}};return <button onClick={disabled?undefined:onClick} style={{...base,...v[variant],...sx}}>{children}</button>;}
function Toggle({checked,onChange,size="md",disabled=false}){const w=size==="sm"?32:38,h=size==="sm"?18:22,d=size==="sm"?12:16;return <button onClick={(e)=>{if(disabled)return;e.stopPropagation();onChange&&onChange();}} style={{width:w,height:h,borderRadius:h/2,border:"none",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,background:checked?T.accent:T.border,position:"relative",transition:"background .2s",flexShrink:0}}><span style={{position:"absolute",top:(h-d)/2,left:checked?w-d-3:3,width:d,height:d,borderRadius:d/2,background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.25)"}}/></button>;}
function Pill({ children, active, onClick, color }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '4px 11px',
                borderRadius: 7,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                fontFamily: T.font,
                background: active
                    ? color
                        ? `${color}1A`
                        : T.accentDim
                    : T.surfaceAlt,
                color: active ? color || T.accent : T.text3,
                transition: 'all .15s',
            }}
        >
            {children}
        </button>
    )
}

// ═══ Layout Presets ═══
const LAYOUT_PRESETS=[
  {id:'text',  label:'テキスト重視',    cols:[{f:3},{f:1}]},
  {id:'balanced',label:'バランス',       cols:[{f:5},{f:3},{f:2}]},
  {id:'preview',label:'プレビュー重視', cols:[{f:2},{f:5},{f:2}]},
  {id:'focus', label:'集中モード',      cols:[{f:1}]},
];
function LayoutIcon({cols,active,color}){
  return (
    <div style={{
      width:28,height:18,borderRadius:3,
      border:`1.5px solid ${active?color:T.border}`,
      display:'flex',gap:1,padding:2,
      background:active?`${color}18`:'transparent',
      overflow:'hidden',
    }}>
      {cols.map((c,i)=>(
        <span key={i} style={{
          flex:c.f,borderRadius:1,
          background:active?color:T.text3,
          opacity:active?0.7:0.25,
        }}/>
      ))}
    </div>
  );
}

// ═══ Settings Modal ═══
function SettingsModal({settings,onSave,onClose,isDark,setIsDark}){
  const [provider, setProvider] = useState(settings.provider || 'openai')
  const [model, setModel] = useState(settings.model || 'gpt-5-nano')
  const[apiKey,setApiKey]=useState(settings.apiKey||"");
  const[aiDetect,setAiDetect]=useState(settings.aiDetect!==false);
  const [aiProfile, setAiProfile] = useState(settings.aiProfile || 'balanced')
  const[proxyUrl,setProxyUrl]=useState(settings.proxyUrl||"");
  const[showKey,setShowKey]=useState(false);
  const[saved,setSaved]=useState(false);
  const [testingKey, setTestingKey] = useState(false)
  const [keyTest, setKeyTest] = useState(null)
  const safeSet=async(key,val)=>{await storage.set(key,val);};
  const handleSave = () => {
      onSave({ apiKey, model, aiDetect, aiProfile, provider, proxyUrl })
      ;(async () => {
          await safeSet('rp_api_key', apiKey)
          await safeSet('rp_model', model)
          await safeSet('rp_ai_detect', String(aiDetect))
          await safeSet('rp_ai_profile', aiProfile)
          await safeSet('rp_provider', provider)
          await safeSet('rp_proxy_url', proxyUrl)
          await safeSet('rp_theme', isDark ? 'dark' : 'light')
      })()
      setSaved(true)
      setTimeout(() => {
          setSaved(false)
          onClose()
      }, 600)
  }
  const curProv=AI_PROVIDERS.find(p=>p.id===provider)||AI_PROVIDERS[0];
  const masked=apiKey?apiKey.slice(0,8)+"..."+apiKey.slice(-4):"";
  const PROFILES = [
      { id: 'speed', label: '速度', desc: '最速・低コスト' },
      { id: 'balanced', label: 'バランス', desc: '検出は速く、整形は高品質' },
      { id: 'quality', label: '品質', desc: '高品質（遅め）' },
  ]
  // When switching provider, auto-select default model
  const switchProvider = (pid) => {
      setProvider(pid)
      setModel(pickFormatModelForProfile(pid, aiProfile) || 'gpt-5-nano')
  }
  const keyPlaceholder =
      provider === 'anthropic'
          ? 'sk-ant-api03-...（省略可）'
          : provider === 'openai'
            ? 'sk-proj-...（未入力ならサーバー環境変数）'
            : 'AIza...（必須）'
  const requiresKey = provider === 'google'
  useEffect(() => {
      setKeyTest(null)
  }, [provider, model, apiKey])
  useEffect(() => {
      // Provider list may change defaults; if current model isn't in provider, snap to profile default.
      if (!curProv.models.some((m) => m.id === model)) {
          setModel(
              pickFormatModelForProfile(provider, aiProfile) || 'gpt-5-nano',
          )
      }
  }, [provider, aiProfile]) // eslint-disable-line
  const testApiConnection = async () => {
      const key = apiKey.trim()
      if (requiresKey && !key) {
          setKeyTest({
              ok: false,
              msg: 'このプロバイダーはAPIキーが必須です。先にキーを入力してください。',
          })
          return
      }
      setTestingKey(true)
      setKeyTest(null)
      try {
          const text = await callAI({
              provider,
              model,
              apiKey: key || undefined,
              maxTokens: 32,
              messages: [
                  {
                      role: 'user',
                      content: '接続テストです。`OK` だけ返答してください。',
                  },
              ],
          })
          const short = (text || '').replace(/\s+/g, ' ').trim().slice(0, 48)
          setKeyTest({
              ok: true,
              msg: `接続OK (${provider} / ${model})${short ? ` 返答: ${short}` : ''}`,
          })
      } catch (e) {
          setKeyTest({
              ok: false,
              msg: `接続失敗: ${e?.message || '不明なエラー'}`,
          })
      } finally {
          setTestingKey(false)
      }
  }
  return (
      <div
          style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.55)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              padding: 16,
              animation: 'fadeIn .2s',
          }}
          onClick={(e) => {
              if (e.target === e.currentTarget) onClose()
          }}
      >
          <div
              className='rp-modal-inner'
              style={{
                  width: '100%',
                  maxWidth: 560,
                  maxHeight: '92vh',
                  overflow: 'auto',
                  background: T.bg2,
                  borderRadius: 16,
                  border: `1px solid ${T.border}`,
                  animation: 'fadeUp .3s ease',
              }}
          >
              <div
                  style={{
                      padding: '14px 20px',
                      borderBottom: `1px solid ${T.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      position: 'sticky',
                      top: 0,
                      background: T.bg2,
                      zIndex: 1,
                  }}
              >
                  <span
                      style={{ fontSize: 15, fontWeight: 700, color: T.text }}
                  >
                      設定
                  </span>
                  <button
                      onClick={onClose}
                      style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          border: `1px solid ${T.border}`,
                          background: 'transparent',
                          color: T.text2,
                          cursor: 'pointer',
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                      }}
                  >
                      ✕
                  </button>
              </div>
              <div
                  style={{
                      padding: '18px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 20,
                  }}
              >
                  {/* Theme */}
                  <div
                      style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: `1px solid ${T.border}`,
                          background: T.surface,
                      }}
                  >
                      <div
                          style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                          }}
                      >
                          <span style={{ fontSize: 16 }}>
                              {isDark ? '🌙' : '☀️'}
                          </span>
                          <div>
                              <div
                                  style={{
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: T.text,
                                  }}
                              >
                                  テーマ
                              </div>
                              <div style={{ fontSize: 12, color: T.text3 }}>
                                  {isDark ? 'ダークモード' : 'ライトモード'}
                              </div>
                          </div>
                      </div>
                      <Toggle
                          checked={!isDark}
                          onChange={() => setIsDark(!isDark)}
                          size='sm'
                      />
                  </div>
                  {/* Provider */}
                  <div>
                      <div
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text2,
                              marginBottom: 8,
                          }}
                      >
                          AIプロバイダー
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                          {AI_PROVIDERS.map((p) => (
                              <button
                                  key={p.id}
                                  onClick={() => switchProvider(p.id)}
                                  style={{
                                      flex: 1,
                                      padding: '10px 8px',
                                      borderRadius: 10,
                                      border: `1.5px solid ${provider === p.id ? p.color : T.border}`,
                                      background:
                                          provider === p.id
                                              ? `${p.color}15`
                                              : 'transparent',
                                      cursor: 'pointer',
                                      textAlign: 'center',
                                      transition: 'all .15s',
                                  }}
                              >
                                  <div
                                      style={{
                                          fontSize: 14,
                                          fontWeight: 700,
                                          color:
                                              provider === p.id
                                                  ? p.color
                                                  : T.text3,
                                          marginBottom: 2,
                                      }}
                                  >
                                      {p.icon}
                                  </div>
                                  <div
                                      style={{
                                          fontSize: 12,
                                          fontWeight: 600,
                                          color:
                                              provider === p.id
                                                  ? p.color
                                                  : T.text,
                                      }}
                                  >
                                      {p.label}
                                  </div>
                                  {p.needsKey && (
                                      <div
                                          style={{
                                              fontSize: 12,
                                              color: T.text3,
                                              marginTop: 2,
                                          }}
                                      >
                                          要APIキー
                                      </div>
                                  )}
                              </button>
                          ))}
                      </div>
                  </div>
                  {/* Models */}
                  <div>
                      <div
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text2,
                              marginBottom: 8,
                          }}
                      >
                          モデル{' '}
                          <span style={{ fontWeight: 400, color: T.text3 }}>
                              — {curProv.label}
                          </span>
                      </div>
                      <div
                          style={{
                              fontSize: 12,
                              color: T.text3,
                              marginBottom: 8,
                              lineHeight: 1.6,
                          }}
                      >
                          {aiProfile === 'balanced' && (
                              <>
                                  再フォーマット/再構成はこのモデル。PII検出は高速モデルを自動選択します。
                              </>
                          )}
                          {aiProfile === 'speed' && (
                              <>
                                  全て高速モデル寄りで実行します（品質より速度優先）。
                              </>
                          )}
                          {aiProfile === 'quality' && (
                              <>
                                  可能な限り高品質モデルで実行します（遅くなります）。
                              </>
                          )}
                      </div>
                      <div
                          className='rp-settings-models'
                          style={{
                              display: 'grid',
                              gridTemplateColumns:
                                  curProv.models.length <= 2
                                      ? '1fr 1fr'
                                      : '1fr 1fr 1fr',
                              gap: 6,
                          }}
                      >
                          {curProv.models.map((m) => (
                              <button
                                  key={m.id}
                                  onClick={() => setModel(m.id)}
                                  style={{
                                      padding: '9px 12px',
                                      borderRadius: 9,
                                      border: `1.5px solid ${model === m.id ? curProv.color : T.border}`,
                                      background:
                                          model === m.id
                                              ? `${curProv.color}15`
                                              : 'transparent',
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      transition: 'all .15s',
                                  }}
                              >
                                  <div
                                      style={{
                                          fontSize: 12,
                                          fontWeight: 600,
                                          color:
                                              model === m.id
                                                  ? curProv.color
                                                  : T.text,
                                      }}
                                  >
                                      {m.label}
                                  </div>
                                  <div
                                      style={{
                                          fontSize: 12,
                                          color: T.text3,
                                          marginTop: 1,
                                      }}
                                  >
                                      {m.desc}
                                  </div>
                              </button>
                          ))}
                      </div>
                  </div>
                  {/* AI profile */}
                  <div>
                      <div
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text2,
                              marginBottom: 8,
                          }}
                      >
                          AI品質プロファイル
                      </div>
                      <div
                          style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr 1fr',
                              gap: 6,
                          }}
                      >
                          {PROFILES.map((p) => (
                              <button
                                  key={p.id}
                                  onClick={() => {
                                      setAiProfile(p.id)
                                      setModel(
                                          pickFormatModelForProfile(
                                              provider,
                                              p.id,
                                          ) || model,
                                      )
                                  }}
                                  style={{
                                      padding: '10px 12px',
                                      borderRadius: 10,
                                      border: `1.5px solid ${aiProfile === p.id ? curProv.color : T.border}`,
                                      background:
                                          aiProfile === p.id
                                              ? `${curProv.color}15`
                                              : 'transparent',
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      transition: 'all .15s',
                                  }}
                              >
                                  <div
                                      style={{
                                          fontSize: 12,
                                          fontWeight: 700,
                                          color:
                                              aiProfile === p.id
                                                  ? curProv.color
                                                  : T.text,
                                          marginBottom: 2,
                                      }}
                                  >
                                      {p.label}
                                  </div>
                                  <div
                                      style={{
                                          fontSize: 12,
                                          color: T.text3,
                                          lineHeight: 1.4,
                                      }}
                                  >
                                      {p.desc}
                                  </div>
                              </button>
                          ))}
                      </div>
                      <div
                          style={{
                              fontSize: 12,
                              color: T.text3,
                              marginTop: 8,
                              lineHeight: 1.6,
                          }}
                      >
                          バランス推奨:{' '}
                          <span style={{ fontFamily: T.mono }}>
                              PII検出=高速
                          </span>{' '}
                          /{' '}
                          <span style={{ fontFamily: T.mono }}>
                              再構成・再フォーマット=高品質
                          </span>
                          （例: OpenAIなら検出は GPT-5 Nano、整形は GPT-5 Mini）
                      </div>
                  </div>
                  {/* AI detect toggle */}
                  <div
                      style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: `1px solid ${T.border}`,
                          background: T.surface,
                      }}
                  >
                      <div>
                          <div
                              style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: T.text,
                              }}
                          >
                              AI PII検出
                          </div>
                          <div style={{ fontSize: 12, color: T.text3 }}>
                              アップロード時にAIで人名を自動検出
                          </div>
                      </div>
                      <Toggle
                          checked={aiDetect}
                          onChange={() => setAiDetect(!aiDetect)}
                          size='sm'
                      />
                  </div>
                  {/* API Key */}
                  <div>
                      <div
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text2,
                              marginBottom: 4,
                          }}
                      >
                          API Key
                      </div>
                      <div
                          style={{
                              fontSize: 12,
                              color: T.text3,
                              marginBottom: 8,
                              lineHeight: 1.5,
                          }}
                      >
                          {provider === 'anthropic'
                              ? '未入力時はclaude.ai組み込みプロキシを使用。'
                              : provider === 'openai'
                                ? '未入力時はサーバー環境変数 OPENAI_API_KEY を使用します。'
                                : 'APIキーが必須です。右のボタンで接続テストできます。'}
                      </div>
                      <div style={{ position: 'relative' }}>
                          <input
                              type={showKey ? 'text' : 'password'}
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              placeholder={keyPlaceholder}
                              style={{
                                  width: '100%',
                                  padding: '10px 14px',
                                  paddingRight: 52,
                                  borderRadius: 10,
                                  border: `1px solid ${T.border}`,
                                  background: T.surface,
                                  color: T.text,
                                  fontSize: 12,
                                  fontFamily: T.mono,
                                  outline: 'none',
                              }}
                          />
                          <button
                              onClick={() => setShowKey(!showKey)}
                              style={{
                                  position: 'absolute',
                                  right: 8,
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  background: 'transparent',
                                  border: 'none',
                                  color: T.text3,
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontFamily: T.font,
                              }}
                          >
                              {showKey ? '隠す' : '表示'}
                          </button>
                      </div>
                      {apiKey && !showKey && (
                          <div
                              style={{
                                  fontSize: 12,
                                  color: T.text3,
                                  marginTop: 4,
                                  fontFamily: T.mono,
                              }}
                          >
                              {masked}
                          </div>
                      )}
                      <div
                          style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginTop: 8,
                          }}
                      >
                          <Btn
                              variant='ghost'
                              onClick={testApiConnection}
                              disabled={testingKey}
                              style={{
                                  padding: '6px 12px',
                                  fontSize: 12,
                                  borderRadius: 7,
                              }}
                          >
                              {testingKey ? '接続テスト中...' : 'API接続テスト'}
                          </Btn>
                          {keyTest && (
                              <span
                                  style={{
                                      fontSize: 12,
                                      color: keyTest.ok ? T.green : T.red,
                                      lineHeight: 1.4,
                                  }}
                              >
                                  {keyTest.msg}
                              </span>
                          )}
                      </div>
                  </div>
                  {/* Proxy URL for URL scraping */}
                  <div>
                      <div
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text2,
                              marginBottom: 4,
                          }}
                      >
                          スクレイピング用プロキシURL{' '}
                          <span
                              style={{
                                  fontSize: 12,
                                  fontWeight: 400,
                                  color: T.text3,
                              }}
                          >
                              (任意)
                          </span>
                      </div>
                      <div
                          style={{
                              fontSize: 12,
                              color: T.text3,
                              marginBottom: 8,
                              lineHeight: 1.6,
                          }}
                      >
                          URLタブでWebページ本文を取るときに使う「中継サーバー」のURLです。
                          <br />
                          例:{' '}
                          <span style={{ fontFamily: T.mono }}>
                              https://your-proxy.example.com/fetch?url={'{url}'}
                          </span>
                          （
                          <span style={{ fontFamily: T.mono }}>{'{url}'}</span>{' '}
                          は取得対象URLに自動置換）
                          <br />
                          通常はサーバー経由で自動取得されるため、設定不要です。独自の中継サーバーがある場合のみ入力してください。
                      </div>
                      <input
                          value={proxyUrl}
                          onChange={(e) => setProxyUrl(e.target.value)}
                          placeholder='https://your-proxy.example.com/fetch?url={url}'
                          style={{
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: 10,
                              border: `1px solid ${T.border}`,
                              background: T.surface,
                              color: T.text,
                              fontSize: 12,
                              fontFamily: T.mono,
                              outline: 'none',
                              boxSizing: 'border-box',
                          }}
                      />
                      {!proxyUrl && (
                          <div
                              style={{
                                  fontSize: 12,
                                  color: T.text3,
                                  marginTop: 6,
                                  lineHeight: 1.5,
                              }}
                          >
                              未設定でOK — サーバー経由で自動取得します。
                          </div>
                      )}
                      {proxyUrl && !proxyUrl.includes('{url}') && (
                          <div
                              style={{
                                  fontSize: 12,
                                  color: T.red,
                                  marginTop: 6,
                                  lineHeight: 1.5,
                              }}
                          >
                              ⚠ プロキシURLに {'{url}'}{' '}
                              がありません。対象URLを渡せないため正しく動作しません。
                          </div>
                      )}
                  </div>
                  <div
                      style={{
                          display: 'flex',
                          gap: 8,
                          justifyContent: 'flex-end',
                      }}
                  >
                      <Btn
                          variant='ghost'
                          onClick={() => {
                              if(!confirm('すべての設定を初期値に戻しますか？'))return;
                              setProvider('openai');setModel('gpt-5-nano');
                              setApiKey('');setAiDetect(true);
                              setAiProfile('balanced');setProxyUrl('');
                          }}
                          style={{
                              padding: '8px 16px',
                              fontSize: 12,
                              borderRadius: 8,
                              marginRight: 'auto',
                              color: T.red,
                          }}
                      >
                          初期化
                      </Btn>
                      {apiKey && (
                          <Btn
                              variant='ghost'
                              onClick={() => setApiKey('')}
                              style={{
                                  padding: '8px 16px',
                                  fontSize: 12,
                                  borderRadius: 8,
                              }}
                          >
                              消去
                          </Btn>
                      )}
                      <Btn
                          variant={saved ? 'success' : 'primary'}
                          onClick={handleSave}
                          style={{
                              padding: '8px 20px',
                              fontSize: 12,
                              borderRadius: 8,
                          }}
                      >
                          {saved ? '✓ 保存済' : '保存'}
                      </Btn>
                  </div>
              </div>
          </div>
      </div>
  )
}

// ═══ Design Export (Canva-like template PDF) ═══

// --- Section Parser (regex fallback + AI) ---
const SECTION_MARKERS=/^(?:■|●|◆|◇|▶|▷|☆|★|━|─|═|【|〈|《|〔)|\n(?:#{1,3}\s)|^(?:職務経歴|学歴|資格|スキル|自己PR|志望動機|職務要約|経歴|キャリア|略歴|免許|特記|趣味|活動|受賞|出版|プロジェクト|業務|所属|研修|語学|表彰|社外|副業)/m;

function parseSections(text){
  // Split by common Japanese resume section markers
  const lines=text.split("\n");
  const sections=[];
  let cur=null;
  const headerRe=/^(?:[■●◆◇▶▷☆★━─═]+\s*|【(.+?)】|〈(.+?)〉|《(.+?)》|#{1,3}\s+)(.+?)$/;
  const labelRe=/^(職務経歴書?|履歴書?|学歴|職歴|資格|免許|スキル|自己PR|志望動機|職務要約|経歴概要|キャリアサマリ|プロジェクト|業務実績|語学|活動|その他|基本情報|個人情報|連絡先)\s*$/;
  const dividerRe=/^[-=─━]{3,}$/;

  for(const line of lines){
    const hm=line.match(headerRe);
    const lm=line.match(labelRe);
    const isDiv=dividerRe.test(line.trim());

    if(hm||lm){
      if(cur&&cur.lines.length)sections.push(cur);
      const title=hm?(hm[1]||hm[2]||hm[3]||hm[4]).trim():lm[1].trim();
      cur={title,lines:[]};
    }else if(isDiv){
      // divider after content starts a new unnamed section
      if(cur&&cur.lines.length){sections.push(cur);cur={title:"",lines:[]};}
    }else{
      if(!cur)cur={title:"",lines:[]};
      cur.lines.push(line);
    }
  }
  if(cur&&cur.lines.length)sections.push(cur);

  // Classify sections
  return sections.map(s=>{
    const t=s.title;
    const content=s.lines.join("\n").trim();
    if(!content)return null;
    let type="other";
    if(/職務要約|概要|サマリ|summary/i.test(t))type="summary";
    else if(/職務経歴|職歴|キャリア|経歴|プロジェクト|業務/i.test(t))type="experience";
    else if(/学歴|教育/i.test(t))type="education";
    else if(/資格|免許|スキル|技術|語学|certification/i.test(t))type="skills";
    else if(/自己PR|志望|アピール|強み/i.test(t))type="pr";
    else if(!t&&sections.indexOf(s)===0)type="header";
    return{type,title:t,content};
  }).filter(Boolean);
}

async function parseSectionsWithAI(text,apiKey,model){
  try{
    const provider=getProviderForModel(model);
    const result=await callAI({
      provider,model,apiKey,maxTokens:4000,
      system:"あなたは日本語履歴書の構造化パーサーです。与えられたマスキング済テキストをJSON形式で構造化してください。",
      messages:[{role:"user",content:`以下のマスキング済み履歴書テキストを構造化してください。

出力形式（JSONのみ、コードブロック不要）：
[
  {"type":"header","title":"基本情報","content":"氏名：[氏名非公開]\\nフリガナ：[氏名非公開]\\n生年月日：..."},
  {"type":"summary","title":"職務要約","content":"要約テキスト"},
  {"type":"experience","title":"職務経歴","content":"会社名・役職・業務内容"},
  {"type":"education","title":"学歴","content":"学校名・学位"},
  {"type":"skills","title":"資格・スキル","content":"資格一覧"},
  {"type":"pr","title":"自己PR","content":"アピール文"},
  {"type":"other","title":"セクション名","content":"その他"}
]

重要なルール：
- typeは header/summary/experience/education/skills/pr/other のいずれか
- headerのcontentは「氏名：値」「住所：値」のようにkey：value形式を維持（1行1フィールド、改行区切り）
- 氏名の行は必ず「氏名：」で始めること（名前を抽出するため）
- [非公開]のプレースホルダーはそのまま保持
- headerセクションは1つだけ

テキスト：
${text.slice(0,6000)}`}]
    });
    const cleaned=result.replace(/```json\s*|```\s*/g,"").trim();
    const parsed=JSON.parse(cleaned);
    if(Array.isArray(parsed)&&parsed.length>0)return parsed;
  }catch(e){console.log("AI parse failed, using regex:",e.message);}
  return parseSections(text);
}

// --- Color Palettes ---
// ═══ PDF Preview / Edit ═══

// --- Shared utilities ---
const escHTML=t=>(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const isPIIValue=v=>/^\s*(\[[^\]]*非公開[^\]]*\]\s*)+$/.test(v);

function cleanContent(text,opts){
  const removeRedactionOnlyLines=opts?.removeRedactionOnlyLines!==false;
  return text.split("\n").filter(line=>{
    const trimmed=line.trim();
    if(!trimmed)return true;
    // Remove page markers (internal use only)
    if(/^-{2,}\s*Page\s+\d+\s*-{2,}$/.test(trimmed))return false;
    if(/^-{2,}\s*Sheet:\s*.+\s*-{2,}$/.test(trimmed))return false;
    if(removeRedactionOnlyLines){
      const kv=trimmed.match(/^(.+?)[：:]\s*(.+)$/);
      if(kv&&isPIIValue(kv[2]))return false;
      if(isPIIValue(trimmed))return false;
    }
    return true;
  }).join("\n");
}

// --- Markdown → HTML ---
function mdToHTML(text,opts){
  const stripRedactions=opts?.stripRedactions!==false;
  const highlightRedactions=!!opts?.highlightRedactions;
  const cleaned=cleanContent(text,{removeRedactionOnlyLines:opts?.removeRedactionOnlyLines});
  const lines=cleaned.split("\n");
  const out=[];
  let prevBlank=false;
  const redRe=new RegExp(PH_RE.source,"g");
  for(const line of lines){
    let t=line;
    if(stripRedactions){
      t=t.replace(redRe,"");
    }
    const trimmed=t.trim();
    if(!trimmed){
      // Collapse consecutive blanks to max 1
      if(!prevBlank)out.push("<br class='sp'>");
      prevBlank=true;
      continue;
    }
    prevBlank=false;
    // Heuristic headings (for non-markdown AI output)
    const numHead=trimmed.match(/^(?:\(|（)\s*\d+\s*(?:\)|）)\s*(.+)$/)||trimmed.match(/^\(\s*\d+\s*\)\s*(.+)$/);
    if(numHead){
      out.push(`<h2>${escHTML(numHead[1])}</h2>`);continue;
    }
    const bracketHead=trimmed.match(/^【(.+?)】$/);
    if(bracketHead){
      out.push(`<h2>${escHTML(bracketHead[1])}</h2>`);continue;
    }
    const symbolHead=trimmed.match(/^[■●◆◇▶▷☆★]+\s*(.+)$/);
    if(symbolHead){
      out.push(`<h2>${escHTML(symbolHead[1])}</h2>`);continue;
    }
    if(/^(?:職務経歴書|履歴書|基本情報|職務要約|職務経歴|学歴|資格|スキル|自己PR|志望動機|プロフィール|連絡先|Contact)\s*$/i.test(trimmed)){
      out.push(`<h2>${escHTML(trimmed)}</h2>`);continue;
    }
    // Horizontal rule
    if(/^-{3,}$/.test(trimmed)){
      out.push(`<hr class="hr">`);continue;
    }
    // Company/project-ish line: treat as subheading
    // Guard: do NOT upgrade list items or key-value lines into headings
    const isListLike=/^[-*]\s+/.test(trimmed)||/^・\s*/.test(trimmed);
    const isKvLike=/^(.{1,30}?)[：:]\s*(.+)$/.test(trimmed);
    if(!isListLike&&!isKvLike&&!/[：:]/.test(trimmed)&&/.+（\d{4}.*?）/.test(trimmed)&&trimmed.length<=48){
      out.push(`<h3>${escHTML(trimmed)}</h3>`);continue;
    }
    // Headers (no extra <br> needed — CSS margin handles spacing)
    if(/^###\s+(.+)$/.test(trimmed)){
      const m=trimmed.match(/^###\s+(.+)$/);
      out.push(`<h4>${escHTML(m[1])}</h4>`);continue;
    }
    if(/^##\s+(.+)$/.test(trimmed)){
      const m=trimmed.match(/^##\s+(.+)$/);
      out.push(`<h3>${escHTML(m[1])}</h3>`);continue;
    }
    if(/^#\s+(.+)$/.test(trimmed)){
      const m=trimmed.match(/^#\s+(.+)$/);
      out.push(`<h2>${escHTML(m[1])}</h2>`);continue;
    }
    // List items
    if(/^[-*]\s+(.+)$/.test(trimmed)){
      const m=trimmed.match(/^[-*]\s+(.+)$/);
      let html=escHTML(m[1]);
      html=html.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
      if(!stripRedactions&&highlightRedactions)html=html.replace(redRe,'<span class="rd">$&</span>');
      out.push(`<div class="li">・${html}</div>`);continue;
    }
    if(/^・\s*(.+)$/.test(trimmed)){
      const m=trimmed.match(/^・\s*(.+)$/);
      let html=escHTML(m[1]);
      html=html.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
      if(!stripRedactions&&highlightRedactions)html=html.replace(redRe,'<span class="rd">$&</span>');
      out.push(`<div class="li">・${html}</div>`);continue;
    }
    // Key: Value lines (resume fields)
    const kv=trimmed.match(/^(.{1,30}?)[：:]\s*(.+)$/);
    if(kv){
      let k=escHTML(kv[1]).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
      let v=escHTML(kv[2]).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
      if(stripRedactions)v=v.replace(redRe,"");
      if(!stripRedactions&&highlightRedactions)v=v.replace(redRe,'<span class="rd">$&</span>');
      out.push(`<div class="kv"><div class="k">${k}</div><div class="v">${v||"&nbsp;"}</div></div>`);continue;
    }
    // Bold **text**
    let html=escHTML(t);
    html=html.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    if(!stripRedactions&&highlightRedactions)html=html.replace(redRe,'<span class="rd">$&</span>');
    out.push(`<div>${html}</div>`);
  }
  // Remove leading/trailing <br>
  while(out.length>0&&out[0]==="<br class='sp'>")out.shift();
  while(out.length>0&&out[out.length-1]==="<br class='sp'>")out.pop();
  // Remove <br> right before/after headers (headers have CSS margin)
  const filtered=out.filter((l,i)=>{
    if(l!=="<br class='sp'>")return true;
    const next=out[i+1]||"";
    const prev=out[i-1]||"";
    if(/^<h[234]/.test(next)||/<\/h[234]>$/.test(prev))return false;
    return true;
  });
  return filtered.join("\n");
}

// --- PDF Document Generator ---
const FONT_IMPORTS={
  gothic:`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap');`,
  mincho:`@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;600;700&display=swap');`,
};
const FONT_FAMILIES={
  gothic:"'Noto Sans JP',sans-serif",
  mincho:"'Noto Serif JP',serif",
};

function generatePDFHTML(text,fontType,mdOpts){
  const fontCSS=FONT_IMPORTS[fontType]||FONT_IMPORTS.gothic;
  const fontFamily=FONT_FAMILIES[fontType]||FONT_FAMILIES.gothic;
  const body=mdToHTML(text,mdOpts);
  return`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>Resume</title>
<style>
${fontCSS}
@page{size:A4;margin:18mm 20mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${fontFamily};color:#111827;background:#fff;font-size:10.2pt;line-height:1.75}
.page{max-width:660px;margin:0 auto;padding:26px 30px}
h2{font-size:14pt;font-weight:700;color:#0f172a;margin:18px 0 8px;padding-bottom:7px;border-bottom:1.8px solid #0f172a;letter-spacing:.2px}
h3{font-size:11.5pt;font-weight:700;color:#111827;margin:14px 0 6px}
h4{font-size:10.6pt;font-weight:700;color:#1f2937;margin:12px 0 4px}
strong{font-weight:700}
.body{font-size:10pt;word-break:break-word}
.body div{line-height:1.75}
.body br.sp{display:block;content:"";margin-top:8px}
.kv{display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px;padding:2.5px 0}
.k{color:#475569;font-weight:700}
.v{color:#0f172a}
.li{padding-left:1em;text-indent:-1em;line-height:1.75;margin:1px 0}
.rd{background:#fee;color:#c33;padding:0 4px;border-radius:3px;font-weight:700}
.hr{border:0;border-top:1px solid #e5e7eb;margin:12px 0}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="page"><div class="body">${body}</div></div></body></html>`;
}

// ═══ A4 Preview (inline) ═══
function A4PreviewPanel({text,detections,maskOpts,focusDetId,focusPulse,onFocusDet,zoom=1}){
  const segments=useMemo(()=>{
    return buildAnnotations(text,detections,{
      showRedacted:true,
      keepPrefecture:maskOpts?.keepPrefecture||false,
      nameInitial:maskOpts?.nameInitial||false,
    });
  },[text,detections,maskOpts]);

  // A4用のMarkdownパース（セクション分割）
  const lines=useMemo(()=>{
    const result=[];
    // セグメントをテキスト行に再構成
    let lineBuffer=[];
    for(const seg of segments){
      const parts=seg.text.split("\n");
      for(let i=0;i<parts.length;i++){
        if(i>0){
          result.push({line:lineBuffer,raw:lineBuffer.map(s=>s.text||"").join("")});
          lineBuffer=[];
        }
        if(parts[i]||i<parts.length){
          lineBuffer.push({...seg,text:parts[i]});
        }
      }
    }
    if(lineBuffer.length>0){
      result.push({line:lineBuffer,raw:lineBuffer.map(s=>s.text||"").join("")});
    }
    return result;
  },[segments]);

  const animName=focusPulse%2?"detFlashA":"detFlashB";

  function renderSegment(seg,idx){
    if(seg.type==="text"){
      return <span key={`t${idx}`}>{seg.text}</span>;
    }
    const d=seg.det;
    const focused=!!(focusDetId&&d?.id===focusDetId);
    const anim=focused?{animation:`${animName} 1.25s ease-in-out 1`}:{};
    const meta=CATEGORIES[d?.category]||{color:T.text2};
    if(seg.masked){
      return (
        <span key={`d${idx}`} data-det-id={d?.id}
          onClick={(e)=>{e.stopPropagation();onFocusDet&&onFocusDet(d?.id);}}
          style={{
            background:`${meta.color}18`,color:meta.color,
            padding:"1px 5px",borderRadius:3,fontWeight:600,
            fontSize:"0.92em",cursor:"pointer",
            borderBottom:`2px solid ${meta.color}40`,
            ...anim,
          }}>
          {seg.text}
        </span>
      );
    }
    // enabled:false の検出は点線下線で視覚的に区別
    const disabledStyle=seg.disabledDet?{
      borderBottom:`1.5px dashed ${meta.color}60`,
      opacity:0.7,
    }:{};
    return (
      <span key={`d${idx}`} data-det-id={d?.id}
        onClick={(e)=>{e.stopPropagation();onFocusDet&&onFocusDet(d?.id);}}
        style={{
          background:focused?`${meta.color}16`:"transparent",
          borderRadius:3,cursor:"pointer",...anim,...disabledStyle,
        }}>
        {seg.text}
      </span>
    );
  }

  function classifyLine(raw){
    const trimmed=raw.trim();
    if(!trimmed)return {type:"blank"};
    if(/^#{1,3}\s+(.+)$/.test(trimmed)){
      const m=trimmed.match(/^(#{1,3})\s+(.+)$/);
      return {type:"heading",level:m[1].length,content:m[2]};
    }
    if(/^【(.+?)】$/.test(trimmed))return {type:"heading",level:2};
    if(/^[■●◆◇▶▷☆★]+\s*(.+)$/.test(trimmed))return {type:"heading",level:2};
    if(/^(?:職務経歴書|履歴書|基本情報|職務要約|職務経歴|学歴|資格|スキル|自己PR|志望動機|プロフィール|連絡先)\s*$/i.test(trimmed))return {type:"heading",level:2};
    if(/^-{3,}$/.test(trimmed))return {type:"hr"};
    if(/^[-*]\s+(.+)$/.test(trimmed)||/^・\s*(.+)$/.test(trimmed))return {type:"list"};
    if(/^(.{1,30}?)[：:]\s*(.+)$/.test(trimmed))return {type:"kv"};
    return {type:"body"};
  }

  const pageStyle={
    maxWidth:595,margin:"0 auto",padding:"26px 30px",
    fontFamily:"'Noto Sans JP',sans-serif",color:"#111827",
    fontSize:"10.2pt",lineHeight:1.75,background:"#fff",
    minHeight:842,
  };
  const h2Style={fontSize:"14pt",fontWeight:700,color:"#0f172a",margin:"18px 0 8px",paddingBottom:7,borderBottom:"1.8px solid #0f172a",letterSpacing:0.2};
  const h3Style={fontSize:"11.5pt",fontWeight:700,color:"#111827",margin:"14px 0 6px"};
  const kvStyle={display:"grid",gridTemplateColumns:"minmax(110px,160px) 1fr",gap:12,padding:"2.5px 0"};
  const kvKeyStyle={color:"#475569",fontWeight:700};
  const kvValStyle={color:"#0f172a"};
  const liStyle={paddingLeft:"1em",textIndent:"-1em",lineHeight:1.75,margin:"1px 0"};
  const hrStyle={border:0,borderTop:"1px solid #e5e7eb",margin:"12px 0"};

  return (
    <div style={{flex:1,overflow:"auto",background:"#e5e7eb",display:"flex",justifyContent:"center",padding:"24px 16px"}}>
      <div style={{width:595,background:"#fff",boxShadow:"0 4px 24px rgba(0,0,0,.12)",borderRadius:4,transform:`scale(${zoom})`,transformOrigin:"top center"}}>
        <div style={pageStyle}>
          {lines.map(({line,raw},li)=>{
            const cls=classifyLine(raw);
            const segs=line.map((seg,si)=>renderSegment(seg,`${li}_${si}`));

            if(cls.type==="blank")return <br key={li} style={{display:"block",marginTop:8}}/>;
            if(cls.type==="hr")return <hr key={li} style={hrStyle}/>;
            if(cls.type==="heading"){
              const style=cls.level<=2?h2Style:h3Style;
              // 見出しマーカーを除去して表示
              const cleaned=raw.trim().replace(/^#{1,3}\s+/,"").replace(/^[■●◆◇▶▷☆★]+\s*/,"").replace(/^【(.+?)】$/,"$1");
              // セグメント内の検出値はそのまま表示
              const hasDetection=line.some(s=>s.type==="det");
              if(hasDetection){
                return <div key={li} style={style}>{segs}</div>;
              }
              return <div key={li} style={style}>{cleaned}</div>;
            }
            if(cls.type==="list"){
              return <div key={li} style={liStyle}>・{segs}</div>;
            }
            if(cls.type==="kv"){
              const kvMatch=raw.trim().match(/^(.{1,30}?)[：:]\s*(.+)$/);
              if(kvMatch){
                // キー部分と値部分を分割してセグメント表示
                const keyLen=kvMatch[1].length;
                const sepIdx=raw.indexOf(kvMatch[1])+keyLen;
                const keySegs=[];
                const valSegs=[];
                let charCount=0;
                for(let si=0;si<line.length;si++){
                  const seg=line[si];
                  const segLen=seg.text.length;
                  if(charCount+segLen<=sepIdx){
                    keySegs.push(renderSegment(seg,`${li}_k${si}`));
                  }else if(charCount>=sepIdx){
                    valSegs.push(renderSegment(seg,`${li}_v${si}`));
                  }else{
                    // セグメントがキーと値にまたがる場合 — detection metadataを保持
                    const splitAt=sepIdx-charCount;
                    keySegs.push(renderSegment({...seg,text:seg.text.slice(0,splitAt)},`${li}_ks${si}`));
                    valSegs.push(renderSegment({...seg,text:seg.text.slice(splitAt)},`${li}_vs${si}`));
                  }
                  charCount+=segLen;
                }
                return (
                  <div key={li} style={kvStyle}>
                    <div style={kvKeyStyle}>{keySegs}</div>
                    <div style={kvValStyle}>{valSegs}</div>
                  </div>
                );
              }
            }
            return <div key={li} style={{lineHeight:1.75}}>{segs}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

// ═══ PDF Review / Edit Modal ═══
function DesignExportModal({text,apiKey,model,onClose,baseName:baseNameProp}){
  const exportBase=baseNameProp||"redacted_"+fileTimestamp();
  const[editText,setEditText]=useState(text);
  const[fontType,setFontType]=useState("gothic");
  const[saved,setSaved]=useState(false);

  useEffect(() => {
      const h = (e) => {
          if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', h)
      return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const htmlContent=useMemo(()=>generatePDFHTML(editText,fontType),[editText,fontType]);

  const handleExport=()=>{
    // Open as self-printing HTML in a new tab
    const printHTML=htmlContent.replace("</body>",`<script>window.onload=function(){window.print();setTimeout(()=>{window.close()},1000)}<\/script></body>`);
    const blob=new Blob([printHTML],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const win=window.open(url,"_blank");
    if(win)win.focus();
  };

  const handleDownloadHTML=()=>{
    const blob=new Blob([htmlContent],{type:"text/html;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=exportBase+".html";
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const handleDownloadWord=()=>{
    const wordHTML=htmlContent
      .replace('<!DOCTYPE html>','')
      .replace('<html lang="ja">','<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ja">')
      .replace('<head>','<head><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->');
    const bom="\uFEFF";
    const blob=new Blob([bom+wordHTML],{type:"application/msword;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=exportBase+".docx";
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const handleCopyText=()=>{
    navigator.clipboard.writeText(editText).then(()=>{setSaved(true);setTimeout(()=>setSaved(false),2000);});
  };

  const charCount=editText.length;
  const lineCount=editText.split("\n").length;

  return (
      <div
          style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(0,0,0,.65)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
      >
          <div
              style={{
                  width: '95vw',
                  maxWidth: 1300,
                  height: '92vh',
                  background: T.bg2,
                  borderRadius: 16,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  border: `1px solid ${T.border}`,
              }}
          >
              {/* Header */}
              <div
                  style={{
                      padding: '12px 20px',
                      borderBottom: `1px solid ${T.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: T.bg,
                      flexShrink: 0,
                  }}
              >
                  <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                      <span style={{ fontSize: 16 }}>📄</span>
                      <div>
                          <div
                              style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: T.text,
                              }}
                          >
                              PDF プレビュー・編集
                          </div>
                          <div style={{ fontSize: 12, color: T.text3 }}>
                              最終確認 → テキスト編集 → 出力
                          </div>
                      </div>
                  </div>
                  <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                      <span
                          style={{
                              fontSize: 12,
                              color: T.text3,
                              fontFamily: T.mono,
                          }}
                      >
                          {lineCount}行 / {charCount}文字
                      </span>
                      <button
                          onClick={onClose}
                          style={{
                              background: 'transparent',
                              border: 'none',
                              color: T.text3,
                              fontSize: 18,
                              cursor: 'pointer',
                              padding: 4,
                          }}
                      >
                          ✕
                      </button>
                  </div>
              </div>

              {/* Body */}
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                  {/* Left: Editor */}
                  <div
                      className='rp-design-controls'
                      style={{
                          width: '45%',
                          minWidth: 300,
                          borderRight: `1px solid ${T.border}`,
                          display: 'flex',
                          flexDirection: 'column',
                          overflow: 'hidden',
                      }}
                  >
                      {/* Toolbar */}
                      <div
                          style={{
                              padding: '8px 14px',
                              borderBottom: `1px solid ${T.border}`,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              flexShrink: 0,
                              flexWrap: 'wrap',
                          }}
                      >
                          <span
                              style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: T.text2,
                              }}
                          >
                              フォント
                          </span>
                          <button
                              onClick={() => setFontType('gothic')}
                              style={{
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  border: `1.5px solid ${fontType === 'gothic' ? T.accent : T.border}`,
                                  background:
                                      fontType === 'gothic'
                                          ? T.accentDim
                                          : 'transparent',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: fontType === 'gothic' ? 600 : 400,
                                  color:
                                      fontType === 'gothic' ? T.accent : T.text,
                              }}
                          >
                              ゴシック
                          </button>
                          <button
                              onClick={() => setFontType('mincho')}
                              style={{
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  border: `1.5px solid ${fontType === 'mincho' ? T.accent : T.border}`,
                                  background:
                                      fontType === 'mincho'
                                          ? T.accentDim
                                          : 'transparent',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: fontType === 'mincho' ? 600 : 400,
                                  color:
                                      fontType === 'mincho' ? T.accent : T.text,
                              }}
                          >
                              明朝
                          </button>
                          <div style={{ flex: 1 }} />
                          <button
                              onClick={handleCopyText}
                              style={{
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  border: `1px solid ${T.border}`,
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  color: saved ? T.green : T.text3,
                              }}
                          >
                              {saved ? '✓ コピー済' : '📋 コピー'}
                          </button>
                      </div>
                      {/* Tips */}
                      <div
                          style={{
                              padding: '6px 14px',
                              borderBottom: `1px solid ${T.border}`,
                              fontSize: 12,
                              color: T.text3,
                              lineHeight: 1.6,
                              flexShrink: 0,
                          }}
                      >
                          <span style={{ fontWeight: 600, color: T.text2 }}>
                              記法:{' '}
                          </span>
                          <code
                              style={{
                                  background: T.surface,
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  fontFamily: T.mono,
                              }}
                          >
                              **太字**
                          </code>
                          <code
                              style={{
                                  background: T.surface,
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  fontFamily: T.mono,
                                  marginLeft: 6,
                              }}
                          >
                              # 見出し
                          </code>
                          <code
                              style={{
                                  background: T.surface,
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  fontFamily: T.mono,
                                  marginLeft: 6,
                              }}
                          >
                              ## 小見出し
                          </code>
                          　
                          <span style={{ opacity: 0.6 }}>
                              非公開タグは自動除去
                          </span>
                      </div>
                      {/* Textarea */}
                      <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          spellCheck={false}
                          style={{
                              flex: 1,
                              padding: '14px 16px',
                              border: 'none',
                              outline: 'none',
                              resize: 'none',
                              fontFamily: T.mono,
                              fontSize: 12,
                              lineHeight: 1.8,
                              color: T.text,
                              background: T.bg2,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                          }}
                      />
                      {/* Actions */}
                      <div
                          style={{
                              padding: 12,
                              borderTop: `1px solid ${T.border}`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              flexShrink: 0,
                          }}
                      >
                          <Btn
                              onClick={handleExport}
                              style={{
                                  width: '100%',
                                  borderRadius: 10,
                                  fontSize: 13,
                                  background: '#222',
                                  gap: 6,
                              }}
                          >
                              🖨️ PDFとして印刷・保存
                          </Btn>
                          <div
                              style={{
                                  fontSize: 12,
                                  color: T.text3,
                                  textAlign: 'center',
                                  lineHeight: 1.4,
                                  padding: '0 4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 4,
                              }}
                          >
                              <span>🖨️</span>{' '}
                              別タブで開き、ブラウザの印刷ダイアログから「PDFとして保存」を選択してください
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                              <Btn
                                  variant='ghost'
                                  onClick={handleDownloadWord}
                                  style={{
                                      flex: 1,
                                      borderRadius: 8,
                                      fontSize: 12,
                                      padding: '9px 8px',
                                  }}
                              >
                                  Word (.docx)
                              </Btn>
                              <Btn
                                  variant='ghost'
                                  onClick={handleDownloadHTML}
                                  style={{
                                      flex: 1,
                                      borderRadius: 8,
                                      fontSize: 12,
                                      padding: '9px 8px',
                                  }}
                              >
                                  HTML
                              </Btn>
                              <Btn
                                  variant='ghost'
                                  onClick={handleCopyText}
                                  style={{
                                      flex: 1,
                                      borderRadius: 8,
                                      fontSize: 12,
                                      padding: '9px 8px',
                                  }}
                              >
                                  {saved ? '✓ コピー済' : '📋 テキスト'}
                              </Btn>
                          </div>
                      </div>
                  </div>

                  {/* Right: Live Preview */}
                  <div
                      style={{
                          flex: 1,
                          background: '#e5e7eb',
                          overflow: 'auto',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'center',
                          padding: 24,
                      }}
                  >
                      <div
                          style={{
                              width: 595,
                              minHeight: 842,
                              background: '#fff',
                              boxShadow: '0 4px 24px rgba(0,0,0,.12)',
                              borderRadius: 4,
                              overflow: 'hidden',
                              transform: 'scale(0.88)',
                              transformOrigin: 'top center',
                          }}
                      >
                          <iframe
                              srcDoc={htmlContent}
                              sandbox="allow-same-origin"
                              style={{
                                  width: '100%',
                                  minHeight: 842,
                                  border: 'none',
                                  pointerEvents: 'none',
                              }}
                              title='Preview'
                              onLoad={(e) => {
                                  try {
                                      const h =
                                          e.target.contentDocument
                                              ?.documentElement?.scrollHeight
                                      if (h && h > 842)
                                          e.target.style.height = h + 'px'
                                  } catch (ex) {}
                              }}
                          />
                      </div>
                  </div>
              </div>
          </div>
      </div>
  )
}
// ═══ Preview / Export Modal ═══
function PreviewModal({title,content,baseName,onClose,onContentChange,editable}){
  const[copied,setCopied]=useState(false);
  const[fmt,setFmt]=useState("txt");
  const[view,setView]=useState("layout"); // "layout" | "text" | "edit"
  const[editedContent,setEditedContent]=useState(content);
  const[hasChanges,setHasChanges]=useState(false);

  useEffect(()=>{setEditedContent(content);setHasChanges(false);},[content]);

  const handleSave=useCallback(()=>{
    if(onContentChange&&hasChanges){onContentChange(editedContent);}
    setView("text");setHasChanges(false);
  },[onContentChange,hasChanges,editedContent]);

  const handleCancelEdit=useCallback(()=>{
    setEditedContent(content);setView("text");setHasChanges(false);
  },[content]);

  useEffect(() => {
      const h = (e) => {
          if (e.key === 'Escape') {
              if(view==='edit'){handleCancelEdit();return;}
              onClose();
          }
          if((e.metaKey||e.ctrlKey)&&e.key==='s'&&view==='edit'){
              e.preventDefault();handleSave();
          }
      }
      window.addEventListener('keydown', h)
      return () => window.removeEventListener('keydown', h)
  }, [onClose,view,handleSave,handleCancelEdit])

  const displayContent=view==='edit'?editedContent:content;
  const handleCopy=()=>{navigator.clipboard.writeText(displayContent).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});};
  const handleDownload=()=>{const ex=generateExport(displayContent,fmt,baseName);if(ex.isPrintPdf){triggerDownload(ex);}else triggerDownload(ex);};
  const lines=displayContent.split("\n").length;const chars=displayContent.length;
  const curFmt=EXPORT_FORMATS.find(f=>f.id===fmt);

  // CSV/XLSX: default to layout (table view) when switching format
  useEffect(()=>{
    if((fmt==="csv"||fmt==="xlsx")&&view==="edit")setView("layout");
  },[fmt]);

  const layoutHtml=useMemo(()=>{
    const redRe=new RegExp(PH_RE.source,"g");
    const esc=(s)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    if(fmt==="txt"){
      return`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
body{font-family:'Consolas','Monaco','Noto Sans JP',monospace;font-size:11pt;line-height:1.8;color:#111;background:#fff;padding:30px 36px;white-space:pre-wrap;word-break:break-word;margin:0}
</style></head><body>${esc(displayContent)}</body></html>`;
    }
    if(fmt==="md"){
      const body=mdToHTML(displayContent,{stripRedactions:false,highlightRedactions:true,removeRedactionOnlyLines:false});
      return`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap');
body{font-family:'Noto Sans JP',sans-serif;font-size:10.5pt;line-height:1.8;color:#111827;background:#fff;padding:26px 30px;margin:0;max-width:660px}
h2{font-size:14pt;font-weight:700;margin:18px 0 8px;padding-bottom:6px;border-bottom:1.8px solid #0f172a}
h3{font-size:11.5pt;font-weight:700;margin:14px 0 6px}
h4{font-size:10.6pt;font-weight:700;margin:12px 0 4px}
.kv{display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px;padding:2px 0}
.k{color:#475569;font-weight:700}.v{color:#0f172a}
.li{padding-left:1em;text-indent:-1em;line-height:1.75;margin:1px 0}
.rd{background:#fee;color:#c33;padding:0 4px;border-radius:3px;font-weight:700}
.hr{border:0;border-top:1px solid #e5e7eb;margin:12px 0}
code{background:#f1f5f9;padding:2px 6px;border-radius:3px;font-size:0.9em}
pre{background:#f1f5f9;padding:12px 16px;border-radius:6px;overflow-x:auto;font-size:0.9em}
</style></head><body>${body}</body></html>`;
    }
    if(fmt==="csv"){
      // Note: simple split — quoted fields with commas are not handled (preview-only)
      const rows=displayContent.split("\n").map(r=>r.split(","));
      let table="<table><thead><tr>";
      if(rows.length>0)rows[0].forEach(c=>{table+=`<th>${esc(c.trim())}</th>`;});
      table+="</tr></thead><tbody>";
      for(let i=1;i<rows.length;i++){
        table+="<tr>";rows[i].forEach(c=>{table+=`<td>${esc(c.trim())}</td>`;});table+="</tr>";
      }
      table+="</tbody></table>";
      return`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
body{font-family:'Noto Sans JP',sans-serif;font-size:10pt;margin:0;padding:20px;background:#fff}
table{border-collapse:collapse;width:100%;font-size:10pt}
th,td{border:1px solid #d1d5db;padding:6px 10px;text-align:left;white-space:nowrap}
th{background:#f3f4f6;font-weight:700;color:#374151}
tr:nth-child(even){background:#f9fafb}
</style></head><body>${table}</body></html>`;
    }
    if(fmt==="xlsx"){
      const rows=displayContent.split("\n").map(r=>r.split(","));
      let table="<table><thead><tr><th class='rn'></th>";
      if(rows.length>0)rows[0].forEach((c,ci)=>{table+=`<th>${esc(c.trim())}</th>`;});
      table+="</tr></thead><tbody>";
      for(let i=1;i<rows.length;i++){
        table+=`<tr><td class='rn'>${i}</td>`;rows[i].forEach(c=>{table+=`<td>${esc(c.trim())}</td>`;});table+="</tr>";
      }
      table+="</tbody></table>";
      return`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
body{font-family:'Calibri','Noto Sans JP',sans-serif;font-size:10pt;margin:0;padding:0;background:#fff}
table{border-collapse:collapse;width:100%;font-size:10pt}
th,td{border:1px solid #9ca3af;padding:4px 8px;text-align:left;white-space:nowrap;min-width:60px}
th{background:#D9E2F3;font-weight:700;color:#1f2937;text-align:center}
td.rn,th.rn{background:#f3f4f6;color:#6b7280;text-align:center;width:36px;font-size:9pt}
tr:hover{background:#EBF0FA}
</style></head><body>${table}</body></html>`;
    }
    if(fmt==="docx"){
      const body=mdToHTML(displayContent,{stripRedactions:false,highlightRedactions:true,removeRedactionOnlyLines:false});
      return`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;600;700&display=swap');
@page{size:A4;margin:25mm 25mm}
body{font-family:'Noto Serif JP','MS 明朝',serif;font-size:10.5pt;line-height:1.8;color:#111827;background:#fff;margin:0;padding:36px 40px;max-width:660px}
h2{font-size:13pt;font-weight:700;margin:20px 0 8px;padding-bottom:6px;border-bottom:1.5px solid #374151}
h3{font-size:11pt;font-weight:700;margin:16px 0 6px}
h4{font-size:10.5pt;font-weight:700;margin:12px 0 4px}
.kv{display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px;padding:2px 0}
.k{color:#475569;font-weight:700}.v{color:#0f172a}
.li{padding-left:1em;text-indent:-1em;line-height:1.8;margin:1px 0}
.rd{background:#fee;color:#c33;padding:0 4px;border-radius:3px;font-weight:700}
.hr{border:0;border-top:1px solid #d1d5db;margin:14px 0}
</style></head><body>${body}</body></html>`;
    }
    // default: pdf
    return generatePDFHTML(displayContent,"gothic",{stripRedactions:false,highlightRedactions:true,removeRedactionOnlyLines:false});
  },[displayContent,fmt]);
  return (
      <div
          style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 110,
              padding: 20,
              animation: 'fadeIn .2s',
          }}
          onClick={(e) => {
              if (e.target === e.currentTarget) onClose()
          }}
      >
          <div
              className='rp-modal-inner'
              style={{
                  width: '100%',
                  maxWidth: 820,
                  maxHeight: '92vh',
                  background: T.bg2,
                  borderRadius: 16,
                  border: `1px solid ${T.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  animation: 'fadeUp .3s ease',
              }}
          >
              <div
                  style={{
                      padding: '14px 22px',
                      borderBottom: `1px solid ${T.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexShrink: 0,
                  }}
              >
                  <div>
                      <div
                          style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: T.text,
                          }}
                      >
                          {title}
                      </div>
                      <div style={{ fontSize: 12, color: T.text3 }}>
                          {lines} 行 / {chars.toLocaleString()} 文字
                      </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                          style={{
                              display: 'flex',
                              border: `1px solid ${T.border}`,
                              borderRadius: 10,
                              overflow: 'hidden',
                          }}
                      >
                          <button
                              onClick={() => setView('layout')}
                              title='書式付きプレビュー'
                              style={{
                                  padding: '6px 10px',
                                  border: 'none',
                                  background:
                                      view === 'layout'
                                          ? T.accentDim
                                          : 'transparent',
                                  color: view === 'layout' ? T.accent : T.text3,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                              }}
                          >
                              レイアウト
                          </button>
                          <button
                              onClick={() => setView('text')}
                              title='プレーンテキスト表示'
                              style={{
                                  padding: '6px 10px',
                                  border: 'none',
                                  background:
                                      view === 'text'
                                          ? T.accentDim
                                          : 'transparent',
                                  color: view === 'text' ? T.accent : T.text3,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                              }}
                          >
                              テキスト
                          </button>
                          {editable!==false&&onContentChange&&(
                          <button
                              onClick={() => setView('edit')}
                              title='テキストを編集'
                              style={{
                                  padding: '6px 10px',
                                  border: 'none',
                                  background:
                                      view === 'edit'
                                          ? T.accentDim
                                          : 'transparent',
                                  color: view === 'edit' ? T.accent : T.text3,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                              }}
                          >
                              編集
                          </button>
                          )}
                      </div>
                      <button
                          onClick={onClose}
                          title='閉じる'
                          style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              border: `1px solid ${T.border}`,
                              background: 'transparent',
                              color: T.text2,
                              cursor: 'pointer',
                              fontSize: 13,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                          }}
                      >
                          x
                      </button>
                  </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
                  {view === 'edit' ? (
                      <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
                          <textarea
                              value={editedContent}
                              onChange={(e)=>{setEditedContent(e.target.value);setHasChanges(e.target.value!==content);}}
                              style={{
                                  width:'100%',flex:1,minHeight:400,
                                  padding:'16px 24px',fontFamily:T.mono,fontSize:12,
                                  lineHeight:1.8,color:T.text,background:T.bg,
                                  border:'none',resize:'none',
                                  outline:`2px solid ${T.accent}`,outlineOffset:-2,
                                  borderRadius:0,
                              }}
                              spellCheck={false}
                              autoFocus
                          />
                          <div style={{padding:'10px 22px',display:'flex',justifyContent:'flex-end',gap:8,alignItems:'center',borderTop:`1px solid ${T.border}`,background:T.bg2}}>
                              {hasChanges&&<span style={{fontSize:11,color:T.amber,marginRight:'auto'}}>未保存の変更があります</span>}
                              <Btn variant='ghost' onClick={handleCancelEdit} style={{padding:'6px 14px',fontSize:12,borderRadius:8}}>キャンセル</Btn>
                              <Btn onClick={handleSave} disabled={!hasChanges} style={{padding:'6px 14px',fontSize:12,borderRadius:8,opacity:hasChanges?1:.5}}>保存 (Ctrl+S)</Btn>
                          </div>
                      </div>
                  ) : view === 'layout' ? (
                      <div
                          style={{
                              display: 'flex',
                              justifyContent: 'center',
                              padding: (fmt==="csv"||fmt==="xlsx") ? 12 : 24,
                              background: (fmt==="csv"||fmt==="xlsx") ? '#fff' : T.bg,
                              overflow: 'auto',
                          }}
                      >
                          {(fmt==="csv"||fmt==="xlsx") ? (
                              <iframe
                                  srcDoc={layoutHtml}
                                  sandbox="allow-same-origin"
                                  style={{
                                      width: '100%',
                                      minHeight: 400,
                                      border: 'none',
                                  }}
                                  title='TablePreview'
                                  onLoad={(e) => {
                                      try {
                                          const h = e.target.contentDocument?.documentElement?.scrollHeight;
                                          if (h) e.target.style.height = Math.max(h, 400) + 'px';
                                      } catch (ex) {}
                                  }}
                              />
                          ) : fmt==="txt" ? (
                              <div style={{
                                  width: '100%',
                                  maxWidth: 700,
                                  background: '#fff',
                                  boxShadow: '0 2px 12px rgba(0,0,0,.08)',
                                  borderRadius: 8,
                                  overflow: 'hidden',
                              }}>
                                  <iframe
                                      srcDoc={layoutHtml}
                                      sandbox="allow-same-origin"
                                      style={{ width: '100%', minHeight: 600, border: 'none' }}
                                      title='TextPreview'
                                      onLoad={(e) => {
                                          try {
                                              const h = e.target.contentDocument?.documentElement?.scrollHeight;
                                              if (h && h > 600) e.target.style.height = h + 'px';
                                          } catch (ex) {}
                                      }}
                                  />
                              </div>
                          ) : (
                          <div
                              style={{
                                  width: 595,
                                  minHeight: 842,
                                  background: '#fff',
                                  boxShadow: '0 4px 24px rgba(0,0,0,.12)',
                                  borderRadius: 8,
                                  overflow: 'hidden',
                                  transform: 'scale(0.9)',
                                  transformOrigin: 'top center',
                                  maxWidth: '100%',
                              }}
                          >
                              <iframe
                                  srcDoc={layoutHtml}
                                  sandbox="allow-same-origin"
                                  style={{
                                      width: '100%',
                                      minHeight: 842,
                                      border: 'none',
                                      pointerEvents: 'none',
                                  }}
                                  title='LayoutPreview'
                                  onLoad={(e) => {
                                      try {
                                          const h =
                                              e.target.contentDocument
                                                  ?.documentElement
                                                  ?.scrollHeight
                                          if (h && h > 842)
                                              e.target.style.height = h + 'px'
                                      } catch (ex) {}
                                  }}
                              />
                          </div>
                          )}
                      </div>
                  ) : (
                      <pre
                          style={{
                              padding: '16px 24px',
                              fontFamily: T.mono,
                              fontSize: 12,
                              lineHeight: 1.8,
                              color: T.text,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              margin: 0,
                          }}
                      >
                          {content.split('\n').map((line, i) => {
                              const re = new RegExp(PH_RE.source, 'g')
                              const parts = []
                              let last = 0
                              let m
                              while ((m = re.exec(line)) !== null) {
                                  if (m.index > last)
                                      parts.push(
                                          <span key={`t${i}-${last}`}>
                                              {line.slice(last, m.index)}
                                          </span>,
                                      )
                                  parts.push(
                                      <span
                                          key={`r${i}-${m.index}`}
                                          style={{
                                              background: T.redDim,
                                              color: T.red,
                                              padding: '0 4px',
                                              borderRadius: 3,
                                              fontWeight: 600,
                                          }}
                                      >
                                          {m[0]}
                                      </span>,
                                  )
                                  last = m.index + m[0].length
                              }
                              if (last < line.length)
                                  parts.push(
                                      <span key={`e${i}-${last}`}>
                                          {line.slice(last)}
                                      </span>,
                                  )
                              return (
                                  <div
                                      key={i}
                                      style={{ display: 'flex', minHeight: 20 }}
                                  >
                                      <span
                                          style={{
                                              width: 36,
                                              flexShrink: 0,
                                              textAlign: 'right',
                                              paddingRight: 10,
                                              color: T.text3,
                                              fontSize: 12,
                                              userSelect: 'none',
                                              lineHeight: '20px',
                                          }}
                                      >
                                          {i + 1}
                                      </span>
                                      <span style={{ flex: 1 }}>
                                          {parts.length
                                              ? parts
                                              : line || '\u00A0'}
                                      </span>
                                  </div>
                              )
                          })}
                      </pre>
                  )}
              </div>
              <div
                  style={{
                      padding: '12px 22px',
                      borderTop: `1px solid ${T.border}`,
                      flexShrink: 0,
                  }}
              >
                  <div
                      style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          marginBottom: 10,
                      }}
                  >
                      <span
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text3,
                              flexShrink: 0,
                          }}
                      >
                          出力形式:
                      </span>
                      <div
                          style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
                      >
                          {EXPORT_FORMATS.map((f) => (
                              <button
                                  key={f.id}
                                  onClick={() => setFmt(f.id)}
                                  title={`${f.label}形式`}
                                  style={{
                                      padding: '5px 12px',
                                      borderRadius: 7,
                                      border: `1px solid ${fmt === f.id ? T.accent : T.border}`,
                                      background:
                                          fmt === f.id
                                              ? T.accentDim
                                              : 'transparent',
                                      color: fmt === f.id ? T.accent : T.text3,
                                      fontSize: 12,
                                      fontWeight: fmt === f.id ? 600 : 400,
                                      cursor: 'pointer',
                                      fontFamily: T.font,
                                      transition: 'all .15s',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                  }}
                              >
                                  <span
                                      style={{
                                          width: 16,
                                          height: 16,
                                          borderRadius: 4,
                                          background:
                                              fmt === f.id
                                                  ? T.accent
                                                  : T.border,
                                          color:
                                              fmt === f.id ? '#fff' : T.text3,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: 12,
                                          fontWeight: 700,
                                      }}
                                  >
                                      {f.icon}
                                  </span>
                                  {f.label}
                                  {f.id === 'pdf' && (
                                      <span
                                          title='ブラウザの印刷機能を使用してPDFを生成します'
                                          style={{
                                              fontSize: 12,
                                              marginLeft: -2,
                                              opacity: 0.8,
                                          }}
                                      >
                                          🖨️
                                      </span>
                                  )}
                              </button>
                          ))}
                      </div>
                  </div>
                  <div
                      style={{
                          display: 'flex',
                          gap: 8,
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                      }}
                  >
                      {fmt === 'pdf' && (
                          <span
                              style={{
                                  fontSize: 12,
                                  color: T.amber,
                                  marginRight: 'auto',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                              }}
                          >
                              <span style={{ fontSize: 12 }}>🖨️</span>{' '}
                              印刷ダイアログから「PDFとして保存」を選択してください
                          </span>
                      )}
                      <Btn
                          variant='ghost'
                          onClick={onClose}
                          title='閉じる'
                          style={{
                              padding: '7px 16px',
                              fontSize: 12,
                              borderRadius: 8,
                          }}
                      >
                          閉じる
                      </Btn>
                      <Btn
                          variant='ghost'
                          onClick={handleCopy}
                          title='クリップボードにコピー'
                          style={{
                              padding: '7px 16px',
                              fontSize: 12,
                              borderRadius: 8,
                          }}
                      >
                          {copied ? '\u2713 コピー済' : 'コピー'}
                      </Btn>
                      <Btn
                          onClick={handleDownload}
                          title={`${curFmt?.label}形式でダウンロード`}
                          style={{
                              padding: '7px 16px',
                              fontSize: 12,
                              borderRadius: 8,
                          }}
                      >
                          {curFmt?.label} で保存
                      </Btn>
                  </div>
                  {view === 'layout' && (
                      <div
                          style={{
                              marginTop: 10,
                              fontSize: 10,
                              color: T.text3,
                              lineHeight: 1.5,
                          }}
                      >
                          {fmt==='csv'||fmt==='xlsx' ? 'テーブルプレビューはCSV/Excel出力のイメージです。'
                           : fmt==='txt' ? 'プレーンテキスト表示です。'
                           : fmt==='md' ? 'Markdownをレンダリングしたプレビューです。'
                           : fmt==='docx' ? 'Word出力のイメージです（明朝体・広めの余白）。'
                           : 'PDF出力のイメージです（閲覧環境により余白や改ページが微調整されることがあります）。'}
                      </div>
                  )}
              </div>
          </div>
      </div>
  )
}

// ═══ Diff View ═══
function DiffView({original,modified,label}){
  const origLines=original.split("\n");
  const modLines=modified.split("\n");
  const maxLen=Math.max(origLines.length,modLines.length);
  const diffs=[];
  for(let i=0;i<maxLen;i++){
    const o=origLines[i]||"";const m=modLines[i]||"";
    if(o===m){diffs.push({type:"same",orig:o,mod:m});}
    else{diffs.push({type:"changed",orig:o,mod:m});}
  }
  const changeCount=diffs.filter(d=>d.type==="changed").length;
  return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
              style={{
                  padding: '8px 16px',
                  borderBottom: `1px solid ${T.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: T.bg2,
                  flexShrink: 0,
              }}
          >
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                  Diff: {label || '変更箇所'}
              </div>
              <Badge color={T.amber} bg={T.amberDim}>
                  {changeCount} 行変更
              </Badge>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
              <div
                  style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      minWidth: 0,
                  }}
              >
                  <div
                      style={{
                          borderRight: `1px solid ${T.border}`,
                          padding: '4px 0',
                      }}
                  >
                      <div
                          style={{
                              padding: '4px 12px',
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text3,
                              borderBottom: `1px solid ${T.border}`,
                              marginBottom: 4,
                          }}
                      >
                          元テキスト
                      </div>
                      {diffs.map((d, i) => (
                          <div
                              key={i}
                              style={{
                                  display: 'flex',
                                  minHeight: 22,
                                  padding: '1px 0',
                                  background:
                                      d.type === 'changed'
                                          ? T.diffDel
                                          : 'transparent',
                                  borderLeft:
                                      d.type === 'changed'
                                          ? `3px solid ${T.red}`
                                          : '3px solid transparent',
                              }}
                          >
                              <span
                                  style={{
                                      width: 32,
                                      flexShrink: 0,
                                      textAlign: 'right',
                                      paddingRight: 8,
                                      color: T.text3,
                                      fontSize: 12,
                                      userSelect: 'none',
                                      lineHeight: '22px',
                                  }}
                              >
                                  {i + 1}
                              </span>
                              <span
                                  style={{
                                      flex: 1,
                                      fontSize: 12,
                                      fontFamily: T.mono,
                                      lineHeight: '22px',
                                      color:
                                          d.type === 'changed' ? T.red : T.text,
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                      paddingRight: 8,
                                  }}
                              >
                                  {d.orig || '\u00A0'}
                              </span>
                          </div>
                      ))}
                  </div>
                  <div style={{ padding: '4px 0' }}>
                      <div
                          style={{
                              padding: '4px 12px',
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text3,
                              borderBottom: `1px solid ${T.border}`,
                              marginBottom: 4,
                          }}
                      >
                          マスキング済み
                      </div>
                      {diffs.map((d, i) => {
                          const re = new RegExp(PH_RE.source, 'g')
                          const parts = []
                          let last = 0
                          let m
                          const line = d.mod
                          while ((m = re.exec(line)) !== null) {
                              if (m.index > last)
                                  parts.push(
                                      <span key={`t${last}`}>
                                          {line.slice(last, m.index)}
                                      </span>,
                                  )
                              parts.push(
                                  <span
                                      key={`r${m.index}`}
                                      style={{
                                          background: T.greenDim,
                                          color: T.green,
                                          padding: '0 3px',
                                          borderRadius: 3,
                                          fontWeight: 600,
                                      }}
                                  >
                                      {m[0]}
                                  </span>,
                              )
                              last = m.index + m[0].length
                          }
                          if (last < line.length)
                              parts.push(
                                  <span key={`e${last}`}>
                                      {line.slice(last)}
                                  </span>,
                              )
                          return (
                              <div
                                  key={i}
                                  style={{
                                      display: 'flex',
                                      minHeight: 22,
                                      padding: '1px 0',
                                      background:
                                          d.type === 'changed'
                                              ? T.diffAdd
                                              : 'transparent',
                                      borderLeft:
                                          d.type === 'changed'
                                              ? `3px solid ${T.green}`
                                              : '3px solid transparent',
                                  }}
                              >
                                  <span
                                      style={{
                                          width: 32,
                                          flexShrink: 0,
                                          textAlign: 'right',
                                          paddingRight: 8,
                                          color: T.text3,
                                          fontSize: 12,
                                          userSelect: 'none',
                                          lineHeight: '22px',
                                      }}
                                  >
                                      {i + 1}
                                  </span>
                                  <span
                                      style={{
                                          flex: 1,
                                          fontSize: 12,
                                          fontFamily: T.mono,
                                          lineHeight: '22px',
                                          color:
                                              d.type === 'changed'
                                                  ? T.green
                                                  : T.text,
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-word',
                                          paddingRight: 8,
                                      }}
                                  >
                                      {parts.length ? parts : line || '\u00A0'}
                                  </span>
                              </div>
                          )
                      })}
                  </div>
              </div>
          </div>
      </div>
  )
}

function formatDuration(ms){
  const s=Math.max(0,Math.floor((ms||0)/1000));
  const hh=Math.floor(s/3600);
  const mm=Math.floor((s%3600)/60);
  const ss=s%60;
  const two=(n)=>String(n).padStart(2,"0");
  return hh>0?`${hh}:${two(mm)}:${two(ss)}`:`${mm}:${two(ss)}`;
}

// ═══ Upload Screen ═══
function UploadScreen({onAnalyze,settings}){
  const[dragOver,setDragOver]=useState(false);const[loading,setLoading]=useState(false);const[error,setError]=useState(null);const[fileName,setFileName]=useState("");const[stage,setStage]=useState(0);const[mask,setMask]=useState({...DEFAULT_MASK});const inputRef=useRef(null);
  const[aiStatus,setAiStatus]=useState("");
  const[elapsedMs,setElapsedMs]=useState(0);
  const startAtRef=useRef(0);
  const [showUrlHelp, setShowUrlHelp] = useState(false)
  const urlHelpTriggerRef = useRef(null)
  const urlHelpCloseRef = useRef(null)
  const activePreset=MASK_PRESETS.findIndex(p=>Object.entries(p.mask).every(([k,v])=>mask[k]===v));
  const aiOn=settings?.aiDetect!==false;
  const STAGES=["ファイル読み込み","テキスト抽出",aiOn?"AI OCR (画像ページ)":"--",aiOn?"AI テキスト再構成":"--","正規表現マッチ","日本人名辞書照合",aiOn?"AI PII検出":"--","完了"];
  const lc=[null,T.green,T.amber,T.red];
  const closeUrlHelp = useCallback(() => {
      setShowUrlHelp(false)
      setTimeout(() => {
          if (urlHelpTriggerRef.current) urlHelpTriggerRef.current.focus()
      }, 0)
  }, [])
  useEffect(() => {
      if (!showUrlHelp) return
      const onKey = (e) => {
          if (e.key === 'Escape') closeUrlHelp()
      }
      window.addEventListener('keydown', onKey)
      const t = setTimeout(() => {
          if (urlHelpCloseRef.current) urlHelpCloseRef.current.focus()
      }, 0)
      return () => {
          window.removeEventListener('keydown', onKey)
          clearTimeout(t)
      }
  }, [showUrlHelp, closeUrlHelp])

  useEffect(()=>{
    if(!loading)return;
    const id=setInterval(()=>{
      if(!startAtRef.current)return;
      setElapsedMs(Date.now()-startAtRef.current);
    },250);
    return()=>clearInterval(id);
  },[loading]);

  const processText=useCallback(async(text,name,format,pageCount,fileSize,rawText,sparsePages,pdfData)=>{
    let workText=text;
    let originalRaw=rawText||text;
    const runModels = aiOn ? getModelsForRun(settings) : null

    // OCR fallback for image-heavy PDF pages
    if(aiOn&&format==="PDF"&&sparsePages&&sparsePages.length>0){
      setStage(2);
      setAiStatus(`OCR対象: ${sparsePages.length}/${pageCount||"?"}ページ (テキスト未検出)`);
      await new Promise(r=>setTimeout(r,300));
      try{
        const ocrResults = await ocrSparsePages(
            pdfData,
            sparsePages,
            settings?.apiKey,
            runModels?.formatModel || settings?.model,
            (msg) => setAiStatus(msg),
        )
        const ocrCount=Object.keys(ocrResults).length;
        if(ocrCount>0){
          originalRaw=workText;
          workText=mergeOcrResults(workText,ocrResults);
          setAiStatus(`OCR完了: ${ocrCount}ページからテキスト復元`);
        }else{
          setAiStatus(`OCR: テキスト復元なし（${sparsePages.length}ページが画像のみ）`);
        }
      }catch(e){
        setAiStatus(`OCRエラー: ${e.message||"不明"}`);
        console.error("OCR failed:",e);
      }
    }

    // AI text cleanup for PDFs (garbled table/layout extraction)
    if(aiOn&&format==="PDF"){
      setStage(3);
      setAiStatus("AIテキスト再構成中...");
      try{
        const cleaned = await aiCleanupText(
            workText,
            settings?.apiKey,
            runModels?.formatModel || settings?.model,
            (msg) => setAiStatus(msg),
            runModels?.formatFallbackModel,
        )
        // Validate: AI result must retain substantial content
        const origNonEmpty=workText.split("\n").filter(l=>l.trim().length>0).length;
        const cleanNonEmpty=cleaned?cleaned.split("\n").filter(l=>l.trim().length>0).length:0;
        if(cleaned&&cleanNonEmpty>=origNonEmpty*0.5&&cleaned.length>workText.length*0.4){
          if(!originalRaw||originalRaw===workText)originalRaw=workText;
          workText=cleaned;
          setAiStatus(`AI再構成完了（${cleanNonEmpty}行）`);
        }else{
          setAiStatus("AI再構成スキップ（情報損失の恐れ）");
        }
      }catch(e){setAiStatus("AI再構成スキップ");}
    }

    setStage(aiOn?4:2);
    await new Promise(r=>setTimeout(r,80));
    setStage(aiOn?5:3);
    const dets=detectAll(workText);

    // AI PII detection step
    let allDets=dets;
    if(aiOn){
      setStage(6);
      setAiStatus(
          `AI PII検出中... (${runModels?.detectModel || settings?.model})`,
      )
      try {
          const aiRes = await detectWithAI(
              workText,
              settings?.apiKey,
              runModels?.detectModel || settings?.model,
              runModels?.detectFallbackModel,
              (msg) => setAiStatus(msg),
          )
          const aiDets = aiRes?.detections || []
          if (aiDets.length > 0) {
              allDets = mergeDetections(dets, aiDets)
              setAiStatus(
                  `AI: ${aiDets.length}件追加検出${aiRes?.fallbackUsed ? `（再試行:${aiRes.usedModel}）` : ''}`,
              )
          } else if (aiRes?.error) {
              setAiStatus(
                  `AI検出スキップ（${aiRes.usedModel || runModels.detectModel}）`,
              )
          } else {
              setAiStatus(
                  `AI: 追加検出なし${aiRes?.fallbackUsed ? `（再試行:${aiRes.usedModel}）` : ''}`,
              )
          }
      } catch (e) {
          setAiStatus('AI検出スキップ')
      }
    }

    const wm=allDets.map(d=>({...d,enabled:mask[d.category]!==false}));
    await new Promise(r=>setTimeout(r,200));
    setStage(aiOn?7:4);
    setTimeout(()=>{
      const analysisMs=startAtRef.current?Date.now()-startAtRef.current:0;
      onAnalyze({file_name:name,file_format:format,page_count:pageCount,text_preview:workText.slice(0,8000),fullText:workText,rawText:originalRaw,sparsePageCount:sparsePages?.length||0,detections:wm,stats:{total:wm.length,regex:wm.filter(d=>d.source==="regex").length,dict:wm.filter(d=>d.source==="dict").length,ai:wm.filter(d=>d.source==="ai").length,heuristic:wm.filter(d=>d.source==="heuristic").length},fileSize,isDemo:fileSize==="DEMO",analysis_ms:analysisMs,maskOpts:{keepPrefecture:!!mask.keepPrefecture,nameInitial:!!mask.nameInitial}});
    },200);
  },[onAnalyze,mask,settings,aiOn]);

  const handleFile=useCallback(async(file)=>{if(!file)return;startAtRef.current=Date.now();setElapsedMs(0);setAiStatus("");setLoading(true);setError(null);setFileName(file.name);setStage(0);try{setStage(1);const p=await parseFile(file,(msg)=>setAiStatus(msg));await processText(p.text,file.name,p.format,p.pageCount,`${(file.size/1024).toFixed(1)} KB`,p.text,p.sparsePages,p.pdfData);}catch(e){setError(e.message);setLoading(false);}},[processText]);
  const handleDemo=useCallback(async(type)=>{const s=SAMPLES[type];if(!s)return;startAtRef.current=Date.now();setElapsedMs(0);setAiStatus("");setError(null);setLoading(true);setFileName(s.name);setStage(0);setTimeout(async()=>{setStage(1);setTimeout(async()=>{await processText(s.text,s.name,s.format,s.pageCount,"DEMO");},80);},80);},[processText]);
  const[inputMode,setInputMode]=useState("file"); // "file"|"url"|"paste"
  const[urlValue,setUrlValue]=useState("");const[pasteValue,setPasteValue]=useState("");const[urlFetching,setUrlFetching]=useState(false);
  const handleURL=useCallback(async()=>{
    const url=urlValue.trim();if(!url)return;
    startAtRef.current=Date.now();setElapsedMs(0);setAiStatus("");
    setUrlFetching(true);setLoading(true);setError(null);setFileName(url);setStage(0);
    try{
      setStage(1);setAiStatus("URL取得中...");
      const result=await scrapeURL(url,(msg)=>setAiStatus(msg),settings?.proxyUrl);
      setFileName(result.fileName);
      const size=`${(new Blob([result.text]).size/1024).toFixed(1)} KB`;
      await processText(result.text,result.fileName,result.format,result.pageCount,size,result.text);
    }catch(e){setError(e.message);setLoading(false);}
    setUrlFetching(false);
  },[urlValue,processText]);
  const handlePaste=useCallback(async()=>{
    const raw=pasteValue.trim();if(!raw)return;
    startAtRef.current=Date.now();setElapsedMs(0);setAiStatus("");
    setLoading(true);setError(null);setStage(0);
    try{
      setStage(1);
      // Detect if input is HTML or plain text
      const isHTML=/<[a-z][\s\S]*>/i.test(raw);
      let text;let format;
      if(isHTML){text=extractTextFromHTML(raw);format="HTML (ペースト)";}
      else{text=raw;format="テキスト (ペースト)";}
      setFileName(`pasted_${Date.now()}.txt`);
      const size=`${(new Blob([text]).size/1024).toFixed(1)} KB`;
      await processText(text,`pasted_content.${isHTML?"html":"txt"}`,format,null,size,text);
    }catch(e){setError(e.message);setLoading(false);}
  },[pasteValue,processText]);
  const toggleCat=cat=>setMask(p=>({...p,[cat]:!p[cat]}));

  const visibleStages = STAGES.filter((s) => s !== '--')
  const lastStageIndex = Math.max(0, visibleStages.length - 1)
  const stageIdx = Math.min(Math.max(stage, 0), lastStageIndex)
  const pctMatch = aiStatus?.match(/(\d{1,3})\s*%/)
  const subPct = pctMatch
      ? Math.min(100, Math.max(0, parseInt(pctMatch[1], 10)))
      : null
  const progressPct =
      lastStageIndex === 0
          ? 100
          : Math.max(
                0,
                Math.min(
                    100,
                    Math.round(
                        ((stageIdx + (subPct != null ? subPct / 100 : 0)) /
                            lastStageIndex) *
                            100,
                    ),
                ),
            )

  if (loading)
      return (
          <div
              style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 'calc(100vh - 56px)',
                  padding: 40,
                  animation: 'fadeUp .4s',
              }}
          >
              <div
                  style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}
              >
                  <div
                      style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          border: `3px solid ${T.border}`,
                          borderTopColor: T.accent,
                          animation: 'spin .8s linear infinite',
                          margin: '0 auto 24px',
                      }}
                  />
                  <h2
                      style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: T.text,
                          marginBottom: 6,
                      }}
                  >
                      {fileName}
                  </h2>
                  <p style={{ fontSize: 13, color: T.text2, marginBottom: 20 }}>
                      解析中...
                  </p>
                  <div style={{ padding: '0 20px', marginBottom: 14 }}>
                      <div
                          style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                          }}
                      >
                          <span style={{ fontSize: 11, color: T.text3 }}>
                              進捗（{Math.min(stageIdx + 1, visibleStages.length)}/
                              {visibleStages.length}）
                          </span>
                          <span
                              style={{
                                  fontSize: 12,
                                  fontFamily: T.mono,
                                  color: T.text2,
                                  fontWeight: 700,
                              }}
                          >
                              {progressPct}%
                          </span>
                      </div>
                      <div
                          style={{
                              height: 8,
                              borderRadius: 999,
                              background: T.surfaceAlt,
                              overflow: 'hidden',
                              border: `1px solid ${T.border}`,
                          }}
                      >
                          <div
                              style={{
                                  height: '100%',
                                  width: `${progressPct}%`,
                                  background: `linear-gradient(90deg,${T.accent},${T.purple})`,
                                  transition: 'width .25s ease',
                              }}
                          />
                      </div>
                      <div
                          style={{
                              fontSize: 10,
                              color: T.text3,
                              marginTop: 8,
                              textAlign: 'left',
                              lineHeight: 1.4,
                          }}
                      >
                          現在: {visibleStages[stageIdx] || '処理中'}
                          {subPct != null ? `（${subPct}%）` : ''}
                      </div>
                      <div
                          style={{
                              fontSize: 10,
                              color: T.text3,
                              marginTop: 4,
                              textAlign: 'left',
                              lineHeight: 1.4,
                              fontFamily: T.mono,
                          }}
                      >
                          経過: {formatDuration(elapsedMs)}
                      </div>
                  </div>
                  {aiStatus && (
                      <div
                          style={{
                              padding: '10px 16px',
                              borderRadius: 10,
                              background: T.accentDim,
                              marginBottom: 20,
                              fontSize: 12,
                              color: T.accent,
                              fontWeight: 500,
                              fontFamily: T.mono,
                              lineHeight: 1.6,
                              minHeight: 36,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                          }}
                      >
                          {aiStatus}
                      </div>
                  )}
                  <div style={{ textAlign: 'left', padding: '0 20px' }}>
                      {visibleStages.map((s, i) => (
                          <div
                              key={i}
                              style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  padding: '7px 0',
                                  fontSize: 13,
                                  color:
                                      i < stage
                                          ? T.green
                                          : i === stage
                                            ? T.accent
                                            : T.text3,
                              }}
                          >
                              <div
                                  style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: 10,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      background:
                                          i < stage
                                              ? T.greenDim
                                              : i === stage
                                                ? T.accentDim
                                                : 'transparent',
                                      border: `1.5px solid ${i < stage ? T.green : i === stage ? T.accent : T.text3}`,
                                  }}
                              >
                                  {i < stage
                                      ? '\u2713'
                                      : i === stage
                                        ? '\u2022'
                                        : '\u25CB'}
                              </div>
                              <span
                                  style={{
                                      fontWeight: i === stage ? 600 : 400,
                                  }}
                              >
                                  {s}
                              </span>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )

  return (
      <div
          style={{
              minHeight: 'calc(100vh - 56px)',
              padding: '32px 40px',
              animation: 'fadeUp .5s ease',
          }}
      >
          <div
              style={{
                  textAlign: 'center',
                  marginBottom: 28,
                  maxWidth: 900,
                  margin: '0 auto 28px',
              }}
          >
              <h1
                  style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: T.text,
                      lineHeight: 1.35,
                  }}
              >
                  職務経歴書の
                  <span style={{ color: T.accent }}>
                      個人情報を自動マスキング
                  </span>
              </h1>
              <p
                  style={{
                      fontSize: 13,
                      color: T.text2,
                      marginTop: 8,
                      lineHeight: 1.7,
                  }}
              >
                  日本人名辞書 + 正規表現 + AI検出 + AIテキスト再構成で高精度
              </p>
          </div>
          <div
              className='rp-upload-main'
              style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 24,
                  maxWidth: 1200,
                  margin: '0 auto',
                  alignItems: 'start',
              }}
          >
              <div
                  style={{
                      background: T.surface,
                      border: `1px solid ${T.border}`,
                      borderRadius: 14,
                      padding: '18px 20px',
                  }}
              >
                  <div
                      style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: T.text,
                          marginBottom: 14,
                      }}
                  >
                      マスキング設定{' '}
                      <span
                          style={{
                              fontSize: 12,
                              fontWeight: 400,
                              color: T.text3,
                          }}
                      >
                          -- アップロード前に対象を選択
                      </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      {MASK_PRESETS.map((p, i) => (
                          <button
                              key={p.id}
                              onClick={() => setMask({ ...p.mask })}
                              style={{
                                  flex: 1,
                                  padding: '10px 12px',
                                  borderRadius: 10,
                                  border: `1.5px solid ${activePreset === i ? T.accent : T.border}`,
                                  background:
                                      activePreset === i
                                          ? T.accentDim
                                          : 'transparent',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  transition: 'all .15s',
                              }}
                          >
                              <div
                                  style={{
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color:
                                          activePreset === i
                                              ? T.accent
                                              : T.text,
                                      marginBottom: 2,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                  }}
                              >
                                  <span
                                      style={{
                                          display: 'inline-block',
                                          width: 8,
                                          height: 8,
                                          borderRadius: 4,
                                          background: lc[p.level],
                                      }}
                                  />
                                  {p.label}
                              </div>
                              <div style={{ fontSize: 12, color: T.text3 }}>
                                  {p.desc}
                              </div>
                          </button>
                      ))}
                  </div>
                  <div
                      style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '6px 16px',
                      }}
                  >
                      {Object.entries(CATEGORIES)
                          .filter(([k]) => k !== 'photo')
                          .map(([key, meta]) => (
                              <div
                                  key={key}
                                  style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 12px',
                                      borderRadius: 8,
                                      background: mask[key]
                                          ? `${meta.color}08`
                                          : 'transparent',
                                      border: `1px solid ${mask[key] ? `${meta.color}20` : 'transparent'}`,
                                      transition: 'all .2s',
                                  }}
                              >
                                  <span
                                      style={{
                                          fontSize: 12,
                                          fontWeight: 500,
                                          color: mask[key] ? T.text : T.text3,
                                      }}
                                  >
                                      {meta.label}
                                  </span>
                                  <Toggle
                                      checked={mask[key]}
                                      onChange={() => toggleCat(key)}
                                      size='sm'
                                  />
                              </div>
                          ))}
                  </div>
                  {/* Advanced options */}
                  <div
                      style={{
                          marginTop: 12,
                          padding: '10px 12px',
                          borderRadius: 10,
                          background: T.bg,
                          border: `1px solid ${T.border}`,
                      }}
                  >
                      <div
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text2,
                              marginBottom: 8,
                          }}
                      >
                          詳細オプション
                      </div>
                      <div
                          style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                          }}
                      >
                          <div
                              style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                              }}
                          >
                              <div>
                                  <div
                                      style={{
                                          fontSize: 12,
                                          fontWeight: 500,
                                          color: mask.address
                                              ? T.text
                                              : T.text3,
                                      }}
                                  >
                                      都道府県を残す
                                  </div>
                                  <div style={{ fontSize: 12, color: T.text3 }}>
                                      住所マスク時に在住エリアだけ公開
                                  </div>
                              </div>
                              <Toggle
                                  checked={mask.keepPrefecture}
                                  onChange={() =>
                                      setMask((p) => ({
                                          ...p,
                                          keepPrefecture: !p.keepPrefecture,
                                      }))
                                  }
                                  size='sm'
                                  disabled={!mask.address}
                              />
                          </div>
                          <div
                              style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                              }}
                          >
                              <div>
                                  <div
                                      style={{
                                          fontSize: 12,
                                          fontWeight: 500,
                                          color: mask.name ? T.text : T.text3,
                                      }}
                                  >
                                      氏名イニシャル化
                                  </div>
                                  <div style={{ fontSize: 12, color: T.text3 }}>
                                      田中太郎 → T.T.（フリガナから変換）
                                  </div>
                              </div>
                              <Toggle
                                  checked={mask.nameInitial}
                                  onChange={() =>
                                      setMask((p) => ({
                                          ...p,
                                          nameInitial: !p.nameInitial,
                                      }))
                                  }
                                  size='sm'
                                  disabled={!mask.name}
                              />
                          </div>
                      </div>
                  </div>
                  <div
                      style={{
                          marginTop: 10,
                          display: 'flex',
                          gap: 6,
                          flexWrap: 'wrap',
                      }}
                  >
                      {Object.entries(mask)
                          .filter(([, v]) => v)
                          .map(([k]) => {
                              const m = CATEGORIES[k]
                              return m ? (
                                  <Badge key={k} color={m.color} bg={m.bg}>
                                      {m.label}
                                  </Badge>
                              ) : null
                          })}
                      {mask.keepPrefecture && mask.address && (
                          <Badge
                              color={CATEGORIES.address.color}
                              bg={CATEGORIES.address.bg}
                          >
                              都道府県残す
                          </Badge>
                      )}
                      {mask.nameInitial && mask.name && (
                          <Badge
                              color={CATEGORIES.name.color}
                              bg={CATEGORIES.name.bg}
                          >
                              イニシャル化
                          </Badge>
                      )}
                  </div>
              </div>
              {/* Right Column: Input + Samples */}
              <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
              >
                  <div>
                      <div
                          className='rp-input-tabs'
                          style={{
                              display: 'flex',
                              gap: 0,
                              marginBottom: 0,
                              borderRadius: '12px 12px 0 0',
                              overflow: 'hidden',
                              border: `1px solid ${T.border}`,
                              borderBottom: 'none',
                          }}
                      >
                          {[
                              {
                                  id: 'file',
                                  icon: '\u{1F4C1}',
                                  label: 'ファイル',
                              },
                              {
                                  id: 'url',
                                  icon: '\u{1F310}',
                                  label: 'URLスクレイピング',
                              },
                              {
                                  id: 'paste',
                                  icon: '\u{1F4CB}',
                                  label: 'テキスト/HTML貼付',
                              },
                          ].map((tab) => (
                              <button
                                  key={tab.id}
                                  onClick={() => setInputMode(tab.id)}
                                  style={{
                                      flex: 1,
                                      padding: '12px 8px',
                                      border: 'none',
                                      background:
                                          inputMode === tab.id
                                              ? T.surface
                                              : T.bg2,
                                      cursor: 'pointer',
                                      fontSize: 12,
                                      fontWeight:
                                          inputMode === tab.id ? 700 : 500,
                                      color:
                                          inputMode === tab.id
                                              ? T.accent
                                              : T.text3,
                                      borderBottom:
                                          inputMode === tab.id
                                              ? `2px solid ${T.accent}`
                                              : `2px solid transparent`,
                                      transition: 'all .15s',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 6,
                                  }}
                              >
                                  {tab.icon} {tab.label}
                              </button>
                          ))}
                      </div>
                      <div
                          style={{
                              border: `1px solid ${T.border}`,
                              borderTop: 'none',
                              borderRadius: '0 0 12px 12px',
                              background: T.bg2,
                              overflow: 'hidden',
                          }}
                      >
                          {inputMode === 'file' && (
                              <div
                                  onClick={() => inputRef.current?.click()}
                                  onDragOver={(e) => {
                                      e.preventDefault()
                                      setDragOver(true)
                                  }}
                                  onDragLeave={() => setDragOver(false)}
                                  onDrop={(e) => {
                                      e.preventDefault()
                                      setDragOver(false)
                                      handleFile(e.dataTransfer?.files?.[0])
                                  }}
                                  style={{
                                      padding: '44px 32px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      gap: 14,
                                      cursor: 'pointer',
                                      transition: 'all .25s',
                                      background: dragOver
                                          ? T.accentDim
                                          : T.bg2,
                                  }}
                              >
                                  <input
                                      ref={inputRef}
                                      type='file'
                                      accept='.pdf,.docx,.doc,.xlsx,.xls,.ods,.csv,.txt,.tsv,.md,.markdown,.html,.htm,.rtf,.json,.odt'
                                      onChange={(e) =>
                                          handleFile(e.target.files?.[0])
                                      }
                                      style={{ display: 'none' }}
                                  />
                                  <svg
                                      width='40'
                                      height='40'
                                      viewBox='0 0 24 24'
                                      fill='none'
                                      stroke={T.accent}
                                      strokeWidth='2'
                                      strokeLinecap='round'
                                      strokeLinejoin='round'
                                  >
                                      <path d='M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' />
                                      <polyline points='17 8 12 3 7 8' />
                                      <line x1='12' y1='3' x2='12' y2='15' />
                                  </svg>
                                  <div style={{ textAlign: 'center' }}>
                                      <p
                                          style={{
                                              fontSize: 15,
                                              fontWeight: 600,
                                              color: T.text,
                                          }}
                                      >
                                          ファイルをドラッグ＆ドロップ
                                      </p>
                                      <p
                                          style={{
                                              fontSize: 12,
                                              color: T.text3,
                                              marginTop: 4,
                                          }}
                                      >
                                          PDF / Word / Excel / ODS / CSV /
                                          Markdown / HTML / RTF / JSON / ODT /
                                          TXT
                                      </p>
                                  </div>
                              </div>
                          )}
                          {inputMode === 'url' && (
                              <div style={{ padding: '24px 24px 28px' }}>
                                  <div
                                      style={{
                                          fontSize: 13,
                                          fontWeight: 600,
                                          color: T.text,
                                          marginBottom: 4,
                                      }}
                                  >
                                      URLからスクレイピング
                                  </div>
                                  <p
                                      style={{
                                          fontSize: 12,
                                          color: T.text3,
                                          marginBottom: 10,
                                          lineHeight: 1.6,
                                      }}
                                  >
                                      Webページの職務経歴書・ポートフォリオをそのまま取得してマスキングします
                                  </p>
                                  <div
                                      style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          marginBottom: 12,
                                      }}
                                  >
                                      <button
                                          ref={urlHelpTriggerRef}
                                          onClick={() => setShowUrlHelp(true)}
                                          aria-haspopup='dialog'
                                          aria-expanded={showUrlHelp}
                                          title='URL取得の注意とヒントを表示'
                                          style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 6,
                                              padding: '6px 10px',
                                              borderRadius: 8,
                                              border: `1px solid ${T.border}`,
                                              background: T.surface,
                                              color: T.text2,
                                              fontSize: 12,
                                              fontWeight: 600,
                                              cursor: 'pointer',
                                              transition: 'all .15s',
                                          }}
                                      >
                                          <svg
                                              width='14'
                                              height='14'
                                              viewBox='0 0 24 24'
                                              fill='none'
                                              stroke={T.text2}
                                              strokeWidth='2'
                                              strokeLinecap='round'
                                              strokeLinejoin='round'
                                              aria-hidden='true'
                                          >
                                              <circle cx='12' cy='12' r='10' />
                                              <line
                                                  x1='12'
                                                  y1='10'
                                                  x2='12'
                                                  y2='16'
                                              />
                                              <line
                                                  x1='12'
                                                  y1='7'
                                                  x2='12.01'
                                                  y2='7'
                                              />
                                          </svg>
                                          補足ガイド
                                      </button>
                                  </div>
                                  <div
                                      style={{
                                          display: 'flex',
                                          gap: 8,
                                          marginBottom: 12,
                                      }}
                                  >
                                      <input
                                          value={urlValue}
                                          onChange={(e) =>
                                              setUrlValue(e.target.value)
                                          }
                                          onKeyDown={(e) => {
                                              if (
                                                  e.key === 'Enter' &&
                                                  urlValue.trim()
                                              )
                                                  handleURL()
                                          }}
                                          placeholder='https://example.com/resume'
                                          style={{
                                              flex: 1,
                                              padding: '10px 14px',
                                              borderRadius: 10,
                                              border: `1px solid ${T.border}`,
                                              background: T.surface,
                                              color: T.text,
                                              fontSize: 13,
                                              fontFamily: T.mono,
                                              outline: 'none',
                                          }}
                                      />
                                      <button
                                          onClick={handleURL}
                                          disabled={
                                              !urlValue.trim() || urlFetching
                                          }
                                          style={{
                                              padding: '10px 20px',
                                              borderRadius: 10,
                                              border: 'none',
                                              background: urlValue.trim()
                                                  ? T.accent
                                                  : T.border,
                                              color: urlValue.trim()
                                                  ? '#fff'
                                                  : T.text3,
                                              fontSize: 13,
                                              fontWeight: 600,
                                              cursor: urlValue.trim()
                                                  ? 'pointer'
                                                  : 'default',
                                              opacity: urlFetching ? 0.6 : 1,
                                              transition: 'all .15s',
                                              whiteSpace: 'nowrap',
                                          }}
                                      >
                                          {urlFetching
                                              ? '取得中...'
                                              : '取得＆解析'}
                                      </button>
                                  </div>
                                  {showUrlHelp && (
                                      <div
                                          style={{
                                              position: 'fixed',
                                              inset: 0,
                                              background: 'rgba(0,0,0,.55)',
                                              backdropFilter: 'blur(4px)',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              zIndex: 120,
                                              padding: 16,
                                              animation: 'fadeIn .2s',
                                          }}
                                          onClick={(e) => {
                                              if (e.target === e.currentTarget)
                                                  closeUrlHelp()
                                          }}
                                      >
                                          <div
                                              role='dialog'
                                              aria-modal='true'
                                              aria-label='URLスクレイピングのガイド'
                                              style={{
                                                  width: '100%',
                                                  maxWidth: 520,
                                                  maxHeight: '90vh',
                                                  overflow: 'auto',
                                                  background: T.bg2,
                                                  borderRadius: 14,
                                                  border: `1px solid ${T.border}`,
                                                  animation: 'fadeUp .25s ease',
                                              }}
                                          >
                                              <div
                                                  style={{
                                                      padding: '12px 16px',
                                                      borderBottom: `1px solid ${T.border}`,
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      justifyContent:
                                                          'space-between',
                                                      position: 'sticky',
                                                      top: 0,
                                                      background: T.bg2,
                                                  }}
                                              >
                                                  <div
                                                      style={{
                                                          fontSize: 14,
                                                          fontWeight: 700,
                                                          color: T.text,
                                                      }}
                                                  >
                                                      URLスクレイピング ガイド
                                                  </div>
                                                  <button
                                                      ref={urlHelpCloseRef}
                                                      onClick={closeUrlHelp}
                                                      aria-label='閉じる'
                                                      style={{
                                                          width: 28,
                                                          height: 28,
                                                          borderRadius: 7,
                                                          border: `1px solid ${T.border}`,
                                                          background:
                                                              'transparent',
                                                          color: T.text2,
                                                          cursor: 'pointer',
                                                          fontSize: 13,
                                                          display: 'flex',
                                                          alignItems: 'center',
                                                          justifyContent:
                                                              'center',
                                                      }}
                                                  >
                                                      ×
                                                  </button>
                                              </div>
                                              <div
                                                  style={{
                                                      padding: '16px 18px',
                                                      display: 'flex',
                                                      flexDirection: 'column',
                                                      gap: 14,
                                                  }}
                                              >
                                                  <div>
                                                      <div
                                                          style={{
                                                              fontSize: 12,
                                                              fontWeight: 700,
                                                              color: T.text,
                                                              marginBottom: 6,
                                                          }}
                                                      >
                                                          対象外/非推奨
                                                      </div>
                                                      <div
                                                          style={{
                                                              fontSize: 12,
                                                              color: T.text2,
                                                              lineHeight: 1.7,
                                                          }}
                                                      >
                                                          SNS/テックブログ系のURLは情報が断片的で、マスク後に内容がほぼ残らないためURLスクレイピングは非推奨です。必要に応じて「テキスト/HTML貼付」やPDFでの取り込みをご利用ください。
                                                      </div>
                                                  </div>
                                                  <div>
                                                      <div
                                                          style={{
                                                              fontSize: 12,
                                                              fontWeight: 700,
                                                              color: T.text,
                                                              marginBottom: 6,
                                                          }}
                                                      >
                                                          取得の安定化
                                                      </div>
                                                      <div
                                                          style={{
                                                              fontSize: 12,
                                                              color: T.text2,
                                                              lineHeight: 1.7,
                                                          }}
                                                      >
                                                          {settings?.proxyUrl ? (
                                                              <>
                                                                  自前プロキシ設定済。URL取得は安定して動作します。
                                                              </>
                                                          ) : (
                                                              <>
                                                                  サーバー経由で自動取得します。取得できない場合はテキスト貼付をお試しください。
                                                              </>
                                                          )}
                                                      </div>
                                                      <div
                                                          style={{
                                                              fontSize: 12,
                                                              color: T.text3,
                                                              marginTop: 6,
                                                          }}
                                                      >
                                                          Tip:
                                                          取得失敗時は「テキスト/HTML貼付」タブへ。Ctrl+U→ソースコピーで確実に取り込めます。
                                                      </div>
                                                  </div>
                                                  <div>
                                                      <div
                                                          style={{
                                                              fontSize: 12,
                                                              fontWeight: 700,
                                                              color: T.text,
                                                              marginBottom: 6,
                                                          }}
                                                      >
                                                          非対応サイト
                                                      </div>
                                                      <div
                                                          style={{
                                                              fontSize: 12,
                                                              color: T.text2,
                                                              lineHeight: 1.7,
                                                          }}
                                                      >
                                                          Canva / Figma / Notion
                                                          / Google Docs
                                                          はSPAのため取得不可。PDF保存
                                                          →「ファイル」タブからアップロードしてください。
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                      </div>
                                  )}
                              </div>
                          )}
                          {inputMode === 'paste' && (
                              <div style={{ padding: '24px 24px 28px' }}>
                                  <div
                                      style={{
                                          fontSize: 13,
                                          fontWeight: 600,
                                          color: T.text,
                                          marginBottom: 4,
                                      }}
                                  >
                                      テキストまたはHTMLソースを貼付
                                  </div>
                                  <p
                                      style={{
                                          fontSize: 12,
                                          color: T.text3,
                                          marginBottom: 14,
                                          lineHeight: 1.6,
                                      }}
                                  >
                                      職務経歴書のテキストをコピー＆ペースト、またはHTMLソースを貼り付けてください
                                  </p>
                                  <textarea
                                      value={pasteValue}
                                      onChange={(e) =>
                                          setPasteValue(e.target.value)
                                      }
                                      placeholder={
                                          'ここにテキストまたはHTMLを貼り付け...\n\n例:\n・職務経歴書のテキスト全文\n・Ctrl+U でコピーしたHTMLソース\n・Wantedlyプロフィールのコピー'
                                      }
                                      style={{
                                          width: '100%',
                                          minHeight: 160,
                                          padding: '12px 14px',
                                          borderRadius: 10,
                                          border: `1px solid ${T.border}`,
                                          background: T.surface,
                                          color: T.text,
                                          fontSize: 12,
                                          fontFamily: T.mono,
                                          lineHeight: 1.7,
                                          resize: 'vertical',
                                          outline: 'none',
                                          boxSizing: 'border-box',
                                      }}
                                  />
                                  <div
                                      style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          marginTop: 10,
                                      }}
                                  >
                                      <div
                                          style={{
                                              fontSize: 12,
                                              color: T.text3,
                                          }}
                                      >
                                          {pasteValue.trim() ? (
                                              <>
                                                  {/<[a-z][\s\S]*>/i.test(
                                                      pasteValue,
                                                  ) ? (
                                                      <span
                                                          style={{
                                                              color: T.cyan,
                                                          }}
                                                      >
                                                          HTML検出
                                                      </span>
                                                  ) : (
                                                      <span
                                                          style={{
                                                              color: T.green,
                                                          }}
                                                      >
                                                          テキスト
                                                      </span>
                                                  )}{' '}
                                                  /{' '}
                                                  {(
                                                      new Blob([pasteValue])
                                                          .size / 1024
                                                  ).toFixed(1)}{' '}
                                                  KB
                                              </>
                                          ) : (
                                              '入力待ち...'
                                          )}
                                      </div>
                                      <button
                                          onClick={handlePaste}
                                          disabled={!pasteValue.trim()}
                                          style={{
                                              padding: '10px 24px',
                                              borderRadius: 10,
                                              border: 'none',
                                              background: pasteValue.trim()
                                                  ? T.accent
                                                  : T.border,
                                              color: pasteValue.trim()
                                                  ? '#fff'
                                                  : T.text3,
                                              fontSize: 13,
                                              fontWeight: 600,
                                              cursor: pasteValue.trim()
                                                  ? 'pointer'
                                                  : 'default',
                                              transition: 'all .15s',
                                          }}
                                      >
                                          解析開始
                                      </button>
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
                  {error && (
                      <div
                          style={{
                              padding: '10px 16px',
                              borderRadius: 10,
                              background: T.redDim,
                              color: T.red,
                              fontSize: 13,
                          }}
                      >
                          ! {error}
                      </div>
                  )}
                  <div
                      style={{
                          background: T.surface,
                          border: `1px solid ${T.border}`,
                          borderRadius: 14,
                          padding: '16px 20px',
                      }}
                  >
                      <div
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text2,
                              marginBottom: 12,
                          }}
                      >
                          テストサンプルで動作確認
                      </div>
                      <div
                          className='rp-upload-grid'
                          style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: 8,
                          }}
                      >
                          {[
                              {
                                  type: 'pdf',
                                  label: 'PDF',
                                  desc: '経歴書 2ページ',
                                  color: C.red,
                              },
                              {
                                  type: 'xlsx',
                                  label: 'Excel',
                                  desc: '社員一覧 5名分',
                                  color: C.green,
                              },
                              {
                                  type: 'csv',
                                  label: 'CSV',
                                  desc: '応募者リスト',
                                  color: C.amber,
                              },
                              {
                                  type: 'text',
                                  label: 'Text',
                                  desc: '詳細経歴書 3社分',
                                  color: C.purple,
                              },
                          ].map((s) => (
                              <button
                                  key={s.type}
                                  onClick={() => handleDemo(s.type)}
                                  style={{
                                      padding: '12px 14px',
                                      borderRadius: 10,
                                      border: `1px solid ${T.border}`,
                                      background: T.bg2,
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      transition: 'all .15s',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 10,
                                  }}
                              >
                                  <span
                                      style={{
                                          width: 8,
                                          height: 8,
                                          borderRadius: 4,
                                          background: s.color,
                                          flexShrink: 0,
                                      }}
                                  />
                                  <div>
                                      <div
                                          style={{
                                              fontSize: 12,
                                              fontWeight: 600,
                                              color: T.text,
                                          }}
                                      >
                                          {s.label}{' '}
                                          <span
                                              style={{
                                                  fontSize: 12,
                                                  color: T.text3,
                                                  fontWeight: 400,
                                              }}
                                          >
                                              DEMO
                                          </span>
                                      </div>
                                      <div
                                          style={{
                                              fontSize: 12,
                                              color: T.text3,
                                          }}
                                      >
                                          {s.desc}
                                      </div>
                                  </div>
                              </button>
                          ))}
                      </div>
                      <a
                          href="/mock-resumes.zip"
                          download="mock-resumes.zip"
                          title="モック履歴書一式をダウンロード（ZIP）"
                          style={{
                              display:"flex",alignItems:"center",gap:8,
                              marginTop:12,padding:"10px 14px",borderRadius:10,
                              border:`1px solid ${T.border}`,background:T.bg2,
                              cursor:"pointer",textDecoration:"none",
                              transition:"all .15s",fontSize:12,color:T.text2,
                          }}
                          onMouseEnter={(e)=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.accent;}}
                          onMouseLeave={(e)=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text2;}}
                      >
                          <span style={{fontSize:16}}>&#x1F4E6;</span>
                          <div>
                              <div style={{fontWeight:600,color:"inherit"}}>モック履歴書一式 (ZIP)</div>
                              <div style={{fontSize:11,color:T.text3}}>18種 / TXT・CSV・XLSX・HTML・MD・JSON・RTF・DOCX</div>
                          </div>
                      </a>
                  </div>
              </div>
              {/* end right column */}
          </div>
          {/* end grid */}
      </div>
  )
}

// ═══ AI Panel ═══
function AIPanel({redactedText,apiKey,model,onApply,onClose}){
  const[instruction,setInstruction]=useState("");const[result,setResult]=useState("");const[loading,setLoading]=useState(false);const[error,setError]=useState(null);const[showPreview,setShowPreview]=useState(false);
  const PRESETS=[{label:"推薦書フォーマット",prompt:"人材紹介会社が企業に提出する推薦書フォーマットに変換。(1)職務要約（3行）(2)スキルセット (3)職務経歴（直近3社）(4)強み・適性"},{label:"スキルシート",prompt:"IT業界のスキルシート形式に変換。(1)基本情報 (2)技術スキル（言語/FW/DB/OS）(3)プロジェクト経歴（期間・規模・役割・環境・工程）"},{label:"英語翻訳",prompt:"英語に翻訳。マスキング部分は[Name Redacted]等に変換。欧米式レジュメ形式で。"},{label:"300字要約",prompt:"300字以内で要約。経験年数、主要スキル、直近の実績を簡潔に。"}];
  const gen = async (p) => {
      const q = p || instruction
      if (!q.trim()) return
      setLoading(true)
      setError(null)
      setResult('')

      const providerId = getProviderForModel(model)
      const tier = getModelTier(providerId, model) || 1
      const maxTier = getProviderMaxTier(providerId)
      const fallbackModel =
          tier <= 1
              ? getPreferredTierModel(providerId, Math.min(2, maxTier))
              : null

      try {
          const out = await aiReformat(redactedText, q, apiKey, model)
          const trimmed = (out || '').trim()
          if (trimmed) {
              setResult(trimmed)
              return
          }

          if (fallbackModel && fallbackModel !== model) {
              const fbOut = await aiReformat(
                  redactedText,
                  q,
                  apiKey,
                  fallbackModel,
              )
              const fbTrim = (fbOut || '').trim()
              if (fbTrim) {
                  setResult(fbTrim)
                  return
              }
          }
          setError(
              'AIの応答が空でした。モデルを変更するか、指示を短くして再実行してください。',
          )
      } catch (e) {
          if (fallbackModel && fallbackModel !== model) {
              try {
                  const fbOut = await aiReformat(
                      redactedText,
                      q,
                      apiKey,
                      fallbackModel,
                  )
                  const fbTrim = (fbOut || '').trim()
                  if (fbTrim) {
                      setResult(fbTrim)
                      return
                  }
              } catch {}
          }
          setError(e.message)
      } finally {
          setLoading(false)
      }
  }
  const curModel=AI_MODELS.find(m=>m.id===model)||AI_MODELS[1];
  return (
      <>
          <div
              style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 100,
                  padding: 20,
                  animation: 'fadeIn .2s',
              }}
          >
              <div
                  style={{
                      width: '100%',
                      maxWidth: 720,
                      maxHeight: '90vh',
                      background: T.bg2,
                      borderRadius: 16,
                      border: `1px solid ${T.border}`,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      animation: 'fadeUp .3s ease',
                  }}
              >
                  <div
                      style={{
                          padding: '14px 22px',
                          borderBottom: `1px solid ${T.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                      }}
                  >
                      <div>
                          <div
                              style={{
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: T.text,
                              }}
                          >
                              AI 再フォーマット
                          </div>
                          <div style={{ fontSize: 12, color: T.text3 }}>
                              Model: {curModel.label} --
                              マスキング維持のまま形式変換
                          </div>
                      </div>
                      <button
                          onClick={onClose}
                          style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              border: `1px solid ${T.border}`,
                              background: 'transparent',
                              color: T.text2,
                              cursor: 'pointer',
                              fontSize: 13,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                          }}
                      >
                          x
                      </button>
                  </div>
                  <div style={{ flex: 1, overflow: 'auto', padding: 22 }}>
                      <div
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text2,
                              marginBottom: 8,
                          }}
                      >
                          プリセット
                      </div>
                      <div
                          style={{
                              display: 'flex',
                              gap: 8,
                              flexWrap: 'wrap',
                              marginBottom: 18,
                          }}
                      >
                          {PRESETS.map((p, i) => (
                              <button
                                  key={i}
                                  onClick={() => {
                                      setInstruction(p.prompt)
                                      gen(p.prompt)
                                  }}
                                  style={{
                                      padding: '8px 14px',
                                      borderRadius: 9,
                                      border: `1px solid ${T.border}`,
                                      background: T.surface,
                                      color: T.text,
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      fontFamily: T.font,
                                  }}
                              >
                                  {p.label}
                              </button>
                          ))}
                      </div>
                      <div
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text2,
                              marginBottom: 8,
                          }}
                      >
                          カスタム指示
                      </div>
                      <div
                          style={{ display: 'flex', gap: 8, marginBottom: 18 }}
                      >
                          <textarea
                              value={instruction}
                              onChange={(e) => setInstruction(e.target.value)}
                              placeholder='例: 箇条書きで技術スキルを整理し...'
                              style={{
                                  flex: 1,
                                  padding: '10px 14px',
                                  borderRadius: 10,
                                  border: `1px solid ${T.border}`,
                                  background: T.surface,
                                  color: T.text,
                                  fontSize: 13,
                                  fontFamily: T.font,
                                  resize: 'vertical',
                                  minHeight: 54,
                                  outline: 'none',
                              }}
                          />
                          <Btn
                              onClick={() => gen()}
                              disabled={loading || !instruction.trim()}
                              style={{
                                  alignSelf: 'flex-end',
                                  borderRadius: 10,
                              }}
                          >
                              生成
                          </Btn>
                      </div>
                      {error && (
                          <div
                              style={{
                                  padding: '10px 14px',
                                  borderRadius: 10,
                                  background: T.redDim,
                                  color: T.red,
                                  fontSize: 12,
                                  marginBottom: 14,
                              }}
                          >
                              ! {error}
                          </div>
                      )}
                      {loading && (
                          <div
                              style={{
                                  textAlign: 'center',
                                  padding: '32px 20px',
                              }}
                          >
                              <div
                                  style={{
                                      width: 36,
                                      height: 36,
                                      borderRadius: 18,
                                      border: `3px solid ${T.border}`,
                                      borderTopColor: T.accent,
                                      animation: 'spin .8s linear infinite',
                                      margin: '0 auto 14px',
                                  }}
                              />
                              <p style={{ fontSize: 13, color: T.text2 }}>
                                  AIが再フォーマット中... ({curModel.label})
                              </p>
                          </div>
                      )}
                      {result && !loading && (
                          <div>
                              <div
                                  style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      marginBottom: 8,
                                  }}
                              >
                                  <span
                                      style={{
                                          fontSize: 13,
                                          fontWeight: 600,
                                          color: T.text,
                                      }}
                                  >
                                      生成結果
                                  </span>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                      <Btn
                                          variant='ghost'
                                          onClick={() => setShowPreview(true)}
                                          style={{
                                              padding: '5px 12px',
                                              fontSize: 12,
                                              borderRadius: 7,
                                          }}
                                      >
                                          プレビュー / 保存
                                      </Btn>
                                      <Btn
                                          variant='success'
                                          onClick={() => onApply(result)}
                                          style={{
                                              padding: '5px 12px',
                                              fontSize: 12,
                                              borderRadius: 7,
                                          }}
                                      >
                                          適用して閉じる
                                      </Btn>
                                  </div>
                              </div>
                              <pre
                                  style={{
                                      padding: 18,
                                      borderRadius: 12,
                                      background: T.surface,
                                      border: `1px solid ${T.border}`,
                                      fontFamily: T.mono,
                                      fontSize: 12,
                                      lineHeight: 1.8,
                                      color: T.text,
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                      maxHeight: 300,
                                      overflow: 'auto',
                                  }}
                              >
                                  {result}
                              </pre>
                          </div>
                      )}
                  </div>
              </div>
          </div>
          {showPreview && (
              <PreviewModal
                  title='AI 整形結果'
                  content={result}
                  baseName={`ai_formatted_${fileTimestamp()}`}
                  onClose={() => setShowPreview(false)}
                  onContentChange={(newText) => {
                      setResult(newText);
                  }}
              />
          )}
      </>
  )
}

// ═══ Editor Screen ═══
function EditorScreen({data,onReset,apiKey,model}){
  const [detections, setDetections] = useState(
      ensureUniqueDetectionIds(data.detections),
  )
  const[showRedacted,setShowRedacted]=useState(true);const[copied,setCopied]=useState(false);
  const[filterCat,setFilterCat]=useState("all");const[filterSrc,setFilterSrc]=useState("all");
  const[showAI,setShowAI]=useState(false);const[aiResult,setAiResult]=useState(null);
  const[viewMode,setViewMode]=useState("original");const[preview,setPreview]=useState(null);
  const[showDesign,setShowDesign]=useState(false);
  const[focusDetId,setFocusDetId]=useState(null);
  const[focusPulse,setFocusPulse]=useState(0);
  const[sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const[editMode,setEditMode]=useState(false);
  const[editedText,setEditedText]=useState(null);
  const[previewVisible,setPreviewVisible]=useState(true);
  const[previewFontType,setPreviewFontType]=useState("gothic");
  const[previewZoom,setPreviewZoom]=useState(1);
  // Draggable panel widths (percentages of total width)
  const[leftPct,setLeftPct]=useState(null);
  const[rightPct,setRightPct]=useState(null);
  // Layout presets
  const[layoutPreset,setLayoutPreset]=useState('balanced');
  const presetTransRef=useRef(false);
  const applyLayoutPreset=useCallback((id)=>{
    setLayoutPreset(id);
    setLeftPct(null);setRightPct(null);
    presetTransRef.current=true;
    setTimeout(()=>{presetTransRef.current=false;},300);
    switch(id){
      case 'text':    setPreviewVisible(false);setSidebarCollapsed(false);break;
      case 'balanced':setPreviewVisible(true);setSidebarCollapsed(false);break;
      case 'preview': setPreviewVisible(true);setSidebarCollapsed(false);
        // defer leftPct set after state updates
        setTimeout(()=>setLeftPct(30),0);break;
      case 'focus':   setPreviewVisible(false);setSidebarCollapsed(true);break;
    }
  },[]);
  const activePreset=useMemo(()=>{
    if(rightPct!==null)return null;
    if(!previewVisible&&sidebarCollapsed&&leftPct===null)return 'focus';
    if(!previewVisible&&!sidebarCollapsed&&leftPct===null)return 'text';
    if(previewVisible&&!sidebarCollapsed&&leftPct===null)return 'balanced';
    if(previewVisible&&!sidebarCollapsed&&leftPct===30)return 'preview';
    return null;
  },[previewVisible,sidebarCollapsed,leftPct,rightPct]);
  const hasRawText=data.rawText&&data.rawText!==data.fullText&&data.rawText!==data.text_preview;

  const toggle=id=>setDetections(p=>p.map(d=>d.id===id?{...d,enabled:!d.enabled}:d));
  const setCatEnabled=(cat,en)=>setDetections(p=>p.map(d=>d.category===cat?{...d,enabled:en}:d));
  const enableAll=()=>setDetections(p=>p.map(d=>({...d,enabled:true})));
  const disableAll=()=>setDetections(p=>p.map(d=>({...d,enabled:false})));
  const enabledCount=detections.filter(d=>d.enabled).length;
  const filtered=detections.filter(d=>{if(filterCat!=="all"&&d.category!==filterCat)return false;if(filterSrc!=="all"&&d.source!==filterSrc)return false;return true;});
  const redacted=useMemo(()=>applyRedaction(data.fullText||data.text_preview,detections,data.maskOpts),[data,detections]);
  const displayText=viewMode==="ai"&&aiResult?aiResult:viewMode==="raw"&&hasRawText?data.rawText:showRedacted?applyRedaction(data.text_preview,detections,data.maskOpts):data.text_preview;
  const handleCopy=()=>{navigator.clipboard.writeText(viewMode==="ai"&&aiResult?aiResult:redacted);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const baseName=data.file_name.replace(/\.[^.]+$/,"")+"_redacted_"+fileTimestamp();
  const buildTxt=()=>`# マスキング済み\n# 元ファイル: ${data.file_name}\n# 日時: ${new Date().toLocaleString("ja-JP")}\n# マスク: ${enabledCount}件\n\n${viewMode==="ai"&&aiResult?aiResult:redacted}`;
  const buildCsv=()=>"種類,カテゴリ,検出値,検出方法,確信度,マスク有無\n"+detections.map(d=>`"${d.label}","${d.category}","${d.value}","${d.source}","${d.confidence||""}","${d.enabled?"マスク済":"未マスク"}"`).join("\n");

  // A4プレビュー用 memoized HTML
  const previewSrcText=editedText??redacted;
  const previewHtml=useMemo(()=>editMode?generatePDFHTML(previewSrcText,previewFontType):"",[editMode,previewSrcText,previewFontType]);

  // 共通エクスポートヘルパー
  const exportPrintPDF=useCallback(()=>{
    const src=editedText??redacted;
    const html=generatePDFHTML(src,previewFontType);
    const printHTML=html.replace("</body>",`<script>window.onload=function(){window.print();setTimeout(()=>{window.close()},1000)}<\/script></body>`);
    const blob=new Blob([printHTML],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const win=window.open(url,"_blank");
    if(win)win.focus();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  },[editedText,redacted,previewFontType]);

  const exportHTML=useCallback(()=>{
    const src=editedText??redacted;
    const html=generatePDFHTML(src,previewFontType);
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const a=document.createElement("a");const url=URL.createObjectURL(blob);
    a.href=url;a.download=baseName+".html";document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },[editedText,redacted,previewFontType,baseName]);

  const exportWord=useCallback(()=>{
    const src=editedText??redacted;
    const html=generatePDFHTML(src,previewFontType);
    const wordHTML=html.replace('<!DOCTYPE html>','').replace('<html lang="ja">','<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ja">').replace('<head>','<head><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->');
    const blob=new Blob(["\uFEFF"+wordHTML],{type:"application/msword;charset=utf-8"});
    const a=document.createElement("a");const url=URL.createObjectURL(blob);
    a.href=url;a.download=baseName+".docx";document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },[editedText,redacted,previewFontType,baseName]);

  const focusDetection=useCallback((id)=>{
    setFocusDetId(id);
    setFocusPulse(p=>p+1);
    setViewMode("original");
    setEditMode(false);
  },[]);

  useEffect(()=>{
    if(!focusDetId)return;
    // Wait for the text to render (viewMode or showRedacted may have changed)
    requestAnimationFrame(()=>{
      const el=document.querySelector(`[data-det-id="${focusDetId}"]`);
      if(el&&el.scrollIntoView)el.scrollIntoView({behavior:"smooth",block:"center"});
    });
  },[focusDetId,focusPulse,viewMode,showRedacted]);

  function renderText(text){if(!showRedacted&&viewMode!=="ai")return text;const parts=[];let last=0;let m;const re=new RegExp(PH_RE.source,"g");while((m=re.exec(text))!==null){if(m.index>last)parts.push(<span key={`t${last}`}>{text.slice(last,m.index)}</span>);parts.push(<span key={`r${m.index}`} style={{background:T.redDim,color:T.red,padding:"1px 6px",borderRadius:4,fontWeight:600,fontSize:"0.92em"}}>{m[0]}</span>);last=m.index+m[0].length;}if(last<text.length)parts.push(<span key={`e${last}`}>{text.slice(last)}</span>);return parts.length?parts:text;}

  const grouped={};for(const d of filtered){const c=d.category||"other";if(!grouped[c])grouped[c]=[];grouped[c].push(d);}
  const allCats=[...new Set(detections.map(d=>d.category))];
  const allSrcs=[...new Set(detections.map(d=>d.source))];
  const catCounts=useMemo(()=>{const c={};for(const d of detections){if(!c[d.category])c[d.category]={total:0,enabled:0};c[d.category].total++;if(d.enabled)c[d.category].enabled++;}return c;},[detections]);

  const showDiff=viewMode==="diff";
  const showAiDiff=viewMode==="ai-diff";

  const startDrag=useCallback((divider)=>(e)=>{
    e.preventDefault();
    const wrap=e.target.closest('.rp-editor-wrap');
    if(!wrap)return;
    const totalW=wrap.getBoundingClientRect().width;
    const startX=e.clientX;
    const leftEl=wrap.querySelector('.rp-editor-left');
    const rightEl=wrap.querySelector('.rp-editor-right');
    const initLeftW=leftEl?leftEl.getBoundingClientRect().width:0;
    const initRightW=rightEl?rightEl.getBoundingClientRect().width:0;

    const onMove=(ev)=>{
      const dx=ev.clientX-startX;
      setLayoutPreset(null);
      if(divider==='left'){
        const newLeft=Math.max(160,Math.min(totalW*0.65,initLeftW+dx));
        setLeftPct((newLeft/totalW)*100);
      }else{
        const newRight=Math.max(200,Math.min(totalW*0.55,initRightW-dx));
        setRightPct((newRight/totalW)*100);
      }
    };
    const onUp=()=>{
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      document.body.style.cursor='';
      document.body.style.userSelect='';
    };
    document.body.style.cursor='col-resize';
    document.body.style.userSelect='none';
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  },[]);

  const dividerStyle={
    width:5,flexShrink:0,cursor:'col-resize',
    background:'transparent',
    position:'relative',
    zIndex:5,
    transition:'background .15s',
  };

  return (
      <div
          className='rp-editor-wrap'
          style={{
              display: 'flex',
              height: 'calc(100vh - 52px)',
              fontFamily: T.font,
          }}
      >
          <div
              className='rp-editor-left'
              style={{
                  flex: leftPct ? `0 0 ${leftPct}%` : previewVisible ? '1 1 50%' : '1 1 60%',
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 0,
                  minHeight: 0,
                  overflow: 'hidden',
                  transition: (leftPct&&!presetTransRef.current) ? 'none' : 'flex .2s',
              }}
          >
              <div
                  style={{
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: `1px solid ${T.border}`,
                      background: T.bg2,
                      flexWrap: 'wrap',
                      gap: 6,
                      flexShrink: 0,
                  }}
              >
                  <div
                      style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                      }}
                  >
                      <span
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text,
                          }}
                      >
                          {data.file_name}
                      </span>
                      <Badge color={T.text3} bg={T.surfaceAlt}>
                          {data.file_format}
                      </Badge>
                      {data.page_count && (
                          <Badge color={T.text3} bg={T.surfaceAlt}>
                              {data.page_count}p
                          </Badge>
                      )}
                      {typeof data.analysis_ms === "number" && data.analysis_ms > 0 && (
                          <Badge color={T.text3} bg={T.surfaceAlt}>
                              解析 {formatDuration(data.analysis_ms)}
                          </Badge>
                      )}
                      {data.isDemo && (
                          <Badge color={C.amber} bg={C.amberDim}>
                              DEMO
                          </Badge>
                      )}
                      {data.stats?.ai > 0 && (
                          <Badge color={C.purple} bg={C.purpleDim}>
                              AI +{data.stats.ai}
                          </Badge>
                      )}
                      {hasRawText && (
                          <Badge color={C.cyan} bg={C.cyanDim}>
                              AI再構成済
                          </Badge>
                      )}
                      {data.sparsePageCount > 0 && (
                          <Badge color={C.amber} bg={C.amberDim}>
                              OCR {data.sparsePageCount}p
                          </Badge>
                      )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                      <div
                          className='rp-view-tabs'
                          style={{
                              display: 'flex',
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: `1px solid ${T.border}`,
                          }}
                      >
                          <button
                              title='マスク: 個人情報を隠した結果を表示'
                              onClick={() => setViewMode('original')}
                              style={{
                                  padding: '5px 10px',
                                  border: 'none',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  fontFamily: T.font,
                                  background:
                                      viewMode === 'original'
                                          ? T.accentDim
                                          : 'transparent',
                                  color:
                                      viewMode === 'original'
                                          ? T.accent
                                          : T.text3,
                              }}
                          >
                              マスク
                          </button>
                          <button
                              title='Diff: 元テキストとマスク後の違いを並べて比較'
                              onClick={() => setViewMode('diff')}
                              style={{
                                  padding: '5px 10px',
                                  border: 'none',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  fontFamily: T.font,
                                  background:
                                      viewMode === 'diff'
                                          ? T.amberDim
                                          : 'transparent',
                                  color:
                                      viewMode === 'diff' ? T.amber : T.text3,
                              }}
                          >
                              Diff
                          </button>
                          {hasRawText && (
                              <>
                                  <button
                                      title='Raw: ファイルから抽出した生テキストを表示'
                                      onClick={() => setViewMode('raw')}
                                      style={{
                                          padding: '5px 10px',
                                          border: 'none',
                                          fontSize: 12,
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          fontFamily: T.font,
                                          background:
                                              viewMode === 'raw'
                                                  ? T.redDim
                                                  : 'transparent',
                                          color:
                                              viewMode === 'raw'
                                                  ? T.red
                                                  : T.text3,
                                      }}
                                  >
                                      Raw
                                  </button>
                                  <button
                                      title='Raw Diff: 生テキストとAI整形後の違いを比較'
                                      onClick={() => setViewMode('raw-diff')}
                                      style={{
                                          padding: '5px 10px',
                                          border: 'none',
                                          fontSize: 12,
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          fontFamily: T.font,
                                          background:
                                              viewMode === 'raw-diff'
                                                  ? 'rgba(240,86,86,0.15)'
                                                  : 'transparent',
                                          color:
                                              viewMode === 'raw-diff'
                                                  ? T.red
                                                  : T.text3,
                                      }}
                                  >
                                      Raw Diff
                                  </button>
                              </>
                          )}
                          {aiResult && (
                              <>
                                  <button
                                      title='AI整形: AIが読みやすく整形したテキストを表示'
                                      onClick={() => setViewMode('ai')}
                                      style={{
                                          padding: '5px 10px',
                                          border: 'none',
                                          fontSize: 12,
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          fontFamily: T.font,
                                          background:
                                              viewMode === 'ai'
                                                  ? T.purpleDim
                                                  : 'transparent',
                                          color:
                                              viewMode === 'ai'
                                                  ? T.purple
                                                  : T.text3,
                                      }}
                                  >
                                      AI整形
                                  </button>
                                  <button
                                      title='AI Diff: マスク結果とAI整形後の違いを比較'
                                      onClick={() => setViewMode('ai-diff')}
                                      style={{
                                          padding: '5px 10px',
                                          border: 'none',
                                          fontSize: 12,
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          fontFamily: T.font,
                                          background:
                                              viewMode === 'ai-diff'
                                                  ? T.cyanDim
                                                  : 'transparent',
                                          color:
                                              viewMode === 'ai-diff'
                                                  ? T.cyan
                                                  : T.text3,
                                      }}
                                  >
                                      AI Diff
                                  </button>
                              </>
                          )}
                      </div>
                      {!showDiff && !showAiDiff && viewMode !== 'raw-diff' && !editMode && (
                          <Btn
                              title={showRedacted ? 'マスク済みテキストを表示中（クリックで元文に切替）' : '元のテキストを表示中（クリックでマスク表示に切替）'}
                              variant={showRedacted ? 'danger' : 'ghost'}
                              onClick={() => setShowRedacted(!showRedacted)}
                              style={{
                                  padding: '6px 12px',
                                  fontSize: 12,
                                  borderRadius: 8,
                              }}
                          >
                              {showRedacted ? 'マスク' : '元文'}
                          </Btn>
                      )}
                      <Btn
                          title='編集: テキストを直接編集してA4プレビューに即反映'
                          variant={editMode ? 'primary' : 'ghost'}
                          onClick={() => {
                              if(!editMode){
                                  setEditedText(viewMode==="ai"&&aiResult?aiResult:redacted);
                                  setEditMode(true);
                                  setPreviewVisible(true);
                              }else{
                                  setEditMode(false);
                                  setEditedText(null);
                              }
                          }}
                          style={{
                              padding: '6px 12px',
                              fontSize: 12,
                              borderRadius: 8,
                          }}
                      >
                          {editMode ? '編集中' : '編集'}
                      </Btn>
                      <div style={{width:1,height:20,background:T.border,marginLeft:4,marginRight:2,flexShrink:0}}/>
                      <div style={{display:'flex',gap:2,alignItems:'center'}}>
                          {LAYOUT_PRESETS.map(p=>(
                              <button key={p.id} title={p.label} onClick={()=>applyLayoutPreset(p.id)}
                                  style={{
                                      padding:3,borderRadius:4,cursor:'pointer',
                                      border:`1px solid ${activePreset===p.id?T.accent:'transparent'}`,
                                      background:activePreset===p.id?T.accentDim:'transparent',
                                      display:'flex',alignItems:'center',justifyContent:'center',
                                  }}>
                                  <LayoutIcon cols={p.cols} active={activePreset===p.id} color={T.accent}/>
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
              {/* カテゴリ別クイックトグル */}
              {(viewMode==='original')&&!editMode&&allCats.length>0&&(
              <div style={{
                  padding:"4px 14px",display:"flex",alignItems:"center",gap:4,
                  borderBottom:`1px solid ${T.border}`,background:T.bg2,
                  flexWrap:"wrap",flexShrink:0,
              }}>
                  <span style={{fontSize:11,color:T.text3,fontWeight:600,marginRight:4}}>カテゴリ</span>
                  {allCats.map(cat=>{
                      const meta=CATEGORIES[cat]||{label:cat,color:T.text2};
                      const cc=catCounts[cat]||{total:0,enabled:0};
                      const allOn=cc.enabled===cc.total;
                      return (
                          <button key={cat} onClick={()=>setCatEnabled(cat,!allOn)}
                              style={{
                                  padding:"2px 8px",borderRadius:5,border:`1px solid ${allOn?`${meta.color}30`:T.border}`,
                                  background:allOn?`${meta.color}14`:"transparent",cursor:"pointer",
                                  fontSize:11,fontWeight:allOn?600:400,fontFamily:T.font,
                                  color:allOn?meta.color:T.text3,transition:"all .15s",
                                  display:"flex",alignItems:"center",gap:3,
                              }}>
                              <span style={{width:5,height:5,borderRadius:3,background:meta.color,display:"inline-block"}}/>
                              {meta.label}
                              <span style={{fontSize:10,opacity:0.7}}>({cc.enabled}/{cc.total})</span>
                          </button>
                      );
                  })}
                  <span style={{flex:1}}/>
                  <button title='すべての検出を有効にする' onClick={enableAll} style={{padding:"2px 8px",borderRadius:5,border:`1px solid ${T.border}`,background:"transparent",cursor:"pointer",fontSize:11,fontFamily:T.font,color:T.text3}}>全ON</button>
                  <button title='すべての検出を無効にする' onClick={disableAll} style={{padding:"2px 8px",borderRadius:5,border:`1px solid ${T.border}`,background:"transparent",cursor:"pointer",fontSize:11,fontFamily:T.font,color:T.text3}}>全OFF</button>
              </div>
              )}
              {showDiff ? (
                  <DiffView
                      original={data.text_preview}
                      modified={applyRedaction(
                          data.text_preview,
                          detections,
                          data.maskOpts,
                      )}
                      label='マスキング変更'
                  />
              ) : viewMode === 'raw-diff' && hasRawText ? (
                  <DiffView
                      original={data.rawText.slice(0, 8000)}
                      modified={data.text_preview}
                      label='AI テキスト再構成 (Raw → Clean)'
                  />
              ) : showAiDiff && aiResult ? (
                  <DiffView
                      original={applyRedaction(
                          data.text_preview,
                          detections,
                          data.maskOpts,
                      )}
                      modified={aiResult}
                      label='AI整形変更'
                  />
              ) : editMode ? (
                  <div style={{flex:1,overflow:"auto",padding:0,background:T.bg,display:"flex",flexDirection:"column",minHeight:0}}>
                      <div style={{padding:"6px 14px",borderBottom:`1px solid ${T.border}`,fontSize:12,color:T.text3,lineHeight:1.6,flexShrink:0,background:T.bg2}}>
                          <span style={{fontWeight:600,color:T.text2}}>記法: </span>
                          <code style={{background:T.surface,padding:"1px 4px",borderRadius:3,fontFamily:T.mono}}>**太字**</code>
                          <code style={{background:T.surface,padding:"1px 4px",borderRadius:3,fontFamily:T.mono,marginLeft:6}}># 見出し</code>
                          <code style={{background:T.surface,padding:"1px 4px",borderRadius:3,fontFamily:T.mono,marginLeft:6}}>## 小見出し</code>
                          <span style={{opacity:0.6,marginLeft:8}}>Markdown記法でA4プレビューに反映</span>
                      </div>
                      <textarea
                          value={editedText??""}
                          onChange={(e)=>setEditedText(e.target.value)}
                          spellCheck={false}
                          style={{
                              flex:1,padding:"14px 16px",border:"none",outline:"none",resize:"none",
                              fontFamily:T.mono,fontSize:12,lineHeight:1.8,color:T.text,
                              background:T.bg,whiteSpace:"pre-wrap",wordBreak:"break-word",
                          }}
                      />
                  </div>
              ) : (
                  <div
                      style={{
                          flex: 1,
                          overflow: 'auto',
                          padding: 24,
                          background: T.bg,
                          minHeight: 0,
                      }}
                  >
                      <pre
                          style={{
                              fontFamily: T.mono,
                              fontSize: 13,
                              lineHeight: 1.9,
                              color: T.text,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              margin: 0,
                              maxWidth: 740,
                          }}
                      >
                          {viewMode === 'original'
                              ? renderTextWithDetectionAnchors(
                                    data.text_preview,
                                    detections,
                                    data.maskOpts,
                                    showRedacted,
                                    focusDetId,
                                    focusPulse,
                                )
                              : renderText(displayText)}
                      </pre>
                  </div>
              )}
          </div>
          {/* Divider: Left ↔ Center */}
          {previewVisible && (
              <div
                  onMouseDown={startDrag('left')}
                  title="ドラッグでパネル幅を調整"
                  style={{...dividerStyle,borderLeft:`1px solid ${T.border}`}}
                  onMouseEnter={(e)=>{e.currentTarget.style.background=T.accentDim;}}
                  onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';}}
              />
          )}
          {/* Center: A4 Preview Panel (always visible) */}
          {previewVisible ? (
              <div className="rp-editor-center" style={{
                  flex:"0 1 340px",minWidth:200,display:"flex",flexDirection:"column",
                  background:"#e5e7eb",minHeight:0,overflow:"hidden",
              }}>
                  {/* Preview toolbar */}
                  <div style={{
                      padding:"6px 12px",display:"flex",alignItems:"center",gap:6,
                      borderBottom:`1px solid ${T.border}`,background:T.bg2,flexShrink:0,flexWrap:"wrap",
                  }}>
                      <span style={{fontSize:12,fontWeight:700,color:T.text}}>A4</span>
                      {editMode && (
                          <>
                              <button onClick={()=>setPreviewFontType("gothic")} title="ゴシック体に切替" style={{
                                  padding:"3px 8px",borderRadius:5,fontSize:11,cursor:"pointer",fontFamily:T.font,
                                  border:`1px solid ${previewFontType==="gothic"?T.accent:T.border}`,
                                  background:previewFontType==="gothic"?T.accentDim:"transparent",
                                  color:previewFontType==="gothic"?T.accent:T.text3,fontWeight:previewFontType==="gothic"?600:400,
                              }}>ゴシック</button>
                              <button onClick={()=>setPreviewFontType("mincho")} title="明朝体に切替" style={{
                                  padding:"3px 8px",borderRadius:5,fontSize:11,cursor:"pointer",fontFamily:T.font,
                                  border:`1px solid ${previewFontType==="mincho"?T.accent:T.border}`,
                                  background:previewFontType==="mincho"?T.accentDim:"transparent",
                                  color:previewFontType==="mincho"?T.accent:T.text3,fontWeight:previewFontType==="mincho"?600:400,
                              }}>明朝</button>
                          </>
                      )}
                      <div style={{display:"flex",alignItems:"center",gap:2,marginLeft:4}}>
                          <button onClick={()=>setPreviewZoom(z=>Math.max(0.3,+(z-0.1).toFixed(2)))} title="縮小"
                              style={{width:22,height:22,borderRadius:4,border:`1px solid ${T.border}`,background:"transparent",color:T.text2,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.font}}>
                              &minus;
                          </button>
                          <button onClick={()=>setPreviewZoom(1)} title="ズームをリセット"
                              style={{padding:"2px 6px",borderRadius:4,border:`1px solid ${T.border}`,background:"transparent",color:T.text3,cursor:"pointer",fontSize:10,fontFamily:T.mono,fontWeight:600,minWidth:40,textAlign:"center"}}>
                              {Math.round(previewZoom*100)}%
                          </button>
                          <button onClick={()=>setPreviewZoom(z=>Math.min(1.5,+(z+0.1).toFixed(2)))} title="拡大"
                              style={{width:22,height:22,borderRadius:4,border:`1px solid ${T.border}`,background:"transparent",color:T.text2,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.font}}>
                              +
                          </button>
                      </div>
                      <span style={{flex:1}}/>
                      {editMode && (
                          <div style={{display:"flex",gap:4}}>
                              <button onClick={exportPrintPDF} title="PDFとして印刷" style={{padding:"3px 8px",borderRadius:5,fontSize:11,cursor:"pointer",fontFamily:T.font,border:`1px solid ${T.border}`,background:"transparent",color:T.text2}}>
                                  PDF印刷
                              </button>
                              <button onClick={exportHTML} title="HTML形式でダウンロード" style={{padding:"3px 8px",borderRadius:5,fontSize:11,cursor:"pointer",fontFamily:T.font,border:`1px solid ${T.border}`,background:"transparent",color:T.text2}}>
                                  HTML
                              </button>
                              <button onClick={exportWord} title="Word形式でダウンロード" style={{padding:"3px 8px",borderRadius:5,fontSize:11,cursor:"pointer",fontFamily:T.font,border:`1px solid ${T.border}`,background:"transparent",color:T.text2}}>
                                  Word
                              </button>
                          </div>
                      )}
                      <button onClick={()=>setShowDesign(true)} title="全画面編集" style={{
                          padding:"3px 6px",borderRadius:5,fontSize:13,cursor:"pointer",
                          border:`1px solid ${T.border}`,background:"transparent",color:T.text3,
                      }}>&#x2197;</button>
                      <button onClick={()=>{setPreviewVisible(false);setLeftPct(null);setRightPct(null);}} title="プレビューを閉じる" style={{
                          padding:"3px 6px",borderRadius:5,fontSize:13,cursor:"pointer",
                          border:`1px solid ${T.border}`,background:"transparent",color:T.text3,
                      }}>&#x276F;</button>
                  </div>
                  {/* Preview content */}
                  {editMode ? (
                      <div style={{flex:1,overflow:"auto",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16}}>
                          <div style={{width:595,minHeight:842,background:"#fff",boxShadow:"0 4px 24px rgba(0,0,0,.12)",borderRadius:4,transform:`scale(${previewZoom})`,transformOrigin:"top center"}}>
                              <iframe
                                  srcDoc={previewHtml}
                                  sandbox="allow-same-origin"
                                  style={{width:"100%",minHeight:842,border:"none",pointerEvents:"none"}}
                                  title="A4 Preview"
                                  onLoad={(e)=>{try{const h=e.target.contentDocument?.documentElement?.scrollHeight;if(h&&h>842)e.target.style.height=h+"px";}catch(ex){}}}
                              />
                          </div>
                      </div>
                  ) : (
                      <A4PreviewPanel
                          text={aiResult||data.text_preview}
                          detections={detections}
                          maskOpts={data.maskOpts}
                          focusDetId={focusDetId}
                          focusPulse={focusPulse}
                          onFocusDet={focusDetection}
                          zoom={previewZoom}
                      />
                  )}
              </div>
          ) : (
              <div
                  onClick={()=>{setPreviewVisible(true);setLeftPct(null);setRightPct(null);}}
                  style={{
                      width:36,display:"flex",flexDirection:"column",
                      alignItems:"center",justifyContent:"center",gap:8,
                      background:T.bg2,borderRight:`1px solid ${T.border}`,
                      cursor:"pointer",padding:"12px 0",transition:"background .15s",
                  }}
                  title="A4プレビューを表示"
              >
                  <span style={{writingMode:"vertical-rl",fontSize:12,fontWeight:600,color:T.text2,letterSpacing:1}}>A4</span>
                  <span style={{fontSize:14,color:T.text3,marginTop:4}}>&#x276E;</span>
              </div>
          )}
          {/* Divider: Center ↔ Right */}
          {!sidebarCollapsed && (
              <div
                  onMouseDown={startDrag('right')}
                  title="ドラッグでパネル幅を調整"
                  style={{...dividerStyle,borderLeft:`1px solid ${T.border}`}}
                  onMouseEnter={(e)=>{e.currentTarget.style.background=T.accentDim;}}
                  onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';}}
              />
          )}
          {/* Collapsed sidebar indicator */}
          {sidebarCollapsed && (
              <div
                  onClick={()=>{setSidebarCollapsed(false);setLeftPct(null);setRightPct(null);}}
                  style={{
                      width:40,display:"flex",flexDirection:"column",
                      alignItems:"center",justifyContent:"center",gap:8,
                      background:T.bg2,borderLeft:`1px solid ${T.border}`,
                      cursor:"pointer",padding:"12px 0",
                      transition:"background .15s",
                  }}
                  title="サイドバーを展開"
              >
                  <span style={{writingMode:"vertical-rl",fontSize:12,fontWeight:600,color:T.text2,letterSpacing:1}}>検出結果</span>
                  <Badge color={enabledCount>0?T.green:T.amber} bg={enabledCount>0?T.greenDim:T.amberDim} style={{writingMode:"horizontal-tb",fontSize:11,padding:"2px 6px"}}>
                      {enabledCount}/{detections.length}
                  </Badge>
                  <span style={{fontSize:16,color:T.text3,marginTop:4}}>&#x276E;</span>
              </div>
          )}
          <div
              className='rp-editor-right'
              style={{
                  flex: rightPct ? `0 0 ${rightPct}%` : previewVisible ? '0 0 260px' : '0 1 300px',
                  display: sidebarCollapsed?'none':'flex',
                  flexDirection: 'column',
                  minWidth: 200,
                  maxWidth: previewVisible ? 400 : 480,
                  background: T.bg2,
                  transition: rightPct ? 'none' : 'flex .2s, max-width .2s',
              }}
          >
              <div
                  style={{
                      padding: '14px 18px',
                      borderBottom: `1px solid ${T.border}`,
                  }}
              >
                  <div
                      style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 12,
                      }}
                  >
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div>
                          <span
                              style={{
                                  fontSize: 16,
                                  fontWeight: 700,
                                  color: T.text,
                              }}
                          >
                              検出結果
                          </span>
                          <span
                              style={{
                                  fontSize: 13,
                                  color: T.text2,
                                  marginLeft: 10,
                              }}
                          >
                              {enabledCount}/{detections.length}
                          </span>
                      </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <Badge
                          color={enabledCount > 0 ? T.green : T.amber}
                          bg={enabledCount > 0 ? T.greenDim : T.amberDim}
                      >
                          {enabledCount > 0 ? '保護中' : '未保護'}
                      </Badge>
                      <button
                          onClick={()=>{setSidebarCollapsed(true);setLeftPct(null);setRightPct(null);}}
                          title="サイドバーを折りたたむ"
                          style={{
                              background:"transparent",border:"none",cursor:"pointer",
                              color:T.text3,fontSize:16,padding:"2px 4px",
                              display:"flex",alignItems:"center",
                          }}
                      >&#x276F;</button>
                      </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                      <div
                          style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.text3,
                              marginBottom: 8,
                              letterSpacing: 0.3,
                          }}
                      >
                          カテゴリ別マスキング
                      </div>
                      <div
                          className='rp-cat-grid'
                          style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '4px 12px',
                          }}
                      >
                          {allCats.map((cat) => {
                              const meta = CATEGORIES[cat] || {
                                  label: cat,
                                  color: T.text2,
                              }
                              const cc = catCounts[cat] || {
                                  total: 0,
                                  enabled: 0,
                              }
                              const allOn = cc.enabled === cc.total
                              return (
                                  <div
                                      key={cat}
                                      style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          padding: '6px 10px',
                                          borderRadius: 8,
                                          background: allOn
                                              ? `${meta.color}0A`
                                              : 'transparent',
                                          border: `1px solid ${allOn ? `${meta.color}18` : 'transparent'}`,
                                          transition: 'all .2s',
                                      }}
                                  >
                                      <div
                                          style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 6,
                                          }}
                                      >
                                          <span
                                              style={{
                                                  width: 6,
                                                  height: 6,
                                                  borderRadius: 3,
                                                  background: meta.color,
                                                  display: 'inline-block',
                                              }}
                                          />
                                          <span
                                              style={{
                                                  fontSize: 12,
                                                  fontWeight: 500,
                                                  color: allOn
                                                      ? T.text
                                                      : T.text3,
                                              }}
                                          >
                                              {meta.label}
                                          </span>
                                          <span
                                              style={{
                                                  fontSize: 12,
                                                  color: T.text3,
                                              }}
                                          >
                                              ({cc.enabled}/{cc.total})
                                          </span>
                                      </div>
                                      <span title={allOn?'このカテゴリを無効にする':'このカテゴリを有効にする'}>
                                      <Toggle
                                          checked={allOn}
                                          onChange={() =>
                                              setCatEnabled(cat, !allOn)
                                          }
                                          size='sm'
                                      />
                                      </span>
                                  </div>
                              )
                          })}
                      </div>
                  </div>
                  <div
                      style={{
                          display: 'flex',
                          gap: 4,
                          flexWrap: 'wrap',
                          marginBottom: 6,
                      }}
                  >
                      <Pill
                          active={filterCat === 'all'}
                          onClick={() => setFilterCat('all')}
                      >
                          全て
                      </Pill>
                      {allCats.map((c) => {
                          const m = CATEGORIES[c]
                          return m ? (
                              <Pill
                                  key={c}
                                  active={filterCat === c}
                                  onClick={() => setFilterCat(c)}
                                  color={m.color}
                              >
                                  {m.label}
                              </Pill>
                          ) : null
                      })}
                  </div>
                  {allSrcs.length > 1 && (
                      <div
                          style={{
                              display: 'flex',
                              gap: 4,
                              flexWrap: 'wrap',
                              marginBottom: 6,
                          }}
                      >
                          <Pill
                              active={filterSrc === 'all'}
                              onClick={() => setFilterSrc('all')}
                          >
                              全ソース
                          </Pill>
                          {allSrcs.map((s) => (
                              <Pill
                                  key={s}
                                  active={filterSrc === s}
                                  onClick={() => setFilterSrc(s)}
                              >
                                  {s === 'regex'
                                      ? '正規表現'
                                      : s === 'dict'
                                        ? '辞書'
                                        : s === 'ai'
                                          ? 'AI'
                                          : s === 'heuristic'
                                            ? '推定'
                                            : 'NER'}
                              </Pill>
                          ))}
                      </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                      <Btn
                          title='すべての検出を有効にする'
                          variant='ghost'
                          onClick={enableAll}
                          style={{
                              padding: '3px 10px',
                              fontSize: 12,
                              borderRadius: 7,
                          }}
                      >
                          全ON
                      </Btn>
                      <Btn
                          title='すべての検出を無効にする'
                          variant='ghost'
                          onClick={disableAll}
                          style={{
                              padding: '3px 10px',
                              fontSize: 12,
                              borderRadius: 7,
                          }}
                      >
                          全OFF
                      </Btn>
                  </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '6px 12px' }}>
                  {filtered.length === 0 ? (
                      <div
                          style={{
                              textAlign: 'center',
                              padding: '36px 20px',
                              color: T.text3,
                          }}
                      >
                          <p style={{ fontSize: 12 }}>
                              該当する検出結果がありません
                          </p>
                      </div>
                  ) : (
                      Object.entries(grouped).map(([cat, items], gi) => {
                          const meta = CATEGORIES[cat] || {
                              label: cat,
                              color: T.text2,
                          }
                          return (
                              <div
                                  key={cat}
                                  style={{
                                      marginBottom: 4,
                                      animation: `slideIn .25s ease ${gi * 0.03}s both`,
                                  }}
                              >
                                  <div
                                      style={{
                                          fontSize: 12,
                                          fontWeight: 700,
                                          color: meta.color,
                                          padding: '8px 8px 3px',
                                          letterSpacing: 0.5,
                                          textTransform: 'uppercase',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 6,
                                      }}
                                  >
                                      <span
                                          style={{
                                              width: 6,
                                              height: 6,
                                              borderRadius: 3,
                                              background: meta.color,
                                              display: 'inline-block',
                                          }}
                                      />
                                      {meta.label} ({items.length})
                                  </div>
                                  {items.map((item) => (
                                      <div
                                          key={item.id}
                                          onClick={() => focusDetection(item.id)}
                                          title='クリックで本文の該当箇所へジャンプ'
                                          style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 10,
                                              padding: '7px 10px',
                                              marginBottom: 1,
                                              borderRadius: 9,
                                              background: item.enabled
                                                  ? `${meta.color}0D`
                                                  : 'transparent',
                                              border: `1px solid ${item.enabled ? `${meta.color}1A` : 'transparent'}`,
                                              boxShadow:
                                                  focusDetId === item.id
                                                      ? '0 0 0 2px rgba(76,133,246,.35), 0 0 0 8px rgba(76,133,246,.10)'
                                                      : 'none',
                                              cursor: 'pointer',
                                              transition: 'all .2s',
                                          }}
                                      >
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                              <div
                                                  style={{
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      gap: 5,
                                                      marginBottom: 1,
                                                  }}
                                              >
                                                  {item.source === 'dict' && (
                                                      <Badge
                                                          color={T.red}
                                                          bg={T.redDim}
                                                          style={{
                                                              fontSize: 12,
                                                              padding:
                                                                  '0px 5px',
                                                          }}
                                                      >
                                                          辞書
                                                      </Badge>
                                                  )}
                                                  {item.source === 'ai' && (
                                                      <Badge
                                                          color={T.purple}
                                                          bg={T.purpleDim}
                                                          style={{
                                                              fontSize: 12,
                                                              padding:
                                                                  '0px 5px',
                                                          }}
                                                      >
                                                          AI
                                                      </Badge>
                                                  )}
                                                  {item.source ===
                                                      'heuristic' && (
                                                      <Badge
                                                          color={T.amber}
                                                          bg={T.amberDim}
                                                          style={{
                                                              fontSize: 12,
                                                              padding:
                                                                  '0px 5px',
                                                          }}
                                                      >
                                                          推定
                                                      </Badge>
                                                  )}
                                                  {item.confidence >= 0.9 && (
                                                      <span
                                                          style={{
                                                              fontSize: 12,
                                                              color: T.green,
                                                          }}
                                                      >
                                                          [高]
                                                      </span>
                                                  )}
                                                  {item.confidence &&
                                                      item.confidence < 0.9 &&
                                                      item.confidence >=
                                                          0.75 && (
                                                          <span
                                                              style={{
                                                                  fontSize: 12,
                                                                  color: T.amber,
                                                              }}
                                                          >
                                                              [中]
                                                          </span>
                                                      )}
                                              </div>
                                              <div
                                                  style={{
                                                      fontSize: 12,
                                                      fontWeight: 500,
                                                      color: item.enabled
                                                          ? T.text
                                                          : T.text3,
                                                      fontFamily: T.mono,
                                                      overflow: 'hidden',
                                                      textOverflow: 'ellipsis',
                                                      whiteSpace: 'nowrap',
                                                      textDecoration:
                                                          item.enabled
                                                              ? 'none'
                                                              : 'line-through',
                                                      opacity: item.enabled
                                                          ? 1
                                                          : 0.5,
                                                  }}
                                              >
                                                  {item.value}
                                              </div>
                                          </div>
                                          <span title={item.enabled?'この検出を無効にする':'この検出を有効にする'}>
                                          <Toggle
                                              checked={item.enabled}
                                              onChange={() => toggle(item.id)}
                                              size='sm'
                                          />
                                          </span>
                                      </div>
                                  ))}
                              </div>
                          )
                      })
                  )}
              </div>
              <div
                  style={{
                      padding: '10px 16px',
                      borderTop: `1px solid ${T.border}`,
                      background: T.bg2,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                  }}
              >
                  <Btn
                      title='AIでテキストを再整形'
                      onClick={() => setShowAI(true)}
                      style={{
                          width: '100%',
                          borderRadius: 10,
                          background: `linear-gradient(135deg,${T.accent},${T.purple})`,
                          fontSize: 13,
                      }}
                  >
                      AI で再フォーマット
                  </Btn>
                  <Btn
                      title='PDF編集モードを開く'
                      onClick={() => {
                          if(!editMode){
                              setEditedText(viewMode==="ai"&&aiResult?aiResult:redacted);
                              setEditMode(true);
                          }
                          setPreviewVisible(true);
                      }}
                      style={{
                          width: '100%',
                          borderRadius: 10,
                          background: editMode ? T.accent : '#222',
                          fontSize: 13,
                          color: '#fff',
                      }}
                  >
                      {editMode ? '編集中 / A4プレビュー' : 'PDF プレビュー・編集'}
                  </Btn>
                  <div style={{ display: 'flex', gap: 8 }}>
                      <Btn
                          title='マスキング結果をプレビュー'
                          variant='ghost'
                          onClick={() =>
                              setPreview({
                                  title: 'マスキング済みテキスト',
                                  content: buildTxt(),
                                  baseName,
                                  editable: true,
                                  onContentChange: (newContent) => {
                                      setPreview(prev => prev ? {...prev, content: newContent} : null)
                                  },
                              })
                          }
                          style={{ flex: 1, borderRadius: 10, fontSize: 12 }}
                      >
                          プレビュー / 保存
                      </Btn>
                      <Btn
                          title='クリップボードにコピー'
                          variant='ghost'
                          onClick={handleCopy}
                          style={{
                              borderRadius: 10,
                              padding: '11px 16px',
                              fontSize: 12,
                          }}
                      >
                          {copied ? '\u2713' : 'Copy'}
                      </Btn>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                      <Btn
                          title='検出結果の詳細レポートを表示'
                          variant='ghost'
                          onClick={() =>
                              setPreview({
                                  title: '検出レポート',
                                  content: buildCsv(),
                                  baseName: `pii_report_${fileTimestamp()}`,
                              })
                          }
                          style={{
                              flex: 1,
                              fontSize: 12,
                              padding: '7px 12px',
                              borderRadius: 8,
                          }}
                      >
                          検出レポート
                      </Btn>
                      <Btn
                          title='ファイル選択画面に戻る'
                          variant='ghost'
                          onClick={onReset}
                          style={{
                              fontSize: 12,
                              padding: '7px 12px',
                              borderRadius: 8,
                          }}
                      >
                          ホームへ戻る
                      </Btn>
                  </div>
              </div>
          </div>
          {showAI && (
              <AIPanel
                  redactedText={redacted}
                  apiKey={apiKey}
                  model={model}
                  onApply={(t) => {
                      setAiResult(t)
                      setViewMode('ai')
                      setShowAI(false)
                  }}
                  onClose={() => setShowAI(false)}
              />
          )}
          {showDesign && (
              <DesignExportModal
                  text={editMode ? (editedText??redacted) : viewMode === 'ai' && aiResult ? aiResult : redacted}
                  apiKey={apiKey}
                  model={model}
                  baseName={baseName}
                  onClose={() => setShowDesign(false)}
              />
          )}
          {preview && (
              <PreviewModal
                  title={preview.title}
                  content={preview.content}
                  baseName={preview.baseName}
                  editable={preview.editable}
                  onClose={() => setPreview(null)}
                  onContentChange={preview.onContentChange}
              />
          )}
      </div>
  )
}

// ═══ App ═══
export default function App(){
  const[data,setData]=useState(null);
  const[showSettings,setShowSettings]=useState(false);
  const[isDark,setIsDark]=useState(true);
  const [settings, setSettings] = useState({
      apiKey: '',
      model: pickFormatModelForProfile('openai', 'balanced') || 'gpt-5-nano',
      aiDetect: true,
      aiProfile: 'balanced',
      provider: 'openai',
      proxyUrl: '',
  })
  useEffect(()=>{(async()=>{
    const safeGet=async(key)=>storage.get(key);
    const k=await safeGet("rp_api_key");if(k)setSettings(p=>({...p,apiKey:k}));
    const m=await safeGet("rp_model");if(m)setSettings(p=>({...p,model:m}));
    const ad=await safeGet("rp_ai_detect");if(ad)setSettings(p=>({...p,aiDetect:ad!=="false"}));
    const ap = await safeGet('rp_ai_profile')
    if (ap) setSettings((p) => ({ ...p, aiProfile: ap }))
    const prov=await safeGet("rp_provider");if(prov)setSettings(p=>({...p,provider:prov}));
    const px=await safeGet("rp_proxy_url");if(px)setSettings(p=>({...p,proxyUrl:px}));
    const th=await safeGet("rp_theme");if(th)setIsDark(th!=="light");
  })();},[]);
  const curProv=AI_PROVIDERS.find(p=>p.id===settings.provider)||AI_PROVIDERS[0];
  const curModel=curProv.models.find(m=>m.id===settings.model)||curProv.models[0];
  const goHome=useCallback(()=>{
    if(typeof window!=="undefined"){
      window.location.assign("./");
      return;
    }
    setData(null);
  },[]);

  return (
      <div
          data-theme={isDark ? 'dark' : 'light'}
          style={{
              fontFamily: T.font,
              background: T.bg,
              color: T.text,
              minHeight: '100vh',
          }}
      >
          <style>{CSS}</style>
          <header
              className='rp-header'
              style={{
                  height: 52,
                  padding: '0 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: `1px solid ${T.border}`,
                  background: T.bg2,
              }}
          >
              <nav
                  aria-label='グローバルナビゲーション'
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                  <a
                      href='./'
                      aria-label='トップページへ戻る'
                      style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          textDecoration: 'none',
                          color: 'inherit',
                      }}
                  >
                      <div
                          style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              background: `linear-gradient(135deg,${C.accent},#7C5CFF)`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 14,
                              fontWeight: 800,
                              color: '#fff',
                          }}
                      >
                          R
                      </div>
                      <span
                          style={{
                              fontSize: 15,
                              fontWeight: 700,
                              letterSpacing: -0.5,
                          }}
                      >
                          Redact<span style={{ color: C.accent }}>Pro</span>
                      </span>
                  </a>
                  <Badge color={T.text3} bg={T.surfaceAlt}>
                      v0.9
                  </Badge>
              </nav>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                      className='rp-header-badges'
                      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                  >
                      {data && (
                          <Badge color={C.accent} bg={C.accentDim}>
                              {data.detections.filter((d) => d.enabled).length}{' '}
                              件
                          </Badge>
                      )}
                      {settings.aiDetect && (
                          <Badge color={C.purple} bg={C.purpleDim}>
                              AI
                          </Badge>
                      )}
                  </div>
                  <button
                      title='ダークモード切替'
                      onClick={() => setIsDark(!isDark)}
                      style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          border: `1px solid ${T.border}`,
                          background: 'transparent',
                          cursor: 'pointer',
                          color: T.text2,
                          fontSize: 18,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                      }}
                  >
                      {isDark ? '☀️' : '🌙'}
                  </button>
                  <button
                      title='設定'
                      onClick={() => setShowSettings(true)}
                      style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 36,
                          padding: '0 12px',
                          borderRadius: 8,
                          border: `1px solid ${T.border}`,
                          background: 'transparent',
                          cursor: 'pointer',
                          color: T.text2,
                          fontSize: 13,
                          fontFamily: T.font,
                          fontWeight: 500,
                      }}
                  >
                      <span
                          style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              background: curProv.color,
                              flexShrink: 0,
                          }}
                      />
                      <span>{curModel?.label || '設定'}</span>
                      <svg
                          width='16'
                          height='16'
                          viewBox='0 0 24 24'
                          fill='none'
                          stroke='currentColor'
                          strokeWidth='2'
                      >
                          <path d='M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z' />
                          <circle cx='12' cy='12' r='3' />
                      </svg>
                  </button>
              </div>
          </header>
          {data ? (
              <EditorScreen
                  data={data}
                  onReset={goHome}
                  apiKey={settings.apiKey}
                  model={settings.model}
              />
          ) : (
              <UploadScreen onAnalyze={setData} settings={settings} />
          )}
          {showSettings && (
              <SettingsModal
                  settings={settings}
                  onSave={(s) => setSettings(s)}
                  onClose={() => setShowSettings(false)}
                  isDark={isDark}
                  setIsDark={setIsDark}
              />
          )}
      </div>
  )
}

// For unit tests (Node env): pure formatting helpers
export const __test__ = {
  cleanContent,
  mdToHTML,
  generatePDFHTML,
  buildAnnotations,
}
