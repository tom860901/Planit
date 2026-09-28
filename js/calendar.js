/* ============================================================
   js/calendar.js — 月曆渲染 & 日期篩選
   - renderCalendar()：繪製月曆格子與任務點
   - renderUpcomingPanel()：右欄「即將到來」預告
   - changeMonth()：上下月切換
   - jumpToToday()：跳回今日
   ============================================================ */

function renderCalendar() {
  const titleEl = document.getElementById('cal-month-title');
  const gridEl  = document.getElementById('cal-days-grid');
  gridEl.innerHTML = '';

  titleEl.innerText = `${currentCalendarYear}年 ${currentCalendarMonth + 1}月`;

  const firstDayIndex = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
  const startDay  = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // 週一為首欄
  const totalDays = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();

  const todayStr   = getLocalDateString();
  const activeTasks = allTasksData.filter(t => t.status !== 'completed');

  // 空白格（月初前的空位）
  for (let i = 0; i < startDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    gridEl.appendChild(el);
  }

  // 日期格
  for (let day = 1; day <= totalDays; day++) {
    const mStr    = String(currentCalendarMonth + 1).padStart(2, '0');
    const dStr    = String(day).padStart(2, '0');
    const dateStr = `${currentCalendarYear}-${mStr}-${dStr}`;
    const isToday = dateStr === todayStr;

    // 當天有任務時顯示小點
    const tasksOnDay = activeTasks.filter(t => t.dueDate === dateStr);
    let dotsHtml = '';
    tasksOnDay.forEach(t => {
      const isUrgent = t.priority === '🔴 緊急' || t.dueDate <= todayStr;
      dotsHtml += `<div class="cal-dot ${isUrgent ? 'urgent' : ''}"></div>`;
    });

    const cell = document.createElement('div');
    cell.className = [
      'cal-day',
      isToday ? 'today' : '',
      selectedDateFilter === dateStr ? 'active-filter' : ''
    ].join(' ').trim();
    cell.innerHTML = `<div>${day}</div><div class="cal-dot-container">${dotsHtml}</div>`;

    // 點擊日期：切換篩選（再點一次取消篩選）
    cell.onclick = () => {
      selectedDateFilter = (selectedDateFilter === dateStr) ? null : dateStr;
      renderCalendar();
      renderTasks();
    };

    gridEl.appendChild(cell);
  }
}

