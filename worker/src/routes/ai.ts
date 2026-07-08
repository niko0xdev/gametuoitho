// worker/src/routes/ai.ts
import { Hono } from 'hono';
import type { Bindings } from '../db';
import { callStructured } from '../lib/ai';
import { requireLoggedIn } from '../lib/auth';

const MAX_SUMMARY_BYTES = 32 * 1024; // 32 KB cap (F3: prevents OpenAI bill abuse)

export const aiRoute = new Hono<{ Bindings: Bindings }>();

aiRoute.post('/parse-roster', requireLoggedIn(), async (c) => {
  const { summary } = await c.req.json();
  if (!summary || typeof summary !== 'string' || summary.trim() === '') {
    return c.json({ error: 'Nội dung tóm tắt không được để trống!' }, 400);
  }
  if (new TextEncoder().encode(summary).byteLength > MAX_SUMMARY_BYTES) {
    return c.json({ error: `Nội dung vượt quá ${MAX_SUMMARY_BYTES / 1024} KB!` }, 413);
  }
  if (!c.env.OPENAI_API_KEY || !c.env.OPENAI_MODEL) {
    return c.json({ error: 'Chưa cấu hình OPENAI_API_KEY/OPENAI_MODEL trên Worker secrets!' }, 500);
  }

  const schema = {
    type: 'object',
    properties: {
      teams: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tên của đội tuyển hoặc tên VĐV' },
            players: { type: 'array', items: { type: 'string' }, description: 'Danh sách tên đầy đủ của các cầu thủ trong đội bóng (nếu có)' },
          },
          required: ['name', 'players'],
        },
      },
    },
    required: ['teams'],
  };

  try {
    const result = await callStructured({
      apiKey: c.env.OPENAI_API_KEY,
      model: c.env.OPENAI_MODEL,
      baseUrl: c.env.OPENAI_BASE_URL,
      systemPrompt: 'Bạn là một trợ lý ảo phân tích dữ liệu giải đấu thể thao chuyên nghiệp. Nhiệm vụ của bạn là đọc thông tin về các đội bóng và danh sách cầu thủ tham gia, sau đó trích xuất ra cấu trúc dữ liệu JSON chính xác. Luôn trả về đúng schema được yêu cầu.',
      userPrompt: `Hãy phân tích văn bản tóm tắt giải đấu / đội hình dưới đây và trả về danh sách các đội tuyển cùng danh sách cầu thủ tương ứng.
Nếu là các bộ môn đơn/đôi như bóng bàn hoặc cầu lông, hãy coi mỗi vận động viên hoặc cặp vận động viên là một "đội" và liệt kê tên của họ vào danh sách cầu thủ.

Văn bản cần phân tích:
"""
${summary}
"""`,
      functionName: 'extract_roster',
      schema,
    });
    return c.json(result);
  } catch (e: any) {
    console.error('AI error:', e);
    return c.json({ error: 'Không thể phân tích dữ liệu bằng AI. Chi tiết: ' + (e.message || String(e)) }, 500);
  }
});

// Extract unique player names from free-form text (Bi Lắc bulk add).
aiRoute.post('/parse-players', requireLoggedIn(), async (c) => {
  const { text } = await c.req.json();
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return c.json({ error: 'Vui lòng nhập danh sách tên cần tách!' }, 400);
  }
  if (new TextEncoder().encode(text).byteLength > MAX_SUMMARY_BYTES) {
    return c.json({ error: `Nội dung vượt quá ${MAX_SUMMARY_BYTES / 1024} KB!` }, 413);
  }
  if (!c.env.OPENAI_API_KEY || !c.env.OPENAI_MODEL) {
    return c.json({ error: 'Chưa cấu hình OPENAI_API_KEY/OPENAI_MODEL trên Worker secrets!' }, 500);
  }

  const schema = {
    type: 'object',
    properties: { names: { type: 'array', items: { type: 'string' } } },
    required: ['names'],
  };

  try {
    const result = await callStructured({
      apiKey: c.env.OPENAI_API_KEY,
      model: c.env.OPENAI_MODEL,
      baseUrl: c.env.OPENAI_BASE_URL,
      systemPrompt:
        'Bạn là trợ lý AI trích xuất tên người chơi. Đọc văn bản tự do (danh sách cầu thủ, đội hình, văn bản hỗn độn) và trả về mảng JSON các tên đầy đủ duy nhất. Bỏ tiêu đề nhóm ("Đội X", "Team A"), bỏ số thứ tự đầu dòng ("1.", "-", "•"), bỏ trùng lặp (giữ lần xuất hiện đầu tiên). Mỗi tên là chuỗi tiếng Việt có dấu, đã trim. Chỉ trả JSON đúng schema.',
      userPrompt: `Hãy trích xuất tất cả tên người chơi duy nhất từ văn bản dưới đây:\n"""\n${text}\n"""`,
      functionName: 'extract_player_names',
      schema,
    });
    return c.json(result);
  } catch (e: any) {
    console.error('AI error:', e);
    return c.json({ error: 'Không thể tách tên bằng AI. Chi tiết: ' + (e.message || String(e)) }, 500);
  }
});

