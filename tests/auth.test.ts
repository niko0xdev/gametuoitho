import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';
import { db, hashPassword } from '../server/db.ts';
import { handleLogin, handleGoogleSso, handleQuickLogin } from '../server/handlers/authHandlers.ts';

before(() => {
  getApp(); // ensure server.ts ran
});

describe('POST /api/auth/register', () => {
  it('400s on missing fields', async () => {
    const res = await request(getApp()).post('/api/auth/register', {});
    assert.equal(res.status, 400);
  });
  it('400s when username exists', async () => {
    db.saveUser({
      id: 'u_exist', username: 'nikodup', email: 'dup@x.com',
      passwordHash: 'h', displayName: 'X', avatar: 'a', role: 'user'
    });
    const res = await request(getApp()).post('/api/auth/register', {
      username: 'nikodup', password: 'Str0ngpw1', email: 'newreg1@x.com', displayName: 'Y'
    });
    assert.equal(res.status, 400);
  });
  it('400s when email exists', async () => {
    db.saveUser({
      id: 'u_em', username: 'emuser', email: 'shared@x.com',
      passwordHash: 'h', displayName: 'X', avatar: 'a', role: 'user'
    });
    const res = await request(getApp()).post('/api/auth/register', {
      username: 'newone1', password: 'Str0ngpw1', email: 'shared@x.com', displayName: 'Y'
    });
    assert.equal(res.status, 400);
  });
  it('200s and creates user+profile on success', async () => {
    const username = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const email = `${username}@x.com`;
    const res = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'NewReg'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.username, username);
    assert.ok(res.body.user.id.startsWith('user_'));
    assert.ok(db.getUserByUsername(username));
  });
  it('400s on a weak password', async () => {
    const username = `weak_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const res = await request(getApp()).post('/api/auth/register', {
      username, password: 'a1', email: `${username}@x.com`, displayName: 'W'
    });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/auth/login', () => {
  before(() => {
    db.saveUser({
      id: 'u_login', username: 'loginuser', email: 'l@x.com',
      passwordHash: hashPassword('correct'), displayName: 'L', avatar: 'a', role: 'user'
    });
    db.saveProfile({
      id: 'u_login', displayName: 'L', avatar: 'a',
      elo: { caro: 1500 } as any, honorScore: 100, badges: []
    });
  });
  it('400s on missing fields', async () => {
    const res = await request(getApp()).post('/api/auth/login', {});
    assert.equal(res.status, 400);
  });
  it('400s when user not found', async () => {
    const res = await request(getApp()).post('/api/auth/login', { username: 'nope', password: 'p' });
    assert.equal(res.status, 400);
  });
  it('400s when user is google SSO', async () => {
    db.saveUser({
      id: 'u_g', username: 'guser', email: 'g@x.com',
      passwordHash: '', displayName: 'G', avatar: 'a', role: 'user', isGoogleUser: true
    });
    const res = await request(getApp()).post('/api/auth/login', { username: 'guser', password: 'x' });
    assert.equal(res.status, 400);
  });
  it('400s on wrong password', async () => {
    const res = await request(getApp()).post('/api/auth/login', { username: 'loginuser', password: 'wrong' });
    assert.equal(res.status, 400);
  });
  it('200s on valid creds', async () => {
    const res = await request(getApp()).post('/api/auth/login', { username: 'loginuser', password: 'correct' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, 'u_login');
  });
  it('200s on valid creds and lazy-creates profile', async () => {
    db.saveUser({
      id: 'u_noprofile', username: 'noprofileuser', email: 'np@x.com',
      passwordHash: hashPassword('pw'), displayName: 'NP', avatar: 'a', role: 'user'
    });
    // Ensure no profile
    const res = await request(getApp()).post('/api/auth/login', { username: 'noprofileuser', password: 'pw' });
    assert.equal(res.status, 200);
    assert.ok(db.getProfile('u_noprofile'));
    // Trigger again to make sure it's idempotent (no error)
    const res2 = await request(getApp()).post('/api/auth/login', { username: 'noprofileuser', password: 'pw' });
    assert.equal(res2.status, 200);
  });
});

describe('POST /api/auth/google-sso', () => {
  it('400s without email', async () => {
    const res = await request(getApp()).post('/api/auth/google-sso', {});
    assert.equal(res.status, 400);
  });
  it('200s and creates user if not exists', async () => {
    const res = await request(getApp()).post('/api/auth/google-sso', {
      email: 'google@x.com', displayName: 'G'
    });
    assert.equal(res.status, 200);
    assert.ok(db.getUserByEmail('google@x.com'));
  });
  it('200s for existing google user', async () => {
    const res = await request(getApp()).post('/api/auth/google-sso', { email: 'google@x.com' });
    assert.equal(res.status, 200);
  });
  it('returns fallback profile when user has no profile row', async () => {
    // Create user directly without saving a profile.
    db.saveUser({
      id: 'g_no_prof', username: 'gnoprof', email: 'gnoprof@x.com',
      passwordHash: '', displayName: 'GP', avatar: 'av', role: 'user', isGoogleUser: true
    });
    const res = await request(getApp()).post('/api/auth/google-sso', { email: 'gnoprof@x.com' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.displayName, 'GP');
  });
});

describe('Direct handler invocation (c8 instrumentation)', () => {
  function makeRes() {
    const r: any = { statusCode: 200, body: null };
    r.status = (c: number) => { r.statusCode = c; return r; };
    r.json = (o: any) => { r.body = o; return r; };
    return r;
  }
  it('handleLogin directly', () => {
    const id = `dir_${Date.now()}`;
    db.saveUser({ id, username: id, email: `${id}@x.com`, passwordHash: hashPassword('pw'), displayName: 'D', avatar: 'a', role: 'user' });
    const res = makeRes();
    handleLogin({ body: { username: id, password: 'pw' } } as any, res);
    assert.equal(res.body.user.username, id);
  });
  it('handleLogin lazy profile creation', () => {
    const id = `dir_np_${Date.now()}`;
    db.saveUser({ id, username: id, email: `${id}@x.com`, passwordHash: hashPassword('pw'), displayName: 'D', avatar: 'a', role: 'user' });
    const res = makeRes();
    handleLogin({ body: { username: id, password: 'pw' } } as any, res);
    assert.ok(db.getProfile(id));
  });
  it('handleGoogleSso creates new user', () => {
    const email = `dir_g_${Date.now()}@x.com`;
    const res = makeRes();
    handleGoogleSso({ body: { email, displayName: 'DG' } } as any, res);
    assert.ok(db.getUserByEmail(email));
  });
  it('handleQuickLogin creates profile for new user', () => {
    const id = `dir_q_${Date.now()}`;
    const res = makeRes();
    handleQuickLogin({ body: { userId: id } } as any, res);
    assert.ok(db.getProfile(id));
  });
  it('handleQuickLogin auto-creates user from existing profile', () => {
    const id = `dir_qp_${Date.now()}`;
    db.saveProfile({ id, displayName: 'QP', avatar: 'av', elo: {} as any, honorScore: 100, badges: [] });
    const res = makeRes();
    handleQuickLogin({ body: { userId: id, displayName: 'Override' } } as any, res);
    assert.ok(db.getUser(id));
    // user role (not user_a)
    assert.equal(db.getUser(id)!.role, 'user');
  });
  it('handleQuickLogin user_a gets admin role', () => {
    // user_a already has profile from seed
    const res = makeRes();
    handleQuickLogin({ body: { userId: 'user_a' } } as any, res);
    assert.equal(res.body.role, 'admin');
  });
  it('handleQuickLogin no profile, no user → user role', () => {
    const id = `dir_qn_${Date.now()}`;
    const res = makeRes();
    handleQuickLogin({ body: { userId: id } } as any, res);
    assert.equal(res.body.role, 'user');
  });
  it('handleGoogleSso with no displayName falls back to email prefix', () => {
    const prefix = 'nodisplay';
    const email = `${prefix}${Date.now()}@x.com`;
    const res = makeRes();
    handleGoogleSso({ body: { email } } as any, res);
    assert.ok(res.body.user.displayName.startsWith(prefix));
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('400s without email', async () => {
    const res = await request(getApp()).post('/api/auth/forgot-password', {});
    assert.equal(res.status, 400);
  });
  it('404s when email not found', async () => {
    const res = await request(getApp()).post('/api/auth/forgot-password', { email: 'none@x.com' });
    assert.equal(res.status, 404);
  });
  it('200s and issues OTP', async () => {
    db.saveUser({
      id: 'u_otp', username: 'otpuser', email: 'otp@x.com',
      passwordHash: 'h', displayName: 'O', avatar: 'a', role: 'user'
    });
    const res = await request(getApp()).post('/api/auth/forgot-password', { email: 'otp@x.com' });
    assert.equal(res.status, 200);
    assert.ok(res.body._debugOtp);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('400s on missing fields', async () => {
    const res = await request(getApp()).post('/api/auth/reset-password', {});
    assert.equal(res.status, 400);
  });
  it('404s when email not found', async () => {
    const res = await request(getApp()).post('/api/auth/reset-password', {
      email: 'nope@x.com', otp: '1', newPassword: 'p'
    });
    assert.equal(res.status, 404);
  });
  it('400s on wrong OTP', async () => {
    const res = await request(getApp()).post('/api/auth/reset-password', {
      email: 'otp@x.com', otp: '999999', newPassword: 'p'
    });
    assert.equal(res.status, 400);
  });
  it('400s on expired OTP', async () => {
    const u = db.getUserByEmail('otp@x.com')!;
    u.otp = '111111';
    u.otpExpires = Date.now() - 1000;
    db.saveUser(u);
    const res = await request(getApp()).post('/api/auth/reset-password', {
      email: 'otp@x.com', otp: '111111', newPassword: 'newpw'
    });
    assert.equal(res.status, 400);
  });
  it('200s and resets password', async () => {
    const u = db.getUserByEmail('otp@x.com')!;
    u.otp = '222222';
    u.otpExpires = Date.now() + 100000;
    db.saveUser(u);
    const res = await request(getApp()).post('/api/auth/reset-password', {
      email: 'otp@x.com', otp: '222222', newPassword: 'Str0ngpw1'
    });
    assert.equal(res.status, 200);
    assert.equal(db.getUserByEmail('otp@x.com')!.passwordHash, hashPassword('Str0ngpw1'));
  });
  it('400s on a weak new password', async () => {
    const u = db.getUserByEmail('otp@x.com')!;
    u.otp = '333333';
    u.otpExpires = Date.now() + 100000;
    db.saveUser(u);
    const res = await request(getApp()).post('/api/auth/reset-password', {
      email: 'otp@x.com', otp: '333333', newPassword: 'a1'
    });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/auth/quick-login', () => {
  it('400s without userId', async () => {
    const res = await request(getApp()).post('/api/auth/quick-login', {});
    assert.equal(res.status, 400);
  });
  it('200s and creates profile+user for new userId', async () => {
    const res = await request(getApp()).post('/api/auth/quick-login', { userId: 'u_quick' });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, 'u_quick');
    assert.equal(res.body.role, 'user');
  });
  it('200s for user_a (admin)', async () => {
    const res = await request(getApp()).post('/api/auth/quick-login', { userId: 'user_a' });
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'admin');
  });
  it('200s for existing profile with displayName override', async () => {
    db.saveProfile({ id: 'u_qprof', displayName: 'Old', avatar: 'a', elo: {} as any, honorScore: 100, badges: [] });
    const res = await request(getApp()).post('/api/auth/quick-login', { userId: 'u_qprof', displayName: 'NewName' });
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'user');
    assert.ok(db.getUser('u_qprof'));
  });
});

describe('POST /api/auth/verify-email + resend-otp (Express/Worker parity)', () => {
  it('200s on correct OTP after register; 400s on wrong OTP', async () => {
    const username = `ve_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const email = `${username}@x.com`;
    const reg = await request(getApp()).post('/api/auth/register', {
      username, password: 'Str0ngpw1', email, displayName: 'VE'
    });
    assert.equal(reg.status, 200);
    const otp = reg.body._debugOtp;
    assert.ok(otp, 'register returns a dev OTP');

    const wrong = await request(getApp()).post('/api/auth/verify-email', { email, otp: '000000' });
    assert.equal(wrong.status, 400);

    const ok = await request(getApp()).post('/api/auth/verify-email', { email, otp });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.user, 'verify-email returns the user so the FE can auto-login');
    assert.equal(ok.body.user.email, email);
  });
  it('resend-otp issues a fresh dev OTP', async () => {
    const username = `re_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const email = `${username}@x.com`;
    await request(getApp()).post('/api/auth/register', { username, password: 'Str0ngpw1', email, displayName: 'RE' });
    const res = await request(getApp()).post('/api/auth/resend-otp', { email });
    assert.equal(res.status, 200);
    assert.ok(res.body._debugOtp);
  });
});

describe('POST /api/auth/google-sso with {credential}', () => {
  function makeCredential(payload: any) {
    const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64({ alg: 'RS256' })}.${b64(payload)}.sig`;
  }
  it('decodes a Google credential and creates the user', async () => {
    const email = `gc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@x.com`;
    const credential = makeCredential({ email, name: 'G Cred', picture: 'pic' });
    const res = await request(getApp()).post('/api/auth/google-sso', { credential });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, email);
    assert.equal(res.body.user.displayName, 'G Cred');
  });
});