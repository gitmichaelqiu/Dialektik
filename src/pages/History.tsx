import React, { useState, useEffect } from "react";
import { db, type TournamentRecord } from "../services/db";
import { Trophy, TrendingUp, BarChart2, Trash2 } from "lucide-react";

export const History: React.FC = () => {
  const [records, setRecords] = useState<TournamentRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<TournamentRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TournamentRecord | null>(null);

  // Statistics state
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
    allRecords.sort((a, b) => b.timestamp - a.timestamp);
    setRecords(allRecords);
    calculateStats(allRecords);
    if (allRecords.length > 0) {
      setSelectedRecord(allRecords[0]);
    } else {
      setSelectedRecord(null);
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

  const confirmDeleteRecord = async () => {
    if (!pendingDelete) return;
    await db.history.delete(pendingDelete.id);
    setSelectedRecord(null);
    setPendingDelete(null);
    await loadRecords();
  };

  const filteredRecords = records.filter(r => 
    r.matchName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.opponentName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="documents-layout">
      {pendingDelete && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-history-title">
          <div className="confirm-dialog">
            <h2 id="delete-history-title">Delete Round?</h2>
            <p>{pendingDelete.matchName} will be removed from local history.</p>
            <div className="confirm-actions">
              <button type="button" className="command" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button type="button" className="command danger-command inline-danger" onClick={confirmDeleteRecord}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 1. Left Sidebar directory list */}
      <aside className="file-rail flex flex-col justify-between overflow-y-auto">
        <div className="space-y-4">
          <div className="panel-header compact border-b pb-2">
            <h2>Round History</h2>
            <Trophy size={17} />
          </div>

          {/* Search Input */}
          <div className="relative border-b pb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search matches..."
              className="w-full text-xs"
            />
          </div>

          {/* Records lists */}
          <div className="space-y-2">
            {filteredRecords.map((rec) => (
              <button
                type="button"
                key={rec.id}
                onClick={() => setSelectedRecord(rec)}
                className={`file-item text-left p-3 ${selectedRecord?.id === rec.id ? "selected" : ""}`}
              >
                <div className="flex flex-col w-full">
                  <div className="flex items-center justify-between text-[9px] text-slate-400">
                    <span>{new Date(rec.timestamp).toLocaleDateString()}</span>
                    <span className={`px-1 rounded text-[8px] font-bold uppercase ${
                      rec.winLoss === "win" ? "bg-emerald-50 text-emerald-700 border" : "bg-rose-50 text-rose-700 border"
                    }`}>
                      {rec.winLoss}
                    </span>
                  </div>
                  <strong className="text-xs text-slate-800 truncate block mt-1">{rec.matchName}</strong>
                  <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                    Vs. {rec.opponentName}
                  </span>
                </div>
              </button>
            ))}

            {filteredRecords.length === 0 && (
              <div className="text-center py-10 text-xs text-slate-400 italic">No records found.</div>
            )}
          </div>
        </div>
      </aside>

      {/* 2. Middle Main Pane */}
      <section className="flex-grow flex flex-col gap-6 overflow-y-auto">
        {/* Statistics Panels charts */}
        <div className="history-grid">
          
          {/* Win Rate Card */}
          <div className="metric-card">
            <span className="eyebrow block">Win Performance</span>
            <div className="text-3xl font-extrabold text-[#2f5d62]">
              {stats.winRate}%
            </div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold">
              {records.filter(r => r.winLoss === "win").length} Wins / {stats.totalRounds} Matches
            </span>
          </div>

          {/* Sides win comparison */}
          <div className="metric-card col-span-2">
            <span className="eyebrow block flex items-center gap-1">
              <BarChart2 size={13} /> Win-rate by sides
            </span>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                  <span>Affirmative (Pro)</span>
                  <span>{stats.affWinRate}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border">
                  <div
                    className="bg-[#2f5d62] h-full rounded-full"
                    style={{ width: `${stats.affWinRate}%` }}
                  ></div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                  <span>Negative (Con)</span>
                  <span>{stats.negWinRate}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border">
                  <div
                    className="bg-orange-600 h-full rounded-full"
                    style={{ width: `${stats.negWinRate}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Argument tracker */}
        <div className="panel space-y-4">
          <span className="eyebrow block flex items-center gap-1.5 text-slate-700 font-bold">
            <TrendingUp size={14} className="text-[#2f5d62]" /> Arguments win rate impact
          </span>
          <div className="space-y-3">
            {stats.argumentPerformance.map((arg, idx) => (
              <div key={idx} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                <div>
                  <strong className="text-xs text-slate-800 block">{arg.argument}</strong>
                  <span className="text-[10px] text-slate-400 block">Tested in {arg.totalCount} matches</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden border">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{ width: `${arg.winRate}%` }}
                    ></div>
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-8 text-right">{arg.winRate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail Record view */}
        {selectedRecord ? (
          <div className="panel space-y-5">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">{selectedRecord.matchName}</h3>
                <div className="flex gap-4 text-[10px] text-slate-400 pt-1">
                  <span>Date: {new Date(selectedRecord.timestamp).toLocaleDateString()}</span>
                  <span>Opponent: {selectedRecord.opponentName}</span>
                  <span>Side: {selectedRecord.sides}</span>
                </div>
              </div>
              <button
                    onClick={() => setPendingDelete(selectedRecord)}
                className="command danger-command inline-danger py-1 px-3 text-xs flex items-center gap-1"
              >
                <Trash2 size={13} /> Delete log
              </button>
            </div>

            {/* Outlines flows */}
            <div className="space-y-3">
              <span className="eyebrow block">Speeches note logs</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedRecord.flows.map((flow) => (
                  <div key={flow.speechId} className="bg-slate-50 border border-slate-200 p-3.5 rounded-lg space-y-1">
                    <span className="text-[9px] font-bold text-[#2c504c] bg-[#dfe7e1] border border-[#c5d5c9] px-1.5 py-0.5 rounded uppercase">
                      {flow.speechId}
                    </span>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed pt-2">
                      {flow.notes || "No notes logged for this speech."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="panel text-center text-slate-400 text-xs py-10">
            No round record selected.
          </div>
        )}
      </section>
    </div>
  );
};

export default History;
