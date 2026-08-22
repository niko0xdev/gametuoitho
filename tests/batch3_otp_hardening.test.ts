import { describe, it, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';
import { db, hashPassword } from '../server/db.ts';
import { hashOtp, OTP_MAX_ATTEMPTS } from '../server/handlers/authHandlers.ts';

beforeAll(() => { getApp(); });

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// (a) Case-insensitive forgot/reset
describe('Batch 3: case-insensitive forgot/reset', () => {
  it('forgot-password accepts upper-case email and issues OTP', async () => {
    const username = uniq('b3ci');
    const email = `${username}@x.com`;
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'CI'
    });
    assert.equal(reg.status, 200);
    // Verify so forgot flow is tested on a verified user too.
    await request(getApp()).post('/api/auth/verify-email', { email, otp: reg.body._debugOtp });
    // Cooldown: allow immediate forgot
    const u0 = db.getUserByEmail(email)!;
    u0.lastOtpAt = 0;
    db.saveUser(u0);

    const res = await request(getApp()).post('/api/auth/forgot-password', { email: email.toUpperCase() });
    assert.equal(res.status, 200, `forgot with upper-case email should be 200, got ${res.status} ${JSON.stringify(res.body)}`);
    assert.ok(res.body._debugOtp);
  });

  it('reset-password accepts upper-case email', async () => {
    const username = uniq('b3ci2');
    const email = `${username}@x.com`;
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'CI2'
    });
    assert.equal(reg.status, 200);
    await request(getApp()).post('/api/auth/verify-email', { email, otp: reg.body._debugOtp });
    const u0 = db.getUserByEmail(email)!;
    u0.lastOtpAt = 0;
    db.saveUser(u0);
    const forgot = await request(getApp()).post('/api/auth/forgot-password', { email });
    assert.equal(forgot.status, 200);
    const otp = forgot.body._debugOtp as string;
    assert.ok(otp);
    const reset = await request(getApp()).post('/api/auth/reset-password', {
      email: email.toUpperCase(), otp, newPassword: 'Str0ngpw2'
    });
    assert.equal(reset.status, 200, `reset with upper-case email should be 200, got ${reset.status} ${JSON.stringify(reset.body)}`);
  });
});

