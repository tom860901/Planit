/* ============================================================
   js/tasks.js — 任務 CRUD 全部操作
   - 新增任務 Modal
   - 任務詳情 Modal（含子任務 Checklist）
   - 儲存編輯、完成、Rollover（移到明天）
   - 已完成區（Archive）
   - 刪除確認 Modal
   - AI 拆解子任務
   ============================================================ */

// ── 通用選項工具 ─────────────────────────────────────────────

/** Tag / Priority 按鈕互斥選取 */
function selectOpt(groupClass, btn) {
  document.querySelectorAll(groupClass).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── 子任務輸入 ───────────────────────────────────────────────

function addManualSubtaskInput(defaultText = "") {
  const container = document.getElementById('manual-subtasks-container');
  const row = document.createElement('div');
  row.className = 'subtask-input-row';
  row.innerHTML = `<input type="text" placeholder="步驟描述..." value="${defaultText}">
    <button class="add-step-btn" onclick="this.parentElement.remove()" style="border:none">❌</button>`;
  container.appendChild(row);
  if (!defaultText) row.querySelector('input').focus();
}

// ── AI 拆解（呼叫後端真實 AI API）─────────────────────────────

function triggerAIDecompose() {
  const titleInput = document.getElementById('new-task-input');
  const title = titleInput.value.trim();
  if (!title) { alert("請先輸入上方目標名稱！"); titleInput.focus(); return; }

  const aiBtn = document.getElementById('ai-decompose-btn');
  const originalText = aiBtn.innerHTML;
  aiBtn.innerHTML = "🧠 思考中...";
  aiBtn.disabled = true;

  callGASAPI({ action: 'aiDecompose', title: title }, (res) => {
    aiBtn.innerHTML = originalText;
    aiBtn.disabled = false;
    if (res && res.success && res.steps && res.steps.length > 0) {
      const container = document.getElementById('manual-subtasks-container');
      container.innerHTML = "";
      res.steps.forEach(stepText => { addManualSubtaskInput(stepText); });
      showToast("✨ AI 步驟拆解完成！", "info");
    } else {
      showToast((res && res.msg) || "AI 拆解失敗，請檢查後端 API 設定！", "warning");
    }
  }, (err) => {
    aiBtn.innerHTML = originalText;
    aiBtn.disabled = false;
    showToast("AI 連線失敗：" + err, "danger");
  });
}

// ── 新增任務 Modal ───────────────────────────────────────────

function openTaskModal() {
  openModal('task-modal');
  document.getElementById('manual-subtasks-container').innerHTML = '';
  document.getElementById('new-task-input').value = "";
  document.getElementById('new-task-duedate').value = ""; // 預設不設定任何時間，由使用者自訂

  const persistentCb = document.getElementById('new-task-persistent');
  if (persistentCb) persistentCb.checked = false; // 預設不勾選，由使用者自由決定

  const routineCb = document.getElementById('new-task-routine');
  if (routineCb) routineCb.checked = false;

  // 重置標籤選取至第一項
  document.querySelectorAll('.new-tag-btn').forEach((b, i) => {
    b.classList.toggle('active', i === 0);
  });
}
function closeTaskModal() { closeModal('task-modal'); }

let isAddingTaskInProgress = false;

function confirmAddTask() {
  if (isAddingTaskInProgress) return;

  const input = document.getElementById('new-task-input');
  const title = input.value.trim();
  if (!title) { input.focus(); return; }

  const tagEl   = document.querySelector('.new-tag-btn.active') || document.querySelector('.tag-btn.active');
  const tag     = tagEl ? tagEl.getAttribute('data-val') : '⚡️ 碎片 (<15m)';
  const pri     = document.querySelector('.pri-btn.active').getAttribute('data-val');
  const dueDate = document.getElementById('new-task-duedate').value;

  const persistentCb = document.getElementById('new-task-persistent');
  const isPersistent = persistentCb ? persistentCb.checked : false;

  const routineCb = document.getElementById('new-task-routine');
  const isRoutine = routineCb ? routineCb.checked : false;

  let subTasks = [];
  document.querySelectorAll('#manual-subtasks-container input').forEach(inp => {
    if (inp.value.trim()) subTasks.push({ step: inp.value.trim(), done: false });
  });

  const autoWidth = ((dueDate && dueDate.trim() !== "") || subTasks.length > 0) ? 2 : 1;

  isAddingTaskInProgress = true;
  closeTaskModal();
  input.value = ""; // 立刻清空，防止殘留

  callGASAPI({
    action: 'addTask', account: currentUser, title, tag, priority: pri,
    subTasks: JSON.stringify(subTasks), dueDate,
    persistent: isPersistent ? 1 : 0,
    isRoutine: isRoutine ? 1 : 0
  }, (res) => {
    isAddingTaskInProgress = false;
    if (res && res.success) {
      res.task.w = autoWidth;
      res.task.persistent = isPersistent;
      res.task.isRoutine = isRoutine;
      if (!allTasksData.some(t => t.id === res.task.id)) {
        allTasksData.push(res.task);
      }
      renderCalendar();
      renderUpcomingPanel();
      renderTasks();
      showToast("✅ 任務建立成功！", "success");
    }
  }, (err) => {
    isAddingTaskInProgress = false;
    console.error("新增任務異常:", err);
    showToast("新增任務失敗，請檢查網路連線", "danger");
  });
}

// ── 任務詳情 Modal ───────────────────────────────────────────

function openTaskDetail(taskId) {
  const task = allTasksData.find(t => t.id === taskId);
  if (!task) return;
  currentDetailTaskId = taskId;

  document.getElementById('edit-task-title').value    = task.title;
  document.getElementById('edit-task-duedate').value  = task.dueDate || '';
  document.getElementById('edit-task-priority').value = task.priority || '🟡 一般';

  const editPersistentCb = document.getElementById('edit-task-persistent');
  if (editPersistentCb) editPersistentCb.checked = !!task.persistent;

  const editRoutineCb = document.getElementById('edit-task-routine');
  const isTaskRoutine = Boolean(task.isRoutine || (task.tag && (task.tag.includes('例行公事') || task.tag.includes('每日固定任務') || task.tag.includes('例行重複'))));
  if (editRoutineCb) editRoutineCb.checked = isTaskRoutine;

  // 同步設定任務類型標籤（若為舊版例行公事標籤，預設選取相容標籤）
  const currentTag = task.tag || '⚡️ 碎片 (<15m)';
  let tagMatched = false;
  document.querySelectorAll('.edit-tag-btn').forEach(btn => {
    const isMatch = (btn.getAttribute('data-val') === currentTag);
    if (isMatch) tagMatched = true;
    btn.classList.toggle('active', isMatch);
  });
  if (!tagMatched) {
    const firstTagBtn = document.querySelector('.edit-tag-btn');
    if (firstTagBtn) firstTagBtn.classList.add('active');
  }

  let subTasksArr = [];
  try { subTasksArr = JSON.parse(task.subTasks); } catch (e) {}

  const listContainer = document.getElementById('detail-checklist');
  listContainer.innerHTML = '';

  if (subTasksArr.length === 0) {
    listContainer.innerHTML = `<div class="detail-empty-hint">一般任務，可直接標記完成或修改內容。</div>`;
    document.getElementById('detail-progress-text').innerText = '';
  } else {
    renderChecklist(subTasksArr);
  }

  updateCompleteButtonState(subTasksArr);
  openModal('detail-modal');
}

function renderChecklist(subTasksArr) {
  const listContainer = document.getElementById('detail-checklist');
  listContainer.innerHTML = '';
  let doneCount = 0;

  subTasksArr.forEach(st => {
    if (st.done) doneCount++;
    const item = document.createElement('div');
    item.className = `check-item ${st.done ? 'done' : ''}`;
    item.innerHTML = `<div class="checkbox-circle">✔</div><div style="font-weight:600; font-size:0.9rem;">${st.step}</div>`;

    item.onclick = () => {
      st.done = !st.done;
      const idx = allTasksData.findIndex(t => t.id === currentDetailTaskId);
      allTasksData[idx].subTasks = JSON.stringify(subTasksArr);
      renderChecklist(subTasksArr);
      updateCompleteButtonState(subTasksArr);
      callGASAPI({ action: 'updateTask', taskId: currentDetailTaskId, subTasks: JSON.stringify(subTasksArr) }, () => {});
    };
    listContainer.appendChild(item);
  });

  const prog = Math.round((doneCount / subTasksArr.length) * 100);
  document.getElementById('detail-progress-text').innerText = `目前進度：${prog}%`;
}

function updateCompleteButtonState(subTasksArr) {
  const btn = document.getElementById('detail-complete-btn');
  if (!subTasksArr || subTasksArr.length === 0) {
    btn.classList.remove('btn-disabled');
    return;
  }
  btn.classList.toggle('btn-disabled', subTasksArr.some(st => !st.done));
}

// ── 儲存編輯 ────────────────────────────────────────────────

function saveTaskEdits() {
  if (!currentDetailTaskId) return;
  const idx = allTasksData.findIndex(t => t.id === currentDetailTaskId);
  if (idx === -1) return;

  const newTitle    = document.getElementById('edit-task-title').value.trim();
  const newDueDate  = document.getElementById('edit-task-duedate').value;
  const newPriority = document.getElementById('edit-task-priority').value;

  const activeTagBtn = document.querySelector('.edit-tag-btn.active');
  const newTag = activeTagBtn ? activeTagBtn.getAttribute('data-val') : (allTasksData[idx].tag || '⚡️ 碎片 (<15m)');

  const editPersistentCb = document.getElementById('edit-task-persistent');
  const newPersistent = editPersistentCb ? editPersistentCb.checked : false;

  const editRoutineCb = document.getElementById('edit-task-routine');
  const newRoutine = editRoutineCb ? editRoutineCb.checked : false;

  if (!newTitle) { showToast("任務名稱不能為空！", "warning"); return; }

  allTasksData[idx].title      = newTitle;
  allTasksData[idx].dueDate    = newDueDate;
  allTasksData[idx].priority   = newPriority;
  allTasksData[idx].tag        = newTag;
  allTasksData[idx].persistent = newPersistent;
  allTasksData[idx].isRoutine  = newRoutine;

  callGASAPI({
    action: 'updateTaskDetails', taskId: currentDetailTaskId, account: currentUser,
    title: newTitle, dueDate: newDueDate, priority: newPriority, tag: newTag,
    persistent: newPersistent ? 1 : 0,
    isRoutine: newRoutine ? 1 : 0
  }, () => {});

  showToast("💾 變更已儲存！", "success");
  closeDetailModal();
}

function closeDetailModal() {
  closeModal('detail-modal');
  currentDetailTaskId = null;
  renderCalendar();
  renderUpcomingPanel();
  renderTasks();
}

// ── 完成任務 ────────────────────────────────────────────────

function markTaskCompleted() {
  if (!currentDetailTaskId) return;
  const task = allTasksData.find(t => t.id === currentDetailTaskId);
  if (!task) return;

  let subTasksArr = [];
  try { subTasksArr = JSON.parse(task.subTasks); } catch (e) {}
  if (subTasksArr.length > 0 && subTasksArr.some(st => !st.done)) {
    showToast("⚠️ 還有子任務尚未完成，請先完成所有步驟！", "warning");
    return;
  }

  const idx = allTasksData.findIndex(t => t.id === currentDetailTaskId);
  allTasksData[idx].status = 'completed';
  callGASAPI({ action: 'updateTaskStatus', taskId: currentDetailTaskId, account: currentUser, status: 'completed' }, () => {});
  showToast("🎉 太棒了！完成一項任務！", "success");
  closeDetailModal();
}

// ── Rollover：移到明天 ───────────────────────────────────────

function rolloverTaskToTomorrow() {
  if (!currentDetailTaskId) return;
  const targetTaskId = currentDetailTaskId;
  const idx = allTasksData.findIndex(t => t.id === targetTaskId);
  if (idx === -1) return;

  const currentTask = allTasksData[idx];
  const prevDueDate = currentTask.dueDate;
  const prevPriority = currentTask.priority;
  let nextDateStr = "";

  if (currentTask.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(currentTask.dueDate)) {
    const [y, m, d] = currentTask.dueDate.split('-').map(Number);
    nextDateStr = getLocalDateString(new Date(y, m - 1, d + 1));
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    nextDateStr = getLocalDateString(tomorrow);
  }

  allTasksData[idx].dueDate  = nextDateStr;
  allTasksData[idx].priority = '🔴 緊急';

  closeDetailModal();

  const rollback = () => {
    const rollIdx = allTasksData.findIndex(t => t.id === targetTaskId);
    if (rollIdx !== -1) {
      allTasksData[rollIdx].dueDate = prevDueDate;
      allTasksData[rollIdx].priority = prevPriority;
      renderCalendar();
      renderUpcomingPanel();
      renderTasks();
    }
    showToast("❌ 移到明天同步失敗，已恢復原狀態", "warning");
  };

  callGASAPI(
    { action: 'rolloverTask', taskId: targetTaskId, account: currentUser, tomorrowDate: nextDateStr },
    (res) => {
      if (!res || !res.success) {
        rollback();
      }
    },
    (err) => {
      console.error("順延同步異常:", err);
      rollback();
    }
  );
  showToast("⏰ 任務已成功移至明日！", "warning");
}

// ── 🎯 項目 7：已完成區（Archive - 按日期時間軸結構化分組）──

function openArchiveModal() {
  const archiveList = document.getElementById('archive-list');
  archiveList.innerHTML = '';
  const completedTasks = allTasksData.filter(t => t.status === 'completed');

  if (completedTasks.length === 0) {
    archiveList.innerHTML = `<div style="text-align:center; color:var(--text-mid); padding:20px;">目前沒有已完成的任務</div>`;
    openModal('archive-modal');
    return;
  }

  const todayStr = getLocalDateString();
  const yObj = new Date();
  yObj.setDate(yObj.getDate() - 1);
  const yesterdayStr = getLocalDateString(yObj);

  // 分組字典
  const groups = {
    today: { title: `📅 今天 (${todayStr})`, tasks: [] },
    yesterday: { title: `📅 昨天 (${yesterdayStr})`, tasks: [] },
    dates: {},
    undated: { title: `📌 常駐 / 無特定期限`, tasks: [] }
  };

  completedTasks.forEach(task => {
    const isRoutine = task.tag && (task.tag.includes('例行公事') || task.tag.includes('每日固定任務') || task.tag.includes('例行重複'));
    if (task.dueDate === todayStr || (isRoutine && !task.dueDate)) {
      groups.today.tasks.push(task);
    } else if (task.dueDate === yesterdayStr) {
      groups.yesterday.tasks.push(task);
    } else if (task.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) {
      if (!groups.dates[task.dueDate]) groups.dates[task.dueDate] = [];
      groups.dates[task.dueDate].push(task);
    } else {
      groups.undated.tasks.push(task);
    }
  });

  function renderGroup(title, tasks) {
    if (!tasks || tasks.length === 0) return;
    const header = document.createElement('div');
    header.className = 'archive-date-header';
    header.innerHTML = `<span>${title}</span> <span style="font-size:0.72rem; opacity:0.75;">(${tasks.length})</span>`;
    archiveList.appendChild(header);

    tasks.forEach(task => {
      const item = document.createElement('div');
      item.className = 'archive-item';
      item.innerHTML = `
        <div>
          <div style="font-weight:700; font-size:0.95rem;">✅ ${task.title}</div>
          <div style="font-size:0.75rem; color:var(--text-mid); margin-top:2px;">${task.tag || ''} | 優先度: ${task.priority || '🟡 一般'}</div>
        </div>
        <button class="btn-main btn-secondary" style="padding:6px 12px; font-size:0.8rem; border-radius:10px;" onclick="restoreTask('${task.id}')">復原</button>`;
      archiveList.appendChild(item);
    });
  }

  // 依時間軸順序渲染
  renderGroup(groups.today.title, groups.today.tasks);
  renderGroup(groups.yesterday.title, groups.yesterday.tasks);
  const sortedDates = Object.keys(groups.dates).sort((a, b) => b.localeCompare(a));
  sortedDates.forEach(d => {
    renderGroup(`📅 ${d}`, groups.dates[d]);
  });
  renderGroup(groups.undated.title, groups.undated.tasks);

  openModal('archive-modal');
}
function closeArchiveModal() { closeModal('archive-modal'); }

function restoreTask(taskId) {
  const idx = allTasksData.findIndex(t => t.id === taskId);
  if (idx === -1) return;
  allTasksData[idx].status = 'active';
  callGASAPI({ action: 'updateTaskStatus', taskId, account: currentUser, status: 'active' }, () => {});
  closeArchiveModal();
  renderCalendar();
  renderUpcomingPanel();
  renderTasks();
  showToast("🔄 任務已復原至看板！", "info");
}

// ── 刪除確認 Modal ───────────────────────────────────────────

function openDeleteModal(taskId) {
  if (navigator.vibrate) navigator.vibrate(50);
  targetElementToDelete = taskId;
  openModal('delete-modal');
}
function closeDeleteModal() {
  closeModal('delete-modal');
  targetElementToDelete = null;
}

function confirmDeleteTask() {
  if (!targetElementToDelete) return;
  const taskId = targetElementToDelete;
  closeDeleteModal();
  allTasksData = allTasksData.filter(t => t.id !== taskId);
  renderCalendar();
  renderUpcomingPanel();
  renderTasks();
  callGASAPI({ action: 'deleteTask', taskId, account: currentUser }, () => {});
  showToast("🗑️ 任務已刪除！", "info");
}
