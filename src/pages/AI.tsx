import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { db, type DebateDocument, type PracticeSession } from "../services/db";
import { AIService } from "../services/ai";
import { notify } from "../utils/notifications";
import { 
  Bot, 
  User, 
  Play, 
  MessageSquare, 
  Award, 
  Send, 
  ArrowRight,
  Check,
  Edit3,
  X,
  FileText,
  Trophy
} from "lucide-react";
import { 
  Button, 
  Card, 
  TextInput, 
  Text, 
  Stack, 
  Group, 
  Checkbox, 
  SegmentedControl, 
  Paper, 
  Title, 
  Grid,
  ScrollArea,
  Notification,
  Alert,
  ActionIcon,
  NavLink
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AIConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const AI_CONVERSATIONS_KEY = "dialektik.aiConversations";
const AI_ACTIVE_CONVERSATION_KEY = "dialektik.aiActiveConversation";
const defaultAssistantMessage = (): ChatMessage => ({
  role: "assistant",
  content: "Hello! I am your AI debate assistant. Ask me to outline arguments, critique case documents, or write rebuttal points. Tick documents on the right to include them in my context. Mention files inline with @.",
  timestamp: Date.now()
});

const createConversation = (): AIConversation => ({
  id: `chat-${Math.random().toString(36).substring(2, 11)}`,
  title: "New Chat",
  messages: [defaultAssistantMessage()],
  updatedAt: Date.now()
});

export const AI: React.FC = () => {
  const { 
    aiApiKey, 
    aiEndpoint, 
    aiModel,
    setActivePage
  } = useApp();
  const isMobile = useMediaQuery("(max-width: 48em)");

  const [viewMode, setViewMode] = useState<"chat" | "sparring">("chat");

  // --- AI CHAT MODE STATES ---
  const [conversations, setConversations] = useState<AIConversation[]>(() => {
    const stored = localStorage.getItem(AI_CONVERSATIONS_KEY);
    if (!stored) return [createConversation()];
    try {
      const parsed = JSON.parse(stored) as AIConversation[];
      return parsed.length > 0 ? parsed : [createConversation()];
    } catch {
      return [createConversation()];
    }
  });
  const [activeConversationId, setActiveConversationId] = useState(() => localStorage.getItem(AI_ACTIVE_CONVERSATION_KEY) || "");
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [checkedDocs, setCheckedDocs] = useState<Record<string, boolean>>({});
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  
  // Autocomplete state
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestDocs, setSuggestDocs] = useState<DebateDocument[]>([]);

  // --- AI SPARRING MODE STATES ---
  const [topic, setTopic] = useState("");
  const [side, setSide] = useState<"affirmative" | "negative">("affirmative");
  const [isSparringActive, setIsSparringActive] = useState(false);
  const [activeSparSession, setActiveSparSession] = useState<PracticeSession | null>(null);
  const [sparMessages, setSparMessages] = useState<{ role: "user" | "ai"; text: string; timestamp: number }[]>([]);
  const [sparInput, setSparInput] = useState("");
  const [sparBusy, setSparBusy] = useState(false);

  // Common collections
  const [documents, setDocuments] = useState<DebateDocument[]>([]);
  const [pastSparSessions, setPastSparSessions] = useState<PracticeSession[]>([]);
  const activeConversation = conversations.find(conv => conv.id === activeConversationId) || conversations[0];
  const chatMessages = activeConversation?.messages || [];

  useEffect(() => {
    if (!activeConversationId && conversations[0]) {
      setActiveConversationId(conversations[0].id);
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    localStorage.setItem(AI_CONVERSATIONS_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem(AI_ACTIVE_CONVERSATION_KEY, activeConversationId);
    }
  }, [activeConversationId]);

  useEffect(() => {
    loadDocs();
    loadLatestSparSession();
  }, []);

  async function loadDocs() {
    const list = await db.documents.toArray();
    setDocuments(list);
    const checks: Record<string, boolean> = {};
    list.forEach(d => {
      checks[d.id] = true;
    });
    setCheckedDocs(checks);
  }

  async function loadLatestSparSession() {
    const sessions = await db.practice_sessions.toArray();
    if (sessions.length > 0) {
      sessions.sort((a, b) => b.timestamp - a.timestamp);
      setPastSparSessions(sessions.slice(0, 8));
      setActiveSparSession(sessions[0]);
      setSparMessages(sessions[0].transcripts);
      setIsSparringActive(true);
    }
  }

  // --- AUTOCOMPLETE LOGIC ---
  const handleChatInputChange = (val: string) => {
    setChatInput(val);
    const atMatch = val.match(/@([a-zA-Z0-9_\-\s]*)$/);
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      const filtered = documents.filter(d => 
        d.name.toLowerCase().includes(query) || 
        (d.partnerAccess || "private").toLowerCase().includes(query)
      );
      setSuggestDocs(filtered);
      setShowSuggest(filtered.length > 0);
    } else {
      setShowSuggest(false);
    }
  };

  const updateActiveConversationMessages = (nextMessages: ChatMessage[]) => {
    setConversations(prev => prev.map(conv => {
      if (conv.id !== activeConversation.id) return conv;
      const firstUserMessage = nextMessages.find(msg => msg.role === "user")?.content;
      return {
        ...conv,
        title: conv.title === "New Chat" && firstUserMessage ? firstUserMessage.slice(0, 48) : conv.title,
        messages: nextMessages,
        updatedAt: Date.now()
      };
    }));
  };

  const handleNewConversation = () => {
    const next = createConversation();
    setConversations(prev => [next, ...prev]);
    setActiveConversationId(next.id);
    setChatInput("");
    setThinkingText("");
  };

  const startRenameConversation = (conversation: AIConversation) => {
    setRenamingConversationId(conversation.id);
    setRenameDraft(conversation.title);
  };

  const commitRenameConversation = () => {
    if (!renamingConversationId) return;
    const title = renameDraft.trim() || "Untitled Chat";
    setConversations(prev => prev.map(conv => (
      conv.id === renamingConversationId ? { ...conv, title, updatedAt: Date.now() } : conv
    )));
    setRenamingConversationId(null);
    setRenameDraft("");
  };

  const handleSelectAutocomplete = (doc: DebateDocument) => {
    const folder = doc.partnerAccess || "private";
    const titleWithoutExt = doc.name.replace(".md", "");
    const mention = `[[${folder}/${titleWithoutExt}]] `;
    
    const newVal = chatInput.replace(/@([a-zA-Z0-9_\-\s]*)$/, mention);
    setChatInput(newVal);
    setShowSuggest(false);
  };

  // --- AI CHAT ACTIONS ---
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatBusy) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: chatInput,
      timestamp: Date.now()
    };

    const nextMessages = [...chatMessages, userMessage];
    updateActiveConversationMessages(nextMessages);
    setChatInput("");
    setChatBusy(true);
    setThinkingText("Reading selected files and preparing a response...");

    try {
      let aiResponseText = "";
      if (!aiApiKey) {
        notify("Configure your AI API key under Settings first.");
        setChatBusy(false);
        return;
      }

      const contextFiles = documents.filter(d => checkedDocs[d.id]);
      const contextPrompt = contextFiles.map(d => 
        `File Path: [[${d.partnerAccess || "private"}/${d.name.replace(".md", "")}]]\n\`\`\`markdown\n${d.content}\n\`\`\``
      ).join("\n\n");

      const systemPrompt = `You are a debate assistant for NSDA preparation.
Review the debate case prep files and citations. Answer topics constructively.
If you need to edit or propose updates to a file, output your edit block EXACTLY in this format:
[FILE_EDIT:folder/filename]
Updated full contents here...
[FILE_EDIT_END]
Do not output placeholders. Provide complete markdown blocks inside the edit tag.`;

      const ai = new AIService({
        apiKey: aiApiKey,
        endpoint: aiEndpoint,
        model: aiModel
      });

      const combinedPrompt = `Debate Context Prep Files:\n${contextPrompt || "No files cited."}\n\nUser request: ${chatInput}`;
      aiResponseText = await ai.sparringPartner(
        "Chat Consultation",
        "affirmative",
        [
          { role: "user", text: `Context:\n${combinedPrompt}\n\nSystem instructions:\n${systemPrompt}` },
          ...nextMessages.slice(0, -1).map(m => ({ role: m.role === "user" ? "user" : "ai", text: m.content }))
        ]
      );

      updateActiveConversationMessages([...nextMessages, {
        role: "assistant",
        content: aiResponseText,
        timestamp: Date.now()
      }]);
      setThinkingText("Response complete.");

    } catch (err: any) {
      updateActiveConversationMessages([...nextMessages, {
        role: "assistant",
        content: `Consultation request failed: ${err.message}`,
        timestamp: Date.now()
      }]);
      setThinkingText("Request failed.");
    } finally {
      setChatBusy(false);
    }
  };

  const handleApplyFileEdit = async (msgContent: string) => {
    const editRegex = /\[FILE_EDIT:([^\]]+)\]\n([\s\S]*?)\n\[FILE_EDIT_END\]/;
    const match = msgContent.match(editRegex);
    if (!match) return;

    const path = match[1];
    const newContent = match[2];

    const parts = path.split("/");
    const folder = parts[0];
    const name = parts[1].endsWith(".md") ? parts[1] : `${parts[1]}.md`;

    const targetDoc = documents.find(d => (d.partnerAccess || "private") === folder && d.name === name);
    if (targetDoc) {
      await db.documents.update(targetDoc.id, {
        content: newContent,
        lastModified: Date.now()
      });
      notify(`Updated case prep file: ${path}.`);
    } else {
      const newDoc: DebateDocument = {
        id: `doc-${Math.random().toString(36).substring(2, 11)}`,
        name,
        type: "case",
        content: newContent,
        lastModified: Date.now(),
        partnerAccess: folder as any,
        encryptedHash: "write"
      };
      await db.documents.put(newDoc);
      notify(`Created case prep file: ${path}.`);
    }

    loadDocs();
  };

  // --- AI SPARRING ACTIONS ---
  const handleStartSparring = async () => {
    if (!topic.trim()) {
      notify("Enter a debate topic resolution to begin.");
      return;
    }

    setSparBusy(true);
    const newSession: PracticeSession = {
      id: `practice-${Math.random().toString(36).substring(2, 11)}`,
      topic,
      side,
      transcripts: [
        {
          role: "ai",
          text: `Hello! I am your AI sparring partner. We are debating: "${topic}". You are representing the ${side.toUpperCase()} team side. Go ahead and start with your speech. I will counter-flow!`,
          timestamp: Date.now()
        }
      ],
      timestamp: Date.now()
    };

    await db.practice_sessions.put(newSession);
    setPastSparSessions(prev => [newSession, ...prev.filter(item => item.id !== newSession.id)].slice(0, 8));
    setActiveSparSession(newSession);
    setSparMessages(newSession.transcripts);
    setIsSparringActive(true);
    setSparBusy(false);
  };

  const handleSendSparMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sparInput.trim() || sparBusy || !activeSparSession) return;

    const userMsg = {
      role: "user" as const,
      text: sparInput,
      timestamp: Date.now()
    };

    const nextMsgs = [...sparMessages, userMsg];
    setSparMessages(nextMsgs);
    setSparInput("");
    setSparBusy(true);

    try {
      let responseText = "";
      let scorecard = activeSparSession.scorecard;
      if (!aiApiKey) {
        notify("Configure your AI API key under Settings first.");
        setSparBusy(false);
        return;
      }

      const ai = new AIService({
        apiKey: aiApiKey,
        endpoint: aiEndpoint,
        model: aiModel
      });

      responseText = await ai.sparringPartner(
        activeSparSession.topic,
        activeSparSession.side,
        nextMsgs
      );

      const evaluationTranscripts = [...nextMsgs, { role: "ai" as const, text: responseText, timestamp: Date.now() }];
      try {
        scorecard = await ai.evaluateSpeech(
          activeSparSession.topic,
          activeSparSession.side,
          evaluationTranscripts
        );
      } catch (evalErr) {
        console.warn(evalErr);
      }

      const aiMsg = {
        role: "ai" as const,
        text: responseText,
        timestamp: Date.now()
      };

      const finalMsgs = [...nextMsgs, aiMsg];
      setSparMessages(finalMsgs);

      await db.practice_sessions.update(activeSparSession.id, {
        transcripts: finalMsgs,
        scorecard
      });

      setActiveSparSession(prev => prev ? { ...prev, transcripts: finalMsgs, scorecard } : null);

    } catch (err: any) {
      notify(`Sparring failed: ${err.message}`);
    } finally {
      setSparBusy(false);
    }
  };

  const handleResetSparring = () => {
    setIsSparringActive(false);
    setActiveSparSession(null);
    setSparMessages([]);
    setTopic("");
  };

  if (!aiApiKey) {
    return (
      <Card withBorder p="xl" radius="md" style={{ maxWidth: 480, margin: "60px auto", textAlign: "center" }}>
        <Stack gap="md" align="center">
          <Bot size={48} color="var(--mantine-color-gray-6)" />
          <Title order={4}>AI Debate Assistant Locked</Title>
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
            AI sparring, practice resolutions, and constructive outline features require an OpenAI API Key.
            Configure your AI Settings to activate the assistant.
          </Text>
          <Button onClick={() => setActivePage("settings")} color="teal">
            Open API Settings
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="md" style={{ flex: 1, height: "100%", minHeight: 0, overflow: isMobile ? "auto" : "hidden" }}>
      {/* View Switcher Header */}
      <Card withBorder p="sm" radius="md">
        <Group justify="space-between" align="center">
          <Stack gap={0}>
            <Title order={4}>AI Debate Sparring & Consultation</Title>
            <Text size="xs" c="dimmed">Explore cases or debate practice rounds with AI.</Text>
          </Stack>
          <SegmentedControl
            value={viewMode}
            onChange={(val) => setViewMode(val as "chat" | "sparring")}
            data={[
              { label: "AI Chat", value: "chat" },
              { label: "AI Sparring", value: "sparring" }
            ]}
            color="teal"
          />
        </Group>
      </Card>

      {viewMode === "chat" ? (
        /* ------------------ AI CHAT CONSULTATION LAYOUT ------------------ */
        <Grid
          style={{ flex: 1, height: isMobile ? "auto" : "100%", minHeight: 0, overflow: isMobile ? "visible" : "hidden" }}
          styles={{ inner: { height: isMobile ? "auto" : "100%" } }}
          align="stretch"
          gutter="md"
        >
          <Grid.Col span={{ base: 12, md: 3 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 150px)" : "100%", minHeight: 0 }}>
            <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                <Button onClick={handleNewConversation} color="teal" size="xs" fullWidth>
                  New Chat
                </Button>
                <ScrollArea.Autosize mah="100%" style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                  <Stack gap="xs" pr="xs">
                    {conversations.map(conv => (
                      <NavLink
                        key={conv.id}
                        active={conv.id === activeConversation.id}
                        label={
                          renamingConversationId === conv.id ? (
                            <TextInput
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={commitRenameConversation}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRenameConversation();
                                if (e.key === "Escape") {
                                  setRenamingConversationId(null);
                                  setRenameDraft("");
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              size="xs"
                              autoFocus
                            />
                          ) : conv.title
                        }
                        leftSection={<MessageSquare size={14} />}
                        rightSection={
                          <ActionIcon
                            variant="subtle"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              startRenameConversation(conv);
                            }}
                            aria-label="Rename chat"
                          >
                            <Edit3 size={12} />
                          </ActionIcon>
                        }
                        onClick={() => setActiveConversationId(conv.id)}
                        variant="light"
                        color="teal"
                        styles={{
                          root: {
                            borderRadius: "var(--mantine-radius-md)",
                          }
                        }}
                      />
                    ))}
                  </Stack>
                </ScrollArea.Autosize>
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 150px)" : "100%", minHeight: 0 }}>
            <Card withBorder p={0} radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
              <Stack gap="xs" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <ScrollArea style={{ flex: 1, minHeight: 0 }} p="md" type="auto" offsetScrollbars>
                  <Stack gap="md">
                    {chatMessages.map((msg, idx) => {
                      const isSystem = msg.role === "assistant";
                      const hasFileProposal = msg.content.includes("[FILE_EDIT:");

                      return (
                        <Group key={idx} justify={isSystem ? "flex-start" : "flex-end"} align="flex-start" gap="xs">
                          {isSystem && (
                            <Paper withBorder p={4} radius="md" bg="var(--mantine-color-gray-1)">
                              <Bot size={15} />
                            </Paper>
                          )}
                          <Stack gap={4} style={{ maxWidth: "80%" }}>
                            <Paper 
                              withBorder 
                              p="sm" 
                              radius="md" 
                              bg={isSystem ? "var(--mantine-color-gray-0)" : "var(--mantine-color-teal-0)"}
                            >
                              <Text size="xs" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                                {msg.content}
                              </Text>
                            </Paper>

                            {/* Proposals handler */}
                            {hasFileProposal && (
                              <Group gap="xs" mt="xs">
                                <Button 
                                  size="xs" 
                                  color="teal" 
                                  leftSection={<Check size={12} />}
                                  onClick={() => handleApplyFileEdit(msg.content)}
                                >
                                  Accept Proposal
                                </Button>
                                <Button 
                                  size="xs" 
                                  variant="outline" 
                                  color="gray" 
                                  leftSection={<X size={12} />}
                                  onClick={() => notify("Proposal rejected.")}
                                >
                                  Decline
                                </Button>
                              </Group>
                            )}
                          </Stack>
                          {!isSystem && (
                            <Paper withBorder p={4} radius="md" bg="var(--mantine-color-teal-1)">
                              <User size={15} />
                            </Paper>
                          )}
                        </Group>
                      );
                    })}

                    {chatBusy && (
                      <Notification loading title="Thinking" withCloseButton={false} color="teal">
                        {thinkingText}
                      </Notification>
                    )}

                    {!chatBusy && thinkingText && (
                      <Alert color="teal" icon={<Bot size={16} />} title="Response Log">
                        <Text size="xs">{thinkingText}</Text>
                      </Alert>
                    )}
                  </Stack>
                </ScrollArea>

                {/* Composer Form */}
                <form onSubmit={handleSendChatMessage} style={{ borderTop: "1px solid var(--mantine-color-gray-2)", padding: "var(--mantine-spacing-sm)", backgroundColor: "var(--mantine-color-gray-0)", position: "relative" }}>
                  {showSuggest && (
                    <Paper 
                      withBorder 
                      p="xs" 
                      radius="md" 
                      style={{ position: "absolute", bottom: "100%", left: "var(--mantine-spacing-sm)", zIndex: 50, width: 280, maxHeight: 180, overflowY: "auto" }}
                    >
                      <Stack gap="xs">
                        <Text size="xs" fw={700} c="dimmed">Mention prep file...</Text>
                        {suggestDocs.map(d => (
                          <Button
                            key={d.id}
                            variant="subtle"
                            color="gray"
                            size="xs"
                            onClick={() => handleSelectAutocomplete(d)}
                            leftSection={<FileText size={12} />}
                            justify="flex-start"
                            styles={{ inner: { justifyContent: "flex-start" } }}
                          >
                            {d.partnerAccess || "private"}/{d.name.replace(".md", "")}
                          </Button>
                        ))}
                      </Stack>
                    </Paper>
                  )}
                  
                  <Group gap="xs">
                    <TextInput
                      style={{ flex: 1 }}
                      value={chatInput}
                      onChange={(e) => handleChatInputChange(e.target.value)}
                      placeholder="Ask about case contentions... Type @ to autocomplete wiki references."
                      disabled={chatBusy}
                    />
                    <Button type="submit" disabled={chatBusy || !chatInput.trim()} color="teal">
                      <Send size={14} />
                    </Button>
                  </Group>
                </form>
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 3 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 150px)" : "100%", minHeight: 0 }}>
            <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                <Group justify="space-between" align="center">
                  <Text fw={700} size="sm">Cited Files</Text>
                  <FileText size={16} color="var(--mantine-color-gray-6)" />
                </Group>
                <Text size="xs" c="dimmed">AI consults only checked files.</Text>
                
                <ScrollArea.Autosize mah="100%" style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                  <Stack gap="xs" pr="xs">
                    {documents.map(d => (
                      <Checkbox
                        key={d.id}
                        checked={checkedDocs[d.id] || false}
                        label={`${d.partnerAccess || "private"}/${d.name}`}
                        onChange={(e) => setCheckedDocs(prev => ({ ...prev, [d.id]: e.target.checked }))}
                        color="teal"
                      />
                    ))}
                    {documents.length === 0 && (
                      <Text size="xs" c="dimmed" style={{ italic: "true" }}>No case files created yet.</Text>
                    )}
                  </Stack>
                </ScrollArea.Autosize>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      ) : (
        /* ------------------ AI SPARRING MODE LAYOUT ------------------ */
        <Grid
          style={{ flex: 1, height: isMobile ? "auto" : "100%", minHeight: 0, overflow: isMobile ? "visible" : "hidden" }}
          styles={{ inner: { height: isMobile ? "auto" : "100%" } }}
          align="stretch"
          gutter="md"
        >
          <Grid.Col span={{ base: 12, md: 8 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 150px)" : "100%", minHeight: 0 }}>
            <Card withBorder p={0} radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
              {!isSparringActive ? (
                <Stack align="center" justify="center" style={{ flex: 1, padding: "var(--mantine-spacing-xl)" }} gap="md">
                  <Bot size={40} color="var(--mantine-color-teal-6)" />
                  <Stack gap={0} align="center">
                    <Title order={4}>Practice Debate Arena</Title>
                    <Text size="xs" c="dimmed" style={{ lineHeight: 1.5, textAlign: "center", maxWidth: 360 }}>
                      Spar against a world-class AI debater. Practice speech outlines, receive judge feedback and analytics.
                    </Text>
                  </Stack>

                  <Stack gap="sm" style={{ width: "100%", maxWidth: 400 }}>
                    <TextInput
                      label="Debate Topic Resolution"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Resolved: The United States should increase trade tariffs..."
                      required
                    />

                    {pastSparSessions.length > 0 && (
                      <Stack gap="xs">
                        <Text size="xs" fw={700} c="dimmed">Past Topics</Text>
                        <ScrollArea style={{ maxHeight: 110 }} type="auto" offsetScrollbars>
                          <Stack gap="xs">
                            {pastSparSessions.map(session => (
                              <NavLink
                                key={session.id}
                                label={session.topic}
                                leftSection={<Trophy size={12} />}
                                onClick={() => {
                                  setTopic(session.topic);
                                  setSide(session.side);
                                }}
                                styles={{ root: { borderRadius: "var(--mantine-radius-md)" } }}
                              />
                            ))}
                          </Stack>
                        </ScrollArea>
                      </Stack>
                    )}

                    <Group justify="space-between" mt="md">
                      <SegmentedControl
                        value={side}
                        onChange={(val) => setSide(val as any)}
                        data={[
                          { label: "Affirmative", value: "affirmative" },
                          { label: "Negative", value: "negative" }
                        ]}
                        color="teal"
                      />
                      <Button 
                        onClick={handleStartSparring} 
                        disabled={!topic.trim()}
                        color="teal"
                        leftSection={<Play size={14} />}
                      >
                        Spar
                      </Button>
                    </Group>
                  </Stack>
                </Stack>
              ) : (
                <Stack gap="xs" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <Group justify="space-between" p="sm" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", backgroundColor: "var(--mantine-color-gray-0)" }}>
                    <Stack gap={0} style={{ maxWidth: "70%" }}>
                      <Text size="xs" fw={700} c="dimmed">Sparring resolution</Text>
                      <Text size="xs" fw={700} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {activeSparSession?.topic}
                      </Text>
                    </Stack>
                    <Button variant="outline" color="red" size="xs" onClick={handleResetSparring}>
                      Reset Sparring
                    </Button>
                  </Group>

                  <ScrollArea style={{ flex: 1, minHeight: 0 }} p="md" type="auto" offsetScrollbars>
                    <Stack gap="md">
                      {sparMessages.map((msg, idx) => {
                        const isAI = msg.role === "ai";
                        return (
                          <Group key={idx} justify={isAI ? "flex-start" : "flex-end"} align="flex-start" gap="xs">
                            {isAI && (
                              <Paper withBorder p={4} radius="md" bg="var(--mantine-color-gray-1)">
                                <Bot size={15} />
                              </Paper>
                            )}
                            <Paper 
                              withBorder 
                              p="sm" 
                              radius="md" 
                              style={{ maxWidth: "80%" }}
                              bg={isAI ? "var(--mantine-color-gray-0)" : "var(--mantine-color-teal-0)"}
                            >
                              <Text size="xs" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                                {msg.text}
                              </Text>
                            </Paper>
                            {!isAI && (
                              <Paper withBorder p={4} radius="md" bg="var(--mantine-color-teal-1)">
                                <User size={15} />
                              </Paper>
                            )}
                          </Group>
                        );
                      })}
                      {sparBusy && (
                        <Notification loading title="AI Partner" withCloseButton={false} color="teal">
                          AI Partner is counter-arguing...
                        </Notification>
                      )}
                    </Stack>
                  </ScrollArea>

                  <form onSubmit={handleSendSparMessage} style={{ borderTop: "1px solid var(--mantine-color-gray-2)", padding: "var(--mantine-spacing-sm)", backgroundColor: "var(--mantine-color-gray-0)" }}>
                    <Group gap="xs">
                      <TextInput
                        style={{ flex: 1 }}
                        value={sparInput}
                        onChange={(e) => setSparInput(e.target.value)}
                        placeholder="Enter your debate constructive speech, counter-points or rebuttal..."
                        disabled={sparBusy}
                      />
                      <Button type="submit" disabled={sparBusy || !sparInput.trim()} color="teal">
                        <Send size={14} />
                      </Button>
                    </Group>
                  </form>
                </Stack>
              )}
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 4 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 150px)" : "100%", minHeight: 0 }}>
            <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
                <Group justify="space-between" align="center">
                  <Text fw={700} size="sm">Judge Scorecard</Text>
                  <Award size={17} color="var(--mantine-color-teal-6)" />
                </Group>
                
                {activeSparSession?.scorecard ? (
                  <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                    <Stack gap="md">
                      <Card withBorder p="md" radius="md" bg="var(--mantine-color-gray-0)" style={{ textAlign: "center" }}>
                        <Text size="xs" fw={700} c="dimmed">Performance score</Text>
                        <Text size="xl" fw={900} c="teal">
                          {activeSparSession.scorecard.score}<span style={{ fontSize: "11px", color: "var(--mantine-color-gray-5)" }}>/100</span>
                        </Text>
                      </Card>

                      <Stack gap="xs">
                        <Text size="xs" fw={700} c="teal">Strengths</Text>
                        <Stack gap={4}>
                          {activeSparSession.scorecard.strengths.map((str, i) => (
                            <Group key={i} gap="xs" align="flex-start" wrap="nowrap">
                              <Text size="xs" c="dimmed">•</Text>
                              <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>{str}</Text>
                            </Group>
                          ))}
                        </Stack>
                      </Stack>

                      <Stack gap="xs">
                        <Text size="xs" fw={700} c="red">Weaknesses</Text>
                        <Stack gap={4}>
                          {activeSparSession.scorecard.weaknesses.map((weak, i) => (
                            <Group key={i} gap="xs" align="flex-start" wrap="nowrap">
                              <Text size="xs" c="dimmed">•</Text>
                              <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>{weak}</Text>
                            </Group>
                          ))}
                        </Stack>
                      </Stack>

                      <Stack gap="xs">
                        <Text size="xs" fw={700} c="teal">Recommendations</Text>
                        <Stack gap={4}>
                          {activeSparSession.scorecard.suggestions.map((sug, i) => (
                            <Group key={i} gap="xs" align="flex-start" wrap="nowrap">
                              <ArrowRight size={12} color="var(--mantine-color-teal-6)" style={{ marginTop: 2, flexShrink: 0 }} />
                              <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>{sug}</Text>
                            </Group>
                          ))}
                        </Stack>
                      </Stack>
                    </Stack>
                  </ScrollArea>
                ) : (
                  <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs">
                    <Trophy size={24} color="var(--mantine-color-gray-3)" />
                    <Text size="xs" c="dimmed" style={{ textAlign: "center" }}>
                      Scorecard metrics will render after the first exchange.
                    </Text>
                  </Stack>
                )}
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
};

export default AI;
