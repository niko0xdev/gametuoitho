import { NextResponse } from 'next/server';
import { callStructured } from '@/server/ai/openai';

// ponytail: this route ONLY fills events — it does not persist. The client
// must review then save. Matches the existing CLAUDE.md contract.

const SCHEMA = {
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

const SYSTEM =
  `Bạn là trợ lý AI phân tích diễn biến trận đấu bóng đá/futsal. Nhiệm vụ: đọc văn bản tóm tắt tự do và trích xuất danh sách sự kiện (bàn thắng, thẻ vàng, thẻ đỏ). Với mỗi sự kiện:\n` +
  `- Loại sự kiện: 'goal' (ghi bàn), 'yellow' (thẻ vàng), 'red' (thẻ đỏ).\n` +
  `- Bên nào: 'home' nếu liên quan đội nhà, 'away' nếu đội khách, 'unknown' nếu văn bản không rõ (ví dụ chỉ ghi "cầu thủ ghi bàn" mà không nêu đội).\n` +
  `- Tên cầu thủ: chuẩn hoá trùng với roster nếu có thể, bỏ tiêu đề "Cầu thủ". Bỏ qua nếu không nêu.\n` +
  `- Phút: là số nguyên 0-200, bỏ qua nếu không nêu.\n` +
  `- Note: 1 câu tóm tắt gốc.\n` +
  `Bỏ qua các thông tin khác (kết quả cuối, nhận xét chung, dự bị). Trả về JSON đúng schema.`;

export async function POST(req: Request) {
  let body: { summary?: string; homeTeamName?: string; awayTeamName?: string; homePlayers?: unknown; awayPlayers?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Vui lòng nhập tóm tắt diễn biến trận đấu!' }, { status: 400 }); }
  const { summary, homeTeamName, awayTeamName, homePlayers, awayPlayers } = body;
  if (!summary || typeof summary !== 'string' || summary.trim() === '') {
    return NextResponse.json({ error: 'Vui lòng nhập tóm tắt diễn biến trận đấu!' }, { status: 400 });
  }
  const safeHome = (homeTeamName || 'đội nhà').trim();
  const safeAway = (awayTeamName || 'đội khách').trim();

  const rosterInfo = [
    `- Đội nhà ("home"): ${safeHome}. Cầu thủ: ${Array.isArray(homePlayers) && homePlayers.length ? homePlayers.join(', ') : '(không rõ)'}.`,
    `- Đội khách ("away"): ${safeAway}. Cầu thủ: ${Array.isArray(awayPlayers) && awayPlayers.length ? awayPlayers.join(', ') : '(không rõ)'}.`,
  ].join('\n');

  const userPrompt = `Thông tin hai đội:\n${rosterInfo}\n\nTóm tắt diễn biến trận đấu:\n"""\n${summary}\n"""`;

  try {
    const parsed = (await callStructured({
      systemPrompt: SYSTEM,
      userPrompt,
      schema: SCHEMA,
      functionName: 'extract_match_events',
    })) as { events?: unknown };

    // Normalize: chỉ giữ các field hợp lệ theo schema enum.
    const allowedTypes = new Set(['goal', 'yellow', 'red']);
    const allowedSides = new Set(['home', 'away', 'unknown']);
    const rawEvents = Array.isArray(parsed?.events) ? parsed.events : [];
    const cleanEvents = rawEvents
      .filter((e: any) => e && allowedTypes.has(e.type) && allowedSides.has(e.teamSide))
      .map((e: any) => ({
        type: e.type,
        teamSide: e.teamSide,
        playerName: typeof e.playerName === 'string' ? e.playerName.trim() : '',
        minute: typeof e.minute === 'number' && e.minute >= 0 && e.minute <= 200 ? e.minute : undefined,
        note: typeof e.note === 'string' ? e.note.trim() : undefined,
      }))
      // Bỏ event không có teamSide hữu ích.
      .filter((e: any) => e.teamSide !== 'unknown' || e.playerName);

    return NextResponse.json({ success: true, data: { events: cleanEvents } });
  } catch (e) {
    return NextResponse.json({ error: 'AI lỗi: ' + (e as Error).message }, { status: 502 });
  }
}
