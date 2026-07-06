import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback .env, không override giá trị đã set
import { db, hashPassword } from './server/db.ts';
import { roomManager } from './server/roomManager.ts';
import { tournamentManager } from './server/tournamentManager.ts';
import { dailyChallengeManager } from './server/dailyChallengeManager.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Standard express middlewares
  app.use(express.json());

  // AI-powered roster parsing route (OpenAI-compatible)
  app.post('/api/ai/parse-roster', async (req, res) => {
    const { summary } = req.body;
    if (!summary || typeof summary !== 'string' || summary.trim() === '') {
      return res.status(400).json({ error: 'Nội dung tóm tắt không được để trống!' });
    }

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL;
      if (!apiKey) {
        return res.status(500).json({ error: 'Chưa cấu hình OPENAI_API_KEY trong phần Settings > Secrets!' });
      }
      if (!model) {
        return res.status(500).json({ error: 'Chưa cấu hình OPENAI_MODEL (ví dụ: gpt-4o-mini).' });
      }

      const baseURL = process.env.OPENAI_BASE_URL || undefined;

      // Lazy-initialized to prevent server startup crashes if key is missing or invalid
      const ai = new OpenAI({ apiKey, baseURL });

      const rosterTool = {
        type: 'function' as const,
        function: {
          name: 'parse_roster',
          description: 'Trích xuất danh sách đội tuyển và cầu thủ từ văn bản tóm tắt giải đấu.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              teams: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', description: 'Tên của đội tuyển hoặc tên VĐV' },
                    players: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Danh sách tên đầy đủ của các cầu thủ trong đội bóng (nếu có)',
                    },
                  },
                  required: ['name', 'players'],
                },
              },
            },
            required: ['teams'],
          },
        },
      };

      const completion = await ai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'Bạn là một trợ lý ảo phân tích dữ liệu giải đấu thể thao chuyên nghiệp. Nhiệm vụ của bạn là đọc thông tin về các đội bóng và danh sách cầu thủ tham gia, sau đó trích xuất ra cấu trúc dữ liệu JSON chính xác. Luôn trả về đúng schema được yêu cầu.',
          },
          {
            role: 'user',
            content: `Hãy phân tích văn bản tóm tắt giải đấu / đội hình dưới đây và trả về danh sách các đội tuyển cùng danh sách cầu thủ tương ứng.
Nếu là các bộ môn đơn/đôi như bóng bàn hoặc cầu lông, hãy coi mỗi vận động viên hoặc cặp vận động viên là một "đội" và liệt kê tên của họ vào danh sách cầu thủ.

Văn bản cần phân tích:
"""
${summary}
"""`,
          },
        ],
        tools: [rosterTool],
        tool_choice: { type: 'function', function: { name: 'parse_roster' } },
        // Một số provider tương thích cũ (Ollama cũ) bỏ qua tools; ép thêm json_object để fallback ổn định.
        response_format: { type: 'json_object' },
      });

      const msg = completion.choices?.[0]?.message;
      const functionToolCall = msg?.tool_calls?.find(
        (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function' } =>
          tc.type === 'function' && (tc as any).function?.name === 'parse_roster'
      );

      let result: any;
      if (functionToolCall?.function?.arguments) {
        result = JSON.parse(functionToolCall.function.arguments);
      } else if (msg?.content) {
        // Fallback: tool_call bị provider bỏ qua, parse nội dung text như JSON.
        const jsonText = msg.content.trim();
        try {
          result = JSON.parse(jsonText);
        } catch {
          return res.status(500).json({ error: 'AI trả về dữ liệu không phải JSON hợp lệ.' });
        }
      } else {
        return res.status(500).json({ error: 'AI không trả về kết quả phân tích.' });
      }

      res.json(result);
    } catch (error: any) {
      console.error('AI API Error:', error);
      res.status(500).json({ error: 'Không thể phân tích dữ liệu bằng AI. Chi tiết: ' + (error.message || error) });
    }
  });

  // AI-powered bulk player names parser (for Bi Lắc arena)
  app.post('/api/ai/parse-players', async (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ error: 'Vui lòng nhập danh sách tên cần tách!' });
    }

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL;
      if (!apiKey) {
        return res.status(500).json({ error: 'Chưa cấu hình OPENAI_API_KEY trong phần Settings > Secrets!' });
      }
      if (!model) {
        return res.status(500).json({ error: 'Chưa cấu hình OPENAI_MODEL (ví dụ: gpt-4o-mini).' });
      }

      const baseURL = process.env.OPENAI_BASE_URL || undefined;
      const ai = new OpenAI({ apiKey, baseURL });

      const playersTool = {
        type: 'function' as const,
        function: {
          name: 'extract_player_names',
          description: 'Tách danh sách tên người chơi duy nhất từ một đoạn văn bản tự do.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              names: {
                type: 'array',
                items: { type: 'string' },
                description: 'Mỗi phần tử là một tên đầy đủ của người chơi đã được chuẩn hoá (trim, bỏ tiêu đề "Cầu thủ", bỏ số thứ tự đầu dòng, bỏ trùng lặp, giữ thứ tự xuất hiện đầu tiên).',
              },
            },
            required: ['names'],
          },
        },
      };

      const completion = await ai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'Bạn là trợ lý AI trích xuất tên người chơi. Nhiệm vụ: đọc văn bản tự do (danh sách cầu thủ, đội hình, hoặc văn bản hỗn độn) và trả về mảng JSON các tên đầy đủ duy nhất. Bỏ tiêu đề nhóm ("Đội X", "Team A"), bỏ số thứ tự đầu dòng ("1.", "-", "•"), bỏ trùng lặp (giữ lần xuất hiện đầu tiên). Mỗi tên là chuỗi tiếng Việt có dấu, đã được trim khoảng trắng. Không trả thêm text ngoài JSON.',
          },
          {
            role: 'user',
            content: `Hãy trích xuất tất cả tên người chơi duy nhất từ văn bản dưới đây:\n"""\n${text}\n"""`,
          },
        ],
        tools: [playersTool],
        tool_choice: { type: 'function', function: { name: 'extract_player_names' } },
        response_format: { type: 'json_object' },
      });

      const msg = completion.choices?.[0]?.message;
      const functionToolCall = msg?.tool_calls?.find(
        (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function' } =>
          tc.type === 'function' && (tc as any).function?.name === 'extract_player_names'
      );

      let names: string[] = [];
      if (functionToolCall?.function?.arguments) {
        const parsed = JSON.parse(functionToolCall.function.arguments);
        if (Array.isArray(parsed?.names)) names = parsed.names.filter((n: any) => typeof n === 'string' && n.trim());
      } else if (msg?.content) {
        try {
          const parsed = JSON.parse(msg.content.trim());
          if (Array.isArray(parsed?.names)) names = parsed.names.filter((n: any) => typeof n === 'string' && n.trim());
        } catch {
          return res.status(500).json({ error: 'AI trả về dữ liệu không phải JSON hợp lệ.' });
        }
      }

      // Normalize: trim, dedupe (case-insensitive), bỏ token rỗng.
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const raw of names) {
        const n = raw.trim();
        if (!n) continue;
        const key = n.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(n);
      }

      res.json({ names: deduped });
    } catch (error: any) {
      console.error('AI API Error:', error);
      res.status(500).json({ error: 'Không thể tách tên bằng AI. Chi tiết: ' + (error.message || error) });
    }
  });

  // AI helper: parse a free-text match summary into structured events (futsal).
  // The route ONLY fills events — it does not persist; the client must review then save.
  app.post('/api/ai/parse-events', async (req, res) => {
    const { summary, homeTeamName, awayTeamName, homePlayers, awayPlayers } = req.body || {};
    if (!summary || typeof summary !== 'string' || summary.trim() === '') {
      return res.status(400).json({ error: 'Vui lòng nhập tóm tắt diễn biến trận đấu!' });
    }
    const safeHome = (homeTeamName || 'đội nhà').trim();
    const safeAway = (awayTeamName || 'đội khách').trim();

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL;
      if (!apiKey) {
        return res.status(500).json({ error: 'Chưa cấu hình OPENAI_API_KEY trong phần Settings > Secrets!' });
      }
      if (!model) {
        return res.status(500).json({ error: 'Chưa cấu hình OPENAI_MODEL (ví dụ: gpt-4o-mini).' });
      }

      const baseURL = process.env.OPENAI_BASE_URL || undefined;
      const ai = new OpenAI({ apiKey, baseURL });

      const eventsTool = {
        type: 'function' as const,
        function: {
          name: 'extract_match_events',
          description: 'Trích xuất các sự kiện của một trận đấu bóng đá/futsal từ văn bản tóm tắt tự do.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    type: { type: 'string', enum: ['goal', 'yellow', 'red'], description: "Loại sự kiện: 'goal' (bàn thắng), 'yellow' (thẻ vàng), 'red' (thẻ đỏ)." },
                    teamSide: { type: 'string', enum: ['home', 'away', 'unknown'], description: "Bên nào: 'home' (đội nhà), 'away' (đội khách), 'unknown' nếu không phân được." },
                    playerName: { type: 'string', description: 'Tên cầu thủ liên quan, để trống nếu không nêu.' },
                    minute: { type: 'integer', minimum: 0, maximum: 200, description: 'Phút diễn ra, bỏ qua nếu không nêu.' },
                    note: { type: 'string', description: 'Mô tả ngắn gốc từ văn bản (1 câu, tiếng Việt).' },
                  },
                  required: ['type', 'teamSide', 'playerName'],
                },
              },
            },
            required: ['events'],
          },
        },
      };

      const rosterInfo = [
        `- Đội nhà (\"home\"): ${safeHome}. Cầu thủ: ${Array.isArray(homePlayers) && homePlayers.length ? homePlayers.join(', ') : '(không rõ)'}.`,
        `- Đội khách (\"away\"): ${safeAway}. Cầu thủ: ${Array.isArray(awayPlayers) && awayPlayers.length ? awayPlayers.join(', ') : '(không rõ)'}.`,
      ].join('\n');

      const completion = await ai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              `Bạn là trợ lý AI phân tích diễn biến trận đấu bóng đá/futsal. Nhiệm vụ: đọc văn bản tóm tắt tự do và trích xuất danh sách sự kiện (bàn thắng, thẻ vàng, thẻ đỏ). Với mỗi sự kiện:\n` +
              `- Loại sự kiện: 'goal' (ghi bàn), 'yellow' (thẻ vàng), 'red' (thẻ đỏ).\n` +
              `- Bên nào: 'home' nếu liên quan đội nhà, 'away' nếu đội khách, 'unknown' nếu văn bản không rõ (ví dụ chỉ ghi "cầu thủ ghi bàn" mà không nêu đội).\n` +
              `- Tên cầu thủ: chuẩn hoá trùng với roster nếu có thể, bỏ tiêu đề "Cầu thủ". Bỏ qua nếu không nêu.\n` +
              `- Phút: là số nguyên 0-200, bỏ qua nếu không nêu.\n` +
              `- Note: 1 câu tóm tắt gốc.\n` +
              `Bỏ qua các thông tin khác (kết quả cuối, nhận xét chung, dự bị). Trả về JSON đúng schema.`,
          },
          {
            role: 'user',
            content: `Thông tin hai đội:\n${rosterInfo}\n\nTóm tắt diễn biến trận đấu:\n"""\n${summary}\n"""`,
          },
        ],
        tools: [eventsTool],
        tool_choice: { type: 'function', function: { name: 'extract_match_events' } },
        response_format: { type: 'json_object' },
      });

      const msg = completion.choices?.[0]?.message;
      const functionToolCall = msg?.tool_calls?.find(
        (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function' } =>
          tc.type === 'function' && (tc as any).function?.name === 'extract_match_events'
      );

      let events: any[] = [];
      if (functionToolCall?.function?.arguments) {
        const parsed = JSON.parse(functionToolCall.function.arguments);
        if (Array.isArray(parsed?.events)) events = parsed.events;
      } else if (msg?.content) {
        try {
          const parsed = JSON.parse(msg.content.trim());
          if (Array.isArray(parsed?.events)) events = parsed.events;
        } catch {
          return res.status(500).json({ error: 'AI trả về dữ liệu không phải JSON hợp lệ.' });
        }
      }

      // Normalize: chỉ giữ các field hợp lệ theo schema enum.
      const allowedTypes = new Set(['goal', 'yellow', 'red']);
      const allowedSides = new Set(['home', 'away', 'unknown']);
      const cleanEvents = events
        .filter(e => e && allowedTypes.has(e.type) && allowedSides.has(e.teamSide))
        .map(e => ({
          type: e.type,
          teamSide: e.teamSide,
          playerName: typeof e.playerName === 'string' ? e.playerName.trim() : '',
          minute: typeof e.minute === 'number' && e.minute >= 0 && e.minute <= 200 ? e.minute : undefined,
          note: typeof e.note === 'string' ? e.note.trim() : undefined,
        }))
        // Bỏ event không có teamSide hữu ích.
        .filter(e => e.teamSide !== 'unknown' || e.playerName);

      res.json({ events: cleanEvents });
    } catch (error: any) {
      console.error('AI API Error:', error);
      res.status(500).json({ error: 'Không thể phân tích diễn biến bằng AI. Chi tiết: ' + (error.message || error) });
    }
  });

  // 1. AUTHENTICATION & PROFILES (Module A)
  app.post('/api/auth/register', (req, res) => {
    const { username, password, email, displayName } = req.body;
    if (!username || !password || !email || !displayName) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin đăng ký!' });
    }

    const trimmedUsername = username.trim().toLowerCase();
    const trimmedEmail = email.trim().toLowerCase();

    if (db.getUserByUsername(trimmedUsername)) {
      return res.status(400).json({ error: 'Tên tài khoản này đã tồn tại!' });
    }

    if (db.getUserByEmail(trimmedEmail)) {
      return res.status(400).json({ error: 'Email này đã được đăng ký!' });
    }

    const userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const passwordHash = hashPassword(password);
    const avatar = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userId)}`;

    const userRecord = {
      id: userId,
      username: trimmedUsername,
      email: trimmedEmail,
      passwordHash,
      displayName: displayName.trim(),
      avatar,
      role: 'user' as const
    };

    const profile = {
      id: userId,
      displayName: displayName.trim(),
      avatar,
      elo: {
        caro: 1500,
        co_tuong: 1500,
        co_vua: 1500,
        o_an_quan: 1500,
        co_ca_ngua: 1500,
        duoi_hinh_bat_chu: 1500,
        noi_chu: 1500,
        doan_tu: 1500
      },
      honorScore: 100,
      badges: []
    };

    db.saveUser(userRecord);
    db.saveProfile(profile);

    res.json({
      success: true,
      user: {
        id: userId,
        displayName: profile.displayName,
        username: trimmedUsername,
        email: trimmedEmail,
        role: 'user',
        avatar
      }
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ tên tài khoản và mật khẩu!' });
    }

    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(400).json({ error: 'Tài khoản không tồn tại!' });
    }

    if (user.isGoogleUser) {
      return res.status(400).json({ error: 'Tài khoản này đăng nhập bằng Google SSO!' });
    }

    const passwordHash = hashPassword(password);
    if (user.passwordHash !== passwordHash) {
      return res.status(400).json({ error: 'Mật khẩu không chính xác!' });
    }

    let profile = db.getProfile(user.id);
    if (!profile) {
      profile = {
        id: user.id,
        displayName: user.displayName,
        avatar: user.avatar,
        elo: { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
        honorScore: 100,
        badges: []
      };
      db.saveProfile(profile);
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role
      }
    });
  });

  app.post('/api/auth/google-sso', (req, res) => {
    const { email, displayName, avatar } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Thiếu thông tin Google Account Email!' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    let user = db.getUserByEmail(trimmedEmail);

    if (!user) {
      // Register Google user automatically
      const userId = 'user_g_' + Date.now();
      const tempUsername = trimmedEmail.split('@')[0] + '_g';
      
      user = {
        id: userId,
        username: tempUsername,
        email: trimmedEmail,
        passwordHash: '', // no local password
        displayName: displayName || trimmedEmail.split('@')[0],
        avatar: avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userId)}`,
        role: 'user' as const,
        isGoogleUser: true
      };
      db.saveUser(user);

      const profile = {
        id: userId,
        displayName: user.displayName,
        avatar: user.avatar,
        elo: { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
        honorScore: 100,
        badges: []
      };
      db.saveProfile(profile);
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role
      }
    });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Vui lòng cung cấp địa chỉ email!' });
    }

    const user = db.getUserByEmail(email.trim());
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản nào liên kết với email này!' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 mins expiration
    db.saveUser(user);

    console.log(`\n==================================================================`);
    console.log(`🔑 [MÃ OTP RESET MẬT KHẨU] Gửi tới ${user.email}: ${otp}`);
    console.log(`==================================================================\n`);

    res.json({
      success: true,
      message: 'Mã xác thực OTP đã được gửi về email của bạn (vui lòng kiểm tra console log server hoặc sử dụng mã phía dưới)!',
      _debugOtp: otp // Helpful debug token for smooth frontend simulation testing
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ email, mã OTP và mật khẩu mới!' });
    }

    const user = db.getUserByEmail(email.trim());
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản!' });
    }

    if (!user.otp || user.otp !== otp.trim()) {
      return res.status(400).json({ error: 'Mã xác thực OTP không chính xác!' });
    }

    if (!user.otpExpires || Date.now() > user.otpExpires) {
      return res.status(400).json({ error: 'Mã OTP đã hết hạn (hiệu lực trong 5 phút)!' });
    }

    user.passwordHash = hashPassword(newPassword);
    user.otp = undefined;
    user.otpExpires = undefined;
    db.saveUser(user);

    res.json({
      success: true,
      message: 'Đổi mật khẩu thành công! Bạn có thể sử dụng mật khẩu mới để đăng nhập.'
    });
  });

  app.post('/api/auth/quick-login', (req, res) => {
    const { userId, displayName } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Thiếu mã định danh người dùng (userId)!' });
    }

    let profile = db.getProfile(userId);
    let user = db.getUser(userId);

    // Auto-create user if exists in profiles but not in users
    if (profile && !user) {
      const defaultPasswordHash = hashPassword('password123');
      user = {
        id: userId,
        username: userId,
        email: `${userId}@gametuoitho.space`,
        passwordHash: defaultPasswordHash,
        displayName: profile.displayName,
        avatar: profile.avatar,
        role: userId === 'user_a' ? 'admin' : 'user'
      };
      db.saveUser(user);
    }

    if (!profile) {
      profile = {
        id: userId,
        displayName: displayName || `Kỳ thủ ${userId.substring(0, 5)}`,
        avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${userId}`,
        elo: {
          caro: 1500,
          co_tuong: 1500,
          co_vua: 1500,
          o_an_quan: 1500,
          co_ca_ngua: 1500,
          duoi_hinh_bat_chu: 1500,
          noi_chu: 1500,
          doan_tu: 1500
        },
        honorScore: 100,
        badges: []
      };
      db.saveProfile(profile);
    }
    
    const userRole = user?.role || (userId === 'user_a' ? 'admin' : 'user');
    res.json({ ...profile, role: userRole });
  });

  app.get('/api/profile/:userId', (req, res) => {
    const profile = roomManager.getOrInitializeProfile(req.params.userId);
    const user = db.getUser(req.params.userId);
    res.json({ ...profile, role: user?.role || 'user' });
  });

  app.get('/api/online-users', (req, res) => {
    const exclude = req.query.exclude as string;
    const list = roomManager.getOnlineUsers(exclude);
    res.json(list);
  });

  app.post('/api/profile/:userId/update', (req, res) => {
    const { displayName, avatar } = req.body;
    const profile = roomManager.getOrInitializeProfile(req.params.userId);
    if (displayName) profile.displayName = displayName;
    if (avatar) profile.avatar = avatar;
    db.saveProfile(profile);

    const user = db.getUser(req.params.userId);
    if (user) {
      if (displayName) user.displayName = displayName;
      if (avatar) user.avatar = avatar;
      db.saveUser(user);
    }

    res.json({ ...profile, role: user?.role || 'user' });
  });

  app.post('/api/profile/:userId/reset-elo', (req, res) => {
    const profile = roomManager.getOrInitializeProfile(req.params.userId);
    profile.elo = {
      caro: 1500,
      co_tuong: 1500,
      co_vua: 1500,
      o_an_quan: 1500,
      co_ca_ngua: 1500,
      duoi_hinh_bat_chu: 1500,
      noi_chu: 1500,
      doan_tu: 1500
    };
    db.saveProfile(profile);
    const user = db.getUser(req.params.userId);
    res.json({ ...profile, role: user?.role || 'user' });
  });

  // 2. LEADERBOARDS (Module H)
  app.get('/api/leaderboard/global', (req, res) => {
    const profiles = db.getAllProfiles();
    // Sort by Honor score descending
    const sorted = profiles
      .sort((a, b) => b.honorScore - a.honorScore)
      .slice(0, 50);
    res.json(sorted);
  });

  app.get('/api/leaderboard/:gameId', (req, res) => {
    const gameId = req.params.gameId;
    const profiles = db.getAllProfiles();
    const sorted = profiles
      .map(p => ({
        id: p.id,
        displayName: p.displayName,
        avatar: p.avatar,
        elo: p.elo[gameId] || 1500,
        honorScore: p.honorScore
      }))
      .sort((a, b) => b.elo - a.elo)
      .slice(0, 50);
    res.json(sorted);
  });

  // 3. TOURNAMENTS (Module J)
  app.get('/api/tournaments', (req, res) => {
    res.json(db.getAllTournaments());
  });

  app.post('/api/tournaments/create', (req, res) => {
    const { userId, name, gameId, maxPlayers, deadlineSeconds } = req.body;
    const tournament = tournamentManager.createTournament(
      userId,
      name,
      gameId,
      parseInt(maxPlayers) || 16,
      parseInt(deadlineSeconds) || 300
    );
    res.json(tournament);
  });

  app.post('/api/tournaments/join', (req, res) => {
    const { userId, code } = req.body;
    const tournament = tournamentManager.joinTournament(userId, code);
    if (!tournament) {
      return res.status(400).json({ error: 'Không thể tham gia giải đấu! Giải đấu có thể đã đầy hoặc mã không hợp lệ.' });
    }
    res.json(tournament);
  });

  app.get('/api/tournaments/code/:code', (req, res) => {
    const tournament = tournamentManager.getTournamentByCode(req.params.code);
    if (!tournament) {
      return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
    }
    res.json(tournament);
  });

  app.get('/api/tournaments/:id', (req, res) => {
    const tournament = db.getTournament(req.params.id);
    if (!tournament) {
      return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
    }
    res.json(tournament);
  });

  app.post('/api/tournaments/:id/start', (req, res) => {
    const tournament = tournamentManager.startTournament(req.params.id);
    if (!tournament) {
      return res.status(400).json({ error: 'Không thể bắt đầu giải đấu!' });
    }
    res.json(tournament);
  });

  app.post('/api/tournaments/:id/launch/:matchIndex', (req, res) => {
    const matchId = tournamentManager.launchTournamentMatch(
      req.params.id,
      parseInt(req.params.matchIndex)
    );
    if (!matchId) {
      return res.status(400).json({ error: 'Không thể kích hoạt trận đấu này!' });
    }
    res.json({ matchId });
  });

  // 4. DAILY CHALLENGES (Module I)
  app.get('/api/challenges/:gameId/:date', (req, res) => {
    const challenge = dailyChallengeManager.getOrCreateChallenge(req.params.gameId, req.params.date);
    res.json(challenge);
  });

  app.post('/api/challenges/:gameId/:date/submit', (req, res) => {
    const { userId, displayName, avatar, score } = req.body;
    const challenge = dailyChallengeManager.submitScore(
      req.params.gameId,
      req.params.date,
      userId,
      displayName,
      avatar,
      score
    );
    res.json(challenge);
  });

  // 5. REPLAYS & HISTORY (Module L)
  app.get('/api/replays/:userId', (req, res) => {
    const userId = req.params.userId;
    // Return ended matches of this user
    const matches = db.getAllMatches().filter(
      m => m.status === 'ENDED' && m.players.includes(userId)
    );
    res.json(matches);
  });

  app.get('/api/replay/:matchId', (req, res) => {
    const match = db.getMatch(req.params.matchId);
    if (!match) {
      return res.status(404).json({ error: 'Không tìm thấy nhật ký trận đấu!' });
    }
    res.json(match);
  });

  // 6. BI LAC - FOOSBALL TOURNAMENTS
  function getBiLacWeeklyInterval(date: Date) {
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
    const d = new Date(utcMs + (7 * 3600000)); // Adjusted to Vietnam Time (UTC+7)

    const day = d.getDay();
    const wedThisWeekBoundary = new Date(d);
    const diff = 3 - day;
    wedThisWeekBoundary.setDate(d.getDate() + diff);
    wedThisWeekBoundary.setHours(11, 30, 0, 0);

    let start: Date;
    let end: Date;

    if (d.getTime() < wedThisWeekBoundary.getTime()) {
      start = new Date(wedThisWeekBoundary);
      start.setDate(wedThisWeekBoundary.getDate() - 7);
      start.setHours(12, 0, 0, 0);
      end = new Date(wedThisWeekBoundary);
    } else {
      start = new Date(wedThisWeekBoundary);
      start.setHours(12, 0, 0, 0);
      end = new Date(wedThisWeekBoundary);
      end.setDate(wedThisWeekBoundary.getDate() + 7);
    }

    const formatDate = (dateObj: Date) => {
      const dayStr = String(dateObj.getDate()).padStart(2, '0');
      const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
      const yearStr = dateObj.getFullYear();
      return `${dayStr}/${monthStr}/${yearStr}`;
    };

    const label = `Tuần từ ${formatDate(start)} đến ${formatDate(end)}`;
    return { start, end, label };
  }

  // MIDDLEWARE TO CHECK TOURNAMENT ACCESS
  const checkBiLacTournamentAccess = (req: any, res: any, next: any) => {
    const tournamentId = req.headers['x-tournament-id'] || req.query.tournamentId;
    const code = req.headers['x-tournament-code'] || req.query.code;

    if (!tournamentId) {
      return res.status(401).json({ error: 'Thiếu mã giải đấu (Tournament ID)!' });
    }

    const tour = db.getBiLacTournament(tournamentId as string);
    if (!tour) {
      return res.status(404).json({ error: 'Không tìm thấy giải đấu này!' });
    }

    if (tour.code !== code) {
      return res.status(403).json({ error: 'Mã code truy cập không chính xác!' });
    }

    req.tournamentId = tournamentId;
    next();
  };

  // Helper: trích userId hiện tại từ request và xác thực có tồn tại trong db.users.
  // Client gửi qua header `x-user-id` (đã được App.tsx inject vào `bilacFetch`).
  const getRequestUserId = (req: any): string | null => {
    const uid = req.headers['x-user-id'] || req.body?.userId || req.query?.userId;
    return typeof uid === 'string' && uid.trim() ? uid.trim() : null;
  };

  const requireLoggedIn = (req: any, res: any): string | null => {
    const uid = getRequestUserId(req);
    if (!uid) {
      res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục!' });
      return null;
    }
    const user = db.getUser(uid);
    if (!user) {
      res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị xoá. Vui lòng đăng nhập lại!' });
      return null;
    }
    return uid;
  };

  // Middleware: require member of tournament (cần login + là member).
  const requireBiLacMember = (req: any, res: any, next: any) => {
    const uid = requireLoggedIn(req, res);
    if (!uid) return;
    const tournamentId = req.tournamentId || req.headers['x-tournament-id'] || req.query.tournamentId || req.body?.tournamentId;
    if (!tournamentId) {
      return res.status(400).json({ error: 'Thiếu mã giải đấu!' });
    }
    const tour = db.getBiLacTournament(tournamentId);
    if (!tour) {
      return res.status(404).json({ error: 'Không tìm thấy giải đấu này!' });
    }
    if (tour.code !== (req.headers['x-tournament-code'] || req.query.code)) {
      return res.status(403).json({ error: 'Mã code truy cập không chính xác!' });
    }
    const isMember = db.isBiLacTournamentMember(tournamentId, uid);
    if (!isMember) {
      return res.status(403).json({ error: 'Bạn không phải thành viên của giải đấu này! Vui lòng liên hệ chủ giải để được thêm vào.' });
    }
    req.userId = uid;
    req.tournamentId = tournamentId;
    next();
  };

  // 1. GET ALL TOURNAMENTS (Names & Metadata only, NO access codes)
  app.get('/api/bilac/tournaments', (req, res) => {
    const tours = db.getAllBiLacTournaments().map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      createdAt: t.createdAt
    }));
    res.json(tours);
  });

  // 2. CHECK ACCESS CODE FOR A TOURNAMENT
  app.post('/api/bilac/tournaments/access', (req, res) => {
    const { tournamentId, code } = req.body;
    if (!tournamentId) {
      return res.status(400).json({ error: 'Thiếu mã giải đấu!' });
    }
    const tour = db.getBiLacTournament(tournamentId);
    if (!tour) {
      return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
    }
    if (tour.code !== code) {
      return res.status(403).json({ error: 'Mã truy cập không chính xác!' });
    }
    res.json({ success: true, tournament: { id: tour.id, name: tour.name, description: tour.description } });
  });

  // 3. CREATE A NEW TOURNAMENT (yêu cầu login; owner auto thêm vào members)
  app.post('/api/bilac/tournaments', (req, res) => {
    const userId = requireLoggedIn(req, res);
    if (!userId) return;
    const { name, code, description } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Tên giải đấu không được để trống!' });
    }
    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Mã truy cập giải đấu không được để trống!' });
    }
    const nameTrimmed = name.trim();
    const existing = db.getAllBiLacTournaments().find(t => t.name.toLowerCase() === nameTrimmed.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Tên giải đấu này đã tồn tại!' });
    }
    const id = 'tour-' + Date.now();
    const tournament = {
      id,
      name: nameTrimmed,
      code: code.trim(),
      description: description ? description.trim() : '',
      createdAt: Date.now(),
      ownerUserId: userId,
    };
    db.saveBiLacTournament(tournament);

    // Auto-join owner làm member với role=owner.
    const user = db.getUser(userId);
    db.saveBiLacTournamentMember({
      id: `mem-${id}-${userId}`,
      tournamentId: id,
      userId,
      username: user?.username || userId,
      displayName: user?.displayName || user?.username || userId,
      role: 'owner',
      joinedAt: Date.now(),
    });

    res.json({ success: true, tournament });
  });

  // 4. GET PLAYERS FOR THE TOURNAMENT
  app.get('/api/bilac/players', checkBiLacTournamentAccess, (req: any, res) => {
    const tournamentId = req.tournamentId;
    const players = db.getAllBiLacPlayers().filter(p => p.tournamentId === tournamentId);
    res.json(players);
  });

  // 5. CREATE A PLAYER IN THE TOURNAMENT (yêu cầu member)
  app.post('/api/bilac/players', requireBiLacMember, (req: any, res) => {
    const { name } = req.body;
    const tournamentId = req.tournamentId;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Tên người chơi không được để trống!' });
    }
    const nameTrimmed = name.trim();
    const existing = db.getAllBiLacPlayers().find(p => p.tournamentId === tournamentId && p.name.toLowerCase() === nameTrimmed.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Tên người chơi đã tồn tại trong giải đấu này!' });
    }
    const id = 'bl-' + Date.now();
    const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(nameTrimmed)}`;
    const player = { id, name: nameTrimmed, avatar, tournamentId };
    db.saveBiLacPlayer(player);
    res.json(player);
  });

  // 6. DELETE A PLAYER FROM THE TOURNAMENT (yêu cầu member)
  app.delete('/api/bilac/players/:id', requireBiLacMember, (req: any, res) => {
    const playerId = req.params.id;
    const tournamentId = req.tournamentId;

    const hasMatches = db.getAllBiLacMatches().some(m => 
      m.tournamentId === tournamentId && (
        (m.team1 && m.team1.includes(playerId)) || 
        (m.team2 && m.team2.includes(playerId)) || 
        m.benched === playerId
      )
    );

    if (hasMatches) {
      return res.status(400).json({ error: 'Không thể xóa người chơi này vì họ đã tham gia ít nhất một trận đấu!' });
    }

    db.deleteBiLacPlayer(playerId);
    res.json({ success: true });
  });

  // 7. GET MATCHES FOR THE TOURNAMENT
  app.get('/api/bilac/matches', checkBiLacTournamentAccess, (req: any, res) => {
    const tournamentId = req.tournamentId;
    const matches = db.getAllBiLacMatches().filter(m => m.tournamentId === tournamentId);
    res.json(matches);
  });

  // 8. CREATE A MATCH (AUTO-TEAM BALANCING) IN THE TOURNAMENT (yêu cầu member)
  app.post('/api/bilac/matches', requireBiLacMember, (req: any, res) => {
    const { playerIds } = req.body;
    const tournamentId = req.tournamentId;
    if (!playerIds || !Array.isArray(playerIds) || playerIds.length < 2) {
      return res.status(400).json({ error: 'Cần ít nhất 2 người chơi để chia đội!' });
    }

    const allPlayers = db.getAllBiLacPlayers().filter(p => p.tournamentId === tournamentId);
    const selectedPlayers = allPlayers.filter(p => playerIds.includes(p.id));

    if (selectedPlayers.length < 2) {
      return res.status(400).json({ error: 'Không tìm thấy người chơi hợp lệ trong hệ thống!' });
    }

    const now = new Date();
    const interval = getBiLacWeeklyInterval(now);
    const weekLabel = interval.label;

    const allMatches = db.getAllBiLacMatches().filter(m => m.tournamentId === tournamentId);

    const playerStatsWeekly: Record<string, { points: number; gd: number; wins: number; goals: number }> = {};
    const playerStatsAllTime: Record<string, { points: number; gd: number; wins: number; goals: number }> = {};
    
    allPlayers.forEach(p => {
      playerStatsWeekly[p.id] = { points: 0, gd: 0, wins: 0, goals: 0 };
      playerStatsAllTime[p.id] = { points: 0, gd: 0, wins: 0, goals: 0 };
    });

    allMatches.filter(m => m.status === 'FINISHED').forEach(m => {
      const s1 = m.score1;
      const s2 = m.score2;
      const t1 = m.team1;
      const t2 = m.team2;
      const isWeekly = m.weekLabel === weekLabel;

      t1.forEach(pid => {
        if (playerStatsAllTime[pid]) {
          playerStatsAllTime[pid].goals += s1;
          playerStatsAllTime[pid].gd += (s1 - s2);
          if (s1 > s2) {
            playerStatsAllTime[pid].points += 3;
            playerStatsAllTime[pid].wins += 1;
          } else if (s1 === s2) {
            playerStatsAllTime[pid].points += 1;
          }
        }
        if (isWeekly && playerStatsWeekly[pid]) {
          playerStatsWeekly[pid].goals += s1;
          playerStatsWeekly[pid].gd += (s1 - s2);
          if (s1 > s2) {
            playerStatsWeekly[pid].points += 3;
            playerStatsWeekly[pid].wins += 1;
          } else if (s1 === s2) {
            playerStatsWeekly[pid].points += 1;
          }
        }
      });

      t2.forEach(pid => {
        if (playerStatsAllTime[pid]) {
          playerStatsAllTime[pid].goals += s2;
          playerStatsAllTime[pid].gd += (s2 - s1);
          if (s2 > s1) {
            playerStatsAllTime[pid].points += 3;
            playerStatsAllTime[pid].wins += 1;
          } else if (s1 === s2) {
            playerStatsAllTime[pid].points += 1;
          }
        }
        if (isWeekly && playerStatsWeekly[pid]) {
          playerStatsWeekly[pid].goals += s2;
          playerStatsWeekly[pid].gd += (s2 - s1);
          if (s2 > s1) {
            playerStatsWeekly[pid].points += 3;
            playerStatsWeekly[pid].wins += 1;
          } else if (s1 === s2) {
            playerStatsWeekly[pid].points += 1;
          }
        }
      });
    });

    // Sort selected players based on their weekly stats, with All-Time stats as fallback
    const sortedSelected = [...selectedPlayers].sort((a, b) => {
      const wA = playerStatsWeekly[a.id] || { points: 0, gd: 0, wins: 0, goals: 0 };
      const wB = playerStatsWeekly[b.id] || { points: 0, gd: 0, wins: 0, goals: 0 };

      // 1. Compare Weekly Points
      if (wB.points !== wA.points) return wB.points - wA.points;
      // 2. Compare Weekly Goal Difference (GD)
      if (wB.gd !== wA.gd) return wB.gd - wA.gd;
      // 3. Compare Weekly Wins
      if (wB.wins !== wA.wins) return wB.wins - wA.wins;
      // 4. Compare Weekly Goals Scored
      if (wB.goals !== wA.goals) return wB.goals - wA.goals;

      // Fallback to All-Time stats
      const aA = playerStatsAllTime[a.id] || { points: 0, gd: 0, wins: 0, goals: 0 };
      const aB = playerStatsAllTime[b.id] || { points: 0, gd: 0, wins: 0, goals: 0 };

      // 5. Compare All-Time Points
      if (aB.points !== aA.points) return aB.points - aA.points;
      // 6. Compare All-Time GD
      if (aB.gd !== aA.gd) return aB.gd - aA.gd;
      // 7. Compare All-Time Wins
      if (aB.wins !== aA.wins) return aB.wins - aA.wins;
      // 8. Compare All-Time Goals Scored
      if (aB.goals !== aA.goals) return aB.goals - aA.goals;

      // Stable sorting by ID
      return b.id.localeCompare(a.id);
    });

    let participatingIds = sortedSelected.map(p => p.id);
    let benchedPlayerId: string | undefined = undefined;

    // Handle odd number of players
    if (participatingIds.length % 2 !== 0) {
      const benchedIndex = Math.floor(Math.random() * participatingIds.length);
      benchedPlayerId = participatingIds[benchedIndex];
      participatingIds.splice(benchedIndex, 1);
    }

    const teamSize = participatingIds.length / 2;
    const highSeeds = participatingIds.slice(0, teamSize);
    const lowSeeds = participatingIds.slice(teamSize);

    // Shuffle arrays
    const shuffle = <T>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const shuffledHigh = shuffle(highSeeds);
    const shuffledLow = shuffle(lowSeeds);

    const team1: string[] = [];
    const team2: string[] = [];

    // Distribute High Seeds
    const halfHigh = Math.floor(teamSize / 2);
    for (let i = 0; i < shuffledHigh.length; i++) {
      if (i < halfHigh) {
        team1.push(shuffledHigh[i]);
      } else {
        team2.push(shuffledHigh[i]);
      }
    }

    // Distribute Low Seeds (inverse distribution)
    const neededLowForTeam1 = teamSize - team1.length;
    for (let i = 0; i < shuffledLow.length; i++) {
      if (i < neededLowForTeam1) {
        team1.push(shuffledLow[i]);
      } else {
        team2.push(shuffledLow[i]);
      }
    }

    const match = {
      id: 'match-' + Date.now(),
      timestamp: Date.now(),
      weekLabel,
      team1: shuffle(team1),
      team2: shuffle(team2),
      score1: 0,
      score2: 0,
      status: 'PLAYING' as const,
      benched: benchedPlayerId,
      tournamentId
    };

    db.saveBiLacMatch(match);
    res.json(match);
  });

  // 9. UPDATE MATCH DETAILS IN THE TOURNAMENT (yêu cầu member)
  app.post('/api/bilac/matches/:id/update', requireBiLacMember, (req: any, res) => {
    const { score1, score2, status } = req.body;
    const match = db.getBiLacMatch(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Không tìm thấy trận đấu!' });
    }

    if (match.tournamentId !== req.tournamentId) {
      return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa trận đấu của giải đấu này!' });
    }

    if (typeof score1 === 'number') match.score1 = score1;
    if (typeof score2 === 'number') match.score2 = score2;
    if (status) match.status = status;

    db.saveBiLacMatch(match);
    res.json(match);
  });

  // 10. DELETE A MATCH FROM THE TOURNAMENT (yêu cầu member)
  app.delete('/api/bilac/matches/:id', requireBiLacMember, (req: any, res) => {
    const match = db.getBiLacMatch(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Không tìm thấy trận đấu!' });
    }

    if (match.tournamentId !== req.tournamentId) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa trận đấu của giải đấu này!' });
    }

    db.deleteBiLacMatch(req.params.id);
    res.json({ success: true });
  });

  // 7. SPORTS LEAGUES & PERMISSION CONTRACT
  app.get('/api/leagues', (req, res) => {
    const { userId } = req.query;
    if (userId) {
      const perms = db.getLeaguePermissions();
      if (perms[userId as string] !== true) {
        return res.status(403).json({ error: 'Quyền truy cập bị hạn chế' });
      }
    }
    res.json(db.getAllMyLeagues());
  });

  app.post('/api/leagues', (req, res) => {
    const league = req.body;
    if (!league || !league.id || !league.name) {
      return res.status(400).json({ error: 'Dữ liệu giải đấu không hợp lệ!' });
    }
    db.saveMyLeague(league);
    res.json(league);
  });

  app.put('/api/leagues/:id', (req, res) => {
    const league = req.body;
    if (!league || !league.id || !league.name) {
      return res.status(400).json({ error: 'Dữ liệu giải đấu không hợp lệ!' });
    }
    db.saveMyLeague(league);
    res.json(league);
  });

  app.delete('/api/leagues/:id', (req, res) => {
    const { id } = req.params;
    db.deleteMyLeague(id);
    res.json({ success: true });
  });

  app.get('/api/leagues-permissions', (req, res) => {
    res.json({ permissions: db.getLeaguePermissions() });
  });

  app.post('/api/leagues-permissions/toggle', (req, res) => {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: 'Thiếu mã tài khoản!' });
    }
    const perms = db.getLeaguePermissions();
    const nextPerms = { ...perms, [targetUserId]: !perms[targetUserId] };
    db.saveLeaguePermissions(nextPerms);
    res.json({ success: true, permissions: nextPerms });
  });

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
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`gametuoitho.space server active at http://localhost:${PORT}`);
  });
}

startServer();
