import { Game } from './types.ts';

export const GAMES: Game[] = [
  // 1. Strategy
  {
    id: 'caro',
    name: 'Caro',
    category: 'strategy',
    description: 'Game cờ caro truyền thống của học sinh Việt Nam. Đạt 5 quân cờ liên tiếp trên bàn cờ 15x15 để chiến thắng.',
    isRealTime: true,
    minPlayers: 2,
    maxPlayers: 2
  },
  {
    id: 'co_tuong',
    name: 'Cờ Tướng',
    category: 'strategy',
    description: 'Trò chơi trí tuệ đậm chất phương Đông. Điều binh khiển tướng vượt sông, hạ gục Tướng đối phương.',
    isRealTime: true,
    minPlayers: 2,
    maxPlayers: 2
  },
  {
    id: 'co_vua',
    name: 'Cờ Vua',
    category: 'strategy',
    description: 'Môn cờ vua quốc tế huyền thoại. Sử dụng chiến thuật tinh vi để chiếu bí (Checkmate) Vua đối phương.',
    isRealTime: true,
    minPlayers: 2,
    maxPlayers: 2
  },
  {
    id: 'o_an_quan',
    name: 'Ô Ăn Quan',
    category: 'strategy',
    description: 'Trò chơi dân gian Việt Nam đầy ký ức tuổi thơ. Tính toán rải sỏi để thu về nhiều quân dân và quân quan nhất.',
    isRealTime: true,
    minPlayers: 2,
    maxPlayers: 2
  },
  {
    id: 'co_ca_ngua',
    name: 'Cờ Cá Ngựa',
    category: 'strategy',
    description: 'Trò chơi cá ngựa vui nhộn từ 2 đến 4 người. Đổ xúc xắc để xuất chuồng, đi quanh bản đồ và đưa ngựa về đích sớm nhất.',
    isRealTime: true,
    minPlayers: 2,
    maxPlayers: 4
  },

  // 2. Quiz
  {
    id: 'duoi_hinh_bat_chu',
    name: 'Đuổi Hình Bắt Chữ',
    category: 'quiz',
    description: 'Nhìn hình vẽ gợi ý dí dỏm để suy luận ra những từ ngữ, câu thành ngữ tiếng Việt thú vị.',
    isRealTime: true,
    minPlayers: 2,
    maxPlayers: 6
  },
  {
    id: 'ai_la_trieu_phu',
    name: 'Ai Là Triệu Phú',
    category: 'quiz',
    description: 'Thử thách kiến thức tổng hợp với 15 câu hỏi trắc nghiệm kịch tính. Sử dụng 3 quyền trợ giúp kinh điển.',
    isRealTime: false,
    minPlayers: 1,
    maxPlayers: 1
  },
  {
    id: 'noi_chu',
    name: 'Nối Chữ',
    category: 'quiz',
    description: 'Đấu trí từ vựng tiếng Việt. Nối từ tiếp theo bắt đầu bằng âm cuối của từ đối thủ trước khi hết giờ.',
    isRealTime: true,
    minPlayers: 2,
    maxPlayers: 4
  },
  {
    id: 'doan_tu',
    name: 'Đoán Từ',
    category: 'quiz',
    description: 'Đoán từ tiếng Việt có nghĩa trong 6 lượt thử với các gợi ý màu sắc quen thuộc.',
    isRealTime: true,
    minPlayers: 2,
    maxPlayers: 2
  },

  // 3. Puzzle
  {
    id: 'sudoku',
    name: 'Sudoku Trí Tuệ',
    category: 'puzzle',
    description: 'Điền các số từ 1 đến 9 vào lưới 9x9 sao cho không trùng lặp trong mỗi hàng, cột và phân vùng 3x3.',
    isRealTime: false,
    minPlayers: 1,
    maxPlayers: 1
  },
  {
    id: 'crossword',
    name: 'Ô Chữ Kỳ Diệu',
    category: 'puzzle',
    description: 'Giải các ô chữ hàng ngang và hàng dọc theo gợi ý để tìm ra từ khóa chủ đề bí ẩn.',
    isRealTime: false,
    minPlayers: 1,
    maxPlayers: 1
  },
  {
    id: 'spot_difference',
    name: 'Tìm Điểm Khác Biệt',
    category: 'puzzle',
    description: 'So sánh hai bức tranh sinh động mang phong cách retro và nhanh tay tìm ra 5 điểm khác biệt trước khi hết giờ.',
    isRealTime: false,
    minPlayers: 1,
    maxPlayers: 1
  },
  {
    id: 'tangram',
    name: 'Xếp Hình Tangram',
    category: 'puzzle',
    description: 'Xoay và ghép 7 mảnh ghép hình học đơn giản để tạo thành các hình bóng động vật và đồ vật phức tạp.',
    isRealTime: false,
    minPlayers: 1,
    maxPlayers: 1
  },
  {
    id: 'maze',
    name: 'Mê Cung Kỳ Bí',
    category: 'puzzle',
    description: 'Tìm đường thoát khỏi các mê cung phức tạp sinh ngẫu nhiên với giới hạn thời gian đầy thử thách.',
    isRealTime: false,
    minPlayers: 1,
    maxPlayers: 1
  },

  // 4. Memory
  {
    id: 'memory_match',
    name: 'Lật Bài Trùng Khớp',
    category: 'memory',
    description: 'Rèn luyện trí nhớ bằng cách lật mở các cặp hình ảnh trùng khớp trong số lượt lật tối thiểu.',
    isRealTime: false,
    minPlayers: 1,
    maxPlayers: 1
  },
  {
    id: 'simon_says',
    name: 'Trí Nhớ Âm Thanh',
    category: 'memory',
    description: 'Ghi nhớ và lặp lại chuỗi tín hiệu ánh sáng và âm thanh tăng dần theo cấp độ.',
    isRealTime: false,
    minPlayers: 1,
    maxPlayers: 1
  },
  {
    id: 'reflex',
    name: 'Phản Xạ Siêu Tốc',
    category: 'memory',
    description: 'Kiểm tra tốc độ phản ứng của bạn. Nhấp chuột ngay khi màn hình đổi màu hoặc xuất hiện tín hiệu.',
    isRealTime: false,
    minPlayers: 1,
    maxPlayers: 1
  },

  // 5. Math
  {
    id: 'speed_math',
    name: 'Tính Nhẩm Siêu Tốc',
    category: 'math',
    description: 'Giải quyết hàng loạt phép tính cộng, trừ, nhân, chia cơ bản trong vài giây. Chơi đơn hoặc đối kháng 1v1.',
    isRealTime: true, // Can support solo or duel
    minPlayers: 1,
    maxPlayers: 2
  },
  {
    id: 'number_pattern',
    name: 'Quy Luật Con Số',
    category: 'math',
    description: 'Tìm ra số còn thiếu trong chuỗi số logic được sắp xếp theo quy luật toán học thú vị.',
    isRealTime: false,
    minPlayers: 1,
    maxPlayers: 1
  }
];
export const GAMES_MAP = new Map(GAMES.map(g => [g.id, g]));

// Games that actually have a solo implementation (engine + board renderer).
// Catalog hides the solo button for any game not in this set so clicking never
// lands on an unbuilt/hanging arena. Must stay in sync with worker
// RULE_ENGINES (worker/src/game/rules.ts) + GameBoard renderers.
export const SOLO_GAMES = new Set<string>([
  'caro',
  'co_tuong',
  'co_vua',
  'o_an_quan',
  'co_ca_ngua',
  'duoi_hinh_bat_chu',
  'noi_chu',
  'doan_tu',
  'speed_math',
  'number_pattern',
  'memory_match',
  'simon_says',
  'reflex'
]);
