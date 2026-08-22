import { describe, it, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';
import { db, hashPassword } from '../server/db.ts';
import Database from 'better-sqlite3';

beforeAll(() => { getApp(); });

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

describe('Batch 2 auth parity: emailVerified + email-or-username login + scoped grandfather', () => {
  it('RED/GREEN: register → login before verify → 403, after verify → 200', async () => {
    const username = uniq('ap');
    const email = `${username}@x.com`;
    const password = 'Str0ngpw1';
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password, email, displayName: 'AP User'
    });
    assert.equal(reg.status, 200, `register failed: ${JSON.stringify(reg.body)}`);
    const otp = reg.body._debugOtp;
    assert.ok(otp, 'register should echo _debugOtp in test');

    const beforeVerify = await request(getApp()).post('/api/auth/login', {
      username, password
    });
    assert.equal(beforeVerify.status, 403, `login before verify should be 403, got ${beforeVerify.status} ${JSON.stringify(beforeVerify.body)}`);

    const verify = await request(getApp()).post('/api/auth/verify-email', { email, otp });
    assert.equal(verify.status, 200);

    const afterVerify = await request(getApp()).post('/api/auth/login', {
      username, password
    });
    assert.equal(afterVerify.status, 200);
    assert.equal(afterVerify.body.user.id, reg.body.user.id);
  });

  it('login accepts email as identifier (case-insensitive)', async () => {
    const username = uniq('apemail');
    const email = `${username}@x.com`;
    const password = 'Str0ngpw1';
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password, email, displayName: 'AP Email'
    });
    assert.equal(reg.status, 200);
    const otp = reg.body._debugOtp;
    await request(getApp()).post('/api/auth/verify-email', { email, otp });

    const byEmail = await request(getApp()).post('/api/auth/login', {
      username: email.toUpperCase(), password
    });
    assert.equal(byEmail.status, 200, `login by email should succeed: ${JSON.stringify(byEmail.body)}`);

    const byUsernameUpper = await request(getApp()).post('/api/auth/login', {
      username: username.toUpperCase(), password
    });
    assert.equal(byUsernameUpper.status, 200);
  });

  it('grandfather: legacy row (createdAt=0, emailVerified=false) becomes verified after scoped UPDATE; new row stays unverified', async () => {
    const tmpFile = process.env.DB_FILE!;
    // Insert a legacy unverified row (createdAt=0)
    const legacyId = uniq('legacy');
    db.saveUser({
      id: legacyId,
      username: legacyId,
      email: `${legacyId}@x.com`,
      passwordHash: hashPassword('Str0ngpw1'),
      displayName: 'Legacy',
      avatar: 'a',
      role: 'user',
      emailVerified: false,
      createdAt: 0,
      otp: undefined,
      otpExpires: undefined,
    });
    const legacyBefore = db.getUser(legacyId)!;
    assert.equal(legacyBefore.emailVerified, false);
    assert.equal(legacyBefore.createdAt, 0);

    // Insert a new unverified row (createdAt !=0)
    const newId = uniq('newuser');
    db.saveUser({
      id: newId,
      username: newId,
      email: `${newId}@x.com`,
      passwordHash: hashPassword('Str0ngpw1'),
      displayName: 'New',
      avatar: 'a',
      role: 'user',
      emailVerified: false,
      createdAt: Date.now(),
    });
    const newBefore = db.getUser(newId)!;
    assert.equal(newBefore.emailVerified, false);

    // Simulate boot grandfather UPDATE (scoped)
    const raw = new Database(tmpFile);
    try {
      raw.exec(`UPDATE users SET email_verified = 1 WHERE email_verified = 0 AND created_at = 0;`);
    } finally {
      raw.close();
    }

    const legacyAfter = db.getUser(legacyId)!;
    assert.equal(legacyAfter.emailVerified, true, 'legacy row should be grandfathered to verified');

    const newAfter = db.getUser(newId)!;
    assert.equal(newAfter.emailVerified, false, 'new unverified row must stay unverified after scoped UPDATE');

    // Login for legacy should now succeed (verified), new should be 403
    const legacyLogin = await request(getApp()).post('/api/auth/login', {
      username: legacyId, password: 'Str0ngpw1'
    });
    assert.equal(legacyLogin.status, 200);

    const newLogin = await request(getApp()).post('/api/auth/login', {
      username: newId, password: 'Str0ngpw1'
    });
    assert.equal(newLogin.status, 403);
  });

  it('handleRegister persists emailVerified=false and createdAt', async () => {
    const username = uniq('apmeta');
    const email = `${username}@x.com`;
    const before = Date.now();
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'Meta'
    });
    assert.equal(reg.status, 200);
    const u = db.getUser(reg.body.user.id)!;
    assert.equal(u.emailVerified, false);
    assert.ok((u.createdAt ?? 0) >= before, `createdAt should be set, got ${u.createdAt}`);
  });

  it('handleVerifyEmail flips emailVerified to true', async () => {
    const username = uniq('apflip');
    const email = `${username}@x.com`;
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'Flip'
    });
    assert.equal(reg.status, 200);
    const otp = reg.body._debugOtp;
    const before = db.getUser(reg.body.user.id)!;
    assert.equal(before.emailVerified, false);
    const v = await request(getApp()).post('/api/auth/verify-email', { email, otp });
    assert.equal(v.status, 200);
    const after = db.getUser(reg.body.user.id)!;
    assert.equal(after.emailVerified, true);
  });
});
