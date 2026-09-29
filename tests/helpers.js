/**
 * tests/helpers.js
 * 提取自 Planit 前端 (js/) 與後端 (Code.gs) 的純核心邏輯函式
 * 供 Node.js 原生單元測試執行與驗證
 */

import crypto from 'node:crypto';

// ── 1. 日期與時區處理（來自 js/app.js 與 Code.gs）─────────────
export function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateDueDaysDiff(todayStr, dueDateStr) {
  if (!dueDateStr) return null;
  const today = new Date(todayStr + "T00:00:00");
  const due = new Date(dueDateStr + "T00:00:00");
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

export function getRolloverDate(currentDueDateStr) {
  if (!currentDueDateStr) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getLocalDateString(tomorrow);
  }
  const parts = currentDueDateStr.split('-').map(Number);
  const nextDate = new Date(parts[0], parts[1] - 1, parts[2] + 1);
  return getLocalDateString(nextDate);
}

// ── 2. 子任務與進度計算（來自 js/tasks.js 與 js/grid.js）───────
export function calculateSubtaskProgress(subTasks) {
  if (!Array.isArray(subTasks) || subTasks.length === 0) return 0;
  const doneCount = subTasks.filter(s => s.done).length;
  return Math.round((doneCount / subTasks.length) * 100);
}

export function canCompleteTask(subTasks) {
  if (!Array.isArray(subTasks) || subTasks.length === 0) return true;
  return !subTasks.some(s => !s.done);
}

// ── 3. 矩陣網格安全防呆（來自 js/grid.js）──────────────────────
export function sanitizeCardDimension(val) {
  let safe = parseInt(val);
  if (isNaN(safe) || safe < 1 || safe > 3) return 1;
  return safe;
}

export function calculateGridCols(containerWidth) {
  if (containerWidth <= 420) return 1;
  if (containerWidth <= 640) return 2;
  return 3;
}

export function isTaskRoutine(task) {
  if (!task) return false;
  return Boolean(
    task.isRoutine ||
    (task.tag && (task.tag.includes('例行公事') || task.tag.includes('每日固定任務') || task.tag.includes('例行重複')))
  );
}

// ── 4. 後端字串處理與脫敏（來自 Code.gs）──────────────────────
export function cleanStr(val) {
  if (val === null || val === undefined) return "";
  var s = String(val).trim();
  if (s.indexOf("'") === 0) {
    s = s.substring(1).trim();
  }
  return s;
}

export function maskEmailForPrivacy(emailOrAccount) {
  var clean = cleanStr(emailOrAccount);
  if (clean.indexOf("@") !== -1) {
    var parts = clean.split("@");
    var prefix = parts[0];
    if (prefix.length <= 2) {
      return prefix + "***@" + parts[1];
    } else {
      return prefix.substring(0, 2) + "***@" + parts[1];
    }
  }
  return clean;
}

// ── 5. AI 智慧備援拆解規則（直接移植自 Code.gs generateSmartFallbackSteps）
export function getAIDecomposeFallback(title) {
  var t = cleanStr(title);
  if (!t) return ["釐清任務核心需求與目標", "蒐集必備資料並排定順序", "專注執行關鍵產出內容", "檢視成果品質並確認收尾"];

  // 1. 口頭簡報、演講、Demo 類
  if (/(簡報|演講|發表|demo|pitch|presentation|ppt|投影片|口頭報告)/i.test(t)) {
    return [
      "確立簡報核心架構與聽眾需求",
      "彙整關鍵數據並製作投影片初稿",
      "進行全程計時彩排與口條演練",
      "正式上台發表並記錄互動回饋"
    ];
  }
  // 2. 書面報告、論文、企劃、研究心得類
  if (/(報告|論文|期末報告|專案報告|企劃|文獻|書面|文件|筆記|心得)/i.test(t)) {
    return [
      "界定報告主題範疇與蒐集核心文獻",
      "規劃各章節邏輯大綱與論點架構",
      "專注撰寫正文論證與整理數據圖表",
      "全文格式校對排版並最終定稿"
    ];
  }
  if (/(聚餐|吃飯|約會|聚會|派對|活動)/i.test(t)) {
    return [
      "確認大家時間偏好與飲食禁忌",
      "精選合適地點並提前完成訂位",
      "發送行程提醒與集合時間地點",
      "當日準時抵達並享受聚會互動"
    ];
  }
  if (/(開會|會議|討論|訪談|諮詢)/i.test(t)) {
    return [
      "擬定會議議程與討論核心目標",
      "提前發送背景資料與出席通知",
      "主持會議討論並引導達成共識",
      "整理會議紀錄並追蹤待辦分工"
    ];
  }
  if (/(運動|健身|跑步|減肥|鍛鍊|瑜珈)/i.test(t)) {
    return [
      "擬定今日運動課表與訓練目標",
      "充分熱身伸展並備妥飲用水",
      "專注完成主項動作與核心訓練",
      "進行收操拉筋與補充營養水分"
    ];
  }
  if (/(讀書|閱讀|考試|考證|學習|課程|複習)/i.test(t)) {
    return [
      "設定今日閱讀章節或複習進度",
      "專注研讀內容並標註關鍵重點",
      "整理自我檢核筆記或練習題目",
      "快速回顧今日盲點與記憶覆盤"
    ];
  }
  if (/(旅遊|旅行|出差|露營|行前)/i.test(t)) {
    return [
      "規劃每日主要行程路線與景點",
      "預訂交通票券與住宿旅宿飯店",
      "整理隨身行李與必備證件物品",
      "確認天氣預報並愉快啟程出發"
    ];
  }
  if (/(開發|寫程式|code|bug|專案|系統|網頁)/i.test(t)) {
    return [
      "分析功能需求與設計架構邏輯",
      "撰寫核心程式碼並模組化封裝",
      "執行本地測試與修復潛在錯誤",
      "部署上線並確認功能運作正常"
    ];
  }

  return [
    "釐清「" + t + "」的核心目標與成果",
    "盤點所需資源並規劃執行順序",
    "全心專注投入推進關鍵進度",
    "進行成果驗收並完成最後收尾"
  ];
}

// ── 6. 密碼雜湊與驗證（來自 js/auth.js）───────────────────────
export function hashPasswordNode(pwd) {
  if (!pwd) return "";
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
