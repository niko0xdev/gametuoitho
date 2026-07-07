# Hướng dẫn deploy gametuoitho.space lên Cloudflare — từng bước

> 👉 **Bắt đầu ngay tại Bước 1.** Đó là việc duy nhất chờ lâu, làm trước rồi làm việc khác trong lúc chờ.
>
> **Mục tiêu**: app live ở `https://gametuoitho.space`, API ở `https://api.gametuoitho.space`. Hosting Cloudflare **$0**. AI dùng **MiniMax-M3** (có phí theo token — không phải chi phí Cloudflare).
>
> **Thời gian**: ~1–2 tiếng, phần lớn là chờ DNS.

Stack: Cloudflare **Worker** (API) + **D1** (SQLite) + **Durable Objects** (realtime) + **Pages** (frontend).

---

## Bạn cần có trước

- [ ] Tài khoản Cloudflare (đăng ký free tại `dash.cloudflare.com`).
- [ ] Domain `gametuoitho.space` đã mua trên **Namecheap**.
- [ ] API key **MiniMax-M3** (lấy tại `platform.minimax.io`).
- [ ] Máy đã cài **Node.js** và đã `git clone` repo `gametuoitho` về máy.
- [ ] Code trên nhánh `main` đã có 2 PR: realtime Durable Objects + deploy config (đã merge).

---

## Bước 1 — Chuyển DNS domain về Cloudflare ⏳ *làm ĐẦU TIÊN*

Cloudflare quản lý custom domain miễn phí **chỉ khi DNS nằm trên Cloudflare**. Việc này mất 10 phút – vài giờ chờ, nên khởi động trước.

1. Đăng nhập **Cloudflare** → bấm **+ Add a Site** (góc trên bên phải).
2. Nhập `gametuoitho.space` → **Continue**.
3. Chọn plan **Free** → **Continue**.
4. Cloudflare quét DNS cũ. Ở trang cuối, CF hiện **2 nameserver** dạng:
   ```
   something.ns.cloudflare.com
   otherthing.ns.cloudflare.com
   ```
   → **Copy** 2 dòng này.
5. Mở tab mới → đăng nhập **Namecheap** → **Domain List** → tìm `gametuoitho.space` → bấm nút **MANAGE** bên phải.
6. Chuyển sang tab **Nameservers** → dropdown chọn **Custom DNS** *(không phải "Namecheap Basic DNS")*.
7. Dán 2 nameserver Cloudflare vào ô **1** và **2** (bỏ trống ô 3-4-5) → bấm **✓ Save Changes** *(tic xanh "All changes saved")*.
8. Về Cloudflare → bấm **Done, check nameservers**.

- [ ] **Xong khi**: Cloudflare gửi email *"gametuoitho.space is active"* và dashboard hiện trạng thái **Active**.

> ⏳ Trong lúc chờ DNS, làm tiếp **Bước 2 → 5** (không cần DNS).

---

## Bước 2 — Đăng nhập Wrangler CLI

```bash
cd <thư-mục-repo>/gametuoitho
cd worker
npx wrangler login
```

- Browser tự mở → chọn tài khoản Cloudflare → bấm **Allow**.

- [ ] **Xong khi**: terminal hiện `Successfully logged in`.

---

## Bước 3 — Tạo database D1 + áp dụng schema

```bash
# vẫn trong worker/
npx wrangler d1 create gametuoitho-db
```

Output có dòng:
```
✅ Successfully created DB 'gametuoitho-db'
database_id = "b3f7...e91"        ← COPY chuỗi trong ngoặc kép
```

Mở file `worker/wrangler.toml`, tìm dòng:
```toml
database_id = "REPLACE_AFTER_wrangler_d1_create"
```
→ thay bằng `database_id` vừa copy. **Save** file.

Tạo các bảng trên D1 production:
```bash
# về thư mục gốc repo
cd ..
npm run db:migrate:remote
```
- Gõ `y` khi hỏi xác nhận apply lên remote.

- [ ] **Xong khi**: hiện `🚣🚣🚣` / `✅ ... migrations applied`.

Commit `database_id` (giờ là giá trị thật) lên repo:
```bash
git add worker/wrangler.toml
git commit -m "chore: set D1 database_id"
git push
```

---

## Bước 4 — Set Worker secrets (MiniMax-M3)

```bash
cd worker
npx wrangler secret put OPENAI_BASE_URL
# dán: https://api.minimax.io/v1        rồi Enter

npx wrangler secret put OPENAI_MODEL
# dán: MiniMax-M3                       rồi Enter

npx wrangler secret put OPENAI_API_KEY
# dán: <API key MiniMax của bạn>        rồi Enter
```

> Nếu tài khoản MiniMax là vùng Trung Quốc đại lục, base URL dùng `https://api.minimaxi.com/v1`.

- [ ] **Xong khi**: mỗi lệnh hiện `Success! Uploaded secret`.

---

## Bước 5 — Deploy Worker

```bash
# về thư mục gốc repo
cd ..
npm run deploy:worker
```

