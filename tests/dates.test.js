import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getLocalDateString, calculateDueDaysDiff, getRolloverDate } from './helpers.js';

describe('📅 日期與到期日計算模組單元測試', () => {

  test('getLocalDateString 應正確格式化為 YYYY-MM-DD 且月份日期補零', () => {
    const d1 = new Date(2026, 0, 5); // 2026-01-05
    assert.equal(getLocalDateString(d1), '2026-01-05');

    const d2 = new Date(2026, 11, 25); // 2026-12-25
    assert.equal(getLocalDateString(d2), '2026-12-25');
  });

  test('calculateDueDaysDiff 應準確計算逾期、今日截止與倒數天數', () => {
    const today = '2026-09-29';

    // 逾期 2 天
    assert.equal(calculateDueDaysDiff(today, '2026-09-27'), -2);

    // 今日截止 (diff === 0)
    assert.equal(calculateDueDaysDiff(today, '2026-09-29'), 0);

    // 明日到期 / 倒數 1 天 (diff === 1)
    assert.equal(calculateDueDaysDiff(today, '2026-09-30'), 1);

    // 倒數 5 天
    assert.equal(calculateDueDaysDiff(today, '2026-10-04'), 5);

    // 未填寫到期日回傳 null
    assert.equal(calculateDueDaysDiff(today, null), null);
    assert.equal(calculateDueDaysDiff(today, ''), null);
  });

  test('getRolloverDate（移到明天）應正確跨越月份與閏年邊界', () => {
    // 跨月底
    assert.equal(getRolloverDate('2026-01-31'), '2026-02-01');

    // 閏年二月底
    assert.equal(getRolloverDate('2024-02-28'), '2024-02-29');
    assert.equal(getRolloverDate('2024-02-29'), '2024-03-01');

    // 平年二月底
    assert.equal(getRolloverDate('2025-02-28'), '2025-03-01');

    // 跨年度
    assert.equal(getRolloverDate('2026-12-31'), '2027-01-01');
  });

});
