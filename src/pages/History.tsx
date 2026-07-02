import React, { useEffect, useState } from "react";
import { db, type TournamentRecord } from "../services/db";
import { BarChart2, Calendar, Search, Trash2, Trophy } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export const History: React.FC = () => {
  const [records, setRecords] = useState<TournamentRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<TournamentRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TournamentRecord | null>(null);
  const [stats, setStats] = useState({
    totalRounds: 0,
    winRate: 0,
    affWinRate: 0,
    negWinRate: 0
  });

  useEffect(() => {
    loadRecords();
  }, []);

  async function loadRecords() {
    const allRecords = await db.history.toArray();
    allRecords.sort((a, b) => b.timestamp - a.timestamp);
    setRecords(allRecords);
    calculateStats(allRecords);
    setSelectedRecord(allRecords[0] || null);
  }

  const calculateStats = (data: TournamentRecord[]) => {
    const total = data.length;
    if (total === 0) {
      setStats({ totalRounds: 0, winRate: 0, affWinRate: 0, negWinRate: 0 });
      return;
    }

    const wins = data.filter((r) => r.winLoss === "win").length;
    const affs = data.filter((r) => r.sides === "affirmative");
    const negs = data.filter((r) => r.sides === "negative");

    setStats({
      totalRounds: total,
      winRate: Math.round((wins / total) * 100),
      affWinRate: affs.length > 0 ? Math.round((affs.filter((r) => r.winLoss === "win").length / affs.length) * 100) : 0,
      negWinRate: negs.length > 0 ? Math.round((negs.filter((r) => r.winLoss === "win").length / negs.length) * 100) : 0
    });
  };

  const confirmDeleteRecord = async () => {
    if (!pendingDelete) return;
    await db.history.delete(pendingDelete.id);
    setSelectedRecord(null);
    setPendingDelete(null);
    await loadRecords();
  };

  const filteredRecords = records.filter((record) =>
    record.matchName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    record.opponentName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="documents-layout">
      {pendingDelete && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-history-title">
          <div className="confirm-dialog">
            <h2 id="delete-history-title">Delete Round?</h2>
            <p>{pendingDelete.matchName} will be removed from local history.</p>
            <div className="confirm-actions">
              <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={confirmDeleteRecord}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      <aside className="file-rail flex flex-col justify-between overflow-y-auto">
        <div className="space-y-4">
          <div className="panel-header compact border-b border-border pb-3">
            <div>
              <h2>Round History</h2>
              <p className="text-sm text-muted-foreground">Local saved debate rounds</p>
            </div>
            <Trophy size={18} className="text-muted-foreground" />
          </div>

          <div className="relative border-b border-border pb-3">
            <Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search matches..."
              className="pl-9"
            />
          </div>

          <div className="space-y-2">
            {filteredRecords.map((record) => (
              <button
                type="button"
                key={record.id}
                onClick={() => setSelectedRecord(record)}
                className={`file-item text-left p-3 ${selectedRecord?.id === record.id ? "selected" : ""}`}
              >
                <div className="flex w-full flex-col">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> {new Date(record.timestamp).toLocaleDateString()}
                    </span>
                    <Badge variant={record.winLoss === "win" ? "default" : "destructive"}>{record.winLoss}</Badge>
                  </div>
                  <strong className="mt-2 block truncate text-sm text-foreground">{record.matchName}</strong>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">Vs. {record.opponentName}</span>
                </div>
              </button>
            ))}

            {filteredRecords.length === 0 && (
              <div className="empty-state min-h-72">
                <Trophy size={34} />
                <div>
                  <h2>No rounds found</h2>
                  <p className="text-sm text-muted-foreground">Saved rounds will appear here after you end an in-round session.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="flex flex-grow flex-col gap-6 overflow-y-auto">
        <div className="history-grid">
          <div className="metric-card">
            <span className="eyebrow block">Win Performance</span>
            <div className="text-3xl font-extrabold text-primary">{stats.winRate}%</div>
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {records.filter((record) => record.winLoss === "win").length} Wins / {stats.totalRounds} Matches
            </span>
          </div>

          <div className="metric-card col-span-2">
            <span className="eyebrow block flex items-center gap-1">
              <BarChart2 size={13} /> Win-rate by side
            </span>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-foreground">
                  <span>Affirmative</span>
                  <span>{stats.affWinRate}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${stats.affWinRate}%` }} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-foreground">
                  <span>Negative</span>
                  <span>{stats.negWinRate}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-muted">
                  <div className="h-full rounded-full bg-amber-700" style={{ width: `${stats.negWinRate}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {selectedRecord ? (
          <div className="panel space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">{selectedRecord.matchName}</h3>
                <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
                  <span>Date: {new Date(selectedRecord.timestamp).toLocaleDateString()}</span>
                  <span>Opponent: {selectedRecord.opponentName}</span>
                  <span>Side: {selectedRecord.sides}</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPendingDelete(selectedRecord)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={13} /> Delete log
              </Button>
            </div>

            <div className="space-y-3">
              <span className="eyebrow block">Speech note logs</span>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {selectedRecord.flows.map((flow) => (
                  <div key={flow.speechId} className="space-y-2 rounded-2xl border border-border bg-muted/50 p-4">
                    <Badge variant="secondary">{flow.speechId}</Badge>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {flow.notes || "No notes logged for this speech."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <Trophy size={38} />
            <div>
              <h2>No round selected</h2>
              <p className="text-sm text-muted-foreground">Select a saved round to review speech notes and outcomes.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default History;
