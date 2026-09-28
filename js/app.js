/* ============================================================
   js/app.js — 全域狀態 + 進入點
   - 所有模組共用的狀態變數
   - window.onload 啟動流程
   - fetchTasks、getLocalDateString、updateAvatarBadge 等核心工具
   ============================================================ */

// ── 全域狀態 ────────────────────────────────────────────────
var isLoginMode        = true;   // 登入/註冊模式切換
var currentUser        = "";     // 目前登入帳號
var targetElementToDelete = null; // 長按刪除暫存的 task id
var allTasksData       = [];     // 本地任務快取陣列
var currentDetailTaskId = null;  // 目前開啟詳情的 task id
var selectedDateFilter = null;   // 月曆篩選的日期字串 'YYYY-MM-DD'
var currentCalendarYear  = new Date().getFullYear();
var currentCalendarMonth = new Date().getMonth();
var globalRenderGrid   = null;   // grid.js 暴露的重繪函式（供 resize 使用）

// ── 工具函式 ────────────────────────────────────────────────

/**
 * 取得本地日期字串 'YYYY-MM-DD'（不受時區影響）
 * @param {Date} dateObj
 */
function getLocalDateString(dateObj = new Date()) {
  const year  = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day   = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 更新右上角頭像顯示首字（優先使用自訂暱稱） */
function updateAvatarBadge() {
  const badge = document.getElementById('user-avatar-badge');
  if (currentUser && badge) {
    const localNick = localStorage.getItem('planit_nick_' + currentUser);
    const displayStr = (localNick && localNick.trim()) ? localNick.trim() : currentUser;
    badge.innerText = displayStr.charAt(0).toUpperCase();
  }
}

/** 🎯 項目 8：例行公事跨日無感自動生成（方案 A） */
function autoSpawnDailyRoutineTasks() {
  if (!currentUser || !Array.isArray(allTasksData) || allTasksData.length === 0) return;
  const todayStr = getLocalDateString();
  const routineTemplates = allTasksData.filter(t => t.tag && (t.tag.includes('例行公事') || t.tag.includes('每日固定任務') || t.tag.includes('例行重複')));
  if (routineTemplates.length === 0) return;

  const uniqueRoutines = new Map();
  routineTemplates.forEach(t => {
    if (!uniqueRoutines.has(t.title)) uniqueRoutines.set(t.title, t);
  });

  let spawnedAny = false;
  uniqueRoutines.forEach((template, title) => {
    // 檢查今天是否已經有這筆例行任務（若有指定今天的任務，或已有無日期的例行任務，皆不重複產生）
    const existsToday = allTasksData.some(t => t.title === title && (t.dueDate === todayStr || !t.dueDate));
    const spawnKey = `planit_routine_spawned_${currentUser}_${todayStr}_${title}`;

    if (!existsToday && !localStorage.getItem(spawnKey)) {
      localStorage.setItem(spawnKey, "1");
      spawnedAny = true;
      const newTaskId = 'task_' + new Date().getTime() + Math.floor(Math.random() * 1000);
      const newTask = {
        id: newTaskId,
        account: currentUser,
        title: title,
        tag: '🔁 例行公事',
        priority: template.priority || '🟡 一般',
        subTasks: template.subTasks || '[]',
        dueDate: todayStr,
        status: 'active',
        w: 1,
        h: 1,
        persistent: false
      };
      allTasksData.unshift(newTask);
      callGASAPI({ action: 'createTask', ...newTask }, () => {});
    }
  });

  if (spawnedAny) {
    showToast("✨ 已為您自動排入今日例行工作！", "info");
  }
}

/** 從 GAS 拉取任務並刷新所有 UI */
function fetchTasks() {
  callGASAPI({ action: 'getTasks', account: currentUser }, (data) => {
    allTasksData = Array.isArray(data) ? data : [];
    autoSpawnDailyRoutineTasks();
    renderCalendar();
    renderUpcomingPanel();
    renderTasks();
  }, () => {
    document.getElementById('grid-container').innerHTML =
      `<div style="text-align:center; padding:40px; color:#E63946;">任務載入失敗，請重新整理頁面。</div>`;
  });
}

// ── 🔔 全域 Toast 浮動回饋通知 ──────────────────────────────
function showToast(message, type = 'success', duration = 2500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 300);
  }, duration);
}

// ── 🚪 登出防呆確認 Modal ────────────────────────────────────
function openLogoutModal() {
  openModal('logout-modal');
}

function closeLogoutModal() {
  closeModal('logout-modal');
}

function confirmLogout() {
  closeLogoutModal();
  logout();
  showToast('👋 已安全登出系統', 'info');
}

// ── 進入點 ──────────────────────────────────────────────────
window.onload = function () {
  initGoogleAuth();
  initGlobalTilt();

  const savedUser = localStorage.getItem('planit_user');
  if (savedUser) {
    currentUser = savedUser;
    const loginEl = document.getElementById('login-view');
    const dashEl = document.getElementById('dashboard-view');
    if (loginEl) loginEl.classList.replace('view-active', 'view-hidden');
    if (dashEl) dashEl.classList.replace('view-hidden', 'view-active');
    updateAvatarBadge();
    if (loginEl || dashEl) fetchTasks();
  }
};

// 視窗縮放時重新排列卡片矩陣（防抖與寬度改變保護，杜絕迴圈抖動）
let lastWindowInnerWidth = window.innerWidth;
let gridResizeTimer = null;
window.addEventListener('resize', () => {
  if (window.innerWidth !== lastWindowInnerWidth) {
    lastWindowInnerWidth = window.innerWidth;
    clearTimeout(gridResizeTimer);
    gridResizeTimer = setTimeout(() => {
      if (globalRenderGrid) globalRenderGrid();
    }, 80);
  }
});
