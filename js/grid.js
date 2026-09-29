/* ============================================================
   js/grid.js — 任務矩陣排版引擎
   - renderTasks()：依排序規則生成卡片 DOM
   - initGridEngine()：自適應推擠矩陣 + 拖曳 + 長按刪除
   ============================================================ */

/**
 * 渲染任務卡片區
 * 排序規則：優先順序（🔴 > 🟡 > 🟢）→ 到期日由近到遠 → 無日期常駐
 */
function renderTasks() {
  const container = document.getElementById('grid-container');
  container.innerHTML = "";

  const todayStr = getLocalDateString();
  let activeTasks = allTasksData.filter(t => t.status !== 'completed');

  // 月曆篩選：
  // 1. 常駐任務（無日期）永遠顯示
  // 2. 當日到期的任務 (t.dueDate === selectedDateFilter)
  // 3. 勾選「持續顯示 (t.persistent)」的任務：在今天至截止日之間（例如 22~29 號）的每一天都持續顯示！
  if (selectedDateFilter) {
    activeTasks = activeTasks.filter(t => {
      if (!t.dueDate) return true;
      if (t.dueDate === selectedDateFilter) return true;
      if (t.persistent) {
        if (selectedDateFilter <= t.dueDate && (selectedDateFilter >= todayStr || t.dueDate >= todayStr)) {
          return true;
        }
      }
      return false;
    });
  }

  const priorityWeight = { '🔴 緊急': 3, '🟡 一般': 2, '🟢 輕鬆': 1 };
  activeTasks.sort((a, b) => {
    const wA = priorityWeight[a.priority] || 2;
    const wB = priorityWeight[b.priority] || 2;
    if (wA !== wB) return wB - wA;
    return (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99");
  });

  if (activeTasks.length === 0) {
    const msg = selectedDateFilter
      ? `📅 ${selectedDateFilter} 沒有進行中的任務`
      : `目前沒有進行中的任務，點擊 ＋ 新增！`;
    container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-mid);">${msg}</div>`;
    container.style.height = "100px";
    return;
  }

  activeTasks.forEach(task => {
    let subTasksArr = [];
    try { subTasksArr = JSON.parse(task.subTasks); } catch (e) {}
    const total    = subTasksArr.length;
    const done     = subTasksArr.filter(s => s.done).length;
    const progress = total === 0 ? 0 : Math.round((done / total) * 100);

    const isUrgent  = task.priority === '🔴 緊急' || (task.dueDate && task.dueDate <= todayStr);
    const isRoutine = Boolean(task.isRoutine || (task.tag && (task.tag.includes('例行公事') || task.tag.includes('每日固定任務') || task.tag.includes('例行重複'))));

    // 嚴格防呆：確保寬高只能為 1~3，避免歷史錯位資料將 2026 等日期當成卡片高度導致網頁爆炸
    let safeW = parseInt(task.w);
    if (isNaN(safeW) || safeW < 1 || safeW > 3) safeW = 1;
    let safeH = parseInt(task.h);
    if (isNaN(safeH) || safeH < 1 || safeH > 3) safeH = 1;

    const card = document.createElement('div');
    card.className = `widget-card ${isUrgent ? 'urgent-glow' : ''} ${isRoutine ? 'routine-card' : ''}`;
    card.setAttribute('data-id',  task.id);
    card.setAttribute('data-w',   safeW);
    card.setAttribute('data-h',   safeH);
    card.setAttribute('data-pri', task.priority);

    const progressHtml = total > 0
      ? `<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${progress}%"></div></div>` : '';
    const subTaskHint  = total > 0
      ? `<div style="font-size:0.72rem; color:var(--text-mid); margin-top:2px; pointer-events:none;">${done}/${total} 步驟</div>` : '';

    // ── 智慧倒數狀態膠囊 ──
    let dueHtml = "";
    if (task.dueDate) {
      const today = new Date(todayStr + "T00:00:00");
      const due   = new Date(task.dueDate + "T00:00:00");
      const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
      const persistIcon = task.persistent ? "📌 " : "";

      if (diffDays < 0) {
        dueHtml = `<div class="card-due-badge overdue-badge">🚨 逾期 ${Math.abs(diffDays)} 天</div>`;
      } else if (diffDays === 0) {
        dueHtml = `<div class="card-due-badge today-due-badge">${isRoutine ? '🔁 ' : ''}⚠️ 今日截止</div>`;
      } else if (diffDays === 1) {
        dueHtml = `<div class="card-due-badge urgent-countdown-badge">🔥 倒數 1 天</div>`;
      } else {
        dueHtml = `<div class="card-due-badge countdown-badge">${persistIcon}⏳ 剩 ${diffDays} 天 (${task.dueDate.slice(5)})</div>`;
      }
    } else {
      dueHtml = isRoutine
        ? `<div class="card-due-badge routine-due-badge">🔁 每日例行</div>`
        : `<div class="card-due-badge routine-due-badge">📌 常駐</div>`;
    }

    const routineBadgeHtml = isRoutine ? `<span class="card-routine-badge">🔁 每日循環</span>` : '';

    card.innerHTML = `
      <div class="card-topbar">
        <div style="display:inline-flex; align-items:center; gap:5px; overflow:hidden; max-width:65%;">
          <span class="card-tag-text">${task.tag || ''}</span>
          ${routineBadgeHtml}
        </div>
        ${dueHtml}
      </div>
      <div class="card-title-text">${task.title}</div>
      ${subTaskHint}
      ${progressHtml}`;

    container.appendChild(card);
  });

  setTimeout(() => initGridEngine(), 40);
}

