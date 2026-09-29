import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSubtaskProgress, canCompleteTask } from './helpers.js';

describe('📝 子任務 Checklist 與進度計算單元測試', () => {

  test('calculateSubtaskProgress 應精確計算完成百分比並四捨五入', () => {
    // 0 個子任務
    assert.equal(calculateSubtaskProgress([]), 0);

    // 4 個完成 1 個 (25%)
    const subtasks4_1 = [
      { step: '步驟一', done: true },
      { step: '步驟二', done: false },
      { step: '步驟三', done: false },
      { step: '步驟四', done: false }
    ];
    assert.equal(calculateSubtaskProgress(subtasks4_1), 25);

    // 3 個完成 2 個 (67%)
    const subtasks3_2 = [
      { step: 'A', done: true },
      { step: 'B', done: true },
      { step: 'C', done: false }
    ];
    assert.equal(calculateSubtaskProgress(subtasks3_2), 67);

    // 全數完成 (100%)
    const subtasksAllDone = [
      { step: 'A', done: true },
      { step: 'B', done: true }
    ];
    assert.equal(calculateSubtaskProgress(subtasksAllDone), 100);
  });

  test('canCompleteTask 應在所有子任務打勾前防呆鎖定', () => {
    // 無子任務之一般任務隨時可完成
    assert.equal(canCompleteTask([]), true);
    assert.equal(canCompleteTask(null), true);

    // 有任一子任務未打勾時禁止完成
    const incompleteList = [
      { step: '步驟一', done: true },
      { step: '步驟二', done: false }
    ];
    assert.equal(canCompleteTask(incompleteList), false);

    // 全部子任務皆已打勾時解鎖完成
    const completeList = [
      { step: '步驟一', done: true },
      { step: '步驟二', done: true }
    ];
    assert.equal(canCompleteTask(completeList), true);
  });

});
