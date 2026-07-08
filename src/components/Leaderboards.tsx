import React, { useState, useEffect } from 'react';
import { Award, Trophy, User } from 'lucide-react';
import { GAMES } from '../gamesData.ts';
import { gameDisplayName } from '../lib/gameDisplayName.ts';

interface LeaderboardPlayer {
  id: string;
  displayName: string;
  avatar: string;
  elo?: number;
  honorScore: number;
}

export default function Leaderboards() {
  const [activeTab, setActiveTab] = useState<string>('global'); // 'global' or gameId
  const [list, setList] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const url = activeTab === 'global'
          ? '/api/leaderboard/global'
          : `/api/leaderboard/${activeTab}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setList(data);
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [activeTab]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 bg-white border border-stone-200 rounded-2xl shadow-sm my-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-stone-100 pb-4 mb-6">
        <div>
          <h2 className="text-base sm:text-xl font-serif font-bold text-stone-800 flex items-center gap-1.5 leading-tight">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 shrink-0" /> Bảng Vàng Vinh Danh
          </h2>
          <p className="text-xs text-stone-500">Xếp hạng cao thủ tài năng dựa trên điểm Elo đối kháng hoặc điểm Danh Vọng tích lũy</p>
        </div>

        {/* Dropdown tabs */}
        <div className="w-full md:w-auto">
          <select
            id="leaderboard-filter"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full md:w-56 bg-stone-50 border border-stone-300 py-1.5 px-3 rounded-lg text-xs font-semibold text-stone-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="global">Bảng Danh Vọng Toàn Cầu</option>
            {GAMES.filter(g => g.isRealTime).map(g => (
              <option key={g.id} value={g.id}>{gameDisplayName(g)}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
          <span className="text-xs text-stone-500 font-semibold">Đang tổng hợp dữ liệu...</span>
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12">
          <User className="w-12 h-12 text-stone-300 mx-auto" />
          <span className="text-xs text-stone-500 font-semibold block mt-2">Chưa có dữ liệu thi đấu nào!</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-100 text-stone-500 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4 w-16">Hạng</th>
                <th className="py-3 px-4">Kỳ thủ</th>
                <th className="py-3 px-4 text-right">
                  {activeTab === 'global' ? 'Điểm Danh Vọng' : 'Hệ số Elo'}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((player, index) => {
                const rank = index + 1;
                const isTop3 = rank <= 3;
                let rankStyle = 'bg-stone-100 text-stone-700';
                if (rank === 1) rankStyle = 'bg-yellow-500 text-white font-bold';
                if (rank === 2) rankStyle = 'bg-stone-300 text-stone-800 font-bold';
                if (rank === 3) rankStyle = 'bg-amber-600 text-white font-bold';

                return (
                  <tr
                    key={player.id}
                    className="border-b border-stone-100 hover:bg-stone-50/50 transition-colors"
                  >
                    <td className="py-4 px-4">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${rankStyle}`}>
                        {rank}
                      </span>
                    </td>
                    <td className="py-4 px-4 flex items-center gap-3">
                      <img
                        src={player.avatar}
                        alt="Avatar"
                        className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200"
                      />
                      <span className="text-xs sm:text-sm font-bold text-stone-800 tracking-tight">
                        {player.displayName}
                      </span>
                      {rank === 1 && (
                        <Award className="w-4 h-4 text-yellow-500" />
                      )}
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-xs sm:text-sm font-bold text-stone-700">
                      {activeTab === 'global'
                        ? player.honorScore
                        : typeof player.elo === 'number'
                        ? player.elo
                        : player.elo && typeof player.elo === 'object'
                        ? (player.elo[activeTab] ?? 1500)
                        : 1500}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
