# Game Tuổi Thơ · gametuoitho.space

Tuyển tập game cổ điển Việt Nam — cờ caro, cờ tướng, cờ vua, ô ăn quan, cờ cá ngựa, đuổi hình bắt chữ, nối chữ, đoán từ. Chơi online miễn phí: đối kháng realtime, giải đấu, bảng xếp hạng ELO, thêm Bi Lắc arena và futsal MyLeague.

## Stack

- **Frontend**: React 19 + Vite 6 + Tailwind 4.
- **Backend**: Cloudflare Worker (Hono) trên `gametuoitho.space/api/*` (same-origin route).
- **DB**: Cloudflare D1 (SQLite).
- **Realtime**: Durable Objects + Hibernatable WebSockets (một DO mỗi trận / mỗi game; pairing matchmaking chống race cross-isolate).
- **AI**: OpenAI-compatible gateway (mặc định MiniMax-M3).

## Chạy local

**Yêu cầu**: Node.js.

```bash
npm install
```

 hai chế độ:

- `npm run dev` — legacy Express + better-sqlite3 (offline, không dùng code Worker).
- `npm run dev:worker` — Vite + wrangler dev + local D1 (giống production, test realtime ở đây). Cần `cp worker/.dev.vars.example worker/.dev.vars`.

## Build

- `npm run build:fe` — build frontend (Vite) → `dist/`.

## Test

- `npm run lint` — `tsc --noEmit` (frontend).
- `npm run test:worker` — Worker unit tests (vitest).

## Deploy (Cloudflare free tier)

Xem hướng dẫn từng bước: [`docs/deploy-cloudflare.md`](docs/deploy-cloudflare.md).

Tóm tắt:

```bash
cd worker
npx wrangler d1 create gametuoitho-db          # paste database_id vào wrangler.toml
npm run db:migrate:remote                        # áp dụng schema lên D1
npx wrangler secret put OPENAI_API_KEY           # key MiniMax-M3
cd .. && npm run deploy:worker                   # deploy Worker (+ apex /api route)
# Frontend: Cloudflare Pages, build `npm run build:fe`, output `dist`
```

Kiến trúc production: Worker phục vụ `/api/*` (route trên apex zone, same-origin với SPA); Pages phục vụ phần còn lại của `gametuoitho.space`.

## Ghi chú

- DB production (D1) bắt đầu rỗng sau `worker/migrations/*` — không auto-migrate từ `database.json`; `server/db.ts#migrateFromJson`/`seedDefaults` chỉ chạy trên SQLite legacy (`npm run dev`). Muốn seed demo trên D1, insert thủ công via `wrangler d1 execute` / D1 console (dataset mẫu ở `server/db.ts#seedDefaults`) — xem [`docs/deploy-cloudflare.md`](docs/deploy-cloudflare.md).
- Realtime dùng Durable Objects + WebSocket (không phải SSE).
- AI gọi endpoint OpenAI-compatible (`OPENAI_BASE_URL`).