- [ ] **Xong khi**: hiện `Published gametuoitho-api` + URL dạng `https://gametuoitho-api.<account>.workers.dev`.

Test ngay:
```bash
curl https://gametuoitho-api.<account>.workers.dev/api/health
# phải ra: {"ok":true,"ts":...}
```

---

## Bước 6 — Gắn custom domain API: `api.gametuoitho.space`

> Cần **Bước 1 đã xong** (domain Active trên Cloudflare).

1. Cloudflare dashboard → menu trái **Workers & Pages** → chọn **gametuoitho-api**.
2. Vào tab **Settings** → mục **Domains & Routes** (hoặc **Domains**) → bấm **Add** → **Custom domain**.
3. Nhập `api.gametuoitho.space` → **Add domain**.
4. Cloudflare tự thêm DNS record. Chờ status chuyển **Active** (~1–3 phút, cấp SSL).

- [ ] **Test**: `curl https://api.gametuoitho.space/api/health` → `{"ok":true,...}`.

---

## Bước 7 — Deploy frontend (Cloudflare Pages)

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → tab **Pages** → **Connect to Git**.
2. Chọn GitHub account → chọn repo **gametuoitho** → **Begin setup**.
3. Điền build settings:
   - **Project name**: `gametuoitho`
   - **Production branch**: `main`
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build:fe`
   - **Build output directory**: `dist`
   - Mục **Environment variables (advanced)** → **Add variable**:
     - **Variable name**: `VITE_API_BASE`
     - **Value**: `https://api.gametuoitho.space`
4. Bấm **Save and Deploy**. Chờ build (~1–2 phút).

- [ ] **Xong khi**: build **xanh** + có URL `https://gametuoitho.pages.dev`. Mở URL thấy app load.

---

## Bước 8 — Gắn custom domain frontend: `gametuoitho.space`

1. Cloudflare dashboard → **Workers & Pages** → project **gametuoitho** (Pages) → tab **Custom domains** → **Set up a custom domain**.
2. Nhập `gametuoitho.space` → **Continue** → **Activate domain**.
3. *(tùy chọn)* Lặp lại cho `www.gametuoitho.space`.
4. Chờ status **Active**.

- [ ] **Xong khi**: mở `https://gametuoitho.space` → app load bình thường.

---

## Bước 9 — Test toàn bộ

- [ ] `curl https://api.gametuoitho.space/api/health` → `{"ok":true}`
- [ ] Mở `https://gametuoitho.space` → **đăng ký** tài khoản → **đăng nhập**.
- [ ] Vào game cờ caro → bấm **Tìm trận** → mở tab thứ 2 (hoặc máy khác, đăng nhập tài khoản khác) → cũng bấm **Tìm trận** → **ghép pair thành công**.
- [ ] Đánh 1 nước → đối thủ thấy nước đi xuất hiện **ngay** (realtime qua WebSocket). Mở DevTools → tab Network → filter `WS` → thấy `/api/match/.../ws` status **101**.
- [ ] *(nếu có quyền admin)* Test AI: nhập tóm tắt giải đấu → parse roster → ra danh sách đội/cầu thủ.

---

## Troubleshooting

| Triệu chứng | Nguyên nhân & cách sửa |
|---|---|
| DNS không Active sau 1h | Namecheap → kiểm 2 nameserver đã **Save**; tra NS thực tế tại `whatsmydns.net` (chọn NS, nhập `gametuoitho.space`). |
| CORS error ở browser khi chạy local | Thiếu `worker/.dev.vars`. Chạy `cp worker/.dev.vars.example worker/.dev.vars`. *(Production không bị.)* |
| Pages build fail `VITE_API_BASE undefined` | Environment variable sai tên/chưa set. Đảm bảo tên đúng `VITE_API_BASE`, value `https://api.gametuoitho.space`, scope **Production**. |
| `/api/ai/parse-roster` trả 4xx | MiniMax-M3 có thể chặn `response_format`. Báo Claude gỡ field đó trong `worker/src/lib/ai.ts:31`. |
| `wrangler deploy` fail nhắc `database_id` | Chưa thay placeholder trong `worker/wrangler.toml` (xem **Bước 3**). |
| Matchmaking không ghép pair | Phải dùng **2 session khác** (2 tab ẩn danh, hoặc 2 trình duyệt) — cùng 1 localStorage coi là 1 user. |

---

## Giới hạn free tier (theo dõi ở Cloudflare → Analytics)

- **Workers**: 100.000 request/ngày.
- **Durable Objects**: 100.000 request + 13.000 GB-s/ngày (WebSocket idle ≈ 0).
- **D1**: 500 MB storage, ~5M rows đọc + 100k rows ghi/ngày.
- **Pages**: không giới hạn request.
- **AI (MiniMax-M3)**: **có phí** theo token — hosting Cloudflare vẫn **$0**.

> ⚠️ Đừng bao giờ migrate password hashing sang **bcrypt** — Workers free tier giới hạn **10ms CPU/request**, bcrypt sẽ bị kill (`Error 1102`). Code hiện dùng SHA-256, đã an toàn.
