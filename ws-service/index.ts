import http from 'node:http';
import { WebSocketServer } from 'ws';
import { roomManager } from '@/server/roomManager';
import { tournamentManager } from '@/server/tournamentManager';
import { verifyUser } from './auth';

const PORT = Number(process.env.PORT_WS ?? 3001);

function handleMessage(userId: string, msg: any, ws: any) {
  const { type, payload } = msg ?? {};
  switch (type) {
    case 'REGISTER_SOCKET':
      roomManager.registerSocket(userId, ws);
      ws.send(JSON.stringify({ type: 'REGISTERED', payload: { success: true } }));
      return;
    case 'JOIN_MATCHMAKING':
      roomManager.joinMatchmaking(userId, payload.gameId, ws);
      return;
    case 'LEAVE_MATCHMAKING':
      roomManager.leaveMatchmaking(userId);
      ws.send(JSON.stringify({ type: 'MATCHMAKING_STATUS', payload: { status: 'IDLE' } }));
      return;
    case 'CREATE_PRIVATE_ROOM': {
      const code = roomManager.createPrivateRoom(userId, payload.gameId);
      ws.send(JSON.stringify({ type: 'PRIVATE_ROOM_CREATED', payload: { code } }));
      return;
    }
    case 'JOIN_PRIVATE_ROOM': {
      const match = roomManager.joinPrivateRoom(userId, payload.code, ws);
      if (!match) {
        ws.send(JSON.stringify({ type: 'PRIVATE_ROOM_FAILED', payload: { error: 'Không thể vào phòng! Mã sai hoặc phòng đã đầy.' } }));
      }
      return;
    }
    case 'SEND_INVITATION': {
      const targetSocket = roomManager.getSocket(payload.targetUserId);
      if (targetSocket && payload.targetUserId) {
        const senderProfile = roomManager.getOrInitializeProfile(userId);
        targetSocket.send(JSON.stringify({
          type: 'PRIVATE_ROOM_INVITATION',
          payload: {
            fromUserId: userId,
            fromUserName: senderProfile.displayName,
            gameId: payload.gameId,
            code: payload.code
          }
        }));
      }
      return;
    }
    case 'MAKE_MOVE':
      if (payload.matchId) {
        roomManager.handlePlayerMove(userId, payload.matchId, payload.move);
        const matchState = roomManager.getMatchState(payload.matchId);
        if (matchState && matchState.status === 'ENDED') {
          tournamentManager.reportMatchResult(payload.matchId, matchState.winner);
        }
      }
      return;
    case 'FORFEIT':
      if (payload.matchId) {
        roomManager.forfeitMatch(userId, payload.matchId);
        tournamentManager.reportMatchResult(payload.matchId, roomManager.getMatchState(payload.matchId)?.winner);
      }
      return;
    case 'SPECTATE_MATCH':
      if (payload.matchId) roomManager.addSpectator(userId, payload.matchId, ws);
      return;
    case 'UNSPECTATE_MATCH':
      if (payload.matchId) roomManager.removeSpectator(payload.matchId, ws);
      return;
    default:
      console.log(`[ws] Unknown action: ${type}`);
  }
}

const server = http.createServer((_req, res) => {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('WS-only');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  const userId = url.searchParams.get('userId');
  const v = await verifyUser(userId);
  if (!v.ok) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    (ws as any).userId = v.userId;
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  const userId = (ws as any).userId as string;
  ws.on('message', (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(String(raw));
      handleMessage(userId, msg, ws);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'ERROR', message: (e as Error).message }));
    }
  });
  ws.on('close', () => {
    roomManager.deregisterSocket(userId);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ws] listening on :${PORT}/ws`);
});