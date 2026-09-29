import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cleanStr, maskEmailForPrivacy, getAIDecomposeFallback } from './helpers.js';

describe('☁️ 後端字串處理、隱私脫敏與 AI 拆解規則單元測試', () => {

  test('cleanStr 應正確去除 Google Sheets 單引號前綴與兩端空白', () => {
    assert.equal(cleanStr("'2026-09-29"), "2026-09-29");
    assert.equal(cleanStr("  'tom860901  "), "tom860901");
    assert.equal(cleanStr(null), "");
    assert.equal(cleanStr(undefined), "");
    assert.equal(cleanStr(123), "123");
  });

  test('maskEmailForPrivacy 應精確脫敏信箱且不洩露使用者完整帳號', () => {
    // 一般信箱：僅保留前 2 碼其餘打星號
    assert.equal(maskEmailForPrivacy('tom860901@gmail.com'), 'to***@gmail.com');
    assert.equal(maskEmailForPrivacy('alice_smith@school.edu.tw'), 'al***@school.edu.tw');

    // 較短前綴
    assert.equal(maskEmailForPrivacy('me@test.com'), 'me***@test.com');

    // 非信箱帳號原樣返回
    assert.equal(maskEmailForPrivacy('user123'), 'user123');
  });

  test('getAIDecomposeFallback 應精準區分「書面報告」與「口頭簡報」備援拆解', () => {
    // 1. 書面報告情境：不得產出「製作投影片」或「彩排上台」
    const paperReportSteps = getAIDecomposeFallback('完成敏捷專案期末報告');
    assert.equal(paperReportSteps.some(s => s.includes('投影片')), false, '書面報告不應包含投影片');
    assert.equal(paperReportSteps.some(s => s.includes('上台') || s.includes('彩排')), false, '書面報告不應包含上台彩排');
    assert.equal(paperReportSteps.some(s => s.includes('文獻') || s.includes('資料')), true, '書面報告應包含資料蒐集');
    assert.equal(paperReportSteps.some(s => s.includes('撰寫') || s.includes('內文')), true, '書面報告應包含內文撰寫');

    // 2. 口頭簡報發表情境：應產出投影片與彩排
    const presentationSteps = getAIDecomposeFallback('期末成果上台簡報發表');
    assert.equal(presentationSteps.some(s => s.includes('投影片') || s.includes('簡報')), true, '口頭發表應包含投影片');
    assert.equal(presentationSteps.some(s => s.includes('彩排') || s.includes('發表')), true, '口頭發表應包含彩排與發表');

    // 3. 讀書考試情境
    const studySteps = getAIDecomposeFallback('複習軟體工程期末考');
    assert.equal(studySteps.some(s => s.includes('章節') || s.includes('進度')), true);
    assert.equal(studySteps.some(s => s.includes('筆記') || s.includes('題目')), true);
  });

});
