import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Button,
  Content,
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderName,
  InlineNotification,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  SideNav,
  SideNavItems,
  SideNavLink,
  Tag,
  Tile,
  TextArea,
  TextInput,
  Theme,
} from "@carbon/react";
import {
  Add,
  Chat,
  CopyLink,
  Dashboard,
  Document,
  Edit,
  Launch,
  FolderOpen,
  Menu,
  Pause,
  Play,
  Renew,
  Search as SearchIcon,
  Settings,
  Time,
  UserAvatar,
} from "@carbon/icons-react";
import { EngineBridge } from "./engine";
import type { DebateDocument, EvidenceCard, Page, Snapshot } from "./types";
import { emptySnapshot } from "./types";

const navItems: { page: Page; label: string; icon: typeof Dashboard }[] = [
  { page: "inround", label: "In Round", icon: Dashboard },
  { page: "documents", label: "Documents", icon: Document },
  { page: "evidence", label: "Evidence Library", icon: FolderOpen },
  { page: "ai", label: "AI Coach", icon: Chat },
  { page: "history", label: "History", icon: Time },
];

function App() {
  const bridge = useRef(new EngineBridge()).current;
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 768px)").matches);
  const [activePage, setActivePage] = useState<Page | null>(null);

  useEffect(() => {
    void bridge.start(setSnapshot).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "The app engine could not start.");
    });
    return () => bridge.stop();
  }, [bridge]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (activePage === null || (snapshot.activePage !== "inround" && snapshot.activePage !== activePage)) {
      setActivePage(snapshot.activePage);
    }
  }, [activePage, snapshot.activePage]);

  const navigate = (page: Page) => {
    setActivePage(page);
    bridge.navigate(page);
    setMobileNav(false);
  };

  return (
    <Theme theme="white">
      <div className="app-shell">
        <Header aria-label="Dialektik">
          <HeaderGlobalAction
            aria-label="Open navigation"
            className="mobile-only"
            onClick={() => setMobileNav((open) => !open)}
          >
            <Menu />
          </HeaderGlobalAction>
          <HeaderName href="#" prefix="">Dialektik</HeaderName>
          <HeaderGlobalBar>
            <HeaderGlobalAction aria-label="Search">
              <SearchIcon />
            </HeaderGlobalAction>
            <HeaderGlobalAction aria-label="Account">
              <UserAvatar />
            </HeaderGlobalAction>
          </HeaderGlobalBar>
        </Header>
        <SideNav
          aria-label="Primary navigation"
          expanded={isMobile ? mobileNav : true}
          isRail={false}
          className="app-nav"
        >
          <SideNavItems>
            {navItems.map(({ page, label, icon: Icon }) => (
              <SideNavLink
                key={page}
                href={`#${page}`}
                renderIcon={Icon}
                isActive={snapshot.activePage === page}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(page);
                }}
              >
                {label}
              </SideNavLink>
            ))}
            <SideNavLink
              href="#settings"
              renderIcon={Settings}
              isActive={snapshot.activePage === "settings"}
              onClick={(event) => {
                event.preventDefault();
                navigate("settings");
              }}
            >
              Settings
            </SideNavLink>
          </SideNavItems>
        </SideNav>
        <Content className="app-content">
          {error && (
            <InlineNotification
              kind="error"
              lowContrast
              title="Engine unavailable"
              subtitle={error}
              hideCloseButton
            />
          )}
          <main className="page-content">
            <PageView snapshot={{ ...snapshot, activePage: activePage ?? snapshot.activePage }} bridge={bridge} navigate={navigate} />
          </main>
        </Content>
      </div>
    </Theme>
  );
}

