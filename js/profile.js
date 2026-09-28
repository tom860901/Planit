/* ============================================================
   js/profile.js — 個人中心
   - openProfileModal / closeProfileModal
   - 每日打卡 Streak
   - 站內修改密碼
   ============================================================ */

function openProfileModal() {
  openModal('profile-modal');
  document.getElementById('p-acc').innerText   = currentUser;
  document.getElementById('p-email').innerText = "載入中...";

  const nickInput = document.getElementById('profile-nickname-input');
  if (nickInput) {
    nickInput.value = localStorage.getItem('planit_nick_' + currentUser) || "";
  }

  callGASAPI({ action: 'getUserProfile', account: currentUser }, (res) => {
    if (res && res.success && res.profile) {
      document.getElementById('p-email').innerText   = res.profile.email;
      document.getElementById('p-created').innerText = res.profile.createdAt   || "無紀錄";
      document.getElementById('p-login').innerText   = res.profile.lastLoginAt || "無紀錄";
      document.getElementById('profile-streak-days').innerText = res.profile.checkinStreak;

      if (res.profile.nickname && nickInput) {
        nickInput.value = res.profile.nickname;
        localStorage.setItem('planit_nick_' + currentUser, res.profile.nickname);
        if (typeof updateAvatarBadge === 'function') updateAvatarBadge();
      }

      const todayStr = getLocalDateString();
      const checkBtn = document.getElementById('checkin-action-btn');
      if (res.profile.checkinDate === todayStr) {
        checkBtn.innerText = "✅ 今日已完成簽到";
        checkBtn.classList.add('btn-disabled');
      } else {
        checkBtn.innerText = "🎯 今日簽到";
        checkBtn.classList.remove('btn-disabled');
      }
    }
  });
}

function closeProfileModal() { closeModal('profile-modal'); }

/** 🎯 項目 5：儲存自訂暱稱 */
function saveUserNickname() {
  const input = document.getElementById('profile-nickname-input');
  if (!input) return;
  const newNick = input.value.trim();
  localStorage.setItem('planit_nick_' + currentUser, newNick);
  if (typeof updateAvatarBadge === 'function') updateAvatarBadge();
  callGASAPI({ action: 'updateNickname', account: currentUser, nickname: newNick }, () => {});
  if (typeof showToast === 'function') {
    showToast("✅ 暱稱已成功儲存！", "success");
  } else {
    alert("暱稱已儲存！");
  }
}

// ── 每日打卡 ────────────────────────────────────────────────

function triggerDailyCheckin() {
  callGASAPI({ action: 'checkIn', account: currentUser }, (res) => {
    if (!res) return;
    alert(res.msg);
    if (res.success) {
      document.getElementById('profile-streak-days').innerText = res.streak;
      const checkBtn = document.getElementById('checkin-action-btn');
      checkBtn.innerText = "✅ 今日已完成簽到";
      checkBtn.classList.add('btn-disabled');
    }
  });
}

// ── 修改密碼 ────────────────────────────────────────────────

async function submitPasswordReset() {
  const oldPwd = document.getElementById('reset-old-pwd').value.trim();
  const newPwd = document.getElementById('reset-new-pwd').value.trim();
  if (!oldPwd || !newPwd) { alert("請完整填寫新舊密碼！"); return; }

  const hashedOld = (typeof hashPassword === 'function') ? await hashPassword(oldPwd) : oldPwd;
  const hashedNew = (typeof hashPassword === 'function') ? await hashPassword(newPwd) : newPwd;

  // 優先以雜湊舊密碼比對並更新為雜湊新密碼
  callGASAPI({ action: 'resetPassword', account: currentUser, oldPassword: hashedOld, newPassword: hashedNew }, (res) => {
    if (res && res.success) {
      alert(res.msg || "密碼修改成功！");
      document.getElementById('reset-old-pwd').value = "";
      document.getElementById('reset-new-pwd').value = "";
    } else {
      // 降級嘗試：舊密碼可能是早期明文存檔
      callGASAPI({ action: 'resetPassword', account: currentUser, oldPassword: oldPwd, newPassword: hashedNew }, (res2) => {
        if (res2) alert(res2.msg);
        if (res2 && res2.success) {
          document.getElementById('reset-old-pwd').value = "";
          document.getElementById('reset-new-pwd').value = "";
        }
      });
    }
  });
}
