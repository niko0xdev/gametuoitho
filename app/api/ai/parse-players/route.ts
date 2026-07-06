import { NextResponse } from 'next/server';
import { callStructured } from '@/server/ai/openai';

const SCHEMA = {
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
};

const SYSTEM = 'Bạn là trợ lý AI trích xuất tên người chơi. Nhiệm vụ: đọc văn bản tự do (danh sách cầu thủ, đội hình, hoặc văn bản hỗn độn) và trả về mảng JSON các tên đầy đủ duy nhất. Bỏ tiêu đề nhóm ("Đội X", "Team A"), bỏ số thứ tự đầu dòng ("1.", "-", "•"), bỏ trùng lặp (giữ lần xuất hiện đầu tiên). Mỗi tên là chuỗi tiếng Việt có dấu, đã được trim khoảng trắng. Không trả thêm text ngoài JSON.';

export async function POST(req: Request) {
  let body: { text?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Vui lòng nhập danh sách tên cần tách!' }, { status: 400 }); }
  const { text } = body;
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return NextResponse.json({ error: 'Vui lòng nhập danh sách tên cần tách!' }, { status: 400 });
  }
  const userPrompt = `Hãy trích xuất tất cả tên người chơi duy nhất từ văn bản dưới đây:\n"""\n${text}\n"""`;
  try {
    const parsed = (await callStructured({
      systemPrompt: SYSTEM,
      userPrompt,
      schema: SCHEMA,
      functionName: 'extract_player_names',
    })) as { names?: unknown };

    // Normalize: trim, dedupe (case-insensitive), bỏ token rỗng.
    const seen = new Set<string>();
    const deduped: string[] = [];
    if (Array.isArray(parsed?.names)) {
      for (const raw of parsed.names) {
        if (typeof raw !== 'string') continue;
        const n = raw.trim();
        if (!n) continue;
        const key = n.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(n);
      }
    }
    return NextResponse.json({ success: true, data: { names: deduped } });
  } catch (e) {
    return NextResponse.json({ error: 'AI lỗi: ' + (e as Error).message }, { status: 502 });
  }
}
