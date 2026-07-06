import type { Request, Response } from 'express';
import { chatCompletion, extractFunctionArgs, extractContent } from '../ai/openai.ts';

const ROSTER_TOOL = {
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

const PLAYERS_TOOL = {
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

const EVENTS_TOOL = {
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

function checkOpenAIEnv(res: Response): { apiKey: string; model: string; baseURL?: string } | null {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey) {
    res.status(500).json({ error: 'Chưa cấu hình OPENAI_API_KEY trong phần Settings > Secrets!' });
    return null;
  }
  if (!model) {
    res.status(500).json({ error: 'Chưa cấu hình OPENAI_MODEL (ví dụ: gpt-4o-mini).' });
    return null;
  }
  return { apiKey, model, baseURL: process.env.OPENAI_BASE_URL || undefined };
}

export async function handleParseRoster(req: Request, res: Response) {
  const { summary } = req.body;
  if (!summary || typeof summary !== 'string' || summary.trim() === '') {
    return res.status(400).json({ error: 'Nội dung tóm tắt không được để trống!' });
  }

  try {
    const env = checkOpenAIEnv(res);
    if (!env) return;

    const completion = await chatCompletion({
      apiKey: env.apiKey,
      model: env.model,
      baseURL: env.baseURL,
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
      tools: [ROSTER_TOOL],
      toolChoice: { type: 'function', function: { name: 'parse_roster' } },
      responseFormat: { type: 'json_object' },
    });

    const args = extractFunctionArgs(completion, 'parse_roster');
    let result: any;
    if (args) {
      result = JSON.parse(args);
    } else {
      const content = extractContent(completion);
      if (!content) {
        return res.status(500).json({ error: 'AI không trả về kết quả phân tích.' });
      }
      try {
        result = JSON.parse(content.trim());
      } catch {
        return res.status(500).json({ error: 'AI trả về dữ liệu không phải JSON hợp lệ.' });
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error('AI API Error:', error);
    res.status(500).json({ error: 'Không thể phân tích dữ liệu bằng AI. Chi tiết: ' + (error.message || error) });
  }
}

export async function handleParsePlayers(req: Request, res: Response) {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ error: 'Vui lòng nhập danh sách tên cần tách!' });
  }

  try {
    const env = checkOpenAIEnv(res);
    if (!env) return;

    const completion = await chatCompletion({
      apiKey: env.apiKey,
      model: env.model,
      baseURL: env.baseURL,
      messages: [
        {
          role: 'system',
          content: 'Bạn là trợ lý AI trích xuất tên người chơi. Nhiệm vụ: đọc văn bản tự do (danh sách cầu thủ, đội hình, hoặc văn bản hỗn độn) và trả về mảng JSON các tên đầy đủ duy nhất. Bỏ tiêu đề nhóm ("Đội X", "Team A"), bỏ số thứ tự đầu dòng ("1.", "-", "•"), bỏ trùng lặp (giữ lần xuất hiện đầu tiên). Mỗi tên là chuỗi tiếng Việt có dấu, đã được trim khoảng trắng. Không trả thêm text ngoài JSON.',
        },
        {
          role: 'user',
          content: `Hãy trích xuất tất cả tên người chơi duy nhất từ văn bản dưới đây:\n"""\n${text}\n"""`,
        },
      ],
      tools: [PLAYERS_TOOL],
      toolChoice: { type: 'function', function: { name: 'extract_player_names' } },
      responseFormat: { type: 'json_object' },
    });

    const args = extractFunctionArgs(completion, 'extract_player_names');
    let names: string[] = [];
    if (args) {
      const parsed = JSON.parse(args);
      if (Array.isArray(parsed?.names)) names = parsed.names.filter((n: any) => typeof n === 'string' && n.trim());
    } else {
      const content = extractContent(completion);
      if (content) {
        try {
          const parsed = JSON.parse(content.trim());
          if (Array.isArray(parsed?.names)) names = parsed.names.filter((n: any) => typeof n === 'string' && n.trim());
        } catch {
          return res.status(500).json({ error: 'AI trả về dữ liệu không phải JSON hợp lệ.' });
        }
      }
    }

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
}

export async function handleParseEvents(req: Request, res: Response) {
  const { summary, homeTeamName, awayTeamName, homePlayers, awayPlayers } = req.body || {};
  if (!summary || typeof summary !== 'string' || summary.trim() === '') {
    return res.status(400).json({ error: 'Vui lòng nhập tóm tắt diễn biến trận đấu!' });
  }
  const safeHome = (homeTeamName || 'đội nhà').trim();
  const safeAway = (awayTeamName || 'đội khách').trim();

  try {
    const env = checkOpenAIEnv(res);
    if (!env) return;

    const rosterInfo = [
      `- Đội nhà ("home"): ${safeHome}. Cầu thủ: ${Array.isArray(homePlayers) && homePlayers.length ? homePlayers.join(', ') : '(không rõ)'}.`,
      `- Đội khách ("away"): ${safeAway}. Cầu thủ: ${Array.isArray(awayPlayers) && awayPlayers.length ? awayPlayers.join(', ') : '(không rõ)'}.`,
    ].join('\n');

    const completion = await chatCompletion({
      apiKey: env.apiKey,
      model: env.model,
      baseURL: env.baseURL,
      messages: [
        {
          role: 'system',
          content: `Bạn là trợ lý AI phân tích diễn biến trận đấu bóng đá/futsal. Nhiệm vụ: đọc văn bản tóm tắt tự do và trích xuất danh sách sự kiện (bàn thắng, thẻ vàng, thẻ đỏ). Với mỗi sự kiện:
- Loại sự kiện: 'goal' (ghi bàn), 'yellow' (thẻ vàng), 'red' (thẻ đỏ).
- Bên nào: 'home' nếu liên quan đội nhà, 'away' nếu đội khách, 'unknown' nếu văn bản không rõ (ví dụ chỉ ghi "cầu thủ ghi bàn" mà không nêu đội).
- Tên cầu thủ: chuẩn hoá trùng với roster nếu có thể, bỏ tiêu đề "Cầu thủ". Bỏ qua nếu không nêu.
- Phút: là số nguyên 0-200, bỏ qua nếu không nêu.
- Note: 1 câu tóm tắt gốc.
Bỏ qua các thông tin khác (kết quả cuối, nhận xét chung, dự bị). Trả về JSON đúng schema.`,
        },
        {
          role: 'user',
          content: `Thông tin hai đội:\n${rosterInfo}\n\nTóm tắt diễn biến trận đấu:\n"""\n${summary}\n"""`,
        },
      ],
      tools: [EVENTS_TOOL],
      toolChoice: { type: 'function', function: { name: 'extract_match_events' } },
      responseFormat: { type: 'json_object' },
    });

    const args = extractFunctionArgs(completion, 'extract_match_events');
    let events: any[] = [];
    if (args) {
      const parsed = JSON.parse(args);
      if (Array.isArray(parsed?.events)) events = parsed.events;
    } else {
      const content = extractContent(completion);
      if (content) {
        try {
          const parsed = JSON.parse(content.trim());
          if (Array.isArray(parsed?.events)) events = parsed.events;
        } catch {
          return res.status(500).json({ error: 'AI trả về dữ liệu không phải JSON hợp lệ.' });
        }
      }
    }

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
      .filter(e => e.teamSide !== 'unknown' || e.playerName);

    res.json({ events: cleanEvents });
  } catch (error: any) {
    console.error('AI API Error:', error);
    res.status(500).json({ error: 'Không thể phân tích diễn biến bằng AI. Chi tiết: ' + (error.message || error) });
  }
}