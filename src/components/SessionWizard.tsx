import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { ArrowLeft, Play, UserPlus, Users } from "lucide-react";
import { notify } from "../utils/notifications";
import { 
  Button, 
  TextInput, 
  Text, 
  Stack, 
  Group, 
  Modal, 
  Loader,
  Paper,
  ActionIcon,
  UnstyledButton,
  ThemeIcon
} from "@mantine/core";

interface SessionWizardProps {
  onClose: () => void;
}

export const SessionWizard: React.FC<SessionWizardProps> = ({ onClose }) => {
  const { isPeerConnected, hostSession, joinSession } = useApp();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<"host" | "client" | null>(null);
  const [matchName, setMatchName] = useState("");
  const [opponent, setOpponent] = useState("");
  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isPeerConnected) onClose();
  }, [isPeerConnected, onClose]);

  const title =
    step === 1
      ? "Start Debate Session"
      : step === 2 && role === "host"
        ? "Configure Match"
        : step === 2
          ? "Enter Room Code"
          : role === "host"
            ? "Share Room Code"
            : "Establishing Link";

  const handleSelectRole = (selectedRole: "host" | "client") => {
    setRole(selectedRole);
    setStep(2);
  };

  const handleBack = () => {
    if (step === 2) {
      setRole(null);
      setStep(1);
    } else if (step === 3) {
      setStep(2);
    }
  };

  const handleHostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchName.trim()) return;

    setIsLoading(true);
    const randomCode = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedCode(randomCode);

    try {
      await hostSession(randomCode, matchName, opponent);
      setStep(3);
    } catch (err) {
      console.error(err);
      notify("Failed to initialize host room. Check network.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 4) return;

    setIsLoading(true);
    try {
      await joinSession(code);
      setStep(3);
    } catch (err) {
      console.error(err);
      notify("Failed to join room. Verify the code and ensure the host is online.");
      setIsLoading(false);
    }
  };

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={
        <Group gap="xs" wrap="nowrap">
          {step > 1 && (
            <ActionIcon variant="subtle" color="teal" onClick={handleBack}>
              <ArrowLeft size={16} />
            </ActionIcon>
          )}
          <Stack gap={0}>
            <Text fw={700} size="sm">{title}</Text>
            <Text size="xs" c="dimmed">
              {role === "client" ? "Join a live room from a host code." : "Create a synced debate room."}
            </Text>
          </Stack>
        </Group>
      }
      centered
      size="lg"
    >
      <Stack gap="md" mt="md">
        {step === 1 && (
          <Group grow gap="md">
            <UnstyledButton onClick={() => handleSelectRole("host")}>
              <Paper withBorder p="xl" radius="md" style={{ textAlign: "center" }} bg="var(--mantine-color-gray-0)">
                <Stack align="center" gap="sm">
                  <ThemeIcon variant="light" size="xl" radius="xl" color="teal">
                    <Users size={24} />
                  </ThemeIcon>
                  <Text fw={700} size="sm">Host a Match</Text>
                  <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
                    Manage the room, timers, debaters, and handout release.
                  </Text>
                </Stack>
              </Paper>
            </UnstyledButton>

            <UnstyledButton onClick={() => handleSelectRole("client")}>
              <Paper withBorder p="xl" radius="md" style={{ textAlign: "center" }} bg="var(--mantine-color-gray-0)">
                <Stack align="center" gap="sm">
                  <ThemeIcon variant="light" size="xl" radius="xl" color="teal">
                    <UserPlus size={24} />
                  </ThemeIcon>
                  <Text fw={700} size="sm">Join a Match</Text>
                  <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
                    Connect with a code from the host and sync shared materials.
                  </Text>
                </Stack>
              </Paper>
            </UnstyledButton>
          </Group>
        )}

        {step === 2 && role === "host" && (
          <form onSubmit={handleHostSubmit}>
            <Stack gap="md">
              <TextInput
                label="Tournament or match name"
                id="match-name"
                required
                value={matchName}
                onChange={(e) => setMatchName(e.target.value)}
                placeholder="e.g. NSDA Finals Round 3"
              />
              <TextInput
                label="Opponent team or debater code"
                id="opponent"
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="e.g. Lincoln High School AB"
              />
              <Button type="submit" loading={isLoading} leftSection={<Play size={16} />} color="teal" fullWidth>
                Generate Room & Start Hosting
              </Button>
            </Stack>
          </form>
        )}

        {step === 2 && role === "client" && (
          <form onSubmit={handleClientSubmit}>
            <Stack gap="md" align="center">
              <Text size="xs" c="dimmed" style={{ textAlign: "center" }}>
                Ask the host for the generated 4-digit pairing code.
              </Text>
              <TextInput
                label="Room code"
                id="room-code"
                required
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="1234"
                styles={{
                  input: {
                    textAlign: "center",
                    fontFamily: "monospace",
                    fontSize: "20px",
                    fontWeight: 700,
                    letterSpacing: "4px",
                    width: "160px",
                    margin: "0 auto"
                  }
                }}
              />
              <Button 
                type="submit" 
                loading={isLoading} 
                disabled={code.length !== 4} 
                leftSection={<Play size={16} />} 
                color="teal" 
                fullWidth
              >
                Connect to Room
              </Button>
            </Stack>
          </form>
        )}

        {step === 3 && role === "host" && (
          <Stack align="center" gap="md" py="xl">
            <Text size="xs" fw={700} c="dimmed">Room pairing code</Text>
            <Text size="xl" fw={900} c="teal" style={{ fontSize: "48px", fontFamily: "monospace", letterSpacing: "8px" }}>
              {generatedCode}
            </Text>
            <Group gap="xs">
              <Loader size="xs" color="teal" />
              <Text size="xs" c="dimmed">Waiting for partner to join</Text>
            </Group>
          </Stack>
        )}

        {step === 3 && role === "client" && (
          <Stack align="center" gap="md" py="xl">
            <Loader size="lg" color="teal" />
            <Stack gap={2} align="center">
              <Text size="sm" fw={700}>Connecting to host room</Text>
              <Text size="xs" c="dimmed">Syncing flow outlines and version handshakes.</Text>
            </Stack>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
};

export default SessionWizard;
