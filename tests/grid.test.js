import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCardDimension, calculateGridCols, isTaskRoutine } from './helpers.js';

describe('📐 矩陣網格防呆與循環徽章判定單元測試', () => {

  test('sanitizeCardDimension 應嚴格鉗制卡片寬高在 1~3 範圍內，防止歷史髒資料炸版', () => {
    // 合法寬高保持不變
    assert.equal(sanitizeCardDimension(1), 1);
    assert.equal(sanitizeCardDimension(2), 2);
    assert.equal(sanitizeCardDimension(3), 3);
    assert.equal(sanitizeCardDimension('2'), 2);

    // 小於 1 或 0 應自動修正為 1
    assert.equal(sanitizeCardDimension(0), 1);
    assert.equal(sanitizeCardDimension(-1), 1);

    // 大於 3（例如曾發生將 2026 年份誤寫入高寬的狀況）應自動修正為 1
    assert.equal(sanitizeCardDimension(4), 1);
    assert.equal(sanitizeCardDimension(2026), 1);

    // 非數字與空值應自動修正為 1
    assert.equal(sanitizeCardDimension('invalid'), 1);
    assert.equal(sanitizeCardDimension(null), 1);
    assert.equal(sanitizeCardDimension(undefined), 1);
  });

  test('calculateGridCols 應依容器寬度精準響應 1 / 2 / 3 欄', () => {
    // 手機版 (<= 420px) 應為單欄
    assert.equal(calculateGridCols(375), 1);
    assert.equal(calculateGridCols(420), 1);

    // 平板版 (421px ~ 640px) 應為雙欄
    assert.equal(calculateGridCols(421), 2);
    assert.equal(calculateGridCols(600), 2);
    assert.equal(calculateGridCols(640), 2);

    // 寬螢幕電腦版 (> 640px) 應為三欄
    assert.equal(calculateGridCols(641), 3);
    assert.equal(calculateGridCols(1200), 3);
  });

  test('isTaskRoutine 應同時支援方案 B 獨立屬性與舊版例行標籤向下相容', () => {
    // 方案 B：獨立 isRoutine 布林值
    const taskRoutineTrue = { title: '晨間站會', isRoutine: true, tag: '🧠 深度專注' };
    assert.equal(isTaskRoutine(taskRoutineTrue), true);

    const taskRoutineFalse = { title: '期末報告', isRoutine: false, tag: '🧠 深度專注' };
    assert.equal(isTaskRoutine(taskRoutineFalse), false);

    // 向下相容：帶有舊版「例行公事」或「每日固定任務」標籤
    const legacyTask1 = { title: '背單字', isRoutine: false, tag: '🔁 例行公事' };
    assert.equal(isTaskRoutine(legacyTask1), true);

    const legacyTask2 = { title: '運動', isRoutine: false, tag: '每日固定任務' };
    assert.equal(isTaskRoutine(legacyTask2), true);
  });

});
