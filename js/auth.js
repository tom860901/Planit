/* ============================================================
   js/auth.js — 帳號驗證系統
   - 帳密登入 / 註冊
   - Google OAuth SSO
   - 忘記密碼（寄臨時密碼）
   - 登出
   - 密碼顯示切換
   ============================================================ */

// ── 密碼眼睛切換 ─────────────────────────────────────────────

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerText = '🙈';
  } else {
    input.type = 'password';
    btn.innerText = '👁️';
  }
}

// ── Google OAuth ─────────────────────────────────────────────

function initGoogleAuth() {
  setTimeout(() => {
    try {
      if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
          auto_select: false
        });
        google.accounts.id.renderButton(
          document.getElementById("google-btn-container"),
          { theme: "outline", size: "large", shape: "pill", width: 280 }
        );
      }
    } catch (e) {}
  }, 200);
}

function decodeJwtResponse(t) {
  return JSON.parse(
    decodeURIComponent(
      atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
        .split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    )
  );
}

function handleCredentialResponse(r) {
  document.getElementById('message').innerText = "驗證成功，進入控制中心...";
  const userInfo = decodeJwtResponse(r.credential);

  callGASAPI({ action: 'googleLogin', email: userInfo.email, name: userInfo.name || "User" }, (res) => {
    currentUser = (res && res.account) ? res.account : userInfo.email;
    localStorage.setItem('planit_user', currentUser);
    updateAvatarBadge();
    document.getElementById('login-view').classList.replace('view-active', 'view-hidden');
    document.getElementById('dashboard-view').classList.replace('view-hidden', 'view-active');
    fetchTasks();
  }, (err) => {
    document.getElementById('message').innerText = err;
  });
}

// ── 密碼 SHA-256 雜湊（保護密碼不以明文存於試算表）────────────

async function hashPassword(str) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn("Crypto API 不可用，使用原字串", e);
  }
  return str;
}

// ── 登入 / 註冊模式切換 ──────────────────────────────────────

function toggleMode() {
  isLoginMode = !isLoginMode;
  document.getElementById('form-title').innerText        = isLoginMode ? 'Planit' : '新建帳號';
  document.getElementById('action-btn').innerText        = isLoginMode ? '進入系統' : '註冊帳號';
  document.getElementById('email-field-group').classList.toggle('view-hidden', isLoginMode);
  document.getElementById('switch-mode-text').innerText  = isLoginMode ? '沒有帳號？點此新建帳號' : '已有帳號？返回登入';
  document.getElementById('forgot-pwd-btn').style.display = isLoginMode ? 'inline' : 'none';
  document.getElementById('message').innerText = '';
}

// ── 帳密登入 / 註冊提交 ──────────────────────────────────────

async function submitManualForm() {
  const acc   = document.getElementById('account').value.trim();
  const pwd   = document.getElementById('password').value.trim();
  const email = document.getElementById('email').value.trim();
  const actionBtn = document.getElementById('action-btn');

  if (!acc || !pwd) { document.getElementById('message').innerText = "請輸入帳號與密碼！"; return; }
  if (!isLoginMode && (!email || !email.includes('@'))) {
    document.getElementById('message').innerText = "⚠️ 請輸入有效的電子信箱（必填項目，供忘記密碼救援）！";
    if (typeof showToast === 'function') showToast("⚠️ 請輸入有效的電子信箱以供密碼救援！", "warning");
    return;
  }

  document.getElementById('message').innerText = "連線驗證中...";
  actionBtn.disabled = true;
  actionBtn.classList.add('btn-disabled');

  // 將密碼轉為 SHA-256 雜湊碼，確保試算表中只呈現亂碼而不洩漏真實密碼
  const hashedPwd = await hashPassword(pwd);

  function handleLoginSuccess(res) {
    actionBtn.disabled = false;
    actionBtn.classList.remove('btn-disabled');
    currentUser = String(res.account);
    localStorage.setItem('planit_user', currentUser);
    updateAvatarBadge();
    document.getElementById('login-view').classList.replace('view-active', 'view-hidden');
    document.getElementById('dashboard-view').classList.replace('view-hidden', 'view-active');
    fetchTasks();
  }

  if (!isLoginMode) {
    // 註冊：強制使用雜湊碼存入試算表（保護密碼安全）
    callGASAPI(
      { action: 'register', account: acc, password: hashedPwd, email: email },
      (res) => {
        actionBtn.disabled = false;
        actionBtn.classList.remove('btn-disabled');
        if (!res) { document.getElementById('message').innerText = "伺服器未回傳有效狀態！"; return; }
        document.getElementById('message').innerText = res.msg || (res.success ? "成功" : "驗證失敗");
        if (res.success) setTimeout(toggleMode, 1500);
      },
      (errMsg) => {
        actionBtn.disabled = false;
        actionBtn.classList.remove('btn-disabled');
        document.getElementById('message').innerText = errMsg;
      }
    );
  } else {
    // 登入：優先以 SHA-256 雜湊比對（符合原始 1234 等帳號）；若未匹配則嘗試明文（相容過渡期註冊帳號）
    callGASAPI(
      { action: 'login', account: acc, password: hashedPwd },
      (res) => {
        if (res && res.success) {
          handleLoginSuccess(res);
        } else {
          // 降級嘗試：相容過渡期直接存明文的帳號
          callGASAPI(
            { action: 'login', account: acc, password: pwd },
            (fallbackRes) => {
              actionBtn.disabled = false;
              actionBtn.classList.remove('btn-disabled');
              if (fallbackRes && fallbackRes.success) {
                handleLoginSuccess(fallbackRes);
              } else {
                document.getElementById('message').innerText = (fallbackRes && fallbackRes.msg) || (res && res.msg) || "帳號或密碼錯誤！";
              }
            },
            (errMsg) => {
              actionBtn.disabled = false;
              actionBtn.classList.remove('btn-disabled');
              document.getElementById('message').innerText = errMsg;
            }
          );
        }
      },
      (errMsg) => {
        actionBtn.disabled = false;
        actionBtn.classList.remove('btn-disabled');
        document.getElementById('message').innerText = errMsg;
      }
    );
  }
}

// ── 登出 ─────────────────────────────────────────────────────

function logout() {
  localStorage.removeItem('planit_user');
  currentUser = ""; allTasksData = []; selectedDateFilter = null;
  document.getElementById('dashboard-view').classList.replace('view-active', 'view-hidden');
  document.getElementById('login-view').classList.replace('view-hidden', 'view-active');
  document.getElementById('account').value  = '';
  document.getElementById('password').value = '';
  document.getElementById('email').value    = '';
  document.getElementById('message').innerText = '';
  initGoogleAuth();
}

// ── 忘記密碼 ─────────────────────────────────────────────────

function openForgotPasswordModal() {
  openModal('forgot-modal');
  document.getElementById('forgot-email-input').value = "";
}
function closeForgotPasswordModal() { closeModal('forgot-modal'); }

function submitForgotPassword() {
  const email = document.getElementById('forgot-email-input').value.trim();
  if (!email) { alert("請填寫註冊信箱！"); return; }

  const btn = document.getElementById('forgot-submit-btn');
  btn.innerText = "發送中..."; btn.disabled = true;

  callGASAPI({ action: 'forgotPassword', email: email }, (res) => {
    btn.innerText = "發送臨時密碼"; btn.disabled = false;
    alert(res.msg || "信件已發送");
    if (res.success) closeForgotPasswordModal();
  }, (err) => {
    btn.innerText = "發送臨時密碼"; btn.disabled = false;
    alert(err);
  });
}