/**
 * 初始化矩陣排版引擎
 * - 自動計算欄數（1/2/3 欄）
 * - 填充矩陣（bin-packing 貼上演算法）
 * - 拖曳換位、長按刪除
 */
function initGridEngine() {
  const oldContainer = document.getElementById('grid-container');
  // cloneNode 移除舊事件監聽，重新綁定
  const container = oldContainer.cloneNode(true);
  oldContainer.parentNode.replaceChild(container, oldContainer);

  const cardElements = Array.from(container.children);
  const gap = 16, rowHeight = 86;

  function getColCount() {
    return container.clientWidth <= 420 ? 1 : container.clientWidth <= 640 ? 2 : 3;
  }

  let cols = getColCount();
  let cardsData = cardElements.map(el => {
    let rawW = parseInt(el.getAttribute('data-w'));
    let rawH = parseInt(el.getAttribute('data-h'));
    let w = (isNaN(rawW) || rawW < 1 || rawW > 3) ? 1 : rawW;
    let h = (isNaN(rawH) || rawH < 1 || rawH > 3) ? 1 : rawH;
    return {
      el,
      w: Math.min(w, cols),
      h: h
    };
  });

  function renderGrid() {
    cols = getColCount();
    cardsData.forEach(c => {
      let rawW = parseInt(c.el.getAttribute('data-w'));
      let rawH = parseInt(c.el.getAttribute('data-h'));
      let w = (isNaN(rawW) || rawW < 1 || rawW > 3) ? 1 : rawW;
      c.w = Math.min(w, cols);
      c.h = (isNaN(rawH) || rawH < 1 || rawH > 3) ? 1 : rawH;
    });

    const cellWidth = (container.clientWidth - (cols - 1) * gap) / cols;
    let gridMatrix = [], maxRow = 0;

    cardsData.forEach(card => {
      let placed = false, r = 0;
      while (!placed) {
        for (let c = 0; c <= cols - card.w; c++) {
          let isFree = true;
          for (let y = 0; y < card.h && isFree; y++)
            for (let x = 0; x < card.w && isFree; x++)
              if (gridMatrix[r + y] && gridMatrix[r + y][c + x]) isFree = false;

          if (isFree) {
            for (let y = 0; y < card.h; y++) {
              if (!gridMatrix[r + y]) gridMatrix[r + y] = [];
              for (let x = 0; x < card.w; x++) gridMatrix[r + y][c + x] = true;
            }
            card.el.style.left   = `${c * (cellWidth + gap)}px`;
            card.el.style.top    = `${r * (rowHeight + gap)}px`;
            card.el.style.width  = `${card.w * cellWidth + (card.w - 1) * gap}px`;
            card.el.style.height = `${card.h * rowHeight + (card.h - 1) * gap}px`;
            maxRow = Math.max(maxRow, r + card.h);
            placed = true; break;
          }
        }
        if (!placed) r++;
      }
    });
    container.style.height = `${maxRow * rowHeight + (maxRow - 1) * gap}px`;
  }

  globalRenderGrid = renderGrid;
  renderGrid();

  // ── 拖曳 & 長按刪除 ──────────────────────────────────────
  let draggingIndex = -1, startX, startY, initialLeft, initialTop;
  let longPressTimer, clickStartTime;

  cardsData.forEach(card => {
    card.el.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      e.preventDefault();
      draggingIndex = cardsData.indexOf(card);
      startX = e.clientX; startY = e.clientY;
      clickStartTime = Date.now();
      initialLeft = parseFloat(card.el.style.left || 0);
      initialTop  = parseFloat(card.el.style.top  || 0);

      longPressTimer = setTimeout(() => {
        draggingIndex = -1;
        card.el.classList.remove('dragging');
        try { card.el.releasePointerCapture(e.pointerId); } catch (_) {}
        openDeleteModal(card.el.getAttribute('data-id'));
      }, 700);

      card.el.classList.add('dragging');
      card.el.setPointerCapture(e.pointerId);
    });

    card.el.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) clearTimeout(longPressTimer);
      if (draggingIndex === -1 || draggingIndex !== cardsData.indexOf(card)) return;

      const dx = e.clientX - startX, dy = e.clientY - startY;
      card.el.style.left = `${initialLeft + dx}px`;
      card.el.style.top  = `${initialTop  + dy}px`;

      const rect = card.el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      let targetIndex = -1;

      cardsData.forEach((other, i) => {
        if (i === draggingIndex) return;
        const r = other.el.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) targetIndex = i;
      });

      if (targetIndex !== -1) {
        cardsData.splice(targetIndex, 0, cardsData.splice(draggingIndex, 1)[0]);
        draggingIndex = targetIndex;
        renderGrid();
        card.el.style.left = `${initialLeft + dx}px`;
        card.el.style.top  = `${initialTop  + dy}px`;
      }
    });

    card.el.addEventListener('pointerup', (e) => {
      clearTimeout(longPressTimer);
      const elapsed = Date.now() - clickStartTime;
      const moved = Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6;

      if (draggingIndex !== -1) {
        card.el.classList.remove('dragging');
        try { card.el.releasePointerCapture(e.pointerId); } catch (_) {}
        draggingIndex = -1;
        renderGrid();
      }
      if (!moved && elapsed < 300) openTaskDetail(card.el.getAttribute('data-id'));
    });

    card.el.addEventListener('pointercancel', () => {
      clearTimeout(longPressTimer);
      if (draggingIndex !== -1) {
        card.el.classList.remove('dragging');
        draggingIndex = -1;
        renderGrid();
      }
    });
  });
}
