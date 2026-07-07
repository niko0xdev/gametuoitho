# Deploy gametuoitho.space lên Cloudflare (free tier)

Runbook deploy $0. Stack: Cloudflare **Worker** (API) + **D1** (SQLite) + **Durable Objects** (realtime) + **Pages** (frontend). Domain mua trên Namecheap.

> Free tier = hosting Cloudflare $0. Chi phí AI (OpenAI/Groq/Ollama) là của provider, riêng. Total $0 chỉ khi dùng Ollama local hoặc Groq free tier.

## 0. Yêu cầu trước
- Tài khoản Cloudflare (free).
- Domain `gametuoitho.space` đã mua trên Namecheap.
- Đã login wrangler: `cd worker && npx wrangler login`.
- (Local dev) `cp worker/.dev.vars.example worker/.dev.vars` — để `wrangler dev` dùng CORS localhost thay vì giá trị production trong `wrangler.toml [vars]`.

## 1. Chuyển DNS domain về Cloudflare (Namecheap)
Cloudflare quản lý custom domain miễn phí khi DNS nằm trên Cloudflare.
1. Cloudflare dashboard → **Add a Site** → nhập `gametuoitho.space` → plan **Free**.
2. Cloudflare quét DNS cũ và gán 2 nameserver (dạng `xxx.ns.cloudflare.com`).
3. **Namecheap** → *Domain List* → nút **Manage** cạnh `gametuoitho.space` → tab **Nameservers** → chọn **Custom DNS** → dán 2 nameserver Cloudflare → **Save** (tic xanh).
4. Đợi Cloudflare email "…is active" (vài phút – vài giờ). Xem trạng thái ở dashboard home.

## 2. Tạo D1 + áp dụng schema (remote)
```bash
cd worker
npx wrangler d1 create gametuoitho-db        # in ra database_id
# paste database_id đó vào worker/wrangler.toml (dòng database_id), commit
npm run db:migrate:remote                      # tạo bảng trên D1 production
```

## 3. Worker secrets (provider: MiniMax-M3)
```bash
cd worker
npx wrangler secret put OPENAI_API_KEY        # MiniMax API key (Bearer)
npx wrangler secret put OPENAI_MODEL          # giá trị: MiniMax-M3
npx wrangler secret put OPENAI_BASE_URL       # https://api.minimax.io/v1  (quốc tế; TQ: https://api.minimaxi.com/v1)
```

## 4. Deploy Worker
```bash
npm run deploy:worker     # = wrangler deploy
```
→ API live tại `https://gametuoitho-api.<account-subdomain>.workers.dev`. Lệnh này ship `[vars]` (prod CORS/APP) + bindings D1/DO.

## 5. Gắn custom domain API
Cloudflare dashboard → **Workers & Pages** → `gametuoitho-api` → **Settings → Domains → Add → Custom domain** → nhập `api.gametuoitho.space`. Cloudflare tự thêm DNS record (DNS đã nằm trên CF). Đợi certificate **Active**.

## 6. Deploy frontend (Pages)
**Khuyến nghị Git auto-deploy:**
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → chọn repo `gametuoitho`.
2. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build:fe`
   - Build output directory: `dist`
   - Variables (Production): `VITE_API_BASE` = `https://api.gametuoitho.space`
3. Save → Deploy. Các push sau tự rebuild.

**Hoặc direct upload:**
```bash
VITE_API_BASE=https://api.gametuoitho.space npm run build:fe
npx wrangler pages deploy dist --project-name gametuoitho
```

## 7. Gắn custom domain frontend
Pages project → **Custom domains → Set up** → `gametuoitho.space` (thêm cả `www`). Cloudflare tự DNS + SSL.

## 8. Verify
```bash
curl https://api.gametuoitho.space/api/health        # {"ok":true,...}
```
Mở `https://gametuoitho.space` → đăng ký / đăng nhập → test 1 game (matchmaking qua WS + match stream). Kiểm tab Network: WS `/api/matchmaking/ws` và `/api/match/:id/ws` connect 101.

## Free-tier watchouts
- **Workers**: 100k req/ngày, **10ms CPU/req** — đã tránh bcrypt (giữ SHA-256). Đừng migrate bcrypt.
- **D1**: 500 MB/db, ~5M rows read + 100k rows written mỗi ngày.
- **Durable Objects**: 100k req/ngày, 13k GB-s/ngày — Hibernatable WS idle ≈ 0 GB-s.
- **AI**: tiền provider, không phải Cloudflare. MiniMax-M3 **có phí** (không free) → hosting Cloudflare $0 nhưng AI tính tiền theo token.
- **MiniMax-M3 là reasoning model**: code gửi `tools`+`tool_choice` để ép kết quả JSON vào `tool_calls.function.arguments` (path chính). `response_format: json_object` được gửi kèm làm fallback — MiniMax thường ignore field không hỗ trợ, nhưng nếu route `/api/ai/parse-roster` trả 4xx sau deploy, gỡ `response_format` trong `worker/src/lib/ai.ts`. Không dùng `JSON.parse(content)` fallback vì content chứa `<think>...`.
- **Footgun**: điền `database_id` thật vào `worker/wrangler.toml` trước khi `npm run deploy:worker` (placeholder sẽ làm deploy fail hoặc binding D1 rỗng).
- **Footgun local dev**: nếu quên `cp worker/.dev.vars.example worker/.dev.vars`, `wrangler dev` dùng CORS prod → frontend localhost bị chặn CORS. Chạy `npm run dev:worker` cần file này.
- **DO migration**: `[[migrations]] new_sqlite_classes` tự apply ở lần `wrangler deploy` đầu tiên.

## Local dev (nhắc lại)
- `npm run dev` — legacy Express + better-sqlite3 (offline, không dùng Worker code).
- `npm run dev:worker` — Vite + wrangler dev + local D1 (production-like, test realtime ở đây).
