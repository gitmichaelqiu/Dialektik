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
  X,
  FileText,
  UserRound,
  Trophy
} from "lucide-react";

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

  // Tab View Mode: Chat vs Sparring
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
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const [thinkingText, setThinkingText] = useState("");
  const [checkedDocs, setCheckedDocs] = useState<Record<string, boolean>>({});
  
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
    // Auto-check all documents by default
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

    // Look for "@" symbol at the end of the text
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
        title: firstUserMessage ? firstUserMessage.slice(0, 48) : conv.title,
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
    setThinkingOpen(true);
    notify("New conversation started.");
  };

  const handleSelectAutocomplete = (doc: DebateDocument) => {
    // Replace "@query" with "[[folder/title]]"
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
    setThinkingOpen(true);
    setThinkingText("Reading selected files and preparing a response...");

    try {
      let aiResponseText = "";
      if (!aiApiKey) {
        notify("Configure your AI API key under Settings first.");
        setChatBusy(false);
        return;
      }

      // Collect checked files contents as context
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

      // Combine system, history, and context prompt
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
      setThinkingOpen(false);

    } catch (err: any) {
      updateActiveConversationMessages([...nextMessages, {
        role: "assistant",
        content: `Consultation request failed: ${err.message}`,
        timestamp: Date.now()
      }]);
      setThinkingText("Request failed.");
      setThinkingOpen(false);
    } finally {
      setChatBusy(false);
    }
  };

  // Human-in-the-loop: Parse and apply proposed file updates
  const handleApplyFileEdit = async (msgContent: string) => {
    const editRegex = /\[FILE_EDIT:([^\]]+)\]\n([\s\S]*?)\n\[FILE_EDIT_END\]/;
    const match = msgContent.match(editRegex);
    if (!match) return;

    const path = match[1];
    const newContent = match[2];

    const parts = path.split("/");
    const folder = parts[0];
    const name = parts[1].endsWith(".md") ? parts[1] : `${parts[1]}.md`;

    // Look up existing file or create one
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

      // 1. Get debate response
      responseText = await ai.sparringPartner(
        activeSparSession.topic,
        activeSparSession.side,
        nextMsgs
      );

      // 2. Run judge evaluation
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
      <div className="flex-grow flex flex-col items-center justify-center p-8 text-center space-y-6 bg-white border border-slate-300 rounded-xl shadow-xs max-w-lg mx-auto my-12 h-[350px]">
        <Bot size={48} className="text-slate-300" />
        <div className="space-y-2">
          <h2 className="text-base font-bold text-slate-800">AI Debate Assistant Locked</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            AI sparring, practice resolutions, and constructive outline features require an OpenAI API Key.
            Configure your AI Settings to activate the assistant.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActivePage("settings")}
          className="command primary text-xs py-2 px-5 font-bold rounded-xl"
        >
          Open API Settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] overflow-hidden space-y-4">
      {/* Top navigation controls mode */}
      <div className="flex items-center justify-between border-b pb-2 shrink-0 bg-white p-4 rounded-lg border border-slate-300 shadow-2xs">
        <div>
          <h2 className="text-sm font-bold text-slate-800">AI debate Sparring & consultation</h2>
          <span className="text-[10px] text-slate-400 block mt-0.5">Explore cases or debate practice rounds with AI.</span>
        </div>
        <div className="segmented">
          <button 
            type="button"
            className={viewMode === "chat" ? "selected" : ""} 
            onClick={() => setViewMode("chat")}
          >
            <MessageSquare size={13} className="inline mr-1" /> AI Chat
          </button>
          <button 
            type="button"
            className={viewMode === "sparring" ? "selected" : ""} 
            onClick={() => setViewMode("sparring")}
          >
            <UserRound size={13} className="inline mr-1" /> AI Sparring
          </button>
        </div>
      </div>

      {viewMode === "chat" ? (
        /* ------------------ AI CHAT CONSULTATION LAYOUT ------------------ */
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[200px_1fr_240px] gap-4 min-h-0 overflow-hidden">
          
          {/* Left panel conversations */}
          <aside className="conversation-rail flex flex-col justify-between overflow-y-auto bg-white border border-slate-300 rounded-xl">
            <div className="space-y-4">
              <button 
                type="button"
                className="command primary w-full text-xs"
                onClick={handleNewConversation}
              >
                New Chat
              </button>

              <div className="space-y-2">
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setActiveConversationId(conv.id)}
                    className={`conversation ${conv.id === activeConversation.id ? "selected" : ""}`}
                  >
                    <MessageSquare size={13} />
                    <span className="truncate">{conv.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Middle panel chat logs */}
          <section className="chat-panel bg-white border border-slate-300 rounded-xl relative flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map((msg, idx) => {
                const isSystem = msg.role === "assistant";
                const hasFileProposal = msg.content.includes("[FILE_EDIT:");

                return (
                  <div key={idx} className={`flex gap-3 max-w-2xl ${isSystem ? "mr-auto" : "ml-auto flex-row-reverse"}`}>
                    <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border ${
                      isSystem ? "bg-slate-50 text-slate-700 border-slate-300" : "bg-[#2f5d62]/10 text-[#2f5d62] border-[#2f5d62]/20"
                    }`}>
                      {isSystem ? <Bot size={15} /> : <User size={15} />}
                    </div>

                    <div className="space-y-2">
                      <div className={`p-4 rounded-xl text-xs leading-relaxed ${
                        isSystem 
                          ? "bg-slate-50 border rounded-tl-none border-slate-200 text-slate-700" 
                          : "bg-[#dfe7e1] border rounded-tr-none border-[#c5d5c9] text-[#2c504c]"
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>

                      {/* Apply proposed file update action */}
                      {hasFileProposal && (
                        <div className="flex gap-2">
                          <button 
                            type="button"
                            onClick={() => handleApplyFileEdit(msg.content)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] py-1 px-3 rounded flex items-center gap-1 font-bold shadow-xs"
                          >
                            <Check size={11} /> Accept Proposal
                          </button>
                          <button 
                            type="button"
                            onClick={() => notify("Proposal rejected.")}
                            className="bg-slate-100 border hover:bg-slate-200 text-slate-600 text-[10px] py-1 px-3 rounded flex items-center gap-1 font-bold"
                          >
                            <X size={11} /> Decline
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {chatBusy && (
                <div className="thinking-block">
                  <button type="button" onClick={() => setThinkingOpen(!thinkingOpen)}>
                    <Bot size={14} className="animate-bounce" />
                    <span>Thinking</span>
                  </button>
                  {thinkingOpen && <p>{thinkingText}</p>}
                </div>
              )}
              {!chatBusy && thinkingText && (
                <div className="thinking-block collapsed">
                  <button type="button" onClick={() => setThinkingOpen(!thinkingOpen)}>
                    <Bot size={14} />
                    <span>Thinking</span>
                  </button>
                  {thinkingOpen && <p>{thinkingText}</p>}
                </div>
              )}
            </div>

            {/* Chat Composer */}
            <form onSubmit={handleSendChatMessage} className="p-4 border-t bg-slate-50 flex gap-2 relative">
              {/* Autocomplete box overlay */}
              {showSuggest && (
                <div className="absolute bottom-full left-4 mb-2 w-64 bg-white border border-slate-300 rounded-lg shadow-2xl p-1 z-35 max-h-48 overflow-y-auto">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1 border-b">
                    Mention prep file...
                  </div>
                  {suggestDocs.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleSelectAutocomplete(d)}
                      className="w-full text-left text-[11px] text-slate-700 hover:bg-slate-100 p-2 rounded flex items-center gap-1.5"
                    >
                      <FileText size={11} className="text-[#2f5d62]" />
                      <span>{d.partnerAccess || "private"}/{d.name.replace(".md", "")}</span>
                    </button>
                  ))}
                </div>
              )}

              <input 
                value={chatInput}
                onChange={(e) => handleChatInputChange(e.target.value)}
                placeholder="Ask about case contentions... Type @ to autocomplete wiki references."
                disabled={chatBusy}
                className="flex-grow text-xs"
              />
              <button 
                type="submit" 
                disabled={chatBusy || !chatInput.trim()}
                className="command primary py-2 px-3 shrink-0"
              >
                <Send size={13} />
              </button>
            </form>
          </section>

          {/* Right panel: Cited Files checklists */}
          <aside className="context-panel bg-white border border-slate-300 rounded-xl overflow-y-auto">
            <div className="panel-header compact border-b pb-2">
              <h2>Cited Files</h2>
              <FileText size={16} />
            </div>
            <p className="text-[10px] text-slate-400 mb-3">AI consults only checked files.</p>
            <div className="space-y-2">
              {documents.map(d => (
                <label key={d.id} className="check-row text-xs text-slate-600 hover:text-slate-800 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={checkedDocs[d.id] || false}
                    onChange={(e) => setCheckedDocs(prev => ({ ...prev, [d.id]: e.target.checked }))}
                    className="rounded border-slate-300 text-[#2f5d62]"
                  />
                  <span className="truncate">{d.partnerAccess || "private"}/{d.name}</span>
                </label>
              ))}
              {documents.length === 0 && (
                <span className="text-[10px] text-slate-400 italic block py-4 text-center">No case files created yet.</span>
              )}
            </div>
          </aside>

        </div>
      ) : (
        /* ------------------ AI SPARRING MODE LAYOUT ------------------ */
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4 min-h-0 overflow-hidden">
          
          {/* Middle Sparring Arena */}
          <section className="bg-white border border-slate-300 rounded-xl flex flex-col min-h-0 overflow-hidden">
            {!isSparringActive ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-5">
                <Bot size={40} className="text-[#2f5d62]" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Practice Debate Arena</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Spar against a world-class AI debater. Practice speech outlines, receive judge feedback and analytics.
                  </p>
                </div>

                <div className="w-full space-y-3 text-left">
                  <label className="field compact-field">
                    <span>Debate Topic Resolution</span>
                  <input 
                      value={topic} 
                      onChange={(e) => setTopic(e.target.value)} 
                      placeholder="Resolved: The United States should increase trade tariffs..."
                      required
                    />
                  </label>
                  {pastSparSessions.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="eyebrow">Past Topics</span>
                      <div className="space-y-1.5 max-h-28 overflow-y-auto">
                        {pastSparSessions.map(session => (
                          <button
                            key={session.id}
                            type="button"
                            className="conversation"
                            onClick={() => {
                              setTopic(session.topic);
                              setSide(session.side);
                            }}
                          >
                            <Trophy size={12} />
                            <span className="truncate">{session.topic}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2">
                    <div className="segmented">
                      <button 
                        type="button"
                        className={side === "affirmative" ? "selected" : ""} 
                        onClick={() => setSide("affirmative")}
                      >
                        Affirmative
                      </button>
                      <button 
                        type="button"
                        className={side === "negative" ? "selected" : ""} 
                        onClick={() => setSide("negative")}
                      >
                        Negative
                      </button>
                    </div>

                    <button 
                      type="button"
                      onClick={handleStartSparring}
                      disabled={!topic.trim()}
                      className="command primary py-1 px-4"
                    >
                      <Play size={13} className="inline mr-1" /> Spar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="eyebrow block">Sparring Resolution</span>
                    <strong className="text-xs text-slate-800 block truncate">{activeSparSession?.topic}</strong>
                  </div>
                  <button 
                    type="button"
                    onClick={handleResetSparring}
                    className="command py-1.5 px-3 text-xs"
                  >
                    Reset Sparring
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {sparMessages.map((msg, idx) => {
                    const isAI = msg.role === "ai";
                    return (
                      <div key={idx} className={`flex gap-3 max-w-xl ${isAI ? "mr-auto" : "ml-auto flex-row-reverse"}`}>
                        <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border ${
                          isAI ? "bg-slate-50 text-slate-700 border-slate-300" : "bg-[#2f5d62]/10 text-[#2f5d62] border-[#2f5d62]/20"
                        }`}>
                          {isAI ? <Bot size={15} /> : <User size={15} />}
                        </div>

                        <div className={`p-4 rounded-xl text-xs leading-relaxed ${
                          isAI 
                            ? "bg-slate-50 border rounded-tl-none border-slate-200 text-slate-700" 
                            : "bg-[#dfe7e1] border rounded-tr-none border-[#c5d5c9] text-[#2c504c]"
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      </div>
                    );
                  })}
                  {sparBusy && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 animate-pulse">
                      <Bot size={15} className="animate-bounce" />
                      AI Partner is counter-arguing...
                    </div>
                  )}
                </div>

                <form onSubmit={handleSendSparMessage} className="p-4 border-t bg-slate-50 flex gap-2">
                  <input 
                    value={sparInput}
                    onChange={(e) => setSparInput(e.target.value)}
                    placeholder="Enter your debate constructive speech, counter-points or rebuttal..."
                    disabled={sparBusy}
                    className="flex-grow text-xs"
                  />
                  <button 
                    type="submit" 
                    disabled={sparBusy || !sparInput.trim()}
                    className="command primary py-2 px-3 shrink-0"
                  >
                    <Send size={13} />
                  </button>
                </form>
              </>
            )}
          </section>

          {/* Right scorecard pane */}
          <aside className="bg-white border border-slate-300 rounded-xl overflow-y-auto p-4 flex flex-col">
            <div className="panel-header compact border-b pb-2 mb-3">
              <h2>Judge Scorecard</h2>
              <Award size={17} className="text-[#2f5d62]" />
            </div>

            {activeSparSession?.scorecard ? (
              <div className="space-y-4 flex-grow overflow-y-auto">
                <div className="text-center py-4 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="eyebrow block">Performance Score</span>
                  <div className="text-3xl font-extrabold text-[#2f5d62]">
                    {activeSparSession.scorecard.score}<span className="text-[11px] text-slate-400">/100</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="eyebrow block text-emerald-600 font-bold">Strengths</span>
                  <ul className="list-disc pl-4 text-xs text-slate-600 space-y-1">
                    {activeSparSession.scorecard.strengths.map((str, i) => (
                      <li key={i}>{str}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <span className="eyebrow block text-rose-600 font-bold">Weaknesses</span>
                  <ul className="list-disc pl-4 text-xs text-slate-600 space-y-1">
                    {activeSparSession.scorecard.weaknesses.map((weak, i) => (
                      <li key={i}>{weak}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <span className="eyebrow block text-[#2f5d62] font-bold">Recommendations</span>
                  <ul className="text-xs text-slate-600 space-y-1.5 pl-1">
                    {activeSparSession.scorecard.suggestions.map((sug, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <ArrowRight size={11} className="text-[#2f5d62] shrink-0 mt-0.5" />
                        <span>{sug}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-center items-center text-center text-slate-400 text-xs gap-2 py-10">
                <Trophy size={20} className="text-slate-200" />
                <span>Scorecard metrics will render after the first exchange.</span>
              </div>
            )}
          </aside>

        </div>
      )}
    </div>
  );
};

export default AI;
