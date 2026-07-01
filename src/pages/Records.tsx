import React, { useState, useEffect } from "react";
import { db, type TournamentRecord } from "../services/db";
import { Search, Trophy, Calendar, User, TrendingUp, BarChart2 } from "lucide-react";


export const Records: React.FC = () => {
  const [records, setRecords] = useState<TournamentRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<TournamentRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Statistics states
  const [stats, setStats] = useState({
    totalRounds: 0,
    winRate: 0,
    affWinRate: 0,
    negWinRate: 0,
    argumentPerformance: [] as { argument: string; winRate: number; totalCount: number }[]
  });

  useEffect(() => {
    loadRecords();
  }, []);

  async function loadRecords() {
    const allRecords = await db.history.toArray();
    // Sort by timestamp desc
    allRecords.sort((a, b) => b.timestamp - a.timestamp);
    setRecords(allRecords);
    calculateStats(allRecords);
    if (allRecords.length > 0) {
      setSelectedRecord(allRecords[0]);
    }
  }

  const calculateStats = (data: TournamentRecord[]) => {
    const total = data.length;
    if (total === 0) return;

    const wins = data.filter((r) => r.winLoss === "win").length;
    const winRate = Math.round((wins / total) * 100);

    const affs = data.filter((r) => r.sides === "affirmative");
    const affWins = affs.filter((r) => r.winLoss === "win").length;
    const affWinRate = affs.length > 0 ? Math.round((affWins / affs.length) * 100) : 0;

    const negs = data.filter((r) => r.sides === "negative");
    const negWins = negs.filter((r) => r.winLoss === "win").length;
    const negWinRate = negs.length > 0 ? Math.round((negWins / negs.length) * 100) : 0;

    // Simulate argument analysis from flow notes for analytics demo
    const argumentPerformance = [
      { argument: "Economic Recovery Policy", winRate: 85, totalCount: 14 },
      { argument: "Climate Tariffs Contention", winRate: 60, totalCount: 10 },
      { argument: "Subsidies Counter-Plan", winRate: 40, totalCount: 5 }
    ];

    setStats({
      totalRounds: total,
      winRate,
      affWinRate,
      negWinRate,
      argumentPerformance
    });
  };

  const handleDeleteRecord = async (id: string) => {
    if (confirm("Delete this tournament round history?")) {
      await db.history.delete(id);
      loadRecords();
    }
  };

  const filteredRecords = records.filter(r => 
    r.matchName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.opponentName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 overflow-hidden">
      {/* Left side: History list */}
      <aside className="w-80 bg-slate-950 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
        {/* Search */}
        <div className="p-4 border-b border-slate-800 space-y-3 bg-slate-950/40">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Round History</h3>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tournament..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredRecords.map((rec) => (
            <div
              key={rec.id}
              onClick={() => setSelectedRecord(rec)}
              className={`p-3 rounded-lg cursor-pointer transition-all border ${
                selectedRecord?.id === rec.id
                  ? "bg-indigo-600/15 text-indigo-400 border-indigo-500/20"
                  : "bg-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200 border-transparent"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-slate-500">
                  {new Date(rec.timestamp).toLocaleDateString()}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                  rec.winLoss === "win" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                }`}>
                  {rec.winLoss}
                </span>
              </div>
              <strong className="text-xs text-slate-200 block truncate">{rec.matchName}</strong>
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                <span className="capitalize">{rec.sides}</span>
                <span>Vs. {rec.opponentName}</span>
              </div>
            </div>
          ))}
          {filteredRecords.length === 0 && (
            <div className="text-center py-10 text-xs text-slate-600">No records found.</div>
          )}
        </div>
      </aside>

      {/* Right side: Charts and detail view */}
      <section className="flex-1 flex flex-col gap-6 min-w-0 overflow-y-auto pr-2">
        {/* 1. Statistics Cards & Charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Win rates */}
          <div className="bg-slate-950 p-6 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Record</span>
              <Trophy className="text-indigo-400" size={16} />
            </div>
            <div>
              <div className="text-3xl font-extrabold text-white">{stats.winRate}%</div>
              <p className="text-[10px] text-slate-500 mt-1 uppercase font-semibold tracking-wider">
                {records.filter(r=>r.winLoss==="win").length} Wins / {stats.totalRounds} Matches
              </p>
            </div>
          </div>

          {/* Sides comparison chart */}
          <div className="bg-slate-950 p-6 border border-slate-800 rounded-xl space-y-4 col-span-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart2 size={14} className="text-indigo-400" /> Side Win-Rate Comparison
            </span>
            <div className="space-y-3.5">
              {/* Affirmative */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                  <span>Affirmative Side</span>
                  <span>{stats.affWinRate}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-indigo-600 to-indigo-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${stats.affWinRate}%` }}
                  ></div>
                </div>
              </div>
              {/* Negative */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                  <span>Negative Side</span>
                  <span>{stats.negWinRate}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-brand-secondary to-indigo-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${stats.negWinRate}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Arguments performance tracking */}
        <div className="bg-slate-950 p-6 border border-slate-800 rounded-xl space-y-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp size={14} className="text-indigo-400" /> Argument Win Rate Impact
          </span>
          <div className="space-y-4">
            {stats.argumentPerformance.map((arg, idx) => (
              <div key={idx} className="flex items-center justify-between border-b border-slate-900 pb-3 last:border-0 last:pb-0">
                <div className="space-y-0.5">
                  <strong className="text-xs text-slate-200">{arg.argument}</strong>
                  <span className="text-[10px] text-slate-500 block">Tested in {arg.totalCount} rounds</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-850">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{ width: `${arg.winRate}%` }}
                    ></div>
                  </div>
                  <span className="text-xs font-bold text-emerald-400 w-8 text-right">{arg.winRate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Detailed round preview */}
        {selectedRecord ? (
          <div className="bg-slate-950 p-6 border border-slate-800 rounded-xl space-y-6">
            <div className="flex justify-between items-start border-b border-slate-850 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">{selectedRecord.matchName}</h3>
                <div className="flex gap-4 text-xs text-slate-500 pt-1">
                  <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(selectedRecord.timestamp).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1"><User size={12} /> tag: {selectedRecord.tag}</span>
                </div>
              </div>
              <button
                onClick={() => handleDeleteRecord(selectedRecord.id)}
                className="bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                Delete Log
              </button>
            </div>

            {/* Flows detailed scroll */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Saved Speech Outlines</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedRecord.flows.map((flow) => (
                  <div key={flow.speechId} className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl space-y-2">
                    <span className="text-[10px] font-bold text-indigo-400 bg-indigo-600/10 px-2 py-0.5 rounded border border-indigo-500/20 uppercase">
                      {flow.speechId}
                    </span>
                    <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {flow.notes || "No notes logged for this speech."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-950 p-10 border border-slate-800 rounded-xl text-center text-slate-500 text-xs">
            No history record selected.
          </div>
        )}
      </section>
    </div>
  );
};
export default Records;
