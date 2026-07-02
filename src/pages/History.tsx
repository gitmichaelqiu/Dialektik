import React, { useEffect, useState } from "react";
import { db, type TournamentRecord } from "../services/db";
import { BarChart2, Calendar, Search, Trash2, Trophy } from "lucide-react";
import { 
  Button, 
  Card, 
  TextInput, 
  Text, 
  Title, 
  Stack, 
  Group, 
  Modal, 
  Badge, 
  Progress, 
  Grid, 
  SimpleGrid,
  NavLink
} from "@mantine/core";

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
    <Stack gap="md" style={{ height: "calc(100vh - 40px)" }}>
      <Modal 
        opened={!!pendingDelete} 
        onClose={() => setPendingDelete(null)} 
        title={<Text fw={700}>Delete Round?</Text>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            {pendingDelete?.matchName} will be removed from local history.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDeleteRecord}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Grid style={{ height: "100%", minHeight: 0 }} align="stretch" gutter="md">
        <Grid.Col span={4} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Card withBorder p="md" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
              <Group justify="space-between">
                <Stack gap={0}>
                  <Text fw={700} size="sm">Round History</Text>
                  <Text size="xs" c="dimmed">Local saved debate rounds</Text>
                </Stack>
                <Trophy size={18} color="var(--mantine-color-gray-6)" />
              </Group>

              <TextInput
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search matches..."
              />

              <Stack gap="xs" style={{ flex: 1, overflowY: "auto" }}>
                {filteredRecords.map((record) => (
                  <NavLink
                    key={record.id}
                    active={selectedRecord?.id === record.id}
                    label={record.matchName}
                    description={`Vs. ${record.opponentName} • ${new Date(record.timestamp).toLocaleDateString()}`}
                    leftSection={<Calendar size={14} />}
                    rightSection={
                      <Badge color={record.winLoss === "win" ? "teal" : "red"}>
                        {record.winLoss}
                      </Badge>
                    }
                    onClick={() => setSelectedRecord(record)}
                    variant="light"
                    color="teal"
                    styles={{
                      root: {
                        borderRadius: "var(--mantine-radius-md)",
                      }
                    }}
                  />
                ))}

                {filteredRecords.length === 0 && (
                  <Stack align="center" justify="center" style={{ flex: 1, py: "xl" }} gap="xs">
                    <Trophy size={32} color="var(--mantine-color-gray-4)" />
                    <Text fw={700} size="xs" c="dimmed">No rounds found</Text>
                    <Text size="xs" c="dimmed" ta="center">
                      Saved rounds will appear here after you end an in-round session.
                    </Text>
                  </Stack>
                )}
              </Stack>
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={8} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Stack gap="md" style={{ flex: 1, overflowY: "auto" }}>
            <Card withBorder p="md" radius="md">
              <Group justify="space-between" align="center">
                <Stack gap="xs">
                  <Text size="xs" fw={800} c="dimmed" style={{ textTransform: "uppercase" }}>
                    Win Performance
                  </Text>
                  <Text size="xl" fw={900} c="teal">
                    {stats.winRate}%
                  </Text>
                  <Text size="xs" c="dimmed">
                    {records.filter((record) => record.winLoss === "win").length} Wins / {stats.totalRounds} Matches
                  </Text>
                </Stack>

                <Stack gap="xs" style={{ width: "60%" }}>
                  <Group justify="space-between">
                    <Text size="xs" fw={700} c="dimmed" style={{ textTransform: "uppercase" }}>
                      Win-rate by side
                    </Text>
                    <BarChart2 size={14} color="var(--mantine-color-gray-6)" />
                  </Group>

                  <Stack gap="xs">
                    <Stack gap={2}>
                      <Group justify="space-between">
                        <Text size="xs" fw={700}>Affirmative</Text>
                        <Text size="xs" fw={700}>{stats.affWinRate}%</Text>
                      </Group>
                      <Progress value={stats.affWinRate} color="teal" size="sm" radius="xl" />
                    </Stack>

                    <Stack gap={2}>
                      <Group justify="space-between">
                        <Text size="xs" fw={700}>Negative</Text>
                        <Text size="xs" fw={700}>{stats.negWinRate}%</Text>
                      </Group>
                      <Progress value={stats.negWinRate} color="orange" size="sm" radius="xl" />
                    </Stack>
                  </Stack>
                </Stack>
              </Group>
            </Card>

            {selectedRecord ? (
              <Card withBorder p="md" radius="md">
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", paddingBottom: "var(--mantine-spacing-sm)" }}>
                    <Stack gap="xs">
                      <Title order={4}>{selectedRecord.matchName}</Title>
                      <Group gap="md">
                        <Text size="xs" c="dimmed">Date: {new Date(selectedRecord.timestamp).toLocaleDateString()}</Text>
                        <Text size="xs" c="dimmed">Opponent: {selectedRecord.opponentName}</Text>
                        <Text size="xs" c="dimmed">Side: {selectedRecord.sides}</Text>
                      </Group>
                    </Stack>
                    <Button
                      variant="outline"
                      color="red"
                      size="xs"
                      onClick={() => setPendingDelete(selectedRecord)}
                      leftSection={<Trash2 size={13} />}
                    >
                      Delete log
                    </Button>
                  </Group>

                  <Stack gap="xs">
                    <Text size="xs" fw={800} c="dimmed" style={{ textTransform: "uppercase" }}>
                      Speech Note Logs
                    </Text>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                      {selectedRecord.flows.map((flow) => (
                        <Card key={flow.speechId} withBorder p="md" radius="md" bg="var(--mantine-color-gray-0)">
                          <Stack gap="xs">
                            <Badge color="teal" variant="light" size="xs">
                              {flow.speechId}
                            </Badge>
                            <Text size="xs" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                              {flow.notes || "No notes logged for this speech."}
                            </Text>
                          </Stack>
                        </Card>
                      ))}
                    </SimpleGrid>
                  </Stack>
                </Stack>
              </Card>
            ) : (
              <Card withBorder p="md" radius="md" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Stack align="center" gap="xs">
                  <Trophy size={36} color="var(--mantine-color-gray-4)" />
                  <Text fw={700} size="sm">No round selected</Text>
                  <Text size="xs" c="dimmed">
                    Select a saved round to review speech notes and outcomes.
                  </Text>
                </Stack>
              </Card>
            )}
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
};

export default History;
