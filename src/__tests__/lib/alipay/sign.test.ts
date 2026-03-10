import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { generateSign, verifySign } from '@/lib/alipay/sign';

// 生成测试用 RSA 密钥对
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// 提取裸 base64（去掉 PEM 头尾）
const barePrivateKey = privateKey
  .replace(/-----BEGIN PRIVATE KEY-----/, '')
  .replace(/-----END PRIVATE KEY-----/, '')
  .replace(/\n/g, '');
const barePublicKey = publicKey
  .replace(/-----BEGIN PUBLIC KEY-----/, '')
  .replace(/-----END PUBLIC KEY-----/, '')
  .replace(/\n/g, '');

describe('Alipay RSA2 Sign', () => {
  const testParams: Record<string, string> = {
    app_id: '2021000000000000',
    method: 'alipay.trade.page.pay',
    charset: 'utf-8',
    timestamp: '2026-03-05 12:00:00',
    version: '1.0',
    biz_content: '{"out_trade_no":"order-001","total_amount":"100.00"}',
  };

  describe('generateSign', () => {
    it('should generate a valid RSA2 signature', () => {
      const sign = generateSign(testParams, privateKey);
      expect(sign).toBeTruthy();
      expect(typeof sign).toBe('string');
      expect(() => Buffer.from(sign, 'base64')).not.toThrow();
    });

    it('should produce consistent signatures for same input', () => {
      const sign1 = generateSign(testParams, privateKey);
      const sign2 = generateSign(testParams, privateKey);
      expect(sign1).toBe(sign2);
    });

    it('should filter out sign field but keep sign_type in request signing', () => {
      const paramsWithSign = { ...testParams, sign: 'old_sign' };
      const sign1 = generateSign(testParams, privateKey);
      const sign2 = generateSign(paramsWithSign, privateKey);
      expect(sign1).toBe(sign2);

      const paramsWithSignType = { ...testParams, sign_type: 'RSA2' };
      const sign3 = generateSign(paramsWithSignType, privateKey);
      expect(sign3).not.toBe(sign1);
    });

    it('should filter out empty values', () => {
      const paramsWithEmpty = { ...testParams, empty_field: '' };
      const sign1 = generateSign(testParams, privateKey);
      const sign2 = generateSign(paramsWithEmpty, privateKey);
      expect(sign1).toBe(sign2);
    });

    it('should sort parameters alphabetically', () => {
      const reversed: Record<string, string> = {};
      const keys = Object.keys(testParams).reverse();
      for (const key of keys) {
        reversed[key] = testParams[key];
      }
      const sign1 = generateSign(testParams, privateKey);
      const sign2 = generateSign(reversed, privateKey);
      expect(sign1).toBe(sign2);
    });
  });

  describe('verifySign', () => {
    it('should verify a valid signature', () => {
      const sign = generateSign(testParams, privateKey);
      const valid = verifySign(testParams, publicKey, sign);
      expect(valid).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const valid = verifySign(testParams, publicKey, 'invalid_base64_signature');
      expect(valid).toBe(false);
    });

    it('should reject tampered params', () => {
      const sign = generateSign(testParams, privateKey);
      const tampered = { ...testParams, total_amount: '999.99' };
      const valid = verifySign(tampered, publicKey, sign);
      expect(valid).toBe(false);
    });
  });

  describe('PEM auto-formatting', () => {
    it('should work with bare base64 private key (no PEM headers)', () => {
      const sign = generateSign(testParams, barePrivateKey);
      const valid = verifySign(testParams, publicKey, sign);
      expect(valid).toBe(true);
    });

    it('should work with bare base64 public key (no PEM headers)', () => {
      const sign = generateSign(testParams, privateKey);
      const valid = verifySign(testParams, barePublicKey, sign);
      expect(valid).toBe(true);
    });

    it('should work with both bare keys', () => {
      const sign = generateSign(testParams, barePrivateKey);
      const valid = verifySign(testParams, barePublicKey, sign);
      expect(valid).toBe(true);
    });

    it('should work with private key using literal \\n escapes', () => {
      const escapedPrivateKey = privateKey.replace(/\n/g, '\\n');
      const sign = generateSign(testParams, escapedPrivateKey);
      const valid = verifySign(testParams, publicKey, sign);
      expect(valid).toBe(true);
    });

    it('should work with public key using literal \\n escapes', () => {
      const escapedPublicKey = publicKey.replace(/\n/g, '\\n');
      const sign = generateSign(testParams, privateKey);
      const valid = verifySign(testParams, escapedPublicKey, sign);
      expect(valid).toBe(true);
    });

    it('should work with CRLF-formatted PEM keys', () => {
      const crlfPrivateKey = privateKey.replace(/\n/g, '\r\n');
      const crlfPublicKey = publicKey.replace(/\n/g, '\r\n');
      const sign = generateSign(testParams, crlfPrivateKey);
      const valid = verifySign(testParams, crlfPublicKey, sign);
      expect(valid).toBe(true);
    });

    it('should work with literal \\r\\n escapes in PEM keys', () => {
      const escapedCrlfPrivateKey = privateKey.replace(/\n/g, '\\r\\n');
      const escapedCrlfPublicKey = publicKey.replace(/\n/g, '\\r\\n');
      const sign = generateSign(testParams, escapedCrlfPrivateKey);
      const valid = verifySign(testParams, escapedCrlfPublicKey, sign);
      expect(valid).toBe(true);
    });
  });
});
