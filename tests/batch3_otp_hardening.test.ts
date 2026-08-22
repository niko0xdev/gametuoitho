import { describe, it, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';
import { db, SQLITE_FILE } from '../server/db.ts';
import { hashOtp, OTP_MAX_ATTEMPTS } from '../server/handlers/authHandlers.ts';
import Database from 'better-sqlite3';

beforeAll(() => { getApp(); });

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function todayUtcKey(): string { return new Date().toISOString().slice(0, 10); }

function deleteTodayCounter(): void {
  const key = todayUtcKey();
  try {
    const raw = new Database(SQLITE_FILE);
    raw.exec(`DELETE FROM daily_counters WHERE date = '${key.replace(/'/g, "''")}'`);
    raw.close();
  } catch {}
}

function deleteCounter(date: string): void {
  try {
    const raw = new Database(SQLITE_FILE);
    raw.exec(`DELETE FROM daily_counters WHERE date = '${date.replace(/'/g, "''")}'`);
    raw.close();
  } catch {}
}

function readDailyCount(date = todayUtcKey()): number | undefined {
  try {
    const raw = new Database(SQLITE_FILE);
    const r = raw.prepare('SELECT otp_sends FROM daily_counters WHERE date = ?').get(date) as any;
    raw.close();
    return r?.otp_sends as number | undefined;
  } catch { return undefined; }
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

// (d) Batch 6: Express OTP daily cap parity (server/db.ts + OTP_DAILY_CAP)
describe('Batch 6: dailyCounters helper + issuance parity', () => {
  const OTHER_DAY = '2099-12-31';

  it('tryIncrementDailyOtp is atomic, cap-fenced, and uses explicit UTC date keys', () => {
    const d1 = '2099-01-02';
    const d2 = '2099-01-03';
    deleteCounter(d1);
    deleteCounter(d2);
    try {
      assert.equal(db.tryIncrementDailyOtp(d1, 2), 1);
      assert.equal(readDailyCount(d1), 1);
      assert.equal(db.tryIncrementDailyOtp(d1, 2), 2);
      assert.equal(readDailyCount(d1), 2);
      // At cap → no row
      assert.equal(db.tryIncrementDailyOtp(d1, 2), undefined);
      assert.equal(readDailyCount(d1), 2);
      // Different date is independent
      assert.equal(db.tryIncrementDailyOtp(d2, 2), 1);
      assert.equal(readDailyCount(d2), 1);
      // Raising the cap for the same d1 allows one more, which is the cap-parity contract:
      // capping is per call, not per row-creation.
      assert.equal(db.tryIncrementDailyOtp(d1, 80), 3);
      assert.equal(readDailyCount(d1), 3);
      // cap 0 never creates a row
      const d3 = '2099-01-04';
      deleteCounter(d3);
      assert.equal(db.tryIncrementDailyOtp(d3, 0), undefined);
      assert.equal(readDailyCount(d3), undefined);
    } finally {
      deleteCounter(d1);
      deleteCounter(d2);
      deleteCounter('2099-01-04');
    }
  });

  it('default UTC-day key: tryIncrementDailyOtp() uses today without explicit date', () => {
    deleteTodayCounter();
    try {
      const v = db.tryIncrementDailyOtp(undefined, 2);
      assert.equal(v, 1);
      assert.equal(readDailyCount(todayUtcKey()), 1);
    } finally {
      deleteTodayCounter();
    }
  });

  it('boundary OTP_DAILY_CAP=2: 2 issues succeed, 3rd (register) gets 429 and creates no user', async () => {
    const prev = process.env.OTP_DAILY_CAP;
    deleteTodayCounter();
    process.env.OTP_DAILY_CAP = '2';
    try {
      const mk = (s: string) => `${s}_${uniq('capR')}`;
      const u1 = mk('u'), e1 = `${u1}@x.com`;
      const r1 = await request(getApp()).post('/api/auth/register', { username: u1, password: 'Str0ngpw1', email: e1, displayName: 'R1' });
      assert.equal(r1.status, 200);
      assert.equal(readDailyCount(), 1);

      const u2 = mk('u2'), e2 = `${u2}@x.com`;
      const r2 = await request(getApp()).post('/api/auth/register', { username: u2, password: 'Str0ngpw1', email: e2, displayName: 'R2' });
      assert.equal(r2.status, 200);
      assert.equal(readDailyCount(), 2);

      const u3 = mk('u3'), e3 = `${u3}@x.com`;
      const before = readDailyCount();
      const r3 = await request(getApp()).post('/api/auth/register', { username: u3, password: 'Str0ngpw1', email: e3, displayName: 'R3' });
      assert.equal(r3.status, 429);
      assert.match(r3.body.error, /quá nhiều mã OTP/i);
      assert.equal(readDailyCount(), before, 'cap should not advance on 429');
      assert.equal(db.getUserByEmail(e3), undefined, 'over-cap register must not create a user');
      assert.equal(db.getUserByUsername(u3), undefined);
    } finally {
      if (prev === undefined) delete (process.env as any).OTP_DAILY_CAP; else process.env.OTP_DAILY_CAP = prev;
      deleteTodayCounter();
    }
  });

  it('resend-otp counts toward the same cap and 429 leaves OTP state unchanged', async () => {
    const prev = process.env.OTP_DAILY_CAP;
    deleteTodayCounter();
    process.env.OTP_DAILY_CAP = '2';
    try {
      const u = uniq('capRe');
      const email = `${u}@x.com`;
      const reg = await request(getApp()).post('/api/auth/register', { username: u, password: 'Str0ngpw1', email, displayName: 'Re' });
      assert.equal(reg.status, 200);
      assert.equal(readDailyCount(), 1);
      // bypass cooldown for the second success
      const user = db.getUserByEmail(email)!;
      user.lastOtpAt = 0;
      db.saveUser(user);
      const r1 = await request(getApp()).post('/api/auth/resend-otp', { email });
      assert.equal(r1.status, 200);
      assert.equal(readDailyCount(), 2);
      // Next resend (after cooldown) should be cap-blocked and must not mutate OTP state
      const snap = db.getUserByEmail(email)!;
      snap.lastOtpAt = 0;
      db.saveUser(snap);
      const before = db.getUserByEmail(email)!;
      const otpBefore = before.otp;
      const expBefore = before.otpExpires;
      const attBefore = before.otpAttempts;
      const lastBefore = before.lastOtpAt;
      const r2 = await request(getApp()).post('/api/auth/resend-otp', { email });
      assert.equal(r2.status, 429);
      assert.match(r2.body.error, /quá nhiều mã OTP/i);
      const after = db.getUserByEmail(email)!;
      assert.equal(after.otp, otpBefore);
      assert.equal(after.otpExpires, expBefore);
      assert.equal(after.otpAttempts, attBefore);
      assert.equal(after.lastOtpAt, lastBefore);
    } finally {
      if (prev === undefined) delete (process.env as any).OTP_DAILY_CAP; else process.env.OTP_DAILY_CAP = prev;
      deleteTodayCounter();
    }
  });

  it('forgot-password counts toward the same cap and 429 leaves OTP state unchanged', async () => {
    const prev = process.env.OTP_DAILY_CAP;
    deleteTodayCounter();
    process.env.OTP_DAILY_CAP = '2';
    try {
      const u = uniq('capFp');
      const email = `${u}@x.com`;
      const reg = await request(getApp()).post('/api/auth/register', { username: u, password: 'Str0ngpw1', email, displayName: 'Fp' });
      assert.equal(reg.status, 200);
      await request(getApp()).post('/api/auth/verify-email', { email, otp: reg.body._debugOtp });
      const holder = db.getUserByEmail(email)!;
      holder.lastOtpAt = 0;
      db.saveUser(holder);
      assert.equal(readDailyCount(), 1);
      const f1 = await request(getApp()).post('/api/auth/forgot-password', { email });
      assert.equal(f1.status, 200);
      assert.equal(readDailyCount(), 2);
      const locked = db.getUserByEmail(email)!;
      locked.lastOtpAt = 0;
      db.saveUser(locked);
      const before = db.getUserByEmail(email)!;
      const otpBefore = before.otp;
      const expBefore = before.otpExpires;
      const attBefore = before.otpAttempts;
      const lastBefore = before.lastOtpAt;
      const f2 = await request(getApp()).post('/api/auth/forgot-password', { email });
      assert.equal(f2.status, 429);
      assert.match(f2.body.error, /quá nhiều mã OTP/i);
      const after = db.getUserByEmail(email)!;
      assert.equal(after.otp, otpBefore);
      assert.equal(after.otpExpires, expBefore);
      assert.equal(after.otpAttempts, attBefore);
      assert.equal(after.lastOtpAt, lastBefore);
    } finally {
      if (prev === undefined) delete (process.env as any).OTP_DAILY_CAP; else process.env.OTP_DAILY_CAP = prev;
      deleteTodayCounter();
    }
  });

  it('invalid/duplicate/unknown/cooldown requests do not consume a slot', async () => {
    const prev = process.env.OTP_DAILY_CAP;
    deleteTodayCounter();
    process.env.OTP_DAILY_CAP = '2';
    try {
      // Seed one slot used
      const seedU = uniq('capInv0');
      const seedE = `${seedU}@x.com`;
      const seed = await request(getApp()).post('/api/auth/register', { username: seedU, password: 'Str0ngpw1', email: seedE, displayName: 'S' });
      assert.equal(seed.status, 200);
      assert.equal(readDailyCount(), 1);

      // Invalid register (missing email) → 400, no increment
      const bad = await request(getApp()).post('/api/auth/register', { username: uniq('bad'), password: 'Str0ngpw1', displayName: 'X' } as any);
      assert.equal(bad.status, 400);
      assert.equal(readDailyCount(), 1);

      // Duplicate email → 400, no increment
      const dup = await request(getApp()).post('/api/auth/register', { username: uniq('dup'), password: 'Str0ngpw1', email: seedE, displayName: 'D' });
      assert.equal(dup.status, 400);
      assert.equal(readDailyCount(), 1);

      // Cooldown-blocked resend → 429 (cooldown message), no increment
      const tooSoon = await request(getApp()).post('/api/auth/resend-otp', { email: seedE });
      assert.equal(tooSoon.status, 429);
      assert.match(tooSoon.body.error, /60 giây/i);
      assert.equal(readDailyCount(), 1);

      // Unknown forgot → 404, no increment
      const unk = await request(getApp()).post('/api/auth/forgot-password', { email: `no_${uniq('u')}@x.com` });
      assert.equal(unk.status, 404);
      assert.equal(readDailyCount(), 1);

      // Verification (not an issuance) must never consume
      const v = await request(getApp()).post('/api/auth/verify-email', { email: seedE, otp: seed.body._debugOtp });
      assert.ok([200, 400].includes(v.status));
      assert.equal(readDailyCount(), 1);
    } finally {
      if (prev === undefined) delete (process.env as any).OTP_DAILY_CAP; else process.env.OTP_DAILY_CAP = prev;
      deleteTodayCounter();
    }
  });

  it('cap 0 blocks every issuance with cap message', async () => {
    const prev = process.env.OTP_DAILY_CAP;
    deleteTodayCounter();
    process.env.OTP_DAILY_CAP = '0';
    try {
      const u = uniq('cap0');
      const e = `${u}@x.com`;
      const r = await request(getApp()).post('/api/auth/register', { username: u, password: 'Str0ngpw1', email: e, displayName: 'Z' });
      assert.equal(r.status, 429);
      assert.match(r.body.error, /quá nhiều mã OTP/i);
      assert.equal(db.getUserByEmail(e), undefined);
    } finally {
      if (prev === undefined) delete (process.env as any).OTP_DAILY_CAP; else process.env.OTP_DAILY_CAP = prev;
      deleteTodayCounter();
    }
  });

  it('reset-password (OTP consumption) does not consume a slot', async () => {
    const prev = process.env.OTP_DAILY_CAP;
    deleteTodayCounter();
    process.env.OTP_DAILY_CAP = '3';
    try {
      const u = uniq('capRst');
      const e = `${u}@x.com`;
      const reg = await request(getApp()).post('/api/auth/register', { username: u, password: 'Str0ngpw1', email: e, displayName: 'Rst' });
      assert.equal(reg.status, 200);
      await request(getApp()).post('/api/auth/verify-email', { email: e, otp: reg.body._debugOtp });
      const holder = db.getUserByEmail(e)!;
      holder.lastOtpAt = 0;
      db.saveUser(holder);
      const fp = await request(getApp()).post('/api/auth/forgot-password', { email: e });
      assert.equal(fp.status, 200);
      const before = readDailyCount();
      // wrong reset still should not consume (consumption path, not issuance)
      const bad = await request(getApp()).post('/api/auth/reset-password', { email: e, otp: '000000', newPassword: 'Str0ngpw2' });
      assert.equal(bad.status, 400);
      assert.equal(readDailyCount(), before);
      const ok = await request(getApp()).post('/api/auth/reset-password', { email: e, otp: fp.body._debugOtp, newPassword: 'Str0ngpw2' });
      assert.equal(ok.status, 200);
      assert.equal(readDailyCount(), before, 'successful reset must not consume a slot');
    } finally {
      if (prev === undefined) delete (process.env as any).OTP_DAILY_CAP; else process.env.OTP_DAILY_CAP = prev;
      deleteTodayCounter();
    }
  });

  it('isolation helper: other UTC day does not affect today', () => {
    deleteCounter(OTHER_DAY);
    try {
      assert.equal(db.tryIncrementDailyOtp(OTHER_DAY, 5), 1);
      assert.equal(readDailyCount(OTHER_DAY), 1);
      // today counter should still be whatever batch cleanup leaves; OTHER_DAY isolation is what we assert
      deleteCounter(OTHER_DAY);
      assert.equal(readDailyCount(OTHER_DAY), undefined);
    } finally {
      deleteCounter(OTHER_DAY);
    }
  });
});
