import { db } from './db.ts';
import { DailyChallenge } from '../src/types.ts';

const DAILY_WORDS = [
  'HUONG_VI',
  'NANG_AM',
  'BONG_DA',
  'PHU_QUOC',
  'SAI_GON',
  'HA_NOI',
  'HOA_MAI',
  'BIEU_TUONG',
  'AN_LANH',
  'TUOI_THO'
];

class DailyChallengeManager {
  getOrCreateChallenge(gameId: string, dateStr: string): DailyChallenge {
    let challenge = db.getDailyChallenge(`${gameId}_${dateStr}`);
    if (challenge) {
      return challenge;
    }

    // Generate a deterministic puzzle layout based on date and game ID
    const seed = `${gameId}-${dateStr}`;
    let prompt = '';

    if (gameId === 'sudoku') {
      prompt = 'Điền đúng các số vào bảng Sudoku đặc biệt của ngày hôm nay.';
    } else if (gameId === 'speed_math') {
      prompt = 'Giải 20 phép tính cộng trừ nhân chia trong thời gian ngắn nhất có thể!';
    } else if (gameId === 'doan_tu') {
      prompt = 'Đoán từ bí ẩn gồm 6 chữ cái của ngày hôm nay!';
    } else {
      prompt = 'Vượt qua thử thách trí tuệ đặc biệt ngày hôm nay!';
    }

    // Deterministic selection of Wordle words based on day index
    const dateNum = new Date(dateStr).getDate() || 0;
    const wordIndex = dateNum % DAILY_WORDS.length;
    const wordOfTheDay = DAILY_WORDS[wordIndex];

    challenge = {
      id: `${gameId}_${dateStr}`,
      date: dateStr,
      gameId,
      seed: wordOfTheDay, // use as wordle word or random seed
      prompt,
      topScores: []
    };

    db.saveDailyChallenge(challenge);
    return challenge;
  }

  submitScore(
    gameId: string,
    dateStr: string,
    userId: string,
    displayName: string,
    avatar: string,
    score: number
  ): DailyChallenge | null {
    const challenge = db.getDailyChallenge(`${gameId}_${dateStr}`);
    if (!challenge) return null;

    // Check if player already submitted (FR-DAILY-04)
    const alreadySubmitted = challenge.topScores.some(s => s.userId === userId);
    if (alreadySubmitted) {
      return challenge; // Return current state without overwriting
    }

    challenge.topScores.push({
      userId,
      displayName,
      avatar,
      score,
      timestamp: Date.now()
    });

    // Sort by higher score (or lower time depending on game)
    // For math/word guessing, lower time or higher accuracy is better. Let's sort:
    // Higher score is better. If speed_math, we record completion time where LOWER time is better,
    // so we store score as (10000 - timeMs) so higher remains better!
    challenge.topScores.sort((a, b) => b.score - a.score);

    // Keep top 20
    if (challenge.topScores.length > 20) {
      challenge.topScores = challenge.topScores.slice(0, 20);
    }

    db.saveDailyChallenge(challenge);
    return challenge;
  }
}

export const dailyChallengeManager = new DailyChallengeManager();
export default dailyChallengeManager;
