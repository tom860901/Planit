import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPasswordNode, isValidEmail } from './helpers.js';

describe('🔐 密碼安全雜湊與信箱驗證單元測試', () => {

  test('hashPasswordNode 應輸出標準長度 64 碼之 SHA-256 16進位雜湊字串', () => {
    const rawPwd = 'mypassword123!';
    const hash = hashPasswordNode(rawPwd);

    // 長度必須為 64
    assert.equal(hash.length, 64);
    // 必須為純 16 進位字元
    assert.match(hash, /^[0-9a-f]{64}$/);

    // 確定性（同一密碼計算結果必相同）
    assert.equal(hashPasswordNode(rawPwd), hash);

    // 差異性（不同密碼計算結果不同）
    assert.notEqual(hashPasswordNode('anotherPassword'), hash);
  });

  test('isValidEmail 應精確檢驗註冊救援信箱格式', () => {
    // 正確格式
    assert.equal(isValidEmail('tom860901@gmail.com'), true);
    assert.equal(isValidEmail('user.name+tag@sub.domain.org'), true);

    // 不合規格式
    assert.equal(isValidEmail('plainaddress'), false);
    assert.equal(isValidEmail('missingatsign.com'), false);
    assert.equal(isValidEmail('missingdomain@.com'), false);
    assert.equal(isValidEmail('has space@gmail.com'), false);
    assert.equal(isValidEmail(''), false);
    assert.equal(isValidEmail(null), false);
  });

});