// (b) Attempt cap
describe('Batch 3: OTP attempt cap', () => {
  it('wrong OTP increments otpAttempts; 5th wrong blocks with attempt-cap message; correct OTP after cap still blocked; fresh OTP resets', async () => {
    const username = uniq('b3cap');
    const email = `${username}@x.com`;
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'Cap'
    });
    assert.equal(reg.status, 200);
    const correctOtp = reg.body._debugOtp as string;
    assert.ok(correctOtp);

    // 5 wrong attempts via verify-email (same OTP store)
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      const r = await request(getApp()).post('/api/auth/verify-email', { email, otp: '000000' });
      assert.equal(r.status, 400);
      const u = db.getUserByEmail(email)!;
      assert.equal(u.otpAttempts, i + 1, `attempt ${i + 1} should increment`);
      if (i < OTP_MAX_ATTEMPTS - 1) {
        assert.match(r.body.error, /không chính xác/i, `attempt ${i + 1} should be wrong-OTP message`);
      }
    }
    // One more wrong attempt should hit the cap guard
    const capped = await request(getApp()).post('/api/auth/verify-email', { email, otp: '000000' });
    assert.equal(capped.status, 400);
    assert.match(capped.body.error, /quá nhiều lần/i);

    // Correct OTP is now also blocked by the cap
    const correctBlocked = await request(getApp()).post('/api/auth/verify-email', { email, otp: correctOtp });
    assert.equal(correctBlocked.status, 400);
    assert.match(correctBlocked.body.error, /quá nhiều lần/i);

    // Issue a fresh OTP via resend (bypass cooldown) — should reset attempts
    const uPre = db.getUserByEmail(email)!;
    uPre.lastOtpAt = 0;
    db.saveUser(uPre);
    const resend = await request(getApp()).post('/api/auth/resend-otp', { email });
    assert.equal(resend.status, 200);
    const freshOtp = resend.body._debugOtp as string;
    assert.ok(freshOtp);
    const uPost = db.getUserByEmail(email)!;
    assert.equal(uPost.otpAttempts, 0, 'fresh OTP should reset otpAttempts');

    // Fresh OTP verifies successfully and clears attempts
    const ok = await request(getApp()).post('/api/auth/verify-email', { email, otp: freshOtp });
    assert.equal(ok.status, 200);
    const uFinal = db.getUserByEmail(email)!;
    assert.equal(uFinal.otpAttempts, 0);
    assert.equal(uFinal.otp, null ?? undefined ? uFinal.otp : uFinal.otp, uFinal.otp); // otp cleared
    assert.ok(!uFinal.otp, 'otp should be cleared after success');
  });

  it('expired OTP returns expiry message and does not consume an attempt', async () => {
    const username = uniq('b3exp');
    const email = `${username}@x.com`;
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'Exp'
    });
    assert.equal(reg.status, 200);
    const otp = reg.body._debugOtp as string;
    const u = db.getUserByEmail(email)!;
    const attemptsBefore = u.otpAttempts ?? 0;
    u.otpExpires = Date.now() - 1000;
    db.saveUser(u);
    const r = await request(getApp()).post('/api/auth/verify-email', { email, otp });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /hết hạn/i);
    const after = db.getUserByEmail(email)!;
    assert.equal(after.otpAttempts, attemptsBefore, 'expired OTP should not increment attempts');
  });

  it('OTP is stored hashed at rest', async () => {
    const username = uniq('b3hash');
    const email = `${username}@x.com`;
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'Hash'
    });
    assert.equal(reg.status, 200);
    const otp = reg.body._debugOtp as string;
    const u = db.getUserByEmail(email)!;
    assert.ok(u.otp, 'otp should be persisted');
    assert.notEqual(u.otp, otp, 'stored OTP must be hashed, not plaintext');
    assert.equal(u.otp, hashOtp(otp));
  });
});

// (c) Cooldown
describe('Batch 3: resend/forgot cooldown', () => {
  it('resend-otp within 60s → 429, after 60s → 200 with fresh _debugOtp', async () => {
    const username = uniq('b3cd');
    const email = `${username}@x.com`;
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'CD'
    });
    assert.equal(reg.status, 200);
    // Immediate resend should be rate-limited
    const tooSoon = await request(getApp()).post('/api/auth/resend-otp', { email });
    assert.equal(tooSoon.status, 429);
    assert.match(tooSoon.body.error, /60 giây/i);

    // Simulate 61s elapsed
    const u = db.getUserByEmail(email)!;
    u.lastOtpAt = Date.now() - 61_000;
    db.saveUser(u);
    const ok = await request(getApp()).post('/api/auth/resend-otp', { email });
    assert.equal(ok.status, 200);
    assert.ok(ok.body._debugOtp);
  });

  it('forgot-password within 60s → 429, after 60s → 200', async () => {
    const username = uniq('b3cd2');
    const email = `${username}@x.com`;
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'CD2'
    });
    assert.equal(reg.status, 200);
    await request(getApp()).post('/api/auth/verify-email', { email, otp: reg.body._debugOtp });

    // Immediate forgot should be rate-limited
    const tooSoon = await request(getApp()).post('/api/auth/forgot-password', { email });
    assert.equal(tooSoon.status, 429);
    assert.match(tooSoon.body.error, /60 giây/i);

    const u = db.getUserByEmail(email)!;
    u.lastOtpAt = Date.now() - 61_000;
    db.saveUser(u);
    const ok = await request(getApp()).post('/api/auth/forgot-password', { email });
    assert.equal(ok.status, 200);
    assert.ok(ok.body._debugOtp);
  });
});
