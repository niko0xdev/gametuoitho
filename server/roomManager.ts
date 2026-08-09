import { WebSocket } from 'ws';
import { db } from './db.ts';
import { MatchState, UserProfile, Tournament, TournamentMatch } from '../src/types.ts';
import { RULE_ENGINES, getChineseChessLegalMoves } from './rules.ts';

interface WaitingPlayer {
  userId: string;
  gameId: string;
  elo: number;
  joinedAt: number;
  socket: WebSocket;
}

class RoomManager {
  // Sockets currently connected, mapped by user ID
  private activeSockets = new Map<string, WebSocket>();
  // Sockets watching a specific match, mapped by match ID -> set of sockets
  private matchSpectators = new Map<string, Set<WebSocket>>();
  // Active matchmaking queue
  private matchmakingQueue: WaitingPlayer[] = [];
  // Timeout handles for disconnection grace periods, mapped by user ID
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  // Match ID to MatchState mappings in-memory for active sessions
  private activeMatches = new Map<string, MatchState>();
  // Map private room codes to match ID
  private privateRooms = new Map<string, string>();
  // Map private room codes to host user ID
  private privateRoomHosts = new Map<string, string>();
  // Map private room codes to creation timestamp
  private privateRoomTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    // Start matchmaking loop
    const timer = setInterval(() => this.tickMatchmaker(), 2000);
    if (process.env.NODE_ENV === 'test') {
      timer.unref?.();
    }
  }

  // Socket management
  registerSocket(userId: string, socket: WebSocket) {
    console.log(`User ${userId} connected.`);
    this.activeSockets.set(userId, socket);

    // If this player had a pending disconnect timer, cancel it!
    if (this.reconnectTimers.has(userId)) {
      console.log(`Player ${userId} reconnected within grace period. Resuming match.`);
      clearTimeout(this.reconnectTimers.get(userId)!);
      this.reconnectTimers.delete(userId);

      // Notify the opponent in any active match this player is in
      this.notifyReconnection(userId);
    }
  }

  deregisterSocket(userId: string) {
    console.log(`User ${userId} disconnected.`);
    this.activeSockets.delete(userId);

    // If player is currently in an active playing match, trigger reconnection grace period
    this.handleDisconnectionGrace(userId);
  }

  getSocket(userId: string): WebSocket | undefined {
    return this.activeSockets.get(userId);
  }

  getOnlineUsers(excludeUserId?: string) {
    const list: { id: string; displayName: string; avatar: string }[] = [];
    for (const [userId, _socket] of this.activeSockets.entries()) {
      if (userId === excludeUserId) continue;
      const profile = this.getOrInitializeProfile(userId);
      list.push({
        id: userId,
        displayName: profile.displayName,
        avatar: profile.avatar || ''
      });
    }
    return list;
  }

  // Lobby Matchmaking
  joinMatchmaking(userId: string, gameId: string, socket: WebSocket) {
    const profile = this.getOrInitializeProfile(userId);
    const elo = profile.elo[gameId] || 1500;

    // Remove duplicates
    this.leaveMatchmaking(userId);

    this.matchmakingQueue.push({
      userId,
      gameId,
      elo,
      joinedAt: Date.now(),
      socket
    });

    console.log(`Player ${userId} (Elo: ${elo}) joined matchmaking for ${gameId}`);
    socket.send(JSON.stringify({ type: 'MATCHMAKING_STATUS', payload: { status: 'SEARCHING' } }));
  }

  leaveMatchmaking(userId: string) {
    this.matchmakingQueue = this.matchmakingQueue.filter(p => p.userId !== userId);
  }

  private tickMatchmaker() {
    if (this.matchmakingQueue.length < 2) return;

    const matchedIndices = new Set<number>();

    for (let i = 0; i < this.matchmakingQueue.length; i++) {
      if (matchedIndices.has(i)) continue;
      const playerA = this.matchmakingQueue[i];

      for (let j = i + 1; j < this.matchmakingQueue.length; j++) {
        if (matchedIndices.has(j)) continue;
        const playerB = this.matchmakingQueue[j];

        if (playerA.gameId !== playerB.gameId) continue;

        // Calculate allowed Elo difference based on wait times
        const waitTimeA = (Date.now() - playerA.joinedAt) / 1000;
        const waitTimeB = (Date.now() - playerB.joinedAt) / 1000;
        const allowedDiffA = 30 + waitTimeA * 10; // Band widens over time (FR-LOBBY-02)
        const allowedDiffB = 30 + waitTimeB * 10;
        const maxAllowedDiff = Math.max(allowedDiffA, allowedDiffB);

        const eloDiff = Math.abs(playerA.elo - playerB.elo);

        if (eloDiff <= maxAllowedDiff) {
          // Pair found!
          matchedIndices.add(i);
          matchedIndices.add(j);

          this.startMatch(playerA.gameId, [playerA.userId, playerB.userId]);
          break;
        }
      }
    }

    // Filter out matched players
    this.matchmakingQueue = this.matchmakingQueue.filter((_, idx) => !matchedIndices.has(idx));
  }

  // Create private room with 6-char code
  createPrivateRoom(userId: string, gameId: string): string {
    let code = '';
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (this.privateRooms.has(code));

    const matchId = `match_${Math.random().toString(36).substring(2, 10)}`;

    const match: MatchState = {
      id: matchId,
      gameId,
      status: 'WAITING',
      players: [userId],
      boardState: {},
      turn: userId,
      moves: [],
      viewers: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      privateCode: code
    };

    this.activeMatches.set(matchId, match);
    this.privateRooms.set(code, matchId);
    this.privateRoomHosts.set(code, userId);

    // Private Room auto expiry after 15 mins of no second player (FR-LOBBY-05)
    const expiryTimer = setTimeout(() => {
      this.expirePrivateRoom(code);
    }, 15 * 60 * 1000);

    this.privateRoomTimers.set(code, expiryTimer);

    console.log(`Private Room created. Code: ${code} for game: ${gameId}`);
    return code;
  }

  joinPrivateRoom(userId: string, code: string, socket: WebSocket): MatchState | null {
    const cleanCode = code.trim().toUpperCase();
    const matchId = this.privateRooms.get(cleanCode);
    if (!matchId) return null;

    const match = this.activeMatches.get(matchId);
    if (!match) return null;

    // Host attempts to join their own room
    if (match.players.includes(userId)) {
      socket.send(JSON.stringify({
        type: 'PRIVATE_ROOM_FAILED',
        payload: { error: 'Bạn đang là chủ phòng này rồi! Hãy click chọn một TEST ACCOUNT khác ở góc trên màn hình, sau đó nhập mã này để vào đấu trí.' }
      }));
      return match; // return non-null to prevent server.ts from showing generic error
    }

    // Room is already playing or ended
    if (match.status !== 'WAITING') {
      socket.send(JSON.stringify({
        type: 'PRIVATE_ROOM_FAILED',
        payload: { error: 'Phòng này đã đầy hoặc trận đấu đã bắt đầu rồi!' }
      }));
      return match; // return non-null to prevent server.ts from showing generic error
    }

    // Clear expiry timer
    if (this.privateRoomTimers.has(cleanCode)) {
      clearTimeout(this.privateRoomTimers.get(cleanCode)!);
      this.privateRoomTimers.delete(cleanCode);
    }

    // Add player to match
    match.players.push(userId);
    match.status = 'PLAYING';
    match.updatedAt = Date.now();

    // Initialize game board state
    const engine = RULE_ENGINES[match.gameId];
    if (engine) {
      match.boardState = engine.getInitialState(match.players);
      match.turn = match.players[0];
    }

    this.activeMatches.set(matchId, match);
    db.saveMatch(match);

    // Notify all players in match
    this.broadcastMatchState(matchId);

    console.log(`Player ${userId} joined Private Room ${cleanCode}. Match starting!`);
    return match;
  }

  private expirePrivateRoom(code: string) {
    const matchId = this.privateRooms.get(code);
    if (matchId) {
      const match = this.activeMatches.get(matchId);
      if (match && match.status === 'WAITING') {
        const hostId = match.players[0];
        const hostSocket = this.activeSockets.get(hostId);
        if (hostSocket) {
          hostSocket.send(JSON.stringify({ type: 'PRIVATE_ROOM_EXPIRED', payload: { code } }));
        }
        this.activeMatches.delete(matchId);
      }
    }
    this.privateRooms.delete(code);
    this.privateRoomHosts.delete(code);
    this.privateRoomTimers.delete(code);
    console.log(`Private Room ${code} expired.`);
  }

  // Direct start match (from Matchmaking or Tournaments)
  startMatch(gameId: string, playerIds: string[]): string {
    const matchId = `match_${Math.random().toString(36).substring(2, 10)}`;
    const engine = RULE_ENGINES[gameId];

    const match: MatchState = {
      id: matchId,
      gameId,
      status: 'PLAYING',
      players: playerIds,
      boardState: engine ? engine.getInitialState(playerIds) : {},
      turn: playerIds[0],
      moves: [],
      viewers: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.activeMatches.set(matchId, match);
    db.saveMatch(match);

    // Send notifications to all joined players
    playerIds.forEach(pId => {
      const pSocket = this.activeSockets.get(pId);
      if (pSocket) {
        pSocket.send(JSON.stringify({
          type: 'MATCH_STARTED',
          payload: { matchId, gameId }
        }));
      }
    });

    console.log(`Match ${matchId} started for game ${gameId} with players: ${playerIds.join(', ')}`);
    return matchId;
  }

  // Get active match state
  getMatchState(matchId: string, currentUserId?: string): MatchState | undefined {
    if (matchId.startsWith('match_solo_') && !this.activeMatches.has(matchId)) {
      const prefix = 'match_solo_';
      const lastUnderscoreIndex = matchId.lastIndexOf('_');
      const gameId = matchId.substring(prefix.length, lastUnderscoreIndex);
      const pId = currentUserId || 'user_a';
      const botId = 'bot_computer';

      const engine = RULE_ENGINES[gameId];
      if (engine) {
        const match: MatchState = {
          id: matchId,
          gameId,
          status: 'PLAYING',
          players: [pId, botId],
          boardState: engine.getInitialState([pId, botId]),
          turn: pId, // User goes first!
          moves: [],
          viewers: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        this.activeMatches.set(matchId, match);
        db.saveMatch(match);
      }
    }
    return this.activeMatches.get(matchId) || db.getMatch(matchId);
  }

  // Send action from player
  handlePlayerMove(userId: string, matchId: string, move: any) {
    const match = this.activeMatches.get(matchId);
    if (!match || match.status !== 'PLAYING') return;

    const engine = RULE_ENGINES[match.gameId];
    if (!engine) return;

    // Execute engine validate and state update
    const result = engine.validateMove(match.boardState, move, userId, match.players);

    if (!result.valid) {
      const socket = this.activeSockets.get(userId);
      if (socket) {
        socket.send(JSON.stringify({ type: 'MOVE_REJECTED', payload: { error: result.error } }));
      }
      return;
    }

    // Update match state
    match.boardState = result.newState;
    match.turn = result.newState.turnIndex !== undefined ? match.players[result.newState.turnIndex] : match.turn;

    // Log move
    const newMove = {
      player: userId,
      move,
      timestamp: Date.now(),
      sequence: match.moves.length + 1
    };
    match.moves.push(newMove);
    match.updatedAt = Date.now();

    if (result.isTerminal) {
      match.status = 'ENDED';
      match.winner = result.winner;
      this.endMatch(match);
    } else {
      this.activeMatches.set(matchId, match);
      db.saveMatch(match);
      this.broadcastMatchState(matchId);

      // Trigger bot move if solo mode and bot's turn, or speed_math auto-answer
      if (matchId.startsWith('match_solo_')) {
        if (match.turn === 'bot_computer') {
          setTimeout(() => {
            this.makeBotMove(matchId);
          }, 800);
        } else if (match.gameId === 'speed_math' && match.boardState.answers['bot_computer'] === null) {
          // In speed math, trigger bot to answer with a small delay (e.g. 500ms to 1300ms)
          setTimeout(() => {
            const currentMatch = this.activeMatches.get(matchId);
            if (currentMatch && currentMatch.status === 'PLAYING' && currentMatch.boardState.answers['bot_computer'] === null) {
              const state = currentMatch.boardState;
              const isCorrect = Math.random() > 0.25; // 75% accuracy
              const botAnswer = isCorrect ? state.equation.isCorrect : !state.equation.isCorrect;
              this.handlePlayerMove('bot_computer', matchId, { action: 'ANSWER', answer: botAnswer });
            }
          }, 600 + Math.random() * 700);
        }
      }
    }
  }

  // Spectator implementation (Module K)
  addSpectator(userId: string, matchId: string, socket: WebSocket) {
    const match = this.getMatchState(matchId, userId);
    if (!match) {
      socket.send(JSON.stringify({ type: 'SPECTATE_FAILED', payload: { error: 'Không tìm thấy phòng đấu!' } }));
      return;
    }

    let spectators = this.matchSpectators.get(matchId);
    if (!spectators) {
      spectators = new Set<WebSocket>();
      this.matchSpectators.set(matchId, spectators);
    }

    // Viewer limit cap of 50 (FR-SPEC-03)
    if (spectators.size >= 50) {
      socket.send(JSON.stringify({ type: 'SPECTATE_FAILED', payload: { error: 'Phòng đấu đã đầy người xem (tối đa 50)!' } }));
      return;
    }

    spectators.add(socket);
    match.viewers = Array.from(spectators).map(() => 'Spectator'); // track counts
    this.activeMatches.set(matchId, match);

    console.log(`User ${userId} started spectating match ${matchId}. Total viewers: ${spectators.size}`);

    // Push initial match snapshot to spectator
    socket.send(JSON.stringify({
      type: 'MATCH_STATE_UPDATE',
      payload: match
    }));
  }

  removeSpectator(matchId: string, socket: WebSocket) {
    const spectators = this.matchSpectators.get(matchId);
    if (spectators) {
      spectators.delete(socket);
      const match = this.activeMatches.get(matchId);
      if (match) {
        match.viewers = Array.from(spectators).map(() => 'Spectator');
        this.activeMatches.set(matchId, match);
      }
    }
  }

  // Trigger forfeit/manual end
  forfeitMatch(userId: string, matchId: string) {
    const match = this.activeMatches.get(matchId);
    if (!match || match.status !== 'PLAYING') return;

    const opponent = match.players.find(p => p !== userId) || match.players[0];
    match.status = 'ENDED';
    match.winner = opponent;
    this.endMatch(match);
  }

  // Disconnection timer setup
  private handleDisconnectionGrace(userId: string) {
    // Find if player is in any active PLAYING matches
    for (const [matchId, match] of this.activeMatches.entries()) {
      if (match.status === 'PLAYING' && match.players.includes(userId)) {
        // Broadcast disconnection warning to opponent
        this.broadcastToMatch(matchId, {
          type: 'PLAYER_DISCONNECTED',
          payload: { userId, gracePeriodSeconds: 60 }
        });

        // Start 60 second forfeit timer (Module E)
        const timer = setTimeout(() => {
          console.log(`Disconnection grace expired for ${userId}. Forfeiting match ${matchId}.`);
          this.forfeitMatch(userId, matchId);
          this.reconnectTimers.delete(userId);
        }, 60000);

        this.reconnectTimers.set(userId, timer);
      }
    }
  }

  private notifyReconnection(userId: string) {
    for (const [matchId, match] of this.activeMatches.entries()) {
      if (match.status === 'PLAYING' && match.players.includes(userId)) {
        this.broadcastToMatch(matchId, {
          type: 'PLAYER_RECONNECTED',
          payload: { userId }
        });
        // Resend full state
        this.broadcastMatchState(matchId);
      }
    }
  }

  // Finalize match, recalculate Elo, award badges and save
  private endMatch(match: MatchState) {
    console.log(`Match ${match.id} has ended. Winner: ${match.winner}`);

    // Persist to database
    db.saveMatch(match);
    this.activeMatches.delete(match.id);

    // Perform Elo and Honor score recalculations
    if (match.winner && match.winner !== 'DRAW' && match.players.length === 2) {
      const p1Id = match.players[0];
      const p2Id = match.players[1];
      const p1Profile = this.getOrInitializeProfile(p1Id);
      const p2Profile = this.getOrInitializeProfile(p2Id);

      const eloKey = match.gameId;
      const r1 = p1Profile.elo[eloKey] || 1500;
      const r2 = p2Profile.elo[eloKey] || 1500;

      // Elo calculation
      const kFactor = 32;
      const e1 = 1 / (1 + Math.pow(10, (r2 - r1) / 400));
      const e2 = 1 / (1 + Math.pow(10, (r1 - r2) / 400));

      const isP1Winner = match.winner === p1Id;
      const s1 = isP1Winner ? 1 : 0;
      const s2 = isP1Winner ? 0 : 1;

      const newR1 = Math.round(r1 + kFactor * (s1 - e1));
      const newR2 = Math.round(r2 + kFactor * (s2 - e2));

      p1Profile.elo[eloKey] = newR1;
      p2Profile.elo[eloKey] = newR2;

      // Update Honor Scores (Win = +15, Loss = +2, Draw = +5)
      p1Profile.honorScore += isP1Winner ? 15 : 2;
      p2Profile.honorScore += isP1Winner ? 2 : 15;

      // Badges
      this.checkAndAwardBadges(p1Profile, eloKey, isP1Winner);
      this.checkAndAwardBadges(p2Profile, eloKey, !isP1Winner);

      db.saveProfile(p1Profile);
      db.saveProfile(p2Profile);

      console.log(`Elo Updated: ${p1Profile.displayName} (${r1} -> ${newR1}), ${p2Profile.displayName} (${r2} -> ${newR2})`);
    }

    // Broadcast final result to all connected sockets
    this.broadcastToMatch(match.id, {
      type: 'MATCH_ENDED',
      payload: match
    });

    // Clear spectators
    const spectators = this.matchSpectators.get(match.id);
    if (spectators) {
      spectators.clear();
      this.matchSpectators.delete(match.id);
    }
  }

  // Broadcaster routines
  broadcastMatchState(matchId: string) {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    this.broadcastToMatch(matchId, {
      type: 'MATCH_STATE_UPDATE',
      payload: match
    });
  }

  private broadcastToMatch(matchId: string, message: any) {
    const match = this.getMatchState(matchId);
    if (!match) return;

    const msgString = JSON.stringify(message);

    // Send to players
    match.players.forEach(pId => {
      const socket = this.activeSockets.get(pId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(msgString);
      }
    });

    // Send to spectators
    const spectators = this.matchSpectators.get(matchId);
    if (spectators) {
      spectators.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(msgString);
        }
      });
    }
  }

  // Profile Lazy Init Utility
  getOrInitializeProfile(userId: string): UserProfile {
    let profile = db.getProfile(userId);
    if (!profile) {
      profile = {
        id: userId,
        displayName: userId === 'bot_computer' ? '🤖 Máy Siêu Trí Tuệ' : `Kỳ thủ ${userId.substring(0, 5)}`,
        avatar: userId === 'bot_computer' 
          ? `https://api.dicebear.com/7.x/bottts/svg?seed=computer` 
          : `https://api.dicebear.com/7.x/pixel-art/svg?seed=${userId}`,
        elo: {},
        honorScore: 100,
        badges: []
      };
      db.saveProfile(profile);
    }
    return profile;
  }

  private checkAndAwardBadges(profile: UserProfile, gameId: string, isWinner: boolean) {
    const badges = new Set(profile.badges);

    if (isWinner && !badges.has('Chặng Đường Đầu')) {
      badges.add('Chặng Đường Đầu'); // First Win badge
    }

    if (profile.honorScore >= 500 && !badges.has('Cao Thủ Học Đường')) {
      badges.add('Cao Thủ Học Đường');
    }

    profile.badges = Array.from(badges);
  }

  // --- COMPUTER BOT ENGINE IMPLEMENTATIONS ---
  private makeBotMove(matchId: string) {
    const match = this.activeMatches.get(matchId);
    if (!match || match.status !== 'PLAYING' || match.turn !== 'bot_computer') return;

    const engine = RULE_ENGINES[match.gameId];
    if (!engine) return;

    const state = match.boardState;
    let botMove: any = null;

    try {
      if (match.gameId === 'caro') {
        botMove = this.getCaroBotMove(state);
      } else if (match.gameId === 'co_tuong') {
        botMove = this.getChineseChessBotMove(state);
      } else if (match.gameId === 'co_vua') {
        botMove = this.getChessBotMove(state);
      } else if (match.gameId === 'o_an_quan') {
        botMove = this.getOAnQuanBotMove(state);
      } else if (match.gameId === 'co_ca_ngua') {
        botMove = this.getLudoBotMove(state);
      } else if (['duoi_hinh_bat_chu', 'noi_chu', 'doan_tu'].includes(match.gameId)) {
        botMove = this.getQuizBotMove(state, match.gameId);
      } else if (match.gameId === 'memory_match') {
        botMove = this.getMemoryMatchBotMove(state);
      }
    } catch (err) {
      console.error('Error generating bot move', err);
    }

    if (botMove) {
      this.handlePlayerMove('bot_computer', matchId, botMove);
    }
  }

  private getMemoryMatchBotMove(state: any): { action: 'FLIP'; index: number } | null {
    const unflipped = state.cards.filter((c: any) => !c.isMatched && !c.isFlipped);
    if (unflipped.length === 0) return null;

    if (state.selectedIndices.length === 0) {
      // Pick any random unflipped card
      const choice = unflipped[Math.floor(Math.random() * unflipped.length)];
      return { action: 'FLIP', index: choice.id };
    } else if (state.selectedIndices.length === 1) {
      const firstCardIdx = state.selectedIndices[0];
      const firstCard = state.cards[firstCardIdx];

      // Find if there's a card with same symbol that's unflipped
      const potentialMatches = unflipped.filter((c: any) => c.id !== firstCardIdx);
      if (potentialMatches.length === 0) return null;

      const exactMatch = potentialMatches.find((c: any) => c.symbol === firstCard.symbol);
      // 55% chance the bot remembers the exact match, otherwise picks random
      if (exactMatch && Math.random() < 0.55) {
        return { action: 'FLIP', index: exactMatch.id };
      } else {
        const choice = potentialMatches[Math.floor(Math.random() * potentialMatches.length)];
        return { action: 'FLIP', index: choice.id };
      }
    }
    return null;
  }

  private getCaroBotMove(state: any): { r: number; c: number } {
    const board = state.board;
    let bestR = 7;
    let bestC = 7;
    let maxScore = -1;

    const countLine = (r: number, c: number, dr: number, dc: number, symbol: string) => {
      let count = 0;
      let nr = r + dr;
      let nc = c + dc;
      while (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] === symbol) {
        count++;
        nr += dr;
        nc += dc;
      }
      return count;
    };

    const evaluateSpot = (r: number, c: number) => {
      const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
      let botMaxChain = 0;
      let playerMaxChain = 0;
      let proximityScore = 0;

      for (const [dr, dc] of directions) {
        const botCount = countLine(r, c, dr, dc, 'O') + countLine(r, c, -dr, -dc, 'O');
        const playerCount = countLine(r, c, dr, dc, 'X') + countLine(r, c, -dr, -dc, 'X');
        botMaxChain = Math.max(botMaxChain, botCount);
        playerMaxChain = Math.max(playerMaxChain, playerCount);
      }

      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] !== null) {
            proximityScore += (3 - Math.max(Math.abs(dr), Math.abs(dc)));
          }
        }
      }

      let score = proximityScore;
      if (botMaxChain >= 4) score += 100000;
      else if (playerMaxChain >= 4) score += 50000;
      else if (botMaxChain === 3) score += 10000;
      else if (playerMaxChain === 3) score += 5000;
      else if (botMaxChain === 2) score += 1000;
      else if (playerMaxChain === 2) score += 500;

      score += (15 - Math.abs(r - 7) - Math.abs(c - 7)) * 2;
      return score;
    };

    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (board[r][c] === null) {
          const score = evaluateSpot(r, c);
          if (score > maxScore) {
            maxScore = score;
            bestR = r;
            bestC = c;
          }
        }
      }
    }

    return { r: bestR, c: bestC };
  }

  private getChineseChessBotMove(state: any): { from: { r: number; c: number }; to: { r: number; c: number } } {
    const board = state.board;

    const evaluateBoard = (b: any[][]): number => {
      let score = 0;
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          const piece = b[r][c];
          if (piece) {
            let pieceVal = 0;
            switch (piece.type) {
              case 'jiang': pieceVal = 100000; break;
              case 'ju': pieceVal = 950; break;
              case 'pao': pieceVal = 470; break;
              case 'ma': pieceVal = 420; break;
              case 'xiang': pieceVal = 220; break;
              case 'shi': pieceVal = 220; break;
              case 'zu':
                if (piece.color === 'B') {
                  // Black pawn gets stronger as it crosses the river (river is at r=4/5)
                  pieceVal = r > 4 ? 200 + (r - 4) * 15 : 100;
                } else {
                  // Red pawn gets stronger as it crosses the river
                  pieceVal = r < 5 ? 200 + (5 - r) * 15 : 100;
                }
                break;
            }

            // Encourage ma (Horse) and ju (Chariot) development
            let positionalBonus = 0;
            if (piece.type === 'ma' || piece.type === 'ju' || piece.type === 'pao') {
              // Prefer files near the center
              positionalBonus += (4 - Math.abs(c - 4)) * 12;
              // Encourage pushing forward
              if (piece.color === 'B') {
                positionalBonus += r * 8;
              } else {
                positionalBonus += (9 - r) * 8;
              }
            }

            if (piece.color === 'B') {
              score += (pieceVal + positionalBonus);
            } else {
              score -= (pieceVal + positionalBonus);
            }
          }
        }
      }
      return score;
    };

    const cloneBoard = (b: any[][]): any[][] => {
      const next = [];
      for (let r = 0; r < b.length; r++) {
        next.push([...b[r]]);
      }
      return next;
    };

    const makeSimulatedMove = (b: any[][], from: { r: number; c: number }, to: { r: number; c: number }): any[][] => {
      const next = cloneBoard(b);
      const piece = next[from.r][from.c];
      next[from.r][from.c] = null;
      next[to.r][to.c] = piece;
      return next;
    };

    // Piece values for move ordering (MVV-LVA-lite): high-value captures sort
    // first so alpha-beta prunes more aggressively. Matches evaluateBoard()
    // weights.
    const PIECE_VALUE: Record<string, number> = {
      jiang: 100000, ju: 950, pao: 470, ma: 420, xiang: 220, shi: 220, zu: 100,
    };

    const alphaBeta = (
      b: any[][],
      depth: number,
      alpha: number,
      beta: number,
      isMaximizing: boolean,
      deadline?: number
    ): { score: number; move: { from: { r: number; c: number }; to: { r: number; c: number } } | null; aborted?: boolean } => {
      // Abort mid-iteration if time budget expired. At depth 0 we still
      // return a real evaluation so the leaf doesn't get wasted; otherwise
      // the wrapper uses the `aborted` flag to fall back to the previous
      // (shallower) completed best move.
      if (deadline !== undefined && Date.now() >= deadline && depth > 0) {
        return { score: 0, move: null, aborted: true };
      }
      if (depth === 0) {
        // Add tiny random noise to keep play dynamic
        const noise = (Math.random() - 0.5) * 8;
        return { score: evaluateBoard(b) + noise, move: null };
      }

      // Terminal checks (King missing)
      let blackKingFound = false;
      let redKingFound = false;
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          const p = b[r][c];
          if (p && p.type === 'jiang') {
            if (p.color === 'B') blackKingFound = true;
            else redKingFound = true;
          }
        }
      }
      if (!blackKingFound) return { score: -100000 - depth, move: null };
      if (!redKingFound) return { score: 100000 + depth, move: null };

      let bestMove: { from: { r: number; c: number }; to: { r: number; c: number } } | null = null;

      if (isMaximizing) {
        let maxEval = -Infinity;
        const movesList: { from: { r: number; c: number }; to: { r: number; c: number } }[] = [];
        for (let r = 0; r < 10; r++) {
          for (let c = 0; c < 9; c++) {
            const piece = b[r][c];
            if (piece && piece.color === 'B') {
              const targets = getChineseChessLegalMoves(r, c, b);
              for (const t of targets) {
                movesList.push({ from: { r, c }, to: t });
              }
            }
          }
        }

        // Move sorting: prioritize captures & king threats for better alpha-beta pruning efficiency
        movesList.sort((a, b) => {
          const targetA = b.to ? b[a.to.r]?.[a.to.c] : null;
          const targetB = b.to ? b[b.to.r]?.[b.to.c] : null;
          const valA = targetA ? (PIECE_VALUE[targetA.type] ?? 0) : 0;
          const valB = targetB ? (PIECE_VALUE[targetB.type] ?? 0) : 0;
          return valB - valA;
        });

        for (const m of movesList) {
          if (deadline !== undefined && Date.now() >= deadline) {
            return { score: 0, move: null, aborted: true };
          }
          const nextBoard = makeSimulatedMove(b, m.from, m.to);
          const ev = alphaBeta(nextBoard, depth - 1, alpha, beta, false, deadline).score;
          if (ev > maxEval) {
            maxEval = ev;
            bestMove = m;
          }
          alpha = Math.max(alpha, ev);
          if (beta <= alpha) {
            break;
          }
        }
        return { score: maxEval, move: bestMove };
      } else {
        let minEval = Infinity;
        const movesList: { from: { r: number; c: number }; to: { r: number; c: number } }[] = [];
        for (let r = 0; r < 10; r++) {
          for (let c = 0; c < 9; c++) {
            const piece = b[r][c];
            if (piece && piece.color === 'R') {
              const targets = getChineseChessLegalMoves(r, c, b);
              for (const t of targets) {
                movesList.push({ from: { r, c }, to: t });
              }
            }
          }
        }

        movesList.sort((a, b) => {
          const targetA = b.to ? b[a.to.r]?.[a.to.c] : null;
          const targetB = b.to ? b[b.to.r]?.[b.to.c] : null;
          const valA = targetA ? (PIECE_VALUE[targetA.type] ?? 0) : 0;
          const valB = targetB ? (PIECE_VALUE[targetB.type] ?? 0) : 0;
          return valB - valA;
        });

        for (const m of movesList) {
          if (deadline !== undefined && Date.now() >= deadline) {
            return { score: 0, move: null, aborted: true };
          }
          const nextBoard = makeSimulatedMove(b, m.from, m.to);
          const ev = alphaBeta(nextBoard, depth - 1, alpha, beta, true, deadline).score;
          if (ev < minEval) {
            minEval = ev;
            bestMove = m;
          }
          beta = Math.min(beta, ev);
          if (beta <= alpha) {
            break;
          }
        }
        return { score: minEval, move: bestMove };
      }
    };

    // Iterative-deepening search: start shallow, deepen while time remains.
    // Node has no per-request CPU cap, but humans won't wait >3s — cap at 3s
    // and max depth 6. We always keep the deepest *completed* iteration's
    // move, so a depth-N+1 budget overrun falls back gracefully to depth-N
    // instead of returning null.
    const TIME_BUDGET_MS = 3000;
    const MAX_DEPTH = 6;
    const startTime = Date.now();
    const deadline = startTime + TIME_BUDGET_MS;
    let bestResult: { score: number; move: { from: { r: number; c: number }; to: { r: number; c: number } } | null } | null = null;
    for (let d = 1; d <= MAX_DEPTH; d++) {
      if (Date.now() >= deadline) break;
      const r = alphaBeta(board, d, -Infinity, Infinity, true, deadline);
      if (r.move) bestResult = r;
      else break;
    }
    if (bestResult?.move) {
      return bestResult.move;
    }

    // Fallback if no moves found (should rarely happen unless checkmated)
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = board[r][c];
        if (piece && piece.color === 'B') {
          const moves = getChineseChessLegalMoves(r, c, board);
          if (moves.length > 0) {
            return { from: { r, c }, to: moves[0] };
          }
        }
      }
    }

    return { from: { r: 0, c: 4 }, to: { r: 0, c: 4 } };
  }

  private getChessBotMoves(r: number, c: number, board: any[][]): { r: number; c: number }[] {
    const piece = board[r][c];
    if (!piece || piece.color !== 'B') return [];
    const moves: { r: number; c: number }[] = [];

    const isOOB = (row: number, col: number) => row < 0 || row >= 8 || col < 0 || col >= 8;

    const addMoveIfValid = (row: number, col: number) => {
      if (isOOB(row, col)) return false;
      const target = board[row][col];
      if (!target) {
        moves.push({ r: row, c: col });
        return true;
      } else {
        if (target.color === 'W') {
          moves.push({ r: row, c: col });
        }
        return false;
      }
    };

    if (piece.type === 'P') {
      const nextR = r + 1;
      if (!isOOB(nextR, c) && board[nextR][c] === null) {
        moves.push({ r: nextR, c });
        if (r === 1 && board[r + 2][c] === null) {
          moves.push({ r: r + 2, c });
        }
      }
      const diagCols = [c - 1, c + 1];
      for (const dc of diagCols) {
        if (!isOOB(nextR, dc)) {
          const target = board[nextR][dc];
          if (target && target.color === 'W') {
            moves.push({ r: nextR, c: dc });
          }
        }
      }
    } else if (piece.type === 'N') {
      const knightOffsets = [
        [-2, -1], [-2, 1], [2, -1], [2, 1],
        [-1, -2], [-1, 2], [1, -2], [1, 2]
      ];
      for (const [dr, dc] of knightOffsets) {
        addMoveIfValid(r + dr, c + dc);
      }
    } else if (piece.type === 'B' || piece.type === 'Q') {
      const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of diagDirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (!isOOB(nr, nc)) {
          const keepGoing = addMoveIfValid(nr, nc);
          if (!keepGoing) break;
          nr += dr;
          nc += dc;
        }
      }
    } 
    
    if (piece.type === 'R' || piece.type === 'Q') {
      const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of orthoDirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (!isOOB(nr, nc)) {
          const keepGoing = addMoveIfValid(nr, nc);
          if (!keepGoing) break;
          nr += dr;
          nc += dc;
        }
      }
    } else if (piece.type === 'K') {
      const kingDirs = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],          [0, 1],
        [1, -1],  [1, 0],  [1, 1]
      ];
      for (const [dr, dc] of kingDirs) {
        addMoveIfValid(r + dr, c + dc);
      }
    }

    return moves;
  }

  private getChessBotMove(state: any): { from: { r: number; c: number }; to: { r: number; c: number } } {
    const board = state.board;
    const candidates: { from: { r: number; c: number }; to: { r: number; c: number }; score: number }[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.color === 'B') {
          const legalMoves = this.getChessBotMoves(r, c, board);
          for (const m of legalMoves) {
            const target = board[m.r][m.c];
            let score = 0;
            if (target) {
              const weights: Record<string, number> = {
                K: 10000,
                Q: 900,
                R: 500,
                B: 300,
                N: 300,
                P: 100
              };
              score += weights[target.type] || 100;
            }

            score += m.r * 1.5;
            score += Math.random() * 10;

            candidates.push({ from: { r, c }, to: m, score });
          }
        }
      }
    }

    if (candidates.length === 0) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece && piece.color === 'B') {
            for (let tr = 0; tr < 8; tr++) {
              for (let tc = 0; tc < 8; tc++) {
                if (board[tr][tc]?.color !== 'B') {
                  return { from: { r, c }, to: { r: tr, c: tc } };
                }
              }
            }
          }
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return { from: candidates[0].from, to: candidates[0].to };
  }

  private getOAnQuanBotMove(state: any): { boxIndex: number; direction: 'cw' | 'ccw' } {
    const boxes = state.boxes;
    const candidates: { boxIndex: number; direction: 'cw' | 'ccw'; score: number }[] = [];

    const evaluateChoice = (boxIdx: number, direction: 'cw' | 'ccw') => {
      let bCopy = [...boxes];
      let stones = bCopy[boxIdx];
      bCopy[boxIdx] = 0;

      let curr = boxIdx;
      const nextIdx = (idx: number, dir: 'cw' | 'ccw') => {
        return dir === 'cw' ? (idx + 1) % 12 : (idx - 1 + 12) % 12;
      };

      let hand = stones;
      let pointsGained = 0;

      while (hand > 0) {
        curr = nextIdx(curr, direction);
        bCopy[curr]++;
        hand--;

        if (hand === 0) {
          const next = nextIdx(curr, direction);
          if (next === 10 || next === 11) {
            break;
          } else if (bCopy[next] > 0) {
            hand = bCopy[next];
            bCopy[next] = 0;
            curr = next;
          } else {
            let checkEmpty = next;
            while (true) {
              const target = nextIdx(checkEmpty, direction);
              if (bCopy[target] > 0) {
                pointsGained += bCopy[target];
                bCopy[target] = 0;
                const postTarget = nextIdx(target, direction);
                if (bCopy[postTarget] === 0) {
                  checkEmpty = postTarget;
                } else {
                  break;
                }
              } else {
                break;
              }
            }
            break;
          }
        }
      }
      return pointsGained;
    };

    for (let i = 5; i <= 9; i++) {
      if (boxes[i] > 0) {
        for (const dir of ['cw', 'ccw'] as const) {
          const captured = evaluateChoice(i, dir);
          let score = captured * 100;
          score += i * 2;
          score += Math.random() * 5;
          candidates.push({ boxIndex: i, direction: dir, score });
        }
      }
    }

    if (candidates.length === 0) {
      return { boxIndex: 5, direction: 'cw' };
    }

    candidates.sort((a, b) => b.score - a.score);
    return { boxIndex: candidates[0].boxIndex, direction: candidates[0].direction };
  }

  private getLudoBotMove(state: any): { action: 'ROLL_DICE' | 'MOVE_HORSE'; horseIdx?: number } {
    if (state.diceStatus === 'NEED_ROLL') {
      return { action: 'ROLL_DICE' };
    }

    const roll = state.diceRoll;
    const playerHorses = state.horses[1];
    const candidates: { idx: number; score: number }[] = [];

    for (let i = 0; i < 4; i++) {
      const h = playerHorses[i];
      let score = -999;

      if (h.pos === 'S') {
        if (roll === 6) {
          score = 500;
        }
      } else if (h.pos.startsWith('H')) {
        const rank = parseInt(h.pos.substring(1));
        if (rank + 1 === roll) {
          score = 300 + rank * 50;
        }
      } else {
        const currPosInt = parseInt(h.pos);
        const nextStepCount = h.stepCount + roll;

        if (nextStepCount < 48) {
          score = 100 + nextStepCount;
          const nextPos = String((currPosInt + roll) % 48);
          const opponentHorses = state.horses[0];
          const canCapture = opponentHorses.some((oh: any) => oh.pos === nextPos);
          if (canCapture) {
            score += 1000;
          }
        } else if (nextStepCount === 48) {
          score = 600;
        }
      }

      if (score > -999) {
        score += Math.random() * 20;
        candidates.push({ idx: i, score });
      }
    }

    if (candidates.length === 0) {
      return { action: 'MOVE_HORSE', horseIdx: 0 };
    }

    candidates.sort((a, b) => b.score - a.score);
    return { action: 'MOVE_HORSE', horseIdx: candidates[0].idx };
  }

  private getQuizBotMove(state: any, gameId: string): any {
    if (gameId === 'duoi_hinh_bat_chu') {
      if (state.buzzerActive === 'bot_computer') {
        const isCorrect = Math.random() > 0.4;
        const guess = isCorrect ? state.clue.word : 'SAI_ROI';
        return { action: 'SUBMIT', guess };
      } else if (state.buzzerActive === null) {
        if (Math.random() > 0.6) {
          return { action: 'BUZZ' };
        }
      }
    } else if (gameId === 'noi_chu') {
      return this.getNoiChuBotMove(state);
    } else if (gameId === 'doan_tu') {
      return this.getDoanTuBotMove(state);
    }
    return null;
  }

  private getNoiChuBotMove(state: any): { word: string } {
    const prevWordParts = state.currentWord.trim().split(/\s+/);
    const lastWord = prevWordParts[prevWordParts.length - 1].toLowerCase();

    const suffixes = NOI_CHU_DICT[lastWord] || ['mới', 'đẹp', 'tốt', 'mạnh', 'nhanh', 'cao', 'vui', 'học'];
    const usedWords = state.history.map((w: string) => w.toLowerCase());
    
    let chosenSuffix = suffixes[0];
    for (const suf of suffixes) {
      const candidate = `${lastWord} ${suf}`;
      if (!usedWords.includes(candidate.toLowerCase())) {
        chosenSuffix = suf;
        break;
      }
    }

    const firstCharCapitalized = lastWord.charAt(0).toUpperCase() + lastWord.slice(1);
    return { word: `${firstCharCapitalized} ${chosenSuffix}` };
  }

  private getDoanTuBotMove(state: any): { guess: string } {
    const usedGuesses = state.guesses['bot_computer']?.map((g: any) => g.guess) || [];
    const available = DOAN_TU_WORDS.filter(w => !usedGuesses.includes(w));
    const guess = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : 'TRUYEN';
    return { guess };
  }
}

