// worker/src/routes/ai.ts
import { Hono } from 'hono';
import type { Bindings } from '../db';
import { callStructured } from '../lib/ai';

export const aiRoute = new Hono<{ Bindings: Bindings }>();

aiRoute.post('/parse-roster', async (c) => {
  const { summary } = await c.req.json();
  if (!summary || typeof summary !== 'string' || summary.trim() === '') {
    return c.json({ error: 'Nội dung tóm tắt không được để trống!' }, 400);
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
