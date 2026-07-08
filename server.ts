import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback .env, không override giá trị đã set
import { roomManager } from './server/roomManager.ts';
import { tournamentManager } from './server/tournamentManager.ts';
import { handleRegister, handleLogin, handleGoogleSso, handleForgotPassword, handleResetPassword, handleQuickLogin, handleVerifyEmail, handleResendOtp } from './server/handlers/authHandlers.ts';
import { handleGetProfile, handleGetOnlineUsers, handleUpdateProfile, handleResetElo } from './server/handlers/profileHandlers.ts';
import { handleLeaderboardGlobal, handleLeaderboardByGame } from './server/handlers/leaderboardHandlers.ts';
import { handleListTournaments, handleCreateTournament, handleJoinTournament, handleGetTournamentByCode, handleGetTournament, handleStartTournament, handleLaunchTournamentMatch } from './server/handlers/tournamentHandlers.ts';
import { handleGetChallenge, handleSubmitChallenge } from './server/handlers/challengeHandlers.ts';
import { handleGetReplaysByUser, handleGetReplay } from './server/handlers/replayHandlers.ts';
import { checkBiLacTournamentAccess, requireBiLacMember, requireBiLacOwner } from './server/handlers/_middleware.ts';
import { handleListBilacTournaments, handleAccessBilacTournament, handleCreateBilacTournament, handleListBilacMembers, handleInviteBilacMember, handleRemoveBilacMember, handleGetBilacPlayers, handleCreateBilacPlayer, handleDeleteBilacPlayer, handleGetBilacMatches, handleCreateBilacMatch, handleUpdateBilacMatch, handleDeleteBilacMatch, handleGetBilacTournamentBySlug } from './server/handlers/bilacHandlers.ts';
import { handleListLeagues, handleCreateLeague, handlePutLeague, handleDeleteLeague, handleGetLeaguePermissions, handleToggleLeaguePermission } from './server/handlers/leagueHandlers.ts';
import { db } from './server/db.ts';
import { handleParseRoster, handleParsePlayers, handleParseEvents } from './server/handlers/aiHandlers.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Standard express middlewares
  app.use(express.json());

  // AI-powered roster parsing route (OpenAI-compatible)
  app.post('/api/ai/parse-roster', handleParseRoster);

  // AI-powered bulk player names parser (for Bi Lắc arena)
  app.post('/api/ai/parse-players', handleParsePlayers);

  // AI helper: parse a free-text match summary into structured events (futsal).
  // The route ONLY fills events — it does not persist; the client must review then save.
  app.post('/api/ai/parse-events', handleParseEvents);

  // 1. AUTHENTICATION & PROFILES (Module A)
  app.post('/api/auth/register', handleRegister);
  app.post('/api/auth/login', handleLogin);
  app.post('/api/auth/google-sso', handleGoogleSso);
  app.post('/api/auth/forgot-password', handleForgotPassword);
  app.post('/api/auth/reset-password', handleResetPassword);
  app.post('/api/auth/verify-email', handleVerifyEmail);
  app.post('/api/auth/resend-otp', handleResendOtp);
  app.post('/api/auth/quick-login', handleQuickLogin);

  app.get('/api/profile/:userId', handleGetProfile);
  app.get('/api/online-users', handleGetOnlineUsers);
  app.post('/api/profile/:userId/update', handleUpdateProfile);
  app.post('/api/profile/:userId/reset-elo', handleResetElo);

  // 2. LEADERBOARDS (Module H)
  app.get('/api/leaderboard/global', handleLeaderboardGlobal);
  app.get('/api/leaderboard/:gameId', handleLeaderboardByGame);

  // 3. TOURNAMENTS (Module J)
  app.get('/api/tournaments', handleListTournaments);
  app.post('/api/tournaments/create', handleCreateTournament);
  app.post('/api/tournaments/join', handleJoinTournament);
  app.get('/api/tournaments/code/:code', handleGetTournamentByCode);
  app.get('/api/tournaments/:id', handleGetTournament);
  app.post('/api/tournaments/:id/start', handleStartTournament);
  app.post('/api/tournaments/:id/launch/:matchIndex', handleLaunchTournamentMatch);

  // 4. DAILY CHALLENGES (Module I)
  app.get('/api/challenges/:gameId/:date', handleGetChallenge);
  app.post('/api/challenges/:gameId/:date/submit', handleSubmitChallenge);

  // 5. REPLAYS & HISTORY (Module L)
  app.get('/api/replays/:userId', handleGetReplaysByUser);
  app.get('/api/replay/:matchId', handleGetReplay);

  // 6. BI LAC - FOOSBALL TOURNAMENTS
  app.get('/api/bilac/tournaments', handleListBilacTournaments);
  app.get('/api/bilac/tournaments/by-slug/:slug', handleGetBilacTournamentBySlug);
  app.post('/api/bilac/tournaments/access', handleAccessBilacTournament);
  app.post('/api/bilac/tournaments', handleCreateBilacTournament);
  app.get('/api/bilac/tournaments/members', checkBiLacTournamentAccess, handleListBilacMembers);
  app.post('/api/bilac/tournaments/members', requireBiLacOwner, handleInviteBilacMember);
  app.delete('/api/bilac/tournaments/members/:userId', requireBiLacOwner, handleRemoveBilacMember);
  app.get('/api/bilac/players', checkBiLacTournamentAccess, handleGetBilacPlayers);
  app.post('/api/bilac/players', requireBiLacMember, handleCreateBilacPlayer);
  app.delete('/api/bilac/players/:id', requireBiLacMember, handleDeleteBilacPlayer);
  app.get('/api/bilac/matches', checkBiLacTournamentAccess, handleGetBilacMatches);
  app.post('/api/bilac/matches', requireBiLacMember, handleCreateBilacMatch);
  app.post('/api/bilac/matches/:id/update', requireBiLacMember, handleUpdateBilacMatch);
  app.delete('/api/bilac/matches/:id', requireBiLacOwner, handleDeleteBilacMatch);

  // 7. SPORTS LEAGUES & PERMISSION CONTRACT
  app.get('/api/leagues', handleListLeagues);
  app.post('/api/leagues', handleCreateLeague);
  app.put('/api/leagues/:id', handlePutLeague);
  app.delete('/api/leagues/:id', handleDeleteLeague);
  app.get('/api/leagues-permissions', handleGetLeaguePermissions);
  app.post('/api/leagues-permissions/toggle', handleToggleLeaguePermission);

  // Expose app for in-process testing (without binding a port).
  (globalThis as any).__gametuoithoApp = app;

  // Create HTTP & WebSocket Server
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    let currentUserId: string | null = null;
    let activeMatchId: string | null = null;

    ws.on('message', (message: string) => {
      try {
        const { type, payload } = JSON.parse(message);

        switch (type) {
          case 'REGISTER_SOCKET':
            currentUserId = payload.userId;
            roomManager.registerSocket(payload.userId, ws);
            ws.send(JSON.stringify({ type: 'REGISTERED', payload: { success: true } }));
            break;

          case 'JOIN_MATCHMAKING':
            if (currentUserId) {
              roomManager.joinMatchmaking(currentUserId, payload.gameId, ws);
            }
            break;

          case 'LEAVE_MATCHMAKING':
            if (currentUserId) {
              roomManager.leaveMatchmaking(currentUserId);
              ws.send(JSON.stringify({ type: 'MATCHMAKING_STATUS', payload: { status: 'IDLE' } }));
            }
            break;

          case 'CREATE_PRIVATE_ROOM':
            if (currentUserId) {
              const code = roomManager.createPrivateRoom(currentUserId, payload.gameId);
              ws.send(JSON.stringify({ type: 'PRIVATE_ROOM_CREATED', payload: { code } }));
            }
            break;

          case 'JOIN_PRIVATE_ROOM':
            if (currentUserId) {
              const match = roomManager.joinPrivateRoom(currentUserId, payload.code, ws);
              if (!match) {
                ws.send(JSON.stringify({ type: 'PRIVATE_ROOM_FAILED', payload: { error: 'Không thể vào phòng! Mã sai hoặc phòng đã đầy.' } }));
              }
            }
            break;

          case 'SEND_INVITATION':
            if (currentUserId && payload.targetUserId) {
              const targetSocket = roomManager.getSocket(payload.targetUserId);
              if (targetSocket) {
                const senderProfile = roomManager.getOrInitializeProfile(currentUserId);
                targetSocket.send(JSON.stringify({
                  type: 'PRIVATE_ROOM_INVITATION',
                  payload: {
                    fromUserId: currentUserId,
                    fromUserName: senderProfile.displayName,
                    gameId: payload.gameId,
                    code: payload.code
                  }
                }));
              }
            }
            break;

          case 'MAKE_MOVE':
            if (currentUserId && payload.matchId) {
              activeMatchId = payload.matchId;
              roomManager.handlePlayerMove(currentUserId, payload.matchId, payload.move);
              // Report to Tournament manager in case it was a tournament match
              const matchState = roomManager.getMatchState(payload.matchId);
              if (matchState && matchState.status === 'ENDED') {
                tournamentManager.reportMatchResult(payload.matchId, matchState.winner);
              }
            }
            break;

          case 'FORFEIT':
            if (currentUserId && payload.matchId) {
              roomManager.forfeitMatch(currentUserId, payload.matchId);
              tournamentManager.reportMatchResult(payload.matchId, roomManager.getMatchState(payload.matchId)?.winner);
            }
            break;

          case 'SPECTATE_MATCH':
            if (currentUserId && payload.matchId) {
              activeMatchId = payload.matchId;
              roomManager.addSpectator(currentUserId, payload.matchId, ws);
            }
            break;

          case 'UNSPECTATE_MATCH':
            if (payload.matchId) {
              roomManager.removeSpectator(payload.matchId, ws);
            }
            break;

          default:
            console.log(`Unknown WebSocket action: ${type}`);
        }
      } catch (err) {
        console.error('Error processing socket message', err);
      }
    });

    ws.on('close', () => {
      if (currentUserId) {
        roomManager.deregisterSocket(currentUserId);
      }
      if (activeMatchId) {
        roomManager.removeSpectator(activeMatchId, ws);
      }
    });
  });

  // Integrate Vite for development, or static server in production
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // In test mode, don't bind a port — the app is exposed via globalThis for in-process tests.
  if (process.env.NODE_ENV !== 'test') {
    // Backfill slugs for tournaments created before this column existed.
    const backfilled = db.backfillMissingBilacSlugs();
    if (backfilled > 0) {
      console.log(`[bilac] backfilled ${backfilled} tournament slug(s)`);
    }
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`gametuoitho.space server active at http://localhost:${PORT}`);
    });
  }
}

startServer();
