function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    status: "online",
    msg: "Planit API is online!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(10000);
  } catch (err) {
    // 忽略 lock 例外
  }
  
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "未收到有效資料" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 初始化 Tasks 表
    var sheet = ss.getSheetByName("Tasks");
    if (!sheet) {
      sheet = ss.insertSheet("Tasks");
      sheet.appendRow(["id", "account", "title", "tag", "priority", "subTasks", "dueDate", "status", "w", "h"]);
    }

    // 初始化 Users 表
    var userSheet = ss.getSheetByName("Users");
    if (!userSheet) {
      userSheet = ss.insertSheet("Users");
      userSheet.appendRow(["account", "password", "email", "createdAt", "lastLoginAt", "checkinDate", "checkinStreak"]);
    }

    // 🎯 核心防呆清理工具：安全清洗帳號與字串（過濾單引號、純數字、小數點）
    function cleanStr(val) {
      if (val === null || val === undefined) return "";
      return String(val).replace(/^'+/, "").replace(/\.0$/, "").trim();
    }

    // 🎯 核心修復：安全讀取日期
    function safeReadDate(val) {
      if (!val) return "";
      if (val instanceof Date) return Utilities.formatDate(val, "Asia/Taipei", "yyyy-MM-dd");
      return String(val).replace(/^'+/, "").split("T")[0].split(" ")[0].trim();
    }

    function safeReadDateTime(val) {
      if (!val) return "";
      if (val instanceof Date) return Utilities.formatDate(val, "Asia/Taipei", "yyyy/MM/dd HH:mm");
      return String(val).replace(/^'+/, "").trim();
    }

    function getNowStr() {
      var d = new Date();
      return Utilities.formatDate(d, "Asia/Taipei", "yyyy/MM/dd HH:mm");
    }

    function getTodayDateStr() {
      var d = new Date();
      return Utilities.formatDate(d, "Asia/Taipei", "yyyy-MM-dd");
    }

    // 1. 取得任務
    if (action === "getTasks") {
      var rows = sheet.getDataRange().getValues();
      var tasks = [];
      var targetAcc = cleanStr(data.account);
      for (var i = 1; i < rows.length; i++) {
        if (cleanStr(rows[i][1]) === targetAcc) {
          tasks.push({
            id: cleanStr(rows[i][0]),
            account: cleanStr(rows[i][1]),
            title: String(rows[i][2] || ""),
            tag: String(rows[i][3] || ""),
            priority: String(rows[i][4] || ""),
            subTasks: String(rows[i][5] || ""),
            dueDate: safeReadDate(rows[i][6]),
            status: String(rows[i][7] || "active"),
            w: rows[i][8] || 1,
            h: rows[i][9] || 1,
            persistent: (rows[i][10] == 1 || rows[i][10] === true || rows[i][10] === "1") ? true : false,
            isRoutine: (rows[i][11] == 1 || rows[i][11] === true || rows[i][11] === "1" || String(rows[i][3]||"").indexOf("例行") !== -1) ? true : false
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify(tasks)).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 2. 新增任務
    if (action === "addTask") {
      var id = "task_" + new Date().getTime();
      var dueDate = data.dueDate ? "'" + cleanStr(data.dueDate) : ""; 
      var persistentVal = (data.persistent == 1 || data.persistent === true || data.persistent === "1") ? 1 : 0;
      var isRoutineVal = (data.isRoutine == 1 || data.isRoutine === true || data.isRoutine === "1" || String(data.tag || "").indexOf("例行") !== -1) ? 1 : 0;
      sheet.appendRow([id, "'" + cleanStr(data.account), data.title, data.tag, data.priority, data.subTasks, dueDate, "active", 1, 1, persistentVal, isRoutineVal]);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        task: { id: id, account: cleanStr(data.account), title: data.title, tag: data.tag, priority: data.priority, subTasks: data.subTasks, dueDate: data.dueDate, status: "active", w: 1, h: 1, persistent: persistentVal === 1, isRoutine: isRoutineVal === 1 }
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. 儲存編輯（支援標籤、優先級、日期、持續顯示與每日例行循環狀態更新，嚴密分戶防護）
    if (action === "updateTaskDetails") {
      var rows = sheet.getDataRange().getValues();
      var found = false;
      var reqAcc = cleanStr(data.account);
      for (var i = 1; i < rows.length; i++) {
        if (cleanStr(rows[i][0]) === cleanStr(data.taskId)) {
          if (reqAcc && cleanStr(rows[i][1]) !== reqAcc) continue;
          sheet.getRange(i + 1, 3).setValue(data.title);
          if (data.tag) sheet.getRange(i + 1, 4).setValue(data.tag);
          sheet.getRange(i + 1, 5).setValue(data.priority);
          sheet.getRange(i + 1, 7).setValue(data.dueDate ? "'" + cleanStr(data.dueDate) : ""); 
          if (typeof data.persistent !== 'undefined') {
            sheet.getRange(i + 1, 11).setValue(data.persistent ? 1 : 0);
          }
          if (typeof data.isRoutine !== 'undefined') {
            sheet.getRange(i + 1, 12).setValue(data.isRoutine ? 1 : 0);
          }
          found = true;
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: found })).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. 移到明天 (Rollover，分戶防護)
    if (action === "rolloverTask") {
      var rows = sheet.getDataRange().getValues();
      var reqAcc = cleanStr(data.account);
      var found = false;
      for (var i = 1; i < rows.length; i++) {
        if (cleanStr(rows[i][0]) === cleanStr(data.taskId)) {
          if (reqAcc && cleanStr(rows[i][1]) !== reqAcc) continue;
          sheet.getRange(i + 1, 5).setValue("🔴 緊急");
          sheet.getRange(i + 1, 7).setValue("'" + cleanStr(data.tomorrowDate));
          found = true;
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: found,
        msg: found ? "順延成功" : "找不到指定任務或無權限修改"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 5. 更新狀態（分戶防護與防重複完成）
    if (action === "updateTaskStatus") {
      var rows = sheet.getDataRange().getValues();
      var reqAcc = cleanStr(data.account);
      var updated = false;
      for (var i = 1; i < rows.length; i++) {
        if (cleanStr(rows[i][0]) === cleanStr(data.taskId)) {
          if (reqAcc && cleanStr(rows[i][1]) !== reqAcc) continue;
          if (cleanStr(rows[i][7]) === cleanStr(data.status)) {
            return ContentService.createTextOutput(JSON.stringify({ success: true, duplicate: true })).setMimeType(ContentService.MimeType.JSON);
          }
          sheet.getRange(i + 1, 8).setValue(data.status);
          updated = true;
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: updated })).setMimeType(ContentService.MimeType.JSON);
    }

    // 6. 更新子任務（分戶防護）
    if (action === "updateTask") {
      var rows = sheet.getDataRange().getValues();
      var reqAcc = cleanStr(data.account);
      for (var i = 1; i < rows.length; i++) {
        if (cleanStr(rows[i][0]) === cleanStr(data.taskId)) {
          if (reqAcc && cleanStr(rows[i][1]) !== reqAcc) continue;
          sheet.getRange(i + 1, 6).setValue(data.subTasks);
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }

    // 7. 刪除任務（分戶防護）
    if (action === "deleteTask") {
      var rows = sheet.getDataRange().getValues();
      var reqAcc = cleanStr(data.account);
      for (var i = 1; i < rows.length; i++) {
        if (cleanStr(rows[i][0]) === cleanStr(data.taskId)) {
          if (reqAcc && cleanStr(rows[i][1]) !== reqAcc) continue;
          sheet.deleteRow(i + 1);
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }

    // 8. 註冊
    if (action === "register") {
      var uRows = userSheet.getDataRange().getValues();
      var acc = cleanStr(data.account);
      var pwd = cleanStr(data.password);
      var email = cleanStr(data.email || "");

      for (var u = 1; u < uRows.length; u++) {
        if (cleanStr(uRows[u][0]) === acc) {
          return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "此帳號已被使用！" })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      var nowStr = getNowStr();
      userSheet.appendRow(["'" + acc, "'" + pwd, email, "'" + nowStr, "'" + nowStr, "", 0]);

      if (email) {
        try {
          MailApp.sendEmail({ to: email, name: "Planit 敏捷工作中心", subject: "✨ 歡迎加入 Planit！", htmlBody: "<p>註冊成功！歡迎使用。</p>" });
        } catch(e) {}
      }

      return ContentService.createTextOutput(JSON.stringify({ success: true, msg: "註冊成功！" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 9. 登入
    if (action === "login") {
      var uRows = userSheet.getDataRange().getValues();
      var inputAcc = cleanStr(data.account);
      var inputPwd = cleanStr(data.password);

      for (var u = 1; u < uRows.length; u++) {
        var sheetAcc = cleanStr(uRows[u][0]);
        var sheetPwd = cleanStr(uRows[u][1]);
        
        if (sheetAcc === inputAcc && sheetPwd === inputPwd) {
          var nowStr = getNowStr();
          userSheet.getRange(u + 1, 5).setValue("'" + nowStr);
          return ContentService.createTextOutput(JSON.stringify({ success: true, msg: "登入成功！", account: inputAcc })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "帳號或密碼錯誤！" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 10. Google 登入
    if (action === "googleLogin") {
      var uRows = userSheet.getDataRange().getValues();
      var gEmail = cleanStr(data.email);
      var found = false;
      var nowStr = getNowStr();

      for (var u = 1; u < uRows.length; u++) {
        if (cleanStr(uRows[u][2]) === gEmail || cleanStr(uRows[u][0]) === gEmail) {
          found = true;
          userSheet.getRange(u + 1, 5).setValue("'" + nowStr);
          break;
        }
      }

      if (!found) {
        userSheet.appendRow(["'" + gEmail, "GOOGLE_AUTH", gEmail, "'" + nowStr, "'" + nowStr, "", 0]);
      }

      return ContentService.createTextOutput(JSON.stringify({ success: true, account: gEmail })).setMimeType(ContentService.MimeType.JSON);
    }

    // 11. 忘記密碼
    if (action === "forgotPassword") {
      var uRows = userSheet.getDataRange().getValues();
      var targetEmail = cleanStr(data.email);
      var userRowIndex = -1;

      for (var u = 1; u < uRows.length; u++) {
        if (cleanStr(uRows[u][2]) === targetEmail) {
          userRowIndex = u + 1;
          break;
        }
      }

      if (userRowIndex === -1) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "找不到此信箱對應的帳號！" })).setMimeType(ContentService.MimeType.JSON);
      }

      var tempPassword = Math.random().toString(36).substring(2, 8).toUpperCase();
      userSheet.getRange(userRowIndex, 2).setValue("'" + tempPassword);

      try {
        MailApp.sendEmail({ to: targetEmail, name: "Planit 敏捷工作中心", subject: "🔐 Planit 臨時密碼通知", htmlBody: "<p>您的臨時密碼為：<strong>" + tempPassword + "</strong></p>" });
        return ContentService.createTextOutput(JSON.stringify({ success: true, msg: "臨時密碼已寄出！" })).setMimeType(ContentService.MimeType.JSON);
      } catch(e) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "信件發送失敗。" })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 12. 取得個人資料
    if (action === "getUserProfile") {
      var uRows = userSheet.getDataRange().getValues();
      var queryAcc = cleanStr(data.account);
      for (var u = 1; u < uRows.length; u++) {
        if (cleanStr(uRows[u][0]) === queryAcc) {
          return ContentService.createTextOutput(JSON.stringify({
            success: true,
            profile: {
              account: cleanStr(uRows[u][0]),
              email: cleanStr(uRows[u][2]) || "未綁定",
              createdAt: safeReadDateTime(uRows[u][3]),
              lastLoginAt: safeReadDateTime(uRows[u][4]),
              checkinDate: safeReadDate(uRows[u][5]),
              checkinStreak: parseInt(uRows[u][6]) || 0,
              nickname: cleanStr(uRows[u][7]) || ""
            }
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "查無使用者資料" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 13. 重設密碼
    if (action === "resetPassword") {
      var uRows = userSheet.getDataRange().getValues();
      var rAcc = cleanStr(data.account);
      var oldPwd = cleanStr(data.oldPassword);
      var newPwd = cleanStr(data.newPassword);

      for (var u = 1; u < uRows.length; u++) {
        if (cleanStr(uRows[u][0]) === rAcc) {
          if (cleanStr(uRows[u][1]) !== oldPwd) {
            return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "目前密碼錯誤！" })).setMimeType(ContentService.MimeType.JSON);
          }
          userSheet.getRange(u + 1, 2).setValue("'" + newPwd);
          return ContentService.createTextOutput(JSON.stringify({ success: true, msg: "變更成功！" })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "帳號異常" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 14. 簽到
    if (action === "checkIn") {
      var uRows = userSheet.getDataRange().getValues();
      var cAcc = cleanStr(data.account);
      var todayStr = getTodayDateStr();

      for (var u = 1; u < uRows.length; u++) {
        if (cleanStr(uRows[u][0]) === cAcc) {
          var lastCheck = safeReadDate(uRows[u][5]);
          var streak = parseInt(uRows[u][6]) || 0;

          if (lastCheck === todayStr) {
            return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "今天已簽到！", streak: streak })).setMimeType(ContentService.MimeType.JSON);
          }

          var yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          var yStr = Utilities.formatDate(yesterday, "Asia/Taipei", "yyyy-MM-dd");

          streak = (lastCheck === yStr) ? streak + 1 : 1;

          userSheet.getRange(u + 1, 6).setValue("'" + todayStr);
          userSheet.getRange(u + 1, 7).setValue(streak);

          return ContentService.createTextOutput(JSON.stringify({ success: true, msg: "🎉 簽到成功！", streak: streak, todayStr: todayStr })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "找不到此帳號！" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 15. AI 步驟拆解
    if (action === "aiDecompose") {
      var result = decomposeTaskWithAI(data.title);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // 16. 今日敏捷先鋒榜（依今日任務達成率排行）
    if (action === "getLeaderboard") {
      var rows = sheet.getDataRange().getValues();
      var todayStr = getTodayDateStr();
      var reqAcc = cleanStr(data.account);
      var stats = {}; // account -> { total: 0, completed: 0 }

      // 建立 account -> nickname 映射表
      var uRows = userSheet.getDataRange().getValues();
      var nickMap = {};
      for (var u = 1; u < uRows.length; u++) {
        var uAcc = cleanStr(uRows[u][0]);
        var uNick = cleanStr(uRows[u][7]);
        if (uNick) nickMap[uAcc] = uNick;
      }

      for (var i = 1; i < rows.length; i++) {
        var acc = cleanStr(rows[i][1]);
        if (!acc) continue;
        var tag = String(rows[i][3] || "");
        var dDate = safeReadDate(rows[i][6]);
        var status = String(rows[i][7] || "active");

        var isRoutine = (rows[i][11] == 1 || rows[i][11] === true || rows[i][11] === "1" || tag.indexOf("例行") !== -1);
        var isTodayTask = (dDate === todayStr) || isRoutine;
        if (isTodayTask) {
          if (!stats[acc]) {
            stats[acc] = { total: 0, completed: 0 };
          }
          stats[acc].total++;
          if (status === "completed") {
            stats[acc].completed++;
          }
        }
      }

      var rankings = [];
      for (var user in stats) {
        if (stats[user].total > 0) {
          var rate = Math.round((stats[user].completed / stats[user].total) * 100);
          var isMe = (reqAcc && user === reqAcc) ? true : false;
          // 後端脫敏：若為信箱則自動去除網域（僅保留前綴），杜絕完整信箱洩漏
          var safeAccount = user;
          if (safeAccount.indexOf("@") !== -1) {
            safeAccount = safeAccount.split("@")[0];
          }
          rankings.push({
            account: safeAccount,
            isMe: isMe,
            nickname: nickMap[user] || "",
            rate: rate,
            completed: stats[user].completed,
            total: stats[user].total
          });
        }
      }

      // 排序：完成率高的在前；完成率相同時，完成件數多的在前
      rankings.sort(function(a, b) {
        if (b.rate !== a.rate) return b.rate - a.rate;
        return b.completed - a.completed;
      });

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        rankings: rankings
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 17. 自訂顯示暱稱
    if (action === "updateNickname") {
      var uRows = userSheet.getDataRange().getValues();
      var reqAcc = cleanStr(data.account);
      var newNick = cleanStr(data.nickname);
      for (var u = 1; u < uRows.length; u++) {
        if (cleanStr(uRows[u][0]) === reqAcc) {
          userSheet.getRange(u + 1, 8).setValue("'" + newNick);
          return ContentService.createTextOutput(JSON.stringify({ success: true, nickname: newNick })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "查無此使用者" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 18. 重設展示乾淨資料（清理測試髒資料並還原示範任務）
    if (action === "resetDemoAccount") {
      var reqAcc = cleanStr(data.account);
      if (!reqAcc) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "請指定帳號" })).setMimeType(ContentService.MimeType.JSON);
      }

      // 1. 清理 Tasks 表中該帳號的所有歷史與測試卡片（由後往前刪避免索引偏移）
      var rows = sheet.getDataRange().getValues();
      for (var i = rows.length - 1; i >= 1; i--) {
        if (cleanStr(rows[i][1]) === reqAcc) {
          sheet.deleteRow(i + 1);
        }
      }

      // 2. 清理 Users 表中的暱稱與打卡紀錄
      var uRows = userSheet.getDataRange().getValues();
      for (var u = 1; u < uRows.length; u++) {
        if (cleanStr(uRows[u][0]) === reqAcc) {
          userSheet.getRange(u + 1, 8).setValue(""); // 清空暱稱
          userSheet.getRange(u + 1, 7).setValue(0);  // 重設打卡 Streak
          break;
        }
      }

      // 3. 植入 3 筆精緻且標準的示範任務
      var todayStr = getTodayDateStr();
      var nowTime = new Date().getTime();
      
      var demo1Id = "task_" + nowTime + "_1";
      var demo1Steps = JSON.stringify([
        { step: "彙整專案架構需求", done: true },
        { step: "繪製系統流程與資料庫模型", done: false },
        { step: "撰寫期末驗收展示簡報", done: false }
      ]);
      sheet.appendRow([demo1Id, "'" + reqAcc, "完成敏捷專案架構規劃", "🧠 深度專注", "🔴 緊急", demo1Steps, "'" + todayStr, "active", 2, 1, 1, 0]);

      var demo2Id = "task_" + nowTime + "_2";
      sheet.appendRow([demo2Id, "'" + reqAcc, "晨間專案站會與進度檢視", "⚡️ 碎片 (<15m)", "🟡 一般", "[]", "'" + todayStr, "active", 1, 1, 0, 1]);

      var demo3Id = "task_" + nowTime + "_3";
      sheet.appendRow([demo3Id, "'" + reqAcc, "團隊期末成果慶祝聚餐", "☕️ 生活/社交", "🟢 輕鬆", "[]", "'" + todayStr, "active", 1, 1, 0, 0]);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        msg: "✨ 已成功重設為乾淨展示帳號！"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, msg: "未知操作 (action: " + action + ")" })).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (hasLock) {
      try {
        lock.releaseLock();
      } catch(e) {}
    }
  }
}

// ==========================================
// 🧠 AI 自動拆解核心函式 (多模型輪詢備援 + 壅塞重試 + 智慧兜底)
// ==========================================
function decomposeTaskWithAI(title) {
  var targetTitle = String(title || "").trim();
  if (!targetTitle) {
    return { success: false, msg: "任務名稱不能為空" };
  }

  // 🔑 自動從指令碼屬性中讀取你設定的 Key
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty("GEMINI_API_KEY") 
            || props.getProperty("AI_API_KEY") 
            || props.getProperty("API_KEY")
            || props.getProperty("OPENAI_API_KEY");

  if (!apiKey) {
    return { success: false, msg: "未找到 API Key！請至「專案設定 ➔ 指令碼屬性」確認已新增 GEMINI_API_KEY" };
  }

  try {
    var steps = [];

    // 【情況 A】OpenAI (sk- 開頭)
    if (apiKey.indexOf("sk-") === 0) {
      var url = "https://api.openai.com/v1/chat/completions";
      var payload = {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "你是一位敏捷工作法專家。請針對目標拆解出 4 個具體、循序漸進的繁體中文行動步驟。請務必完全使用台灣習慣之繁體中文，不得使用英文。直接輸出純 JSON 字串陣列，格式如：[\"步驟一\", \"步驟二\", \"步驟三\", \"步驟四\"]，不要有 Markdown 或任何其他文字。"
          },
          { role: "user", content: "目標：" + targetTitle }
        ],
        temperature: 0.3
      };
      var resp = UrlFetchApp.fetch(url, {
        method: "post",
        headers: { "Authorization": "Bearer " + apiKey },
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      var resJson = JSON.parse(resp.getContentText());
      if (resJson.choices && resJson.choices[0] && resJson.choices[0].message) {
        steps = parseStepsFromAI(resJson.choices[0].message.content);
      } else {
        return { success: false, msg: "OpenAI 回傳異常：" + (resJson.error ? resJson.error.message : resp.getContentText()) };
      }
    } 
    // 【情況 B】Google Gemini API (多模型輪詢 + 壅塞重試)
    else {
      var prompt = "你是一位敏捷工作法與任務拆解專家。請針對目標「" + targetTitle + "」，拆解出恰好 4 個具體、循序漸進且可執行的繁體中文行動步驟。\n" +
                   "【嚴格要求】：\n" +
                   "1. 必須 100% 使用台灣習慣之繁體中文，嚴禁出現英文或簡體字。\n" +
                   "2. 每個步驟字數約 8 到 18 字，動詞開頭，目標明確。\n" +
                   "3. 必須直接回傳純 JSON 字串陣列，格式如下：\n" +
                   "[\"步驟一內容\", \"步驟二內容\", \"步驟三內容\", \"步驟四內容\"]";

      var payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000,
          responseMimeType: "application/json"
        }
      };

      // 備援模型清單：優先使用官方現役最穩定之 flash 與 pro 模型
      var candidateModels = [
        "gemini-1.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-pro"
      ];

      var lastError = "";

      for (var m = 0; m < candidateModels.length; m++) {
        var cleanModel = candidateModels[m];
        var url = "https://generativelanguage.googleapis.com/v1beta/models/" + cleanModel + ":generateContent?key=" + apiKey;

        // 每個模型最多嘗試 2 次（遇 503 暫時壅塞等待 1.5 秒重試）
        for (var attempt = 1; attempt <= 2; attempt++) {
          var resp = UrlFetchApp.fetch(url, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
          });

          var statusCode = resp.getResponseCode();
          var resText = resp.getContentText();
          Logger.log("嘗試模型: " + cleanModel + " (第 " + attempt + " 次, HTTP " + statusCode + ")");

          try {
            var resJson = JSON.parse(resText);
            if (resJson.candidates && resJson.candidates[0] && resJson.candidates[0].content && resJson.candidates[0].content.parts && resJson.candidates[0].content.parts[0]) {
              var rawText = resJson.candidates[0].content.parts[0].text;
              steps = parseStepsFromAI(rawText);
              if (steps.length > 0) {
                break; // 成功解析出步驟！
              }
            } else {
              lastError = resJson.error ? resJson.error.message : resText;
            }
          } catch(e) {
            lastError = resText;
          }

          // 若為高峰壅塞（503 或 high demand），等待 1.5 秒後重試一次
          if (steps.length === 0 && (statusCode === 503 || (lastError && lastError.indexOf("high demand") !== -1))) {
            if (attempt === 1) {
              Utilities.sleep(1500);
              continue;
            }
          }

          // 其他錯誤（如模型不再支援），直接跳到下一個候選模型
          break;
        }

        if (steps.length > 0) {
          break; // 成功！跳出模型輪詢
        }
      }

      // 若 Google 官方全線繁忙壅塞，啟動智慧情境備援引擎，確保前端操作 100% 成功
      if (steps.length === 0) {
        steps = generateSmartFallbackSteps(targetTitle);
        if (steps && steps.length > 0) {
          return { success: true, steps: steps, note: "AI 伺服器尖峰繁忙，已啟用智慧備援拆解" };
        }
        return { success: false, msg: "Gemini 異常：" + lastError };
      }
    }

    if (steps && steps.length > 0) {
      return { success: true, steps: steps.slice(0, 4) };
    } else {
      return { success: false, msg: "無法解析 AI 回傳的步驟內容" };
    }

  } catch (err) {
    return { success: false, msg: "連線異常：" + err.toString() };
  }
}

// 輔助函式：強韌清理單一步驟（去除引號、括號、序號、冒號標籤）
function cleanSingleStep(s) {
  if (!s) return "";
  var str = String(s).trim();
  str = str.replace(/^["'\[\]\{\}]+/, "");
  str = str.replace(/^[0-9]+[\.\、\-\s\:\：]+/, "");
  str = str.replace(/^(步驟|階段|step|option)\s*[0-9一二三四A-Za-z]*[\.\、\-\s\:\：]*/i, "");
  str = str.replace(/^[\:\：\-\*\•\s]+/, "");
  str = str.replace(/["'\,]+$/, "");
  str = str.replace(/[\[\]\{\}]+$/, "");
  return str.trim();
}

// 輔助函式：多層級容錯解析 AI 回傳內容
function parseStepsFromAI(rawText) {
  if (!rawText) return [];
  var cleaned = String(rawText).replace(/```json/gi, "").replace(/```/g, "").trim();

  // 嘗試 1：標準 JSON 解析
  try {
    var parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      var r1 = parsed.map(cleanSingleStep).filter(Boolean);
      if (r1.length > 0) return r1;
    }
    if (typeof parsed === "object" && parsed !== null) {
      if (Array.isArray(parsed.steps)) {
        var r2 = parsed.steps.map(cleanSingleStep).filter(Boolean);
        if (r2.length > 0) return r2;
      }
      var values = Object.values(parsed);
      var r3 = values.map(cleanSingleStep).filter(Boolean);
      if (r3.length > 0) return r3;
    }
  } catch (e) {}

  // 嘗試 2：尋找完整陣列 [...]
  var arrMatch = cleaned.match(/\[[\s\S]*?\]/);
  if (arrMatch) {
    try {
      var arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr) && arr.length > 0) {
        var r4 = arr.map(cleanSingleStep).filter(Boolean);
        if (r4.length > 0) return r4;
      }
    } catch (e) {}
  }

  // 嘗試 3：即使 JSON 未閉合（被截斷），擷取所有雙引號中的內容
  var quotedMatches = cleaned.match(/"([^"\n\r]{2,80})"/g);
  if (quotedMatches && quotedMatches.length > 0) {
    var extracted = quotedMatches.map(cleanSingleStep).filter(function(s) {
      return s.length >= 2 && s.indexOf("steps") === -1 && s.indexOf("title") === -1;
    });
    if (extracted.length >= 2) return extracted;
  }

  // 嘗試 4：逐行過濾
  return cleaned.split("\n")
    .map(cleanSingleStep)
    .filter(function(s) {
      if (!s || s.length < 2) return false;
      var lower = s.toLowerCase();
      if (lower.indexOf("option") !== -1 || lower.indexOf("steps") !== -1) return false;
      return true;
    });
}

// 輔助函式：智慧情境拆解引擎（Google API 全線尖峰壅塞時的完美兜底）
function generateSmartFallbackSteps(title) {
  var t = String(title || "").trim();
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

// 🧪 測試用函式
function testAIDecompose() {
  var res = decomposeTaskWithAI("專案上台報告");
  Logger.log("拆解結果：" + JSON.stringify(res, null, 2));
}