function renderUpcomingPanel() {
  const todayStr = getLocalDateString();

  // ── 1. 計算今日完成事項與待辦概況 (例如 5/8) ────────────────────
  const todayDueTasks = allTasksData.filter(t => {
    if (t.dueDate === todayStr) return true;
    if (t.isRoutine || (t.tag && (t.tag.includes('例行公事') || t.tag.includes('每日固定任務') || t.tag.includes('例行重複')))) return true;
    return false;
  });

  let completedCount = 0;
  let totalCount = 0;

  const badgeEl = document.getElementById('today-stats-badge');
  const descEl  = document.getElementById('today-stats-desc');
  const progEl  = document.getElementById('today-stats-progress');

  if (todayDueTasks.length > 0) {
    // 今日有指定到期日或每日固定任務
    completedCount = todayDueTasks.filter(t => t.status === 'completed').length;
    totalCount = todayDueTasks.length;
    if (badgeEl && descEl && progEl) {
      badgeEl.innerText = `(${completedCount}/${totalCount})`;
      const pct = Math.round((completedCount / totalCount) * 100);
      descEl.innerText = `已完成 ${completedCount} 項 / 共 ${totalCount} 項待辦 (${pct}%)`;
      progEl.style.width = `${pct}%`;
    }
  } else {
    // 🎯 項目 3 修正：今日暫無排定待辦，標準與先鋒榜 100% 統一！
    if (badgeEl && descEl && progEl) {
      badgeEl.innerText = `(0/0)`;
      const longTermHint = allTasksData.length > 0 ? `（已有 ${allTasksData.length} 項長期/常駐任務）` : '';
      descEl.innerText = `今日暫無排定待辦 ${longTermHint}`;
      progEl.style.width = `0%`;
    }
  }

  // 🎯 若抽屜目前處於展開狀態，即時刷新抽屜內容
  if (typeof renderTodayDrawerContent === 'function' && isTodayDrawerOpen) {
    renderTodayDrawerContent();
  }

  // ── 2. 渲染即將到來清單 ──────────────────────────────────────
  const panel = document.getElementById('upcoming-list');
  if (!panel) return;
  panel.innerHTML = '';

  const activeTasks = allTasksData
    .filter(t => t.status !== 'completed' && t.dueDate && t.dueDate >= todayStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (activeTasks.length === 0) {
    panel.innerHTML = `<div style="text-align:center; color:var(--text-mid); padding:12px; font-size:0.8rem;">近期沒有待辦期限</div>`;
    return;
  }

  activeTasks.slice(0, 8).forEach(task => {
    const item = document.createElement('div');
    item.className = 'upcoming-item';
    item.innerHTML = `
      <div style="font-weight:700; margin-bottom:2px;">📌 ${task.title}</div>
      <div style="font-size:0.75rem; color:var(--text-mid); display:flex; justify-content:space-between;">
        <span>${task.tag}</span>
        <span style="color:#E63946; font-weight:700;">${task.dueDate}</span>
      </div>`;
    item.onclick = () => openTaskDetail(task.id);
    panel.appendChild(item);
  });
}

function changeMonth(direction) {
  currentCalendarMonth += direction;
  if (currentCalendarMonth > 11) { currentCalendarMonth = 0; currentCalendarYear++; }
  else if (currentCalendarMonth < 0) { currentCalendarMonth = 11; currentCalendarYear--; }
  renderCalendar();
}

function jumpToToday() {
  const today = new Date();
  currentCalendarYear  = today.getFullYear();
  currentCalendarMonth = today.getMonth();
  selectedDateFilter   = getLocalDateString(today);
  renderCalendar();
  renderTasks();
}

// ── 🎯 今日待辦抽屜折疊邏輯 ──────────────────────────────────
let isTodayDrawerOpen = false;

function toggleTodayDrawer() {
  const drawer = document.getElementById('today-drawer-list');
  const arrow  = document.getElementById('today-drawer-arrow');
  if (!drawer) return;
  isTodayDrawerOpen = !isTodayDrawerOpen;
  if (isTodayDrawerOpen) {
    drawer.className = 'today-drawer-expanded';
    if (arrow) arrow.style.transform = 'rotate(180deg)';
    renderTodayDrawerContent();
  } else {
    drawer.className = 'today-drawer-collapsed';
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }
}

function renderTodayDrawerContent() {
  const drawer = document.getElementById('today-drawer-list');
  if (!drawer) return;
  const todayStr = getLocalDateString();
  const todayCompleted = allTasksData.filter(t => {
    if (t.status !== 'completed') return false;
    if (t.dueDate === todayStr) return true;
    if (t.isRoutine || (t.tag && (t.tag.includes('例行公事') || t.tag.includes('每日固定任務') || t.tag.includes('例行重複')))) return true;
    return false;
  });

  if (todayCompleted.length === 0) {
    drawer.innerHTML = `<div style="font-size:0.75rem; color:var(--text-mid); text-align:center; padding:6px 0;">今日尚未有完成項目，加油！</div>`;
    return;
  }

  drawer.innerHTML = todayCompleted.map(t => `
    <div class="drawer-task-item">
      <span class="drawer-task-title" title="${t.title}">✅ ${t.title}</span>
      <span style="font-size:0.72rem; opacity:0.8;">${t.tag || ''}</span>
    </div>
  `).join('');
}

// ── 🏆 今日敏捷先鋒榜 Modal ──────────────────────────────────
function openLeaderboardModal() {
  openModal('leaderboard-modal');
  const container = document.getElementById('leaderboard-container');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center; color:var(--text-mid); padding:24px;">計算今日先鋒榜中...</div>`;

  callGASAPI({ action: 'getLeaderboard', account: currentUser }, (res) => {
    if (res && res.success && Array.isArray(res.rankings)) {
      renderLeaderboard(res.rankings);
    } else {
      container.innerHTML = `<div style="text-align:center; color:var(--text-mid); padding:24px;">暫無今日排行資料</div>`;
    }
  }, () => {
    container.innerHTML = `<div style="text-align:center; color:#E63946; padding:24px;">讀取榜單失敗</div>`;
  });
}

function closeLeaderboardModal() {
  closeModal('leaderboard-modal');
}

/** 🎯 項目 4 & 5：格式化榜單使用者顯示名稱（支援自訂暱稱 + 信箱自動脫敏去 @gmail.com） */
function formatLeaderboardName(item) {
  if (item.nickname && String(item.nickname).trim()) return String(item.nickname).trim();
  const isMe = Boolean(item.isMe || item.account === currentUser || (currentUser && currentUser.includes('@') && item.account === currentUser.split('@')[0]));
  if (isMe) {
    const localNick = localStorage.getItem('planit_nick_' + currentUser);
    if (localNick && localNick.trim()) return localNick.trim();
  }
  const acc = String(item.account || '');
  if (acc.includes('@')) return acc.split('@')[0];
  return acc;
}

function renderLeaderboard(rankings) {
  const container = document.getElementById('leaderboard-container');
  if (!container) return;
  if (!rankings || rankings.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-mid); padding:24px; font-size:0.85rem;">今日尚無成員排定待辦任務，快來建立搶下第一名！</div>`;
    return;
  }

  container.innerHTML = '';
  rankings.forEach((item, index) => {
    const isMe = Boolean(item.isMe || (item.account === currentUser) || (currentUser && currentUser.includes('@') && item.account === currentUser.split('@')[0]));
    let rankBadge = `${index + 1}`;
    if (index === 0) rankBadge = '🥇';
    else if (index === 1) rankBadge = '🥈';
    else if (index === 2) rankBadge = '🥉';

    const displayName = formatLeaderboardName(item);

    const row = document.createElement('div');
    row.className = `lb-item ${isMe ? 'is-current-user' : ''}`;
    row.innerHTML = `
      <div class="lb-rank">${rankBadge}</div>
      <div class="lb-user-info">
        <div class="lb-username">
          <span>${displayName}</span>
          ${isMe ? '<span class="lb-me-tag">我</span>' : ''}
        </div>
        <div class="lb-progress-bar">
          <div class="lb-progress-fill" style="width:${item.rate}%"></div>
        </div>
      </div>
      <div class="lb-rate-box">
        <div class="lb-rate">${item.rate}%</div>
        <div class="lb-counts">${item.completed}/${item.total}</div>
      </div>
    `;
    container.appendChild(row);
  });
}