const NOI_CHU_DICT: Record<string, string[]> = {
  'học': ['sinh', 'tập', 'đường', 'phí', 'bổng', 'giả', 'thuật', 'hành', 'vị'],
  'sinh': ['nhật', 'viên', 'hoạt', 'tồn', 'học', 'sản', 'lý', 'thái', 'mệnh'],
  'nhật': ['bản', 'trình', 'ký', 'báo', 'thực', 'nguyệt', 'dạ', 'quang'],
  'bản': ['đồ', 'tin', 'chất', 'thân', 'năng', 'sắc', 'quyền', 'vẽ', 'nhạc'],
  'đồ': ['chơi', 'dùng', 'thờ', 'án', 'thị', 'sứ', 'gỗ', 'gia', 'bản'],
  'chơi': ['bời', 'đùa', 'game', 'nhạc', 'thể', 'vui', 'gai', 'chữ', 'khăm'],
  'báo': ['chí', 'cáo', 'hiệu', 'thức', 'tin', 'thù', 'ân', 'động', 'giá'],
  'tin': ['tức', 'hiệu', 'lòng', 'cậy', 'yêu', 'tưởng', 'ngưỡng', 'buồn', 'vui'],
  'tức': ['khắc', 'giận', 'thời', 'ngực', 'tối', 'tốc', 'đoạt', 'trí', 'thì'],
  'khắc': ['ghi', 'khoải', 'khổ', 'họa', 'tinh', 'chế', 'bản', 'trùng'],
  'giận': ['hờn', 'dỗi', 'dữ', 'quá', 'đỏ', 'tím', 'sôi', 'lôi', 'đùng'],
  'hờn': ['ghen', 'giận', 'trách', 'tủi', 'mát', 'mưa', 'sóng', 'căm'],
  'ghen': ['tuông', 'ghét', 'tị', 'bóng', 'gió', 'tuông', 'hờn', 'ăn'],
  'tuông': ['trào', 'rơi', 'chảy', 'máu', 'lệ', 'suy', 'nghĩ', 'tính'],
  'trào': ['lưu', 'dâng', 'phúng', 'ngược', 'phúng', 'sôi', 'máu', 'lệ'],
  'lưu': ['hành', 'vong', 'niệm', 'bút', 'loát', 'trữ', 'thông', 'luyến'],
  'hành': ['trình', 'động', 'vi', 'lý', 'khách', 'quân', 'hạ', 'pháp'],
  'trình': ['bày', 'diễn', 'tự', 'báo', 'độ', 'thuật', 'diện', 'báo'],
  'bày': ['biện', 'tỏ', 'trò', 'vẽ', 'mưu', 'tiệc', 'đồ', 'ra'],
  'tỏ': ['tường', 'vẻ', 'ý', 'bày', 'rõ', 'lòng', 'tình', 'thái'],
  'tường': ['trình', 'vân', 'thuật', 'tận', 'vách', 'gạch', 'đá'],
  'máy': ['bay', 'tính', 'móc', 'ảnh', 'quay', 'khoan', 'bơm', 'nổ'],
  'bay': ['lượn', 'nhảy', 'mất', 'cao', 'xa', 'màu', 'hơi', 'bổng'],
  'tính': ['cách', 'toán', 'mạng', 'chất', 'tình', 'nết', 'nhẩm', 'năng'],
  'cách': ['mạng', 'điệu', 'trở', 'ly', 'biệt', 'nhìn', 'sống', 'dùng'],
  'mạng': ['lưới', 'nhện', 'mộc', 'hỏa', 'thủy', 'kim', 'thổ', 'sống'],
  'lưới': ['sắt', 'bóng', 'đánh', 'cá', 'nhện', 'điện', 'an', 'trời'],
  'nhện': ['độc', 'giăng', 'tơ', 'con', 'khổng', 'lồ', 'nước', 'đất'],
  'tơ': ['hồng', 'lụa', 'vương', 'lòng', 'duyên', 'kẽ', 'chỉ', 'tóc'],
  'hồng': ['hào', 'nhan', 'ngoại', 'hoa', 'sâm', 'ngọc', 'trà', 'quân'],
  'trà': ['sữa', 'xanh', 'đá', 'đào', 'gừng', 'hoa', 'cúc', 'bạc', 'hà'],
  'sữa': ['đậu', 'tươi', 'chua', 'bột', 'mẹ', 'tắm', 'rửa', 'mặt']
};

const DOAN_TU_WORDS = ['TRUYEN', 'NGUYEN', 'CHUYEN', 'THUYEN', 'THUONG', 'TRUONG', 'PHUONG', 'KHUYEN', 'DUONG', 'HOANG'];

export const roomManager = new RoomManager();
