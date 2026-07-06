import { NextResponse } from 'next/server';
import { callStructured } from '@/server/ai/openai';

const SCHEMA = {
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
};

const SYSTEM = 'Bạn là một trợ lý ảo phân tích dữ liệu giải đấu thể thao chuyên nghiệp. Nhiệm vụ của bạn là đọc thông tin về các đội bóng và danh sách cầu thủ tham gia, sau đó trích xuất ra cấu trúc dữ liệu JSON chính xác. Luôn trả về đúng schema được yêu cầu.';

export async function POST(req: Request) {
  let body: { summary?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Nội dung tóm tắt không được để trống!' }, { status: 400 }); }
  const { summary } = body;
  if (!summary || typeof summary !== 'string' || summary.trim() === '') {
    return NextResponse.json({ error: 'Nội dung tóm tắt không được để trống!' }, { status: 400 });
  }
  const userPrompt = `Hãy phân tích văn bản tóm tắt giải đấu / đội hình dưới đây và trả về danh sách các đội tuyển cùng danh sách cầu thủ tương ứng.
Nếu là các bộ môn đơn/đôi như bóng bàn hoặc cầu lông, hãy coi mỗi vận động viên hoặc cặp vận động viên là một "đội" và liệt kê tên của họ vào danh sách cầu thủ.

Văn bản cần phân tích:
"""
${summary}
"""`;
  try {
    const data = await callStructured({
      systemPrompt: SYSTEM,
      userPrompt,
      schema: SCHEMA,
      functionName: 'parse_roster',
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ error: 'AI lỗi: ' + (e as Error).message }, { status: 502 });
  }
}
