import { AppProvider, useApp } from "./context/AppContext";
import { Documents } from "./pages/Documents";
import { InRound } from "./pages/InRound";
import { History } from "./pages/History";
import { AI } from "./pages/AI";
import { Settings } from "./pages/Settings";
import { 
  AppShell, 
  Group, 
  Stack, 
  Text, 
  Paper, 
  NavLink, 
  ThemeIcon 
} from "@mantine/core";
import { 
  FileText, 
  Radio, 
  Bot,
  History as HistoryIcon, 
  Settings as SettingsIcon,
  Wifi,
  WifiOff
} from "lucide-react";

function AppContent() {
  const { 
    activePage, 
    setActivePage, 
    isPeerConnected, 
    userName
  } = useApp();

  const navItems = [
    { id: "inround", label: "In-Round", icon: Radio },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "ai", label: "AI Coach", icon: Bot },
    { id: "history", label: "History", icon: HistoryIcon },
    { id: "settings", label: "Settings", icon: SettingsIcon }
  ];

  return (
    <AppShell
      navbar={{
        width: 248,
        breakpoint: "sm",
      }}
      padding="md"
    >
      <AppShell.Navbar p="md">
        <Stack justify="space-between" h="100%">
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon variant="filled" size="lg" radius="md" color="teal">
                Δ
              </ThemeIcon>
              <Stack gap={0}>
                <Text size="sm" fw={700}>Dialektik</Text>
                <Text size="xs" c="dimmed">{userName || "No user set"}</Text>
              </Stack>
            </Group>

            <Stack gap="xs">
              {navItems.map((item) => {
                const Icon = item.icon;
                const selected = activePage === item.id;

                return (
                  <NavLink
                    key={item.id}
                    active={selected}
                    label={item.label}
                    leftSection={<Icon size={16} />}
                    onClick={() => setActivePage(item.id)}
                    variant="light"
                    color="teal"
                    styles={{
                      root: {
                        borderRadius: "var(--mantine-radius-md)",
                      }
                    }}
                  />
                );
              })}
            </Stack>
          </Stack>

          <Paper withBorder p="sm" radius="md" bg="var(--mantine-color-gray-0)">
            <Stack gap="xs">
              <Group gap="xs">
                {isPeerConnected ? (
                  <Wifi size={16} color="var(--mantine-color-teal-6)" />
                ) : (
                  <WifiOff size={16} color="var(--mantine-color-gray-5)" />
                )}
                <Text size="xs" fw={700}>Peer Sync</Text>
              </Group>
              <Text size="xs" c="dimmed">
                {isPeerConnected ? "P2P link active" : "Offline until a room connects"}
              </Text>
              <Text size="xs" c="dimmed">
                Recovery through peers in active rooms
              </Text>
            </Stack>
          </Paper>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main style={{ overflowY: "auto", height: "100vh" }}>
        {activePage === "inround" && <InRound />}
        {activePage === "documents" && <Documents />}
        {activePage === "ai" && <AI />}
        {activePage === "history" && <History />}
        {activePage === "settings" && <Settings />}
      </AppShell.Main>
    </AppShell>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