function PageView({ snapshot, bridge, navigate }: { snapshot: Snapshot; bridge: EngineBridge; navigate: (page: Page) => void }) {
  switch (snapshot.activePage) {
    case "documents": return <DocumentsPage snapshot={snapshot} bridge={bridge} />;
    case "evidence": return <EvidencePage snapshot={snapshot} bridge={bridge} />;
    case "ai": return <AiPage snapshot={snapshot} bridge={bridge} />;
    case "history": return <HistoryPage snapshot={snapshot} bridge={bridge} />;
    case "settings": return <SettingsPage snapshot={snapshot} bridge={bridge} />;
    default: return <RoundPage snapshot={snapshot} bridge={bridge} navigate={navigate} />;
  }
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function RoundPage({ snapshot, bridge, navigate }: { snapshot: Snapshot; bridge: EngineBridge; navigate: (page: Page) => void }) {
  const [matchName, setMatchName] = useState("Practice round");
  const [groupName, setGroupName] = useState("Dialektik team");
  const [eventFormat, setEventFormat] = useState("pf");
  const session = snapshot.session;

  if (!session) {
    return (
      <>
        <PageHeader eyebrow="Live workspace" title="In Round" description="Set up a room, join a teammate, and keep the debate on track." />
        <div className="round-start-grid">
          <Tile className="start-tile">
            <div className="tile-kicker">Start a room</div>
            <h2>Host a practice round</h2>
            <TextInput id="match-name" labelText="Round name" value={matchName} onChange={(event) => setMatchName(event.currentTarget.value)} />
            <TextInput id="group-name" labelText="Team or group" value={groupName} onChange={(event) => setGroupName(event.currentTarget.value)} />
            <label className="field-label" htmlFor="event-format">Format</label>
            <select id="event-format" className="carbon-select" value={eventFormat} onChange={(event) => setEventFormat(event.currentTarget.value)}>
              <option value="pf">Public Forum</option>
              <option value="ld">Lincoln-Douglas</option>
              <option value="policy">Policy</option>
              <option value="congress">Congress</option>
              <option value="worlds">World Schools</option>
            </select>
            <Button renderIcon={Add} onClick={() => bridge.dispatch("session.host", { matchName, groupName, teamSize: 1, eventFormat })}>Host room</Button>
          </Tile>
          <Tile className="start-tile start-tile-muted">
            <div className="tile-kicker">Join a room</div>
            <h2>Enter a room code</h2>
            <JoinRoom bridge={bridge} />
            <p className="helper-text">Ask the host for the four-character room code. You can use the same workspace for prep and the live round.</p>
          </Tile>
        </div>
        <div className="section-grid">
          <Tile><h3>Prepare together</h3><p>Choose a document in Documents before the round starts. Evidence cards and AI context stay available without leaving the room.</p><Button kind="ghost" onClick={() => navigate("documents")}>Open documents</Button></Tile>
          <Tile><h3>Need a clean slate?</h3><p>Review previous rounds and notes in History, or adjust your identity and connection settings.</p><Button kind="ghost" onClick={() => navigate("history")}>View history</Button></Tile>
        </div>
      </>
    );
  }

  const currentSpeech = session.speechOrder[session.currentSpeechIndex];
  const minutes = Math.floor(session.speechRemainingMs / 60000).toString().padStart(2, "0");
  const seconds = Math.floor((session.speechRemainingMs % 60000) / 1000).toString().padStart(2, "0");
  return (
    <>
      <PageHeader eyebrow={session.status === "active" ? "Live round" : "Room lobby"} title={session.matchName || "Debate round"} description={`Room ${session.roomCode}${session.isHost ? " · You are hosting" : " · Connected"}`} actions={<Button kind="ghost" onClick={() => bridge.dispatch("session.exit")}>Leave room</Button>} />
      {session.status !== "active" ? (
        <Lobby session={session} snapshot={snapshot} bridge={bridge} />
      ) : (
        <div className="round-grid">
          <section className="round-main">
            <Tile className="timer-tile">
              <div className="timer-meta"><span>Current speech</span><Tag type="green">{currentSpeech?.label ?? "Speech"}</Tag></div>
              <div className="timer-value">{minutes}:{seconds}</div>
              <div className="timer-controls">
                <Button hasIconOnly tooltipPosition="right" iconDescription={session.speechRunning ? "Pause timer" : "Start timer"} renderIcon={session.speechRunning ? Pause : Play} onClick={() => bridge.dispatch("timer.action", { timerType: "speech", action: session.speechRunning ? "pause" : "start" })} />
                <Button kind="tertiary" renderIcon={Renew} onClick={() => bridge.dispatch("timer.action", { timerType: "speech", action: "reset" })}>Reset</Button>
              </div>
            </Tile>
            <Tile className="handout-tile"><div className="tile-kicker">Round handout</div><h2>{session.handout?.title || "No title yet"}</h2><p>{session.handout?.problem || "The resolution will appear here."}</p><p className="muted-copy">{session.handout?.details || "Add notes and documents in the lobby."}</p></Tile>
            <Tile><div className="tile-kicker">Speech order</div><div className="speech-list">{session.speechOrder.map((speech, index) => <div className={`speech-row ${index === session.currentSpeechIndex ? "is-current" : ""}`} key={speech.id}><span>{speech.label}</span><span>{Math.round(speech.durationMs / 60000)} min</span></div>)}</div></Tile>
          </section>
          <aside className="round-aside"><Tile><h3>Room members</h3>{session.debaters.length === 0 ? <p className="muted-copy">No other members yet.</p> : session.debaters.map((debater) => <div className="member-row" key={debater.id}><span>{debater.name}</span><Tag type={debater.status === "connected" ? "green" : "gray"}>{debater.status}</Tag></div>)}</Tile><Tile><h3>Prep timer</h3><div className="small-timer">{Math.floor(session.prepRemainingMs / 60000).toString().padStart(2, "0")}:{Math.floor((session.prepRemainingMs % 60000) / 1000).toString().padStart(2, "0")}</div><Button kind="tertiary" onClick={() => bridge.dispatch("timer.action", { timerType: "prep", action: session.prepRunning ? "pause" : "start" })}>{session.prepRunning ? "Pause" : "Start"}</Button></Tile><Tile><h3>Round controls</h3>{session.isHost && <><Button kind="tertiary" onClick={() => bridge.dispatch("session.advanceSpeech", { direction: "previous" })}>Previous speech</Button><Button kind="tertiary" onClick={() => bridge.dispatch("session.advanceSpeech", { direction: "next" })}>Next speech</Button><Button kind="danger--tertiary" onClick={() => { if (window.confirm("Save this round as an affirmative win?")) bridge.dispatch("session.saveRound", { winner: "affirmative" }); }}>Save round</Button></>}</Tile></aside>
        </div>
      )}
    </>
  );
}

function JoinRoom({ bridge }: { bridge: EngineBridge }) {
  const [code, setCode] = useState("");
  return <div className="join-form"><TextInput id="room-code" labelText="Room code" value={code} onChange={(event) => setCode(event.currentTarget.value.toUpperCase())} /><Button kind="secondary" onClick={() => bridge.dispatch("session.join", { roomCode: code.trim() })}>Join room</Button></div>;
}

function Lobby({ session, snapshot, bridge }: { session: NonNullable<Snapshot["session"]>; snapshot: Snapshot; bridge: EngineBridge }) {
  const [title, setTitle] = useState(session.handout?.title ?? "");
  const [problem, setProblem] = useState(session.handout?.problem ?? "");
  const selectedIds = new Set(session.documentIds ?? []);
  return <div className="lobby-grid"><Tile><div className="tile-kicker">Room code</div><div className="room-code">{session.roomCode}</div><p className="helper-text">Share this code with your debate partner.</p><Button kind="tertiary" renderIcon={CopyLink} onClick={() => void navigator.clipboard?.writeText(session.roomCode)}>Copy code</Button>{session.isHost && session.pendingRequests && session.pendingRequests.length > 0 && <div className="pending-requests"><h3>Join requests</h3>{session.pendingRequests.map((request) => <div className="request-row" key={request.id}><span>{request.name}</span><span><Button kind="ghost" size="sm" onClick={() => bridge.dispatch("session.approveJoin", { id: request.id })}>Approve</Button><Button kind="danger--ghost" size="sm" onClick={() => bridge.dispatch("session.rejectJoin", { id: request.id })}>Reject</Button></span></div>)}</div>}</Tile><Tile><h2>Prepare the round</h2><TextInput id="resolution" labelText="Resolution" value={problem} disabled={!session.isHost} onChange={(event) => { setProblem(event.currentTarget.value); bridge.dispatch("session.spliceHandout", { field: "problem", text: event.currentTarget.value, previous: session.handout?.problem ?? "" }); }} /><TextInput id="handout-title" labelText="Handout title" value={title} disabled={!session.isHost} onChange={(event) => { setTitle(event.currentTarget.value); bridge.dispatch("session.spliceHandout", { field: "title", text: event.currentTarget.value, previous: session.handout?.title ?? "" }); }} /><div className="selected-docs"><h3>Documents in this round</h3>{snapshot.documents.length === 0 ? <p className="muted-copy">No documents yet. Add one in Documents.</p> : snapshot.documents.map((doc) => <label className="document-check" key={doc.id}><input type="checkbox" checked={selectedIds.has(doc.id)} disabled={!session.isHost} onChange={(event) => { const next = event.currentTarget.checked ? [...selectedIds, doc.id] : [...selectedIds].filter((id) => id !== doc.id); bridge.dispatch("session.setDocuments", { ids: next }); }} /><span>{doc.name}</span><Tag type="gray">{doc.sourceType === "google_docs" ? "Google Docs" : "Offline"}</Tag></label>)}</div>{session.isHost && <Button onClick={() => bridge.dispatch("session.startDebate")}>Start debate</Button>}</Tile></div>;
}

function DocumentsPage({ snapshot, bridge }: { snapshot: Snapshot; bridge: EngineBridge }) {
  const [selectedId, setSelectedId] = useState(snapshot.documents[0]?.id ?? "");
  const [linkOpen, setLinkOpen] = useState(false);
  const selected = snapshot.documents.find((doc) => doc.id === selectedId) ?? snapshot.documents[0];
  return <><PageHeader eyebrow="Workspace" title="Documents" description="Keep debate files, linked Google Docs, and offline notes close at hand." actions={<><Button kind="secondary" renderIcon={Add} onClick={() => bridge.dispatch("document.create", { name: "Untitled note", folder: "private", mode: "write" })}>New offline note</Button><Button renderIcon={Add} onClick={() => setLinkOpen(true)}>Link Google Doc</Button></>} /><div className="documents-layout"><aside className="document-list"><div className="list-heading"><span>All documents</span><Tag type="gray">{snapshot.documents.length}</Tag></div>{snapshot.documents.length === 0 ? <p className="muted-copy">No documents yet.</p> : snapshot.documents.map((doc) => <button className={`document-item ${selected?.id === doc.id ? "is-selected" : ""}`} key={doc.id} onClick={() => setSelectedId(doc.id)}><Document size={20} /><span><strong>{doc.name}</strong><small>{doc.sourceType === "google_docs" ? "Google Docs" : "Offline workspace"}</small></span></button>)}</aside><section className="document-detail">{selected ? <DocumentDetail document={selected} bridge={bridge} /> : <EmptyState icon={Document} title="Select a document" description="Link a Google Doc or create an offline note to begin." />}</section></div><LinkDocumentModal open={linkOpen} onClose={() => setLinkOpen(false)} bridge={bridge} /></>;
}

function DocumentDetail({ document, bridge }: { document: DebateDocument; bridge: EngineBridge }) {
  const [content, setContent] = useState(document.content);
  const [editing, setEditing] = useState(document.sourceType !== "google_docs");
  const [frameState, setFrameState] = useState<"loading" | "loaded" | "error">("loading");
  const [frameKey, setFrameKey] = useState(0);
  useEffect(() => setContent(document.content), [document.id, document.content]);
  useEffect(() => { setFrameState("loading"); setFrameKey((key) => key + 1); }, [document.id, document.externalUrl]);
  const isGoogle = document.sourceType === "google_docs" || document.type === "google_docs";
  return <><div className="detail-header"><div><div className="eyebrow">{isGoogle ? "Google Docs" : "Offline workspace"}</div><h2>{document.name}</h2></div><div className="detail-actions">{isGoogle && document.externalUrl && <Button kind="ghost" renderIcon={Launch} onClick={() => window.open(document.externalUrl, "_blank", "noopener,noreferrer")}>Open in browser</Button>}<OverflowMenu ariaLabel="Document actions"><OverflowMenuItem itemText="Rename" onClick={() => { const name = window.prompt("Document name", document.name); if (name) bridge.dispatch("document.rename", { id: document.id, name }); }} /><OverflowMenuItem itemText="Duplicate" onClick={() => bridge.dispatch("document.duplicate", { id: document.id })} /><OverflowMenuItem itemText="Delete" isDelete onClick={() => bridge.dispatch("document.delete", { id: document.id })} /></OverflowMenu></div></div>{isGoogle ? <div className="google-frame-shell"><div className="frame-toolbar"><span>{frameState === "loading" ? "Loading Google Docs…" : frameState === "error" ? "The embedded view could not load" : "Editing in Google Docs"}</span>{frameState === "error" && <Button kind="ghost" size="sm" onClick={() => { setFrameState("loading"); setFrameKey((key) => key + 1); }}>Retry</Button>}</div><iframe key={frameKey} className="google-doc-frame" title={`Google Docs: ${document.name}`} src={document.externalUrl} allow="clipboard-read; clipboard-write" onLoad={() => setFrameState("loaded")} onError={() => setFrameState("error")} /></div> : <><TextArea id="offline-document" labelText="Document content" hideLabel value={content} disabled={!editing} onChange={(event) => setContent(event.currentTarget.value)} onBlur={() => bridge.dispatch("document.updateContent", { id: document.id, content })} rows={20} /><div className="editor-footer"><span>{content.length} characters</span><Button kind="ghost" onClick={() => setEditing((value) => !value)} renderIcon={Edit}>{editing ? "Finish editing" : "Edit note"}</Button></div></>}</>;
}

function LinkDocumentModal({ open, onClose, bridge }: { open: boolean; onClose: () => void; bridge: EngineBridge }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  return <Modal open={open} modalHeading="Link a Google Doc" primaryButtonText="Link document" secondaryButtonText="Cancel" onRequestClose={onClose} onRequestSubmit={() => { bridge.dispatch("document.linkGoogle", { name, url }); setName(""); setUrl(""); onClose(); }}><TextInput id="google-doc-name" labelText="Document name" value={name} onChange={(event) => setName(event.currentTarget.value)} /><TextInput id="google-doc-url" labelText="Google Docs URL" value={url} onChange={(event) => setUrl(event.currentTarget.value)} /></Modal>;
}

function EvidencePage({ snapshot, bridge }: { snapshot: Snapshot; bridge: EngineBridge }) {
  const [newCard, setNewCard] = useState(false);
  return <><PageHeader eyebrow="Research workspace" title="Evidence Library" description="Collect sources and keep cards ready for the next round." actions={<Button renderIcon={Add} onClick={() => setNewCard(true)}>Add evidence</Button>} /><div className="card-grid">{snapshot.cards.length === 0 ? <EmptyState icon={FolderOpen} title="No evidence cards" description="Add a source, citation, and body text to build your library." /> : snapshot.cards.map((card) => <EvidenceTile card={card} key={card.id} bridge={bridge} />)}</div><NewCardModal open={newCard} onClose={() => setNewCard(false)} bridge={bridge} /></>;
}

function EvidenceTile({ card, bridge }: { card: EvidenceCard; bridge: EngineBridge }) {
  return <Tile className="evidence-tile"><div className="evidence-heading"><h3>{card.title}</h3><OverflowMenu ariaLabel={`Actions for ${card.title}`}><OverflowMenuItem itemText="Delete" isDelete onClick={() => bridge.dispatch("card.delete", { id: card.id })} /></OverflowMenu></div><p>{card.text}</p>{card.sourceUrl && <a href={card.sourceUrl} target="_blank" rel="noreferrer">{card.sourceUrl}</a>}<div className="tile-footer"><Tag type={card.folder === "private" ? "gray" : "green"}>{card.folder === "private" ? "Private" : "Shared"}</Tag><span>{card.author || "Unattributed"}</span></div></Tile>;
}

function NewCardModal({ open, onClose, bridge }: { open: boolean; onClose: () => void; bridge: EngineBridge }) {
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [text, setText] = useState("");
  return <Modal open={open} modalHeading="Add evidence card" primaryButtonText="Save card" secondaryButtonText="Cancel" onRequestClose={onClose} onRequestSubmit={() => { bridge.dispatch("card.create", { title, sourceUrl, text }); setTitle(""); setSourceUrl(""); setText(""); onClose(); }}><TextInput id="card-title" labelText="Title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} /><TextInput id="card-source" labelText="Source website" value={sourceUrl} onChange={(event) => setSourceUrl(event.currentTarget.value)} /><TextArea id="card-body" labelText="Evidence body" value={text} onChange={(event) => setText(event.currentTarget.value)} rows={8} /></Modal>;
}

function AiPage({ snapshot, bridge }: { snapshot: Snapshot; bridge: EngineBridge }) {
  const [message, setMessage] = useState("");
  const chat = snapshot.ai.chats.find((item) => item.id === snapshot.ai.activeChatId) ?? snapshot.ai.chats[0];
  return <><PageHeader eyebrow="Practice partner" title="AI Coach" description="Ask for a brainstorm, a rebuttal drill, or feedback on approved context." actions={<Button kind="ghost" renderIcon={Add} onClick={() => bridge.dispatch("ai.newChat")}>New chat</Button>} /><div className="ai-layout"><aside className="chat-list">{snapshot.ai.chats.map((item) => <button className={`chat-item ${item.id === chat?.id ? "is-selected" : ""}`} key={item.id} onClick={() => bridge.dispatch("ai.selectChat", { id: item.id })}>{item.title}</button>)}</aside><section className="chat-panel">{chat?.messages.length ? chat.messages.map((item, index) => <div className={`message ${item.role}`} key={`${item.timestamp}-${index}`}><span className="message-role">{item.role === "user" ? "You" : "AI Coach"}</span><p>{item.text}</p></div>) : <EmptyState icon={Chat} title="Start a coaching chat" description="Your AI key and endpoint are configured in Settings. Dialektik only sends context you choose." />}<div className="chat-composer"><TextArea id="ai-message" labelText="Message" hideLabel placeholder="Ask for a rebuttal drill..." value={message} onChange={(event) => setMessage(event.currentTarget.value)} rows={3} /><Button onClick={() => { if (!message.trim()) return; bridge.dispatch("ai.sendMessage", { text: message.trim() }); setMessage(""); }}>Send</Button></div></section></div></>;
}

function HistoryPage({ snapshot, bridge }: { snapshot: Snapshot; bridge: EngineBridge }) {
  return <><PageHeader eyebrow="Review" title="History" description="Look back at rounds, notes, and results to guide the next practice session." /><div className="history-list">{snapshot.history.length === 0 ? <EmptyState icon={Time} title="No rounds recorded" description="Completed rounds will appear here." /> : snapshot.history.map((record) => <Tile className="history-row" key={record.id}><div><h3>{record.matchName}</h3><p>{record.opponentName || "Practice round"} · {new Date(record.timestamp).toLocaleDateString()}</p></div><Tag type={record.winLoss === "win" ? "green" : "gray"}>{record.winLoss || "Unmarked"}</Tag><OverflowMenu ariaLabel={`Actions for ${record.matchName}`}><OverflowMenuItem itemText="Delete" isDelete onClick={() => bridge.dispatch("history.delete", { id: record.id })} /></OverflowMenu></Tile>)}</div></>;
}

function SettingsPage({ snapshot, bridge }: { snapshot: Snapshot; bridge: EngineBridge }) {
  const [name, setName] = useState(snapshot.settings.userName);
  const [endpoint, setEndpoint] = useState(snapshot.settings.aiEndpoint);
  const [model, setModel] = useState(snapshot.settings.aiModel);
  const [apiKey, setApiKey] = useState("");
  return <><PageHeader eyebrow="Preferences" title="Settings" description="Configure your local identity, AI connection, and round networking." /><div className="settings-layout"><section className="settings-section"><h2>Profile</h2><TextInput id="user-name" labelText="Your name" value={name} onChange={(event) => setName(event.currentTarget.value)} onBlur={() => bridge.dispatch("settings.save", { userName: name })} /><p className="helper-text">This name is shown to teammates in a room.</p></section><section className="settings-section"><h2>AI Coach</h2><TextInput id="ai-endpoint" labelText="API endpoint" value={endpoint} onChange={(event) => setEndpoint(event.currentTarget.value)} onBlur={() => bridge.dispatch("settings.save", { aiEndpoint: endpoint })} /><TextInput id="ai-model" labelText="Model" value={model} onChange={(event) => setModel(event.currentTarget.value)} onBlur={() => bridge.dispatch("settings.save", { aiModel: model })} /><TextInput id="ai-key" type="password" labelText="API key" placeholder={snapshot.settings.hasAiKey ? "Saved securely" : "Not configured"} value={apiKey} onChange={(event) => setApiKey(event.currentTarget.value)} onBlur={() => apiKey && bridge.dispatch("settings.save", { aiApiKey: apiKey })} /><p className="helper-text">Keys are stored locally and are never included in workspace backups.</p></section><section className="settings-section"><h2>Workspace</h2><div className="settings-stat"><strong>{snapshot.documents.length}</strong><span>documents</span><strong>{snapshot.cards.length}</strong><span>evidence cards</span><strong>{snapshot.history.length}</strong><span>rounds</span></div><p className="helper-text">Workspace export and restore remain available in the Flutter release while this frontend migration is completed.</p></section><section className="settings-section"><h2>About Dialektik</h2><p>Next major frontend migration · v1.0.0</p><p className="muted-copy">Local-first debate preparation with peer-to-peer round tools.</p></section></div></>;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Document; title: string; description: string }) {
  return <div className="empty-state"><Icon size={32} /><h2>{title}</h2><p>{description}</p></div>;
}

export default App;
