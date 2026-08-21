import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import DatabaseDriver from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, like, or } from 'drizzle-orm';
import {
  usersTable,
  dailyCountersTable,
  profilesTable,
  matchesTable,
  tournamentsTable,
  dailyChallengesTable,
  bilacPlayersTable,
  bilacMatchesTable,
  bilacTournamentsTable,
  bilacTournamentMembersTable,
  myLeaguesTable,
  myLeagueMembersTable,
  leaguePermissionsTable
} from './schema.ts';
import {
  UserProfile,
  MatchState,
  Tournament,
  DailyChallenge,
  BiLacPlayer,
  BiLacMatch,
  BiLacTournament,
  MyLeague,
  LeagueMember,
  LeagueMemberRole
} from '../src/types.ts';

const DB_FILE = process.env.DB_FILE_JSON || path.join(process.cwd(), 'database.json');
const SQLITE_FILE = process.env.DB_FILE || path.join(process.cwd(), 'database.db');

export interface UserRecord {
  id: string; // userId, e.g. 'user_a' or generated
  username: string; // unique lowercase
  email?: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  role: 'admin' | 'user';
  otp?: string;
  otpExpires?: number;
  otpAttempts?: number;
  lastOtpAt?: number;
  isGoogleUser?: boolean;
  emailVerified?: boolean;
  createdAt?: number;
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const sqliteDb = new DatabaseDriver(SQLITE_FILE);
export const drizzleDb = drizzle(sqliteDb);

class Database {
  constructor() {
    this.initDb();
    this.migrateFromJson();
  }

  private initDb() {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar TEXT NOT NULL,
        role TEXT NOT NULL,
        otp TEXT,
        otp_expires INTEGER,
        otp_attempts INTEGER DEFAULT 0,
        last_otp_at INTEGER DEFAULT 0,
        is_google_user INTEGER,
        email_verified INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS daily_counters (
        date TEXT PRIMARY KEY,
        otp_sends INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        avatar TEXT NOT NULL,
        elo_caro INTEGER DEFAULT 1500,
        elo_co_tuong INTEGER DEFAULT 1500,
        elo_co_vua INTEGER DEFAULT 1500,
        elo_o_an_quan INTEGER DEFAULT 1500,
        elo_co_ca_ngua INTEGER DEFAULT 1500,
        elo_duoi_hinh_bat_chu INTEGER DEFAULT 1500,
        elo_noi_chu INTEGER DEFAULT 1500,
        elo_doan_tu INTEGER DEFAULT 1500,
        honor_score INTEGER DEFAULT 100,
        badges TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        status TEXT NOT NULL,
        players TEXT NOT NULL,
        board_state TEXT,
        turn TEXT NOT NULL,
        moves TEXT NOT NULL,
        viewers TEXT NOT NULL,
        winner TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        private_code TEXT
      );

      CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        game_id TEXT NOT NULL,
        status TEXT NOT NULL,
        organizer TEXT NOT NULL,
        players TEXT NOT NULL,
        max_players INTEGER NOT NULL,
        deadline INTEGER NOT NULL,
        schedule TEXT NOT NULL,
        standings TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_challenges (
        id TEXT NOT NULL,
        date TEXT NOT NULL,
        game_id TEXT NOT NULL,
        seed TEXT NOT NULL,
        prompt TEXT NOT NULL,
        top_scores TEXT NOT NULL,
        PRIMARY KEY (date, game_id)
      );

      CREATE TABLE IF NOT EXISTS bilac_players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT NOT NULL,
        tournament_id TEXT
      );

      CREATE TABLE IF NOT EXISTS bilac_matches (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        week_label TEXT NOT NULL,
        team1 TEXT NOT NULL,
        team2 TEXT NOT NULL,
        score1 INTEGER NOT NULL,
        score2 INTEGER NOT NULL,
        status TEXT NOT NULL,
        benched TEXT,
        tournament_id TEXT
      );

      CREATE TABLE IF NOT EXISTS bilac_tournaments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL
      );

