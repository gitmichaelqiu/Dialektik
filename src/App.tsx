import { AppProvider, useApp } from "./context/AppContext";
import { Documents } from "./pages/Documents";
import { InRound } from "./pages/InRound";
import { History } from "./pages/History";
import { AI } from "./pages/AI";
import { Settings } from "./pages/Settings";
import { 
  AppShell, 
  Burger,
  Group, 
  Stack, 
  Text, 
  Paper, 
  NavLink, 
  ThemeIcon 
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
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
  const [opened, { toggle, close }] = useDisclosure(false);

  const navItems = [
    { id: "inround", label: "In-Round", icon: Radio },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "ai", label: "AI Coach", icon: Bot },
    { id: "history", label: "History", icon: HistoryIcon },
    { id: "settings", label: "Settings", icon: SettingsIcon }
  ];

  return (
    <AppShell
      header={{ height: { base: 56, sm: 0 } }}
      navbar={{
        width: 248,
        breakpoint: "sm",
        collapsed: { mobile: !opened }
      }}
      padding="md"
    >
      <AppShell.Header hiddenFrom="sm">
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
            <ThemeIcon variant="filled" size="md" radius="md" color="teal">
              Δ
            </ThemeIcon>
            <Stack gap={0}>
              <Text size="sm" fw={700}>Dialektik</Text>
              <Text size="xs" c="dimmed" visibleFrom="xs">{userName || "No user set"}</Text>
            </Stack>
          </Group>

          <Group gap="xs">
            {isPeerConnected ? (
              <Wifi size={16} color="var(--mantine-color-teal-6)" />
            ) : (
              <WifiOff size={16} color="var(--mantine-color-gray-5)" />
            )}
            <Text size="xs" c="dimmed" visibleFrom="xs">
              {isPeerConnected ? "Peer sync active" : "Peer sync offline"}
            </Text>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack justify="space-between" h="100%">
          <Stack gap="md">
            <Group gap="sm" visibleFrom="sm">
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
                    onClick={() => {
                      setActivePage(item.id);
                      close();
                    }}
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

          <Paper withBorder p="sm" radius="md" bg="var(--mantine-color-gray-0)" visibleFrom="sm">
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

      <AppShell.Main style={{ height: "calc(100dvh - var(--app-shell-header-height, 0px))", overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
