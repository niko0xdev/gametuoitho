import { NextResponse } from 'next/server';

// Live tournament result reporting stays in the WS service (see server.ts WebSocket
// REPORT_MATCH_RESULT flow). The REST surface is intentionally a stub so the SPA
// has a single, predictable URL for clients still polling for updates.
export async function POST(_req: Request, _ctx: { params: { id: string } }) {
  return NextResponse.json(
    { error: 'Báo cáo kết quả giải đấu qua WebSocket. Endpoint REST chưa được hỗ trợ.' },
    { status: 501 },
  );
}