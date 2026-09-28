/* ============================================================
   js/api.js — GAS 通訊層
   唯一職責：封裝所有對 Google Apps Script 的 fetch 請求
   ============================================================ */

/**
 * 呼叫 Google Apps Script Web App API
 * @param {Object} payload  - 要傳送的 JSON Payload
 * @param {Function} callback  - 成功回調 (data) => {}
 * @param {Function} onError   - 失敗回調 (errorMsg) => {}
 */
function callGASAPI(payload, callback, onError, timeoutMs) {
  // AI 拆解通常需大模型思考，給予 45 秒超時彈性；一般操作 25 秒
  const effectiveTimeout = timeoutMs || (payload && payload.action === 'aiDecompose' ? 45000 : 25000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    signal: controller.signal
  })
  .then(res => {
    clearTimeout(timeoutId);
    return res.text();
  })
  .then(text => {
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      if (text && text.indexOf("Planit API is online") !== -1) {
        console.warn("GAS Web App 轉向並回傳 doGet 狀態:", text);
        if (onError) onError("服務短暫轉向，請重試");
        return;
      }
      console.warn("GAS 回傳非 JSON 文字回應:", text);
      throw parseErr;
    }
    if (callback) callback(data);
  })
  .catch(err => {
    clearTimeout(timeoutId);
    console.error("API 連線異常:", err);
    const errorMsg = err.name === 'AbortError'
      ? (payload && payload.action === 'aiDecompose'
          ? "AI 拆解連線逾時（伺服器回應較慢），請再試一次！"
          : "連線逾時，請檢查網路或 GAS 權限")
      : "無法連線至雲端服務";
    if (onError) onError(errorMsg);
  });
}
