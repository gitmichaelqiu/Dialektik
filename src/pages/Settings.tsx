import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { Bot, Lock, Radio, RotateCcw, Save, Users } from "lucide-react";
import db from "../services/db";
import { 
  Button, 
  Card, 
  TextInput, 
  PasswordInput, 
  Text, 
  Stack, 
  Group, 
  Modal, 
} from "@mantine/core";

export const Settings: React.FC = () => {
  const {
    userName,
    aiApiKey,
    aiEndpoint,
    aiModel,
    saveSettings
  } = useApp();

  const [nameInput, setNameInput] = useState(userName);
  const [aiKeyInput, setAiKeyInput] = useState(aiApiKey);
  const [aiEndInput, setAiEndInput] = useState(aiEndpoint);
  const [aiModelInput, setAiModelInput] = useState(aiModel);
  const [profileSaved, setProfileSaved] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => setNameInput(userName), [userName]);
  useEffect(() => setAiKeyInput(aiApiKey), [aiApiKey]);
  useEffect(() => setAiEndInput(aiEndpoint), [aiEndpoint]);
  useEffect(() => setAiModelInput(aiModel), [aiModel]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({ userName: nameInput });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 1600);
  };

  const handleAISubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({
      aiApiKey: aiKeyInput,
      aiEndpoint: aiEndInput,
      aiModel: aiModelInput
    });
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 1600);
  };

  const resetLocalWorkspace = async () => {
    await db.settings.clear();
    await db.documents.clear();
    await db.cards.clear();
    await db.history.clear();
    await db.practice_sessions.clear();
    localStorage.clear();
    window.location.reload();
  };

  return (
    <Stack gap="md">
      <Modal 
        opened={resetConfirmOpen} 
        onClose={() => setResetConfirmOpen(false)} 
        title={<Text fw={700}>Reset Workspace?</Text>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            All local settings, documents, evidence cards, history, and active room data will be removed.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={resetLocalWorkspace}>
              Reset
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Group align="flex-start" grow gap="md">
        <Stack gap="md">
          <Card withBorder radius="md" p="md">
            <Card.Section inheritPadding py="xs" withBorder>
              <Group justify="space-between">
                <Stack gap={0}>
                  <Text fw={700} size="sm">User Profile</Text>
                  <Text size="xs" c="dimmed">Your display name for room pairing and shared rounds.</Text>
                </Stack>
                <Users size={18} color="var(--mantine-color-gray-6)" />
              </Group>
            </Card.Section>
            
            <form onSubmit={handleProfileSubmit}>
              <Stack gap="md" mt="md">
                <TextInput
                  label="User name"
                  id="user-name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Enter your name"
                  required
                />
                <Button type="submit" leftSection={<Save size={16} />} color="teal" fullWidth>
                  {profileSaved ? "Saved" : "Save Profile"}
                </Button>
              </Stack>
            </form>
          </Card>

          <Card withBorder radius="md" p="md">
            <Card.Section inheritPadding py="xs" withBorder>
              <Group justify="space-between">
                <Stack gap={0}>
                  <Text fw={700} size="sm">Peer Sync Policy</Text>
                  <Text size="xs" c="dimmed">How this workspace recovers shared room data.</Text>
                </Stack>
                <Radio size={18} color="var(--mantine-color-gray-6)" />
              </Group>
            </Card.Section>
            <Text size="xs" c="dimmed" mt="md" style={{ lineHeight: 1.5 }}>
              GitHub sync, local client encryption setup, and absent-partner fallback are disabled for now. Shared files recover through connected peers in active rooms.
            </Text>
          </Card>
        </Stack>

        <Stack gap="md">
          <Card withBorder radius="md" p="md">
            <Card.Section inheritPadding py="xs" withBorder>
              <Group justify="space-between">
                <Stack gap={0}>
                  <Text fw={700} size="sm">AI Configuration</Text>
                  <Text size="xs" c="dimmed">Connect the debate assistant to your preferred OpenAI-compatible endpoint.</Text>
                </Stack>
                <Bot size={18} color="var(--mantine-color-gray-6)" />
              </Group>
            </Card.Section>

            <form onSubmit={handleAISubmit}>
              <Stack gap="md" mt="md">
                <TextInput
                  label="API base URL"
                  id="ai-endpoint"
                  value={aiEndInput}
                  onChange={(e) => setAiEndInput(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
                <TextInput
                  label="Model name"
                  id="ai-model"
                  value={aiModelInput}
                  onChange={(e) => setAiModelInput(e.target.value)}
                  placeholder="gpt-4o"
                />
                <PasswordInput
                  label="API key"
                  id="ai-key"
                  value={aiKeyInput}
                  onChange={(e) => setAiKeyInput(e.target.value)}
                  placeholder="sk-..."
                />
                <Button type="submit" leftSection={<Save size={16} />} color="teal" fullWidth>
                  {aiSaved ? "Saved" : "Save AI Settings"}
                </Button>
              </Stack>
            </form>
          </Card>

          <Card withBorder radius="md" p="md">
            <Card.Section inheritPadding py="xs" withBorder>
              <Group justify="space-between">
                <Stack gap={0}>
                  <Text fw={700} size="sm">Destructive Options</Text>
                  <Text size="xs" c="dimmed">Reset local data only when you want a clean workspace.</Text>
                </Stack>
                <Lock size={18} color="var(--mantine-color-gray-6)" />
              </Group>
            </Card.Section>
            <Button
              type="button"
              color="red"
              mt="md"
              onClick={() => setResetConfirmOpen(true)}
              leftSection={<RotateCcw size={16} />}
              fullWidth
            >
              Reset Local Workspace
            </Button>
          </Card>
        </Stack>
      </Group>
    </Stack>
  );
};

export default Settings;