    `);
    // --- users columns added after initial release: guard via ALTER for existing DBs
    for (const ddl of [
      `ALTER TABLE users ADD COLUMN otp_attempts INTEGER DEFAULT 0;`,
      `ALTER TABLE users ADD COLUMN last_otp_at INTEGER DEFAULT 0;`,
      `ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;`,
      `ALTER TABLE users ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;`,
    ]) {
      try { sqliteDb.exec(ddl); } catch (err: any) {
        if (!/duplicate column name/i.test(String(err?.message))) throw err;
      }
    }
    // Existing rows pre-date verification — grandfather them as verified.
    try { sqliteDb.exec(`UPDATE users SET email_verified = 1 WHERE email_verified = 0;`); } catch {}
    try { sqliteDb.exec(`UPDATE users SET created_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE created_at = 0;`); } catch {}

    // --- daily_challenges: migrate legacy single-PK (date) to composite (date, game_id)
    try {
      const ddl = sqliteDb.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='daily_challenges'`).get() as { sql: string } | undefined;
      if (ddl?.sql && /date\s+TEXT\s+PRIMARY\s+KEY/i.test(ddl.sql) && !/PRIMARY\s+KEY\s*\(\s*date\s*,\s*game_id/i.test(ddl.sql)) {
        console.log('[db] migrating daily_challenges: single PK (date) → composite (date, game_id)');
        sqliteDb.exec(`
          CREATE TABLE daily_challenges_new (
            id TEXT NOT NULL,
            date TEXT NOT NULL,
            game_id TEXT NOT NULL,
            seed TEXT NOT NULL,
            prompt TEXT NOT NULL,
            top_scores TEXT NOT NULL,
            PRIMARY KEY (date, game_id)
          );
          INSERT INTO daily_challenges_new (id, date, game_id, seed, prompt, top_scores)
            SELECT id, date, game_id, seed, prompt, top_scores FROM daily_challenges;
          DROP TABLE daily_challenges;
          ALTER TABLE daily_challenges_new RENAME TO daily_challenges;
        `);
      }
    } catch (e) {
      console.error('[db] daily_challenges migration skipped:', e);
    }

    // ALTER runs separately so try/catch can swallow "duplicate column" on re-init
    try {
      sqliteDb.exec(`ALTER TABLE bilac_tournaments ADD COLUMN owner_user_id TEXT;`);
    } catch (err: any) {
      if (!/duplicate column name/i.test(String(err?.message))) throw err;
    }
    try {
      sqliteDb.exec(`ALTER TABLE bilac_tournaments ADD COLUMN slug TEXT;`);
    } catch (err: any) {
      if (!/duplicate column name/i.test(String(err?.message))) throw err;
    }
    sqliteDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bilac_tournaments_slug ON bilac_tournaments(slug) WHERE slug IS NOT NULL;`);
    sqliteDb.exec(`

      CREATE TABLE IF NOT EXISTS bilac_tournament_members (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        joined_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_bilac_members_tournament ON bilac_tournament_members(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_bilac_members_user ON bilac_tournament_members(user_id);

      CREATE TABLE IF NOT EXISTS my_leagues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sport TEXT NOT NULL,
        format TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        teams TEXT NOT NULL,
        matches TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS league_permissions (
        user_id TEXT PRIMARY KEY,
        can_edit INTEGER DEFAULT 0
      );
    `);
    // my_leagues ACL columns (added incrementally — swallow "duplicate column" on re-init).
    for (const col of ['slug TEXT', 'code TEXT', 'description TEXT', 'owner_user_id TEXT']) {
      try {
        sqliteDb.exec(`ALTER TABLE my_leagues ADD COLUMN ${col};`);
      } catch (err: any) {
        if (!/duplicate column name/i.test(String(err?.message))) throw err;
      }
    }
    sqliteDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_my_leagues_slug ON my_leagues(slug) WHERE slug IS NOT NULL;`);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS my_league_members (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        joined_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_my_league_members_league ON my_league_members(league_id);
      CREATE INDEX IF NOT EXISTS idx_my_league_members_user ON my_league_members(user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_my_league_members_unique ON my_league_members(league_id, user_id);
    `);
  }

  private migrateFromJson() {
    try {
      const usersCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
      if (usersCount && usersCount.count > 0) {
        return; // already has data
      }

      if (fs.existsSync(DB_FILE)) {
        console.log('Migrating existing data from database.json to SQLite database...');
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        const data = JSON.parse(fileContent);

        // Migrate Users
        if (data.users) {
          Object.values(data.users).forEach((u: any) => {
            this.saveUser({
              id: u.id,
              username: u.username,
              email: u.email,
              passwordHash: u.passwordHash,
              displayName: u.displayName,
              avatar: u.avatar,
              role: u.role,
              otp: u.otp,
              otpExpires: u.otpExpires,
              isGoogleUser: u.isGoogleUser
            });
          });
        }

        // Migrate Profiles
        if (data.profiles) {
          Object.values(data.profiles).forEach((p: any) => {
            this.saveProfile({
              id: p.id,
              displayName: p.displayName,
              avatar: p.avatar,
              elo: p.elo || { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
              honorScore: p.honorScore ?? 100,
              badges: p.badges || []
            });
          });
        }

        // Migrate Matches
        if (data.matches) {
          Object.values(data.matches).forEach((m: any) => {
            this.saveMatch({
              id: m.id,
              gameId: m.gameId,
              status: m.status,
              players: m.players || [],
              boardState: m.boardState,
              turn: m.turn || '',
              moves: m.moves || [],
              viewers: m.viewers || [],
              winner: m.winner,
              createdAt: m.createdAt || Date.now(),
              updatedAt: m.updatedAt || Date.now(),
              privateCode: m.privateCode
            });
          });
        }

        // Migrate Tournaments
        if (data.tournaments) {
          Object.values(data.tournaments).forEach((t: any) => {
            this.saveTournament({
              id: t.id,
              name: t.name,
              gameId: t.gameId,
              status: t.status,
              organizer: t.organizer || '',
              players: t.players || [],
              maxPlayers: t.maxPlayers || 8,
              deadline: t.deadline || 0,
              schedule: t.schedule || [],
              standings: t.standings || {},
              createdAt: t.createdAt || Date.now()
            });
          });
        }

        // Migrate Challenges
        if (data.dailyChallenges) {
          Object.values(data.dailyChallenges).forEach((c: any) => {
            this.saveDailyChallenge({
              id: c.id || 'challenge',
              date: c.date,
              gameId: c.gameId,
              seed: c.seed || '',
              prompt: c.prompt || '',
              topScores: c.topScores || []
            });
          });
        }

        // Migrate BiLac Tournaments
        if (data.bilacTournaments) {
          Object.values(data.bilacTournaments).forEach((t: any) => {
            this.saveBiLacTournament(t);
          });
        }

        // Migrate BiLac Players
        if (data.bilacPlayers) {
          Object.values(data.bilacPlayers).forEach((p: any) => {
            this.saveBiLacPlayer(p);
          });
        }

        // Migrate BiLac Matches
        if (data.bilacMatches) {
          Object.values(data.bilacMatches).forEach((m: any) => {
            this.saveBiLacMatch({
              id: m.id,
              timestamp: m.timestamp || Date.now(),
              weekLabel: m.weekLabel || '',
              team1: m.team1 || [],
              team2: m.team2 || [],
              score1: m.score1 || 0,
              score2: m.score2 || 0,
              status: m.status || 'FINISHED',
              benched: m.benched,
              tournamentId: m.tournamentId
            });
          });
        }

        // Migrate My Leagues
        if (data.myLeagues) {
          Object.values(data.myLeagues).forEach((l: any) => {
            this.saveMyLeague(l);
          });
        }

        // Migrate League Permissions
        if (data.leaguePermissions) {
          this.saveLeaguePermissions(data.leaguePermissions);
        }

        console.log('Migration to Drizzle SQLite finished successfully.');
      } else {
        this.seedDefaults();
      }
    } catch (e) {
      console.error('Error during SQLite migration/seeding, falling back to clean seed:', e);
      this.seedDefaults();
    }
  }

  private seedDefaults() {
    try {
      console.log('Seeding default tables in SQLite database...');
      const defaultPasswordHash = hashPassword('password123');
      this.saveUser({
        id: 'user_a',
        username: 'son',
        email: 'son@gametuoitho.space',
        passwordHash: defaultPasswordHash,
        displayName: 'Kỳ thủ Sơn',
        avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=user_a',
        role: 'admin'
      });
      this.saveUser({
        id: 'user_b',
        username: 'thuy',
        email: 'thuy@gametuoitho.space',
        passwordHash: defaultPasswordHash,
        displayName: 'Kỳ thủ Thủy',
        avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=user_b',
        role: 'user'
      });
      this.saveUser({
        id: 'user_c',
        username: 'long',
        email: 'long@gametuoitho.space',
        passwordHash: defaultPasswordHash,
        displayName: 'Kỳ thủ Long',
        avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=user_c',
        role: 'user'
      });

      this.saveProfile({
        id: 'user_a',
        displayName: 'Kỳ thủ Sơn',
        avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=user_a',
        elo: { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
        honorScore: 100,
        badges: ['Khai Quốc Công Thần']
      });
      this.saveProfile({
        id: 'user_b',
        displayName: 'Kỳ thủ Thủy',
        avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=user_b',
        elo: { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
        honorScore: 100,
        badges: []
      });
      this.saveProfile({
        id: 'user_c',
        displayName: 'Kỳ thủ Long',
        avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=user_c',
        elo: { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
        honorScore: 100,
        badges: []
      });

      this.saveBiLacTournament({
        id: 'default-tour',
        name: 'Giải Đấu Văn Phòng',
        code: '1234',
        description: 'Giải đấu giao lưu bi lắc văn phòng mặc định',
        createdAt: Date.now()
      });

      const bilacSeeds = [
        { id: 'bl-1', name: 'Đức Anh', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=DucAnh', tournamentId: 'default-tour' },
        { id: 'bl-2', name: 'Hoàng Nam', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=HoangNam', tournamentId: 'default-tour' },
        { id: 'bl-3', name: 'Minh Quân', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=MinhQuan', tournamentId: 'default-tour' },
        { id: 'bl-4', name: 'Tiến Đạt', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=TienDat', tournamentId: 'default-tour' },
        { id: 'bl-5', name: 'Thanh Sơn', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=ThanhSon', tournamentId: 'default-tour' },
        { id: 'bl-6', name: 'Quốc Bảo', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=QuocBao', tournamentId: 'default-tour' },
        { id: 'bl-7', name: 'Văn Lâm', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=VanLam', tournamentId: 'default-tour' },
        { id: 'bl-8', name: 'Xuân Trường', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=XuanTruong', tournamentId: 'default-tour' }
      ];
      for (const p of bilacSeeds) {
        this.saveBiLacPlayer(p);
      }

      const leagueSeeds: MyLeague[] = [];
      for (const l of leagueSeeds) {
        this.saveMyLeague(l);
      }

      console.log('Successfully completed seeding SQLite defaults.');
    } catch (e) {
      console.error('Error seeding SQLite database defaults', e);
    }
  }

  private toUserRecord(row: any): UserRecord {
    return {
      id: row.id,
      username: row.username,
      email: row.email || undefined,
      passwordHash: row.passwordHash,
      displayName: row.displayName,
      avatar: row.avatar,
      role: row.role,
      otp: row.otp || undefined,
      otpExpires: row.otpExpires || undefined,
      otpAttempts: row.otpAttempts ?? 0,
      lastOtpAt: row.lastOtpAt ?? 0,
      isGoogleUser: row.isGoogleUser === 1,
      emailVerified: (row.emailVerified ?? 0) === 1,
      createdAt: row.createdAt ?? 0,
    };
  }

  // Users
  getUser(userId: string): UserRecord | undefined {
    const row = drizzleDb.select().from(usersTable).where(eq(usersTable.id, userId)).get();
    if (!row) return undefined;
    return this.toUserRecord(row);
  }

  getUserByUsername(username: string): UserRecord | undefined {
    const row = drizzleDb.select().from(usersTable).where(eq(usersTable.username, username.toLowerCase())).get();
    if (!row) return undefined;
    return this.toUserRecord(row);
  }

  // Shared user lookup for invite flows. Prefix on username + contains on displayName.
  searchUsers(q: string): Array<{ id: string; username: string; displayName: string }> {
    const trimmed = q.trim();
    if (trimmed.length < 2) return [];
    const rows = drizzleDb.select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
    })
      .from(usersTable)
      .where(or(like(usersTable.username, `${trimmed.toLowerCase()}%`), like(usersTable.displayName, `%${trimmed}%`)))
      .limit(8)
      .all();
    return rows;
  }

  getUserByEmail(email: string): UserRecord | undefined {
    const row = drizzleDb.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).get();
    if (!row) return undefined;
    return this.toUserRecord(row);
  }

  saveUser(user: UserRecord): void {
    drizzleDb.insert(usersTable)
      .values({
        id: user.id,
        username: user.username.toLowerCase(),
        email: user.email?.toLowerCase() || null,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role,
        otp: user.otp || null,
        otpExpires: user.otpExpires || null,
        otpAttempts: user.otpAttempts ?? 0,
        lastOtpAt: user.lastOtpAt ?? 0,
        isGoogleUser: user.isGoogleUser ? 1 : 0,
        emailVerified: user.emailVerified ? 1 : 0,
        createdAt: user.createdAt ?? Date.now(),
      })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          username: user.username.toLowerCase(),
          email: user.email?.toLowerCase() || null,
          passwordHash: user.passwordHash,
          displayName: user.displayName,
          avatar: user.avatar,
          role: user.role,
          otp: user.otp || null,
          otpExpires: user.otpExpires || null,
          otpAttempts: user.otpAttempts ?? 0,
          lastOtpAt: user.lastOtpAt ?? 0,
          isGoogleUser: user.isGoogleUser ? 1 : 0,
          emailVerified: user.emailVerified ? 1 : 0,
          createdAt: user.createdAt ?? Date.now(),
        }
      })
      .run();
  }

  getAllUsers(): UserRecord[] {
    const rows = drizzleDb.select().from(usersTable).all();
    return rows.map(row => this.toUserRecord(row));
  }

  // Profiles
  getProfile(userId: string): UserProfile | undefined {
    const row = drizzleDb.select().from(profilesTable).where(eq(profilesTable.id, userId)).get();
    if (!row) return undefined;
    return {
      id: row.id,
      displayName: row.displayName,
      avatar: row.avatar,
      elo: {
        caro: row.eloCaro ?? 1500,
        co_tuong: row.eloCoTuong ?? 1500,
        co_vua: row.eloCoVua ?? 1500,
        o_an_quan: row.eloOAnQuan ?? 1500,
        co_ca_ngua: row.eloCoCaNgua ?? 1500,
        duoi_hinh_bat_chu: row.eloDuoiHinhBatChu ?? 1500,
        noi_chu: row.eloNoiChu ?? 1500,
        doan_tu: row.eloDoanTu ?? 1500,
      },
      honorScore: row.honorScore ?? 100,
      badges: row.badges ? JSON.parse(row.badges) : []
    };
  }

  saveProfile(profile: UserProfile): void {
    drizzleDb.insert(profilesTable)
      .values({
        id: profile.id,
        displayName: profile.displayName,
        avatar: profile.avatar,
        eloCaro: profile.elo?.caro ?? 1500,
        eloCoTuong: profile.elo?.co_tuong ?? 1500,
        eloCoVua: profile.elo?.co_vua ?? 1500,
        eloOAnQuan: profile.elo?.o_an_quan ?? 1500,
        eloCoCaNgua: profile.elo?.co_ca_ngua ?? 1500,
        eloDuoiHinhBatChu: profile.elo?.duoi_hinh_bat_chu ?? 1500,
        eloNoiChu: profile.elo?.noi_chu ?? 1500,
        eloDoanTu: profile.elo?.doan_tu ?? 1500,
        honorScore: profile.honorScore ?? 100,
        badges: JSON.stringify(profile.badges || [])
      })
      .onConflictDoUpdate({
        target: profilesTable.id,
        set: {
          displayName: profile.displayName,
          avatar: profile.avatar,
          eloCaro: profile.elo?.caro ?? 1500,
          eloCoTuong: profile.elo?.co_tuong ?? 1500,
          eloCoVua: profile.elo?.co_vua ?? 1500,
          eloOAnQuan: profile.elo?.o_an_quan ?? 1500,
          eloCoCaNgua: profile.elo?.co_ca_ngua ?? 1500,
          eloDuoiHinhBatChu: profile.elo?.duoi_hinh_bat_chu ?? 1500,
          eloNoiChu: profile.elo?.noi_chu ?? 1500,
          eloDoanTu: profile.elo?.doan_tu ?? 1500,
          honorScore: profile.honorScore ?? 100,
          badges: JSON.stringify(profile.badges || [])
        }
      })
      .run();
  }

  getAllProfiles(): UserProfile[] {
    const rows = drizzleDb.select().from(profilesTable).all();
    return rows.map(row => ({
      id: row.id,
      displayName: row.displayName,
      avatar: row.avatar,
      elo: {
        caro: row.eloCaro ?? 1500,
        co_tuong: row.eloCoTuong ?? 1500,
        co_vua: row.eloCoVua ?? 1500,
        o_an_quan: row.eloOAnQuan ?? 1500,
        co_ca_ngua: row.eloCoCaNgua ?? 1500,
        duoi_hinh_bat_chu: row.eloDuoiHinhBatChu ?? 1500,
        noi_chu: row.eloNoiChu ?? 1500,
        doan_tu: row.eloDoanTu ?? 1500,
      },
      honorScore: row.honorScore ?? 100,
      badges: row.badges ? JSON.parse(row.badges) : []
    }));
  }

  // Matches
  getMatch(matchId: string): MatchState | undefined {
    const row = drizzleDb.select().from(matchesTable).where(eq(matchesTable.id, matchId)).get();
    if (!row) return undefined;
    return {
      id: row.id,
      gameId: row.gameId,
      status: row.status as any,
      players: JSON.parse(row.players),
      boardState: row.boardState ? JSON.parse(row.boardState) : undefined,
      turn: row.turn,
      moves: JSON.parse(row.moves),
      viewers: JSON.parse(row.viewers),
      winner: row.winner || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      privateCode: row.privateCode || undefined
    };
  }

  saveMatch(match: MatchState): void {
    drizzleDb.insert(matchesTable)
      .values({
        id: match.id,
        gameId: match.gameId,
        status: match.status,
        players: JSON.stringify(match.players || []),
        boardState: match.boardState ? JSON.stringify(match.boardState) : null,
        turn: match.turn,
        moves: JSON.stringify(match.moves || []),
        viewers: JSON.stringify(match.viewers || []),
        winner: match.winner || null,
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
        privateCode: match.privateCode || null
      })
      .onConflictDoUpdate({
        target: matchesTable.id,
        set: {
          gameId: match.gameId,
          status: match.status,
          players: JSON.stringify(match.players || []),
          boardState: match.boardState ? JSON.stringify(match.boardState) : null,
          turn: match.turn,
          moves: JSON.stringify(match.moves || []),
          viewers: JSON.stringify(match.viewers || []),
          winner: match.winner || null,
          createdAt: match.createdAt,
          updatedAt: match.updatedAt,
          privateCode: match.privateCode || null
        }
      })
      .run();
  }

  getAllMatches(): MatchState[] {
    const rows = drizzleDb.select().from(matchesTable).all();
    return rows.map(row => ({
      id: row.id,
      gameId: row.gameId,
      status: row.status as any,
      players: JSON.parse(row.players),
      boardState: row.boardState ? JSON.parse(row.boardState) : undefined,
      turn: row.turn,
      moves: JSON.parse(row.moves),
      viewers: JSON.parse(row.viewers),
      winner: row.winner || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      privateCode: row.privateCode || undefined
    }));
  }

  // Tournaments
  getTournament(tournamentId: string): Tournament | undefined {
    const row = drizzleDb.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId)).get();
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      gameId: row.gameId,
      status: row.status as any,
      organizer: row.organizer,
      players: JSON.parse(row.players),
      maxPlayers: row.maxPlayers,
      deadline: row.deadline,
      schedule: JSON.parse(row.schedule),
      standings: JSON.parse(row.standings),
      createdAt: row.createdAt
    };
  }

  saveTournament(tournament: Tournament): void {
    drizzleDb.insert(tournamentsTable)
      .values({
        id: tournament.id,
        name: tournament.name,
        gameId: tournament.gameId,
        status: tournament.status,
        organizer: tournament.organizer,
        players: JSON.stringify(tournament.players || []),
        maxPlayers: tournament.maxPlayers,
        deadline: tournament.deadline,
        schedule: JSON.stringify(tournament.schedule || []),
        standings: JSON.stringify(tournament.standings || {}),
        createdAt: tournament.createdAt
      })
      .onConflictDoUpdate({
        target: tournamentsTable.id,
        set: {
          name: tournament.name,
          gameId: tournament.gameId,
          status: tournament.status,
          organizer: tournament.organizer,
          players: JSON.stringify(tournament.players || []),
          maxPlayers: tournament.maxPlayers,
          deadline: tournament.deadline,
          schedule: JSON.stringify(tournament.schedule || []),
          standings: JSON.stringify(tournament.standings || {}),
          createdAt: tournament.createdAt
        }
      })
      .run();
  }

  getAllTournaments(): Tournament[] {
    const rows = drizzleDb.select().from(tournamentsTable).all();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      gameId: row.gameId,
      status: row.status as any,
      organizer: row.organizer,
      players: JSON.parse(row.players),
      maxPlayers: row.maxPlayers,
      deadline: row.deadline,
      schedule: JSON.parse(row.schedule),
      standings: JSON.parse(row.standings),
      createdAt: row.createdAt
    }));
  }

  // Daily Challenges — composite PK (date, gameId). Single-arg form kept for
  // backward compat (returns first match for date). Prefer 2-arg form.
  getDailyChallenge(date: string, gameId?: string): DailyChallenge | undefined {
    const cond = gameId !== undefined
      ? and(eq(dailyChallengesTable.date, date), eq(dailyChallengesTable.gameId, gameId))
      : eq(dailyChallengesTable.date, date);
    const row = drizzleDb.select().from(dailyChallengesTable).where(cond).get();
    if (!row) return undefined;
    return {
      id: row.id,
      date: row.date,
      gameId: row.gameId,
      seed: row.seed,
      prompt: row.prompt,
      topScores: JSON.parse(row.topScores)
    };
  }

  saveDailyChallenge(challenge: DailyChallenge): void {
    drizzleDb.insert(dailyChallengesTable)
      .values({
        id: challenge.id,
        date: challenge.date,
        gameId: challenge.gameId,
        seed: challenge.seed,
        prompt: challenge.prompt,
        topScores: JSON.stringify(challenge.topScores || [])
      })
      .onConflictDoUpdate({
        target: [dailyChallengesTable.date, dailyChallengesTable.gameId],
        set: {
          id: challenge.id,
          seed: challenge.seed,
          prompt: challenge.prompt,
          topScores: JSON.stringify(challenge.topScores || [])
        }
      })
      .run();
  }

  // Bi Lac
  getBiLacPlayer(id: string): BiLacPlayer | undefined {
    const row = drizzleDb.select().from(bilacPlayersTable).where(eq(bilacPlayersTable.id, id)).get();
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      tournamentId: row.tournamentId || undefined
    };
  }

  saveBiLacPlayer(player: BiLacPlayer): void {
    drizzleDb.insert(bilacPlayersTable)
      .values({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        tournamentId: player.tournamentId || null
      })
      .onConflictDoUpdate({
        target: bilacPlayersTable.id,
        set: {
          name: player.name,
          avatar: player.avatar,
          tournamentId: player.tournamentId || null
        }
      })
      .run();
  }

  getAllBiLacPlayers(): BiLacPlayer[] {
    const rows = drizzleDb.select().from(bilacPlayersTable).all();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      tournamentId: row.tournamentId || undefined
    }));
  }

  deleteBiLacPlayer(id: string): void {
    drizzleDb.delete(bilacPlayersTable).where(eq(bilacPlayersTable.id, id)).run();
  }

  getBiLacMatch(id: string): BiLacMatch | undefined {
    const row = drizzleDb.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.id, id)).get();
    if (!row) return undefined;
    return {
      id: row.id,
      timestamp: row.timestamp,
      weekLabel: row.weekLabel,
      team1: JSON.parse(row.team1),
      team2: JSON.parse(row.team2),
      score1: row.score1,
      score2: row.score2,
      status: row.status as any,
      benched: row.benched || undefined,
      tournamentId: row.tournamentId || undefined
    };
  }

  saveBiLacMatch(match: BiLacMatch): void {
    drizzleDb.insert(bilacMatchesTable)
      .values({
        id: match.id,
        timestamp: match.timestamp,
        weekLabel: match.weekLabel,
        team1: JSON.stringify(match.team1 || []),
        team2: JSON.stringify(match.team2 || []),
        score1: match.score1,
        score2: match.score2,
        status: match.status,
        benched: match.benched || null,
        tournamentId: match.tournamentId || null
      })
      .onConflictDoUpdate({
        target: bilacMatchesTable.id,
        set: {
          timestamp: match.timestamp,
          weekLabel: match.weekLabel,
          team1: JSON.stringify(match.team1 || []),
          team2: JSON.stringify(match.team2 || []),
          score1: match.score1,
          score2: match.score2,
          status: match.status,
          benched: match.benched || null,
          tournamentId: match.tournamentId || null
        }
      })
      .run();
  }

  getAllBiLacMatches(): BiLacMatch[] {
    const rows = drizzleDb.select().from(bilacMatchesTable).all();
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      weekLabel: row.weekLabel,
      team1: JSON.parse(row.team1),
      team2: JSON.parse(row.team2),
      score1: row.score1,
      score2: row.score2,
      status: row.status as any,
      benched: row.benched || undefined,
      tournamentId: row.tournamentId || undefined
    }));
  }

  deleteBiLacMatch(id: string): void {
    drizzleDb.delete(bilacMatchesTable).where(eq(bilacMatchesTable.id, id)).run();
  }

  getBiLacTournament(id: string): BiLacTournament | undefined {
    const row = drizzleDb.select().from(bilacTournamentsTable).where(eq(bilacTournamentsTable.id, id)).get();
    if (!row) return undefined;
    return {
      id: row.id,
      slug: row.slug ?? undefined,
      name: row.name,
      code: row.code,
      description: row.description || undefined,
      createdAt: row.createdAt
    };
  }

  getBiLacTournamentBySlug(slug: string): BiLacTournament | undefined {
    const row = drizzleDb
      .select()
      .from(bilacTournamentsTable)
      .where(eq(bilacTournamentsTable.slug, slug))
      .get();
    if (!row) return undefined;
    return {
      id: row.id,
      slug: row.slug ?? undefined,
      name: row.name,
      code: row.code,
      description: row.description || undefined,
      createdAt: row.createdAt
    };
  }

  generateBilacTournamentSlug(length = 8): string {
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += alphabet[buf[i] % alphabet.length];
    }
    return out;
  }

  backfillMissingBilacSlugs(): number {
    const rows = drizzleDb
      .select({ id: bilacTournamentsTable.id })
      .from(bilacTournamentsTable)
      .all();
    let updated = 0;
    for (const r of rows) {
      const existing = drizzleDb
        .select({ slug: bilacTournamentsTable.slug })
        .from(bilacTournamentsTable)
        .where(eq(bilacTournamentsTable.id, r.id))
        .get();
      if (existing?.slug) continue;
      let attempts = 0;
      let candidate = '';
      while (attempts < 5) {
        candidate = this.generateBilacTournamentSlug();
        const collision = drizzleDb
          .select({ id: bilacTournamentsTable.id })
          .from(bilacTournamentsTable)
          .where(eq(bilacTournamentsTable.slug, candidate))
          .get();
        if (!collision) break;
        attempts++;
      }
      if (attempts >= 5) continue; // skip on collision storm — log later
      drizzleDb
        .update(bilacTournamentsTable)
        .set({ slug: candidate })
        .where(eq(bilacTournamentsTable.id, r.id))
        .run();
      updated++;
    }
    return updated;
  }

  saveBiLacTournament(tournament: BiLacTournament): void {
    drizzleDb.insert(bilacTournamentsTable)
      .values({
        id: tournament.id,
        slug: tournament.slug ?? null,
        name: tournament.name,
        code: tournament.code,
        description: tournament.description || null,
        createdAt: tournament.createdAt
      })
      .onConflictDoUpdate({
        target: bilacTournamentsTable.id,
        set: {
          slug: tournament.slug ?? null,
          name: tournament.name,
          code: tournament.code,
          description: tournament.description || null,
          createdAt: tournament.createdAt
        }
      })
      .run();
  }

  getAllBiLacTournaments(): BiLacTournament[] {
    const rows = drizzleDb.select().from(bilacTournamentsTable).all();
    return rows.map(row => ({
      id: row.id,
      slug: row.slug ?? undefined,
      name: row.name,
      code: row.code,
      description: row.description || undefined,
      createdAt: row.createdAt
    }));
  }

  // Return tournaments that userId is a member of (owner counts as member).
  getBiLacTournamentsForUser(userId: string): BiLacTournament[] {
    const rows = drizzleDb
      .select({ t: bilacTournamentsTable })
      .from(bilacTournamentsTable)
      .innerJoin(bilacTournamentMembersTable, eq(bilacTournamentMembersTable.tournamentId, bilacTournamentsTable.id))
      .where(eq(bilacTournamentMembersTable.userId, userId))
      .all();
    return rows.map(r => ({
      id: r.t.id,
      name: r.t.name,
      code: r.t.code,
      description: r.t.description || undefined,
      createdAt: r.t.createdAt
    }));
  }

  // Return ALL Bi Lắc tournaments enriched with memberCount + caller's isMember
  // flag. Does NOT expose `code` (sensitive — caller must POST /access to join).
  // Powers both "Tất cả giải" and "Giải tham gia" tabs from a single fetch.
  getAllBiLacTournamentsWithMembership(userId: string): Array<{
    id: string; slug?: string; name: string; description?: string; createdAt: number;
    memberCount: number; isMember: boolean;
  }> {
    const tournaments = drizzleDb.select().from(bilacTournamentsTable).all();
    const memberRows = drizzleDb
      .select({
        tournamentId: bilacTournamentMembersTable.tournamentId,
        userId: bilacTournamentMembersTable.userId,
      })
      .from(bilacTournamentMembersTable)
      .all();

    const counts = new Map<string, number>();
    const mySet = new Set<string>();
    for (const m of memberRows) {
      counts.set(m.tournamentId, (counts.get(m.tournamentId) ?? 0) + 1);
      if (m.userId === userId) mySet.add(m.tournamentId);
    }

    return tournaments.map(t => ({
      id: t.id,
      slug: t.slug ?? undefined,
      name: t.name,
      description: t.description || undefined,
      createdAt: t.createdAt,
      memberCount: counts.get(t.id) ?? 0,
      isMember: mySet.has(t.id),
    }));
  }

  deleteBiLacTournament(id: string): void {
    drizzleDb.delete(bilacTournamentsTable).where(eq(bilacTournamentsTable.id, id)).run();
  }

  // Cascade delete: remove all matches, players, members, then the tournament
  // row itself. Used by the owner-only DELETE /tournaments/:id route.
  deleteBiLacTournamentCascade(id: string): void {
    drizzleDb.delete(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, id)).run();
    drizzleDb.delete(bilacPlayersTable).where(eq(bilacPlayersTable.tournamentId, id)).run();
    drizzleDb.delete(bilacTournamentMembersTable).where(eq(bilacTournamentMembersTable.tournamentId, id)).run();
    drizzleDb.delete(bilacTournamentsTable).where(eq(bilacTournamentsTable.id, id)).run();
  }

  // BiLac Tournament Members
  saveBiLacTournamentMember(member: { id: string; tournamentId: string; userId: string; username: string; displayName: string; role: 'owner' | 'member'; joinedAt: number; }): void {
    drizzleDb.insert(bilacTournamentMembersTable)
      .values({
        id: member.id,
        tournamentId: member.tournamentId,
        userId: member.userId,
        username: member.username,
        displayName: member.displayName,
        role: member.role,
        joinedAt: member.joinedAt,
      })
      .onConflictDoUpdate({
        target: bilacTournamentMembersTable.id,
        set: {
          tournamentId: member.tournamentId,
          userId: member.userId,
          username: member.username,
          displayName: member.displayName,
          role: member.role,
          joinedAt: member.joinedAt,
        },
      })
      .run();
  }

  getBiLacTournamentMembers(tournamentId: string): Array<{ id: string; tournamentId: string; userId: string; username: string; displayName: string; role: 'owner'|'member'; joinedAt: number }> {
    const rows = drizzleDb.select().from(bilacTournamentMembersTable).where(eq(bilacTournamentMembersTable.tournamentId, tournamentId)).all();
    return rows.map(r => ({
      id: r.id,
      tournamentId: r.tournamentId,
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      role: r.role as 'owner' | 'member',
      joinedAt: r.joinedAt,
    }));
  }

  isBiLacTournamentMember(tournamentId: string, userId: string): boolean {
    const members = this.getBiLacTournamentMembers(tournamentId);
    return members.some(m => m.userId === userId);
  }

  isBiLacTournamentOwner(tournamentId: string, userId: string): boolean {
    const members = this.getBiLacTournamentMembers(tournamentId);
    return members.some(m => m.userId === userId && m.role === 'owner');
  }

  deleteBiLacTournamentMember(tournamentId: string, userId: string): void {
    drizzleDb.delete(bilacTournamentMembersTable)
      .where(and(
        eq(bilacTournamentMembersTable.tournamentId, tournamentId),
        eq(bilacTournamentMembersTable.userId, userId)
      ))
      .run();
  }

  getBiLacTournamentMember(tournamentId: string, userId: string): { id: string; tournamentId: string; userId: string; username: string; displayName: string; role: 'owner'|'member'; joinedAt: number } | undefined {
    const row = drizzleDb.select().from(bilacTournamentMembersTable)
      .where(and(
        eq(bilacTournamentMembersTable.tournamentId, tournamentId),
        eq(bilacTournamentMembersTable.userId, userId)
      ))
      .get();
    if (!row) return undefined;
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      role: row.role as 'owner' | 'member',
      joinedAt: row.joinedAt,
    };
  }

  // MyLeagues
  private parseJsonArray(v: any): any[] {
    try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
  }

  private leagueFromRow(row: any): MyLeague {
    return {
      id: row.id,
      name: row.name,
      sport: row.sport as any,
      format: row.format as any,
      status: row.status as any,
      createdAt: row.createdAt,
      teams: this.parseJsonArray(row.teams),
      matches: this.parseJsonArray(row.matches),
      slug: row.slug ?? undefined,
      code: row.code ?? undefined,
      description: row.description ?? undefined,
      ownerUserId: row.ownerUserId ?? undefined,
    };
  }

  getMyLeague(id: string): MyLeague | undefined {
    const row = drizzleDb.select().from(myLeaguesTable).where(eq(myLeaguesTable.id, id)).get();
    if (!row) return undefined;
    return this.leagueFromRow(row);
  }

  getMyLeagueBySlug(slug: string): MyLeague | undefined {
    const row = drizzleDb.select().from(myLeaguesTable).where(eq(myLeaguesTable.slug, slug)).get();
    if (!row) return undefined;
    return this.leagueFromRow(row);
  }

  generateMyLeagueSlug(length = 8): string {
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += alphabet[buf[i] % alphabet.length];
    }
    return out;
  }

  saveMyLeague(league: MyLeague): void {
    drizzleDb.insert(myLeaguesTable)
      .values({
        id: league.id,
        name: league.name,
        sport: league.sport,
        format: league.format,
        status: league.status,
        createdAt: league.createdAt,
        teams: JSON.stringify(league.teams || []),
        matches: JSON.stringify(league.matches || []),
        slug: league.slug ?? null,
        code: league.code ?? null,
        description: league.description ?? null,
        ownerUserId: league.ownerUserId ?? null,
      })
      .onConflictDoUpdate({
        target: myLeaguesTable.id,
        set: {
          name: league.name,
          sport: league.sport,
          format: league.format,
          status: league.status,
          createdAt: league.createdAt,
          teams: JSON.stringify(league.teams || []),
          matches: JSON.stringify(league.matches || []),
          slug: league.slug ?? null,
          code: league.code ?? null,
          description: league.description ?? null,
          ownerUserId: league.ownerUserId ?? null,
        }
      })
      .run();
  }

  // Update mutable fields while preserving server-authoritative slug/code/ownerUserId.
  // Used by the owner/admin PUT route so a stale client payload can't clobber them.
  updateMyLeagueFields(id: string, patch: Partial<MyLeague>): void {
    const existing = this.getMyLeague(id);
    if (!existing) return;
    const merged: MyLeague = {
      ...existing,
      ...patch,
      slug: existing.slug,
      code: existing.code,
      ownerUserId: existing.ownerUserId,
    };
    this.saveMyLeague(merged);
  }

  getAllMyLeagues(): MyLeague[] {
    const rows = drizzleDb.select().from(myLeaguesTable).all();
    return rows.map(row => this.leagueFromRow(row));
  }

  // All leagues enriched with memberCount + the caller's role (owner|admin) so
  // the portal can render "Tất cả giải" and "Giải của tôi" from one fetch.
  // Never exposes `code` — viewers must POST /access to retrieve it.
  getAllMyLeaguesWithMembership(userId: string): Array<MyLeague & { memberCount: number; role: LeagueMemberRole | null; isMember: boolean }> {
    const leagues = drizzleDb.select().from(myLeaguesTable).all();
    const memberRows = drizzleDb
      .select({
        leagueId: myLeagueMembersTable.leagueId,
        userId: myLeagueMembersTable.userId,
        role: myLeagueMembersTable.role,
      })
      .from(myLeagueMembersTable)
      .all();

    const counts = new Map<string, number>();
    const myRole = new Map<string, LeagueMemberRole>();
    for (const m of memberRows) {
      counts.set(m.leagueId, (counts.get(m.leagueId) ?? 0) + 1);
      if (m.userId === userId) myRole.set(m.leagueId, m.role as LeagueMemberRole);
    }

    return leagues.map(row => {
      const base = this.leagueFromRow(row);
      const role = myRole.get(row.id) ?? null;
      return {
        ...base,
        // strip the secret code from list payloads
        code: undefined,
        memberCount: counts.get(row.id) ?? 0,
        role,
        isMember: role !== null,
      };
    });
  }

  // Cascade delete: members + the league row. (teams/matches live as JSON inside
  // the league row, so deleting the row removes them too.)
  deleteMyLeagueCascade(id: string): void {
    drizzleDb.delete(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, id)).run();
    drizzleDb.delete(myLeaguesTable).where(eq(myLeaguesTable.id, id)).run();
  }

  // MyLeague Members (per-league ACL: owner + admins)
  saveMyLeagueMember(member: { id: string; leagueId: string; userId: string; username: string; displayName: string; role: LeagueMemberRole; joinedAt: number; }): void {
    drizzleDb.insert(myLeagueMembersTable)
      .values({
        id: member.id,
        leagueId: member.leagueId,
        userId: member.userId,
        username: member.username,
        displayName: member.displayName,
        role: member.role,
        joinedAt: member.joinedAt,
      })
      .onConflictDoUpdate({
        target: myLeagueMembersTable.id,
        set: {
          leagueId: member.leagueId,
          userId: member.userId,
          username: member.username,
          displayName: member.displayName,
          role: member.role,
          joinedAt: member.joinedAt,
        },
      })
      .run();
  }

  getMyLeagueMembers(leagueId: string): LeagueMember[] {
    const rows = drizzleDb.select().from(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, leagueId)).all();
    return rows.map(r => ({
      id: r.id,
      leagueId: r.leagueId,
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      role: r.role as LeagueMemberRole,
      joinedAt: r.joinedAt,
    }));
  }

  getMyLeagueMemberRole(leagueId: string, userId: string): LeagueMemberRole | null {
    const row = drizzleDb.select().from(myLeagueMembersTable)
      .where(and(eq(myLeagueMembersTable.leagueId, leagueId), eq(myLeagueMembersTable.userId, userId)))
      .get();
    if (!row) return null;
    return row.role as LeagueMemberRole;
  }

  isMyLeagueMember(leagueId: string, userId: string): boolean {
    return this.getMyLeagueMemberRole(leagueId, userId) !== null;
  }

  isMyLeagueOwner(leagueId: string, userId: string): boolean {
    return this.getMyLeagueMemberRole(leagueId, userId) === 'owner';
  }

  deleteMyLeagueMember(leagueId: string, userId: string): void {
    drizzleDb.delete(myLeagueMembersTable)
      .where(and(
        eq(myLeagueMembersTable.leagueId, leagueId),
        eq(myLeagueMembersTable.userId, userId)
      ))
      .run();
  }

  // League Permissions (legacy global whitelist — kept for json migration compat, no longer used by routes)
  getLeaguePermissions(): Record<string, boolean> {
    const rows = drizzleDb.select().from(leaguePermissionsTable).all();
    const res: Record<string, boolean> = {};
    rows.forEach(row => {
      res[row.userId] = row.canEdit === 1;
    });
    return res;
  }

  saveLeaguePermissions(permissions: Record<string, boolean>): void {
    drizzleDb.delete(leaguePermissionsTable).run();
    Object.entries(permissions).forEach(([userId, canEdit]) => {
      drizzleDb.insert(leaguePermissionsTable)
        .values({
          userId,
          canEdit: canEdit ? 1 : 0
        })
        .run();
    });
  }
}

export const db = new Database();
export default db;