// Parse a free-text match summary into structured events (futsal MyLeague).
// Prefill ONLY — the client reviews then saves; this route never persists.
aiRoute.post('/parse-events', requireLoggedIn(), async (c) => {
  const { summary, homeTeamName, awayTeamName, homePlayers, awayPlayers } = await c.req.json();
  if (!summary || typeof summary !== 'string' || summary.trim() === '') {
    return c.json({ error: 'Vui lòng nhập tóm tắt diễn biến trận đấu!' }, 400);
  }
  if (new TextEncoder().encode(summary).byteLength > MAX_SUMMARY_BYTES) {
    return c.json({ error: `Nội dung vượt quá ${MAX_SUMMARY_BYTES / 1024} KB!` }, 413);
  }
  if (!c.env.OPENAI_API_KEY || !c.env.OPENAI_MODEL) {
    return c.json({ error: 'Chưa cấu hình OPENAI_API_KEY/OPENAI_MODEL trên Worker secrets!' }, 500);
  }

  const safeHome = (typeof homeTeamName === 'string' && homeTeamName.trim()) || 'đội nhà';
  const safeAway = (typeof awayTeamName === 'string' && awayTeamName.trim()) || 'đội khách';
  const rosterInfo = [
    `- Đội nhà ("home"): ${safeHome}. Cầu thủ: ${Array.isArray(homePlayers) && homePlayers.length ? homePlayers.join(', ') : '(không rõ)'}.`,
    `- Đội khách ("away"): ${safeAway}. Cầu thủ: ${Array.isArray(awayPlayers) && awayPlayers.length ? awayPlayers.join(', ') : '(không rõ)'}.`,
  ].join('\n');

  const schema = {
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
  };

  try {
    const result = await callStructured({
      apiKey: c.env.OPENAI_API_KEY,
      model: c.env.OPENAI_MODEL,
      baseUrl: c.env.OPENAI_BASE_URL,
      systemPrompt: `Bạn là trợ lý AI phân tích diễn biến trận đấu bóng đá/futsal. Nhiệm vụ: đọc văn bản tóm tắt tự do và trích xuất danh sách sự kiện (bàn thắng, thẻ vàng, thẻ đỏ). Với mỗi sự kiện:
- Loại sự kiện: 'goal' (ghi bàn), 'yellow' (thẻ vàng), 'red' (thẻ đỏ).
- Bên nào: 'home' nếu liên quan đội nhà, 'away' nếu đội khách, 'unknown' nếu văn bản không rõ.
- Tên cầu thủ: chuẩn hoá trùng với roster nếu có thể, bỏ tiêu đề "Cầu thủ". Bỏ qua nếu không nêu.
- Phút: là số nguyên 0-200, bỏ qua nếu không nêu.
- Note: 1 câu tóm tắt gốc.
Bỏ qua các thông tin khác (kết quả cuối, nhận xét chung, dự bị). Trả về JSON đúng schema.`,
      userPrompt: `Thông tin hai đội:\n${rosterInfo}\n\nTóm tắt diễn biến trận đấu:\n"""\n${summary}\n"""`,
      functionName: 'extract_match_events',
      schema,
    });

    // Sanitize whatever the LLM returned (defense-in-depth — model may ignore enums).
    const allowedTypes = new Set(['goal', 'yellow', 'red']);
    const allowedSides = new Set(['home', 'away', 'unknown']);
    const raw = (result as { events?: unknown }).events;
    const cleanEvents = (Array.isArray(raw) ? raw : [])
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object'
        && allowedTypes.has(e.type as string) && allowedSides.has(e.teamSide as string))
      .map((e) => ({
        type: e.type,
        teamSide: e.teamSide,
        playerName: typeof e.playerName === 'string' ? e.playerName.trim() : '',
        minute: typeof e.minute === 'number' && e.minute >= 0 && e.minute <= 200 ? e.minute : undefined,
        note: typeof e.note === 'string' ? e.note.trim() : undefined,
      }))
      .filter((e) => e.teamSide !== 'unknown' || e.playerName);

    return c.json({ events: cleanEvents });
  } catch (e: any) {
    console.error('AI error:', e);
    return c.json({ error: 'Không thể phân tích diễn biến bằng AI. Chi tiết: ' + (e.message || String(e)) }, 500);
  }
});
