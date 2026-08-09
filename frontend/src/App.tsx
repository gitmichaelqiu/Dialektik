import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  Checkbox,
  Content,
  Header,
  InlineNotification,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  SideNav,
  SideNavItems,
  SideNavLink,
  Select,
  SelectItem,
  Tag,
  Tile,
  TextArea,
  TextInput,
  Toggle,
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
  OverflowMenuVertical,
  Pause,
  Play,
  Renew,
  Settings,
  Time,
  UserAvatar,
} from "@carbon/icons-react";
import { EngineBridge } from "./engine";
import type { DebateDocument, EvidenceCard, Page, Snapshot } from "./types";
import { emptySnapshot } from "./types";
import type { Webview as TauriWebview } from "@tauri-apps/api/webview";

const navItems: { page: Page; label: string; icon: typeof Dashboard }[] = [
  { page: "inround", label: "In Round", icon: Dashboard },
  { page: "evidence", label: "Evidence Library", icon: FolderOpen },
  { page: "ai", label: "AI Coach", icon: Chat },
  { page: "history", label: "History", icon: Time },
];

function normalizeGoogleDocsUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const match = url.hostname.toLowerCase() === "docs.google.com" ? url.pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)/) : null;
    if (!match) return null;
    return `https://docs.google.com/document/d/${match[1]}/edit`;
  } catch {
    return null;
  }
}

function googleSignInUrl(documentUrl: string) {
  return `https://accounts.google.com/ServiceLogin?service=wise&continue=${encodeURIComponent(documentUrl)}`;
}

function App() {
  const bridge = useRef(new EngineBridge()).current;
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [navExpanded, setNavExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 768px)").matches);
  const [activePage, setActivePage] = useState<Page | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [googleDialog, setGoogleDialog] = useState<{ open: boolean; document?: DebateDocument }>({ open: false });

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
    const suppressBrowserMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", suppressBrowserMenu);
    return () => document.removeEventListener("contextmenu", suppressBrowserMenu);
  }, []);

  useEffect(() => {
    if (activePage === null) {
      setActivePage(snapshot.activePage);
    }
  }, [activePage, snapshot.activePage]);

  useEffect(() => {
    if (!snapshot.documents.some((document) => document.id === selectedDocumentId)) {
      setSelectedDocumentId(snapshot.documents[0]?.id ?? "");
    }
  }, [selectedDocumentId, snapshot.documents]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const navigate = (page: Page) => {
    setActivePage(page);
    bridge.navigate(page);
    setMobileNav(false);
  };

  const selectedDocument = snapshot.documents.find((document) => document.id === selectedDocumentId) ?? snapshot.documents[0];
  const currentPage = activePage ?? snapshot.activePage;
  const pageTitle = currentPage === "documents" ? selectedDocument?.name ?? "Documents" : currentPage === "inround" && snapshot.session?.matchName ? snapshot.session.matchName : currentPage === "settings" ? "Settings" : navItems.find((item) => item.page === currentPage)?.label ?? "Dialektik";

  return (
    <Theme theme="white">
      <div className={`app-shell ${!isMobile && !navExpanded ? "nav-collapsed" : ""}`}>
        <Header aria-label="Dialektik" className="app-titlebar">
          <button className="sidebar-toggle mobile-only" aria-label="Open navigation" aria-expanded={mobileNav} onClick={() => setMobileNav((open) => !open)}>
            <Menu />
          </button>
          <span className="app-wordmark">Dialektik</span>
        </Header>
        <SideNav
          aria-label="Primary navigation"
          expanded={isMobile ? mobileNav : navExpanded}
          isRail={!isMobile && !navExpanded}
          addMouseListeners={false}
          addFocusListeners={false}
          className="app-nav"
        >
          <div className="sidebar-brand"><button type="button" className="sidebar-toggle sidebar-toggle-rail" aria-label={navExpanded ? "Collapse sidebar" : "Expand sidebar"} aria-expanded={navExpanded} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setNavExpanded((expanded) => !expanded); }}><Menu /></button><span>Dialektik</span></div>
          <div className="sidebar-navigation"><SideNavItems>
            {navItems.map(({ page, label, icon: Icon }) => (
              <SideNavLink
                key={page}
                href={`#${page}`}
                renderIcon={Icon}
                isActive={currentPage === page}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(page);
                }}
              >
                {label}
              </SideNavLink>
            ))}
          </SideNavItems></div>
          <div className="sidebar-documents-scroll"><DocumentSidebar snapshot={snapshot} bridge={bridge} selectedId={selectedDocumentId} onSelect={(id) => { setSelectedDocumentId(id); navigate("documents"); }} onCreate={() => bridge.dispatch("document.create", { name: "Untitled note", folder: "private", mode: "write" })} onLink={() => setGoogleDialog({ open: true })} onEditGoogle={(document) => setGoogleDialog({ open: true, document })} /></div>
          <div className="sidebar-footer"><button type="button" className="sidebar-account" onClick={() => navigate("settings")}><UserAvatar /><span>{snapshot.settings.userName || "Name"}</span></button><button type="button" className="sidebar-settings" aria-label="Settings" onClick={() => navigate("settings")}><Settings /></button></div>
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
          <div className="app-pagebar"><h1>{pageTitle}</h1>{currentPage === "documents" && selectedDocument?.externalUrl && <Button kind="ghost" size="sm" renderIcon={Launch} onClick={() => window.open(selectedDocument.externalUrl, "_blank", "noopener,noreferrer")}>Open in browser</Button>}</div>
          <main className={`page-content ${currentPage === "documents" ? "document-page-content" : ""}`}>
            <PageView snapshot={{ ...snapshot, activePage: currentPage }} bridge={bridge} navigate={navigate} selectedDocumentId={selectedDocumentId} googleDialog={googleDialog} onCloseGoogleDialog={() => setGoogleDialog({ open: false })} />
          </main>
          <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} snapshot={snapshot} navigate={navigate} />
        </Content>
      </div>
    </Theme>
  );
}

function DocumentSidebar({ snapshot, bridge, selectedId, onSelect, onCreate, onLink, onEditGoogle }: { snapshot: Snapshot; bridge: EngineBridge; selectedId: string; onSelect: (id: string) => void; onCreate: () => void; onLink: () => void; onEditGoogle: (document: DebateDocument) => void }) {
  const [menu, setMenu] = useState<{ document: DebateDocument; x: number; y: number }>();
  const [renameDocument, setRenameDocument] = useState<DebateDocument>();
  const [renameValue, setRenameValue] = useState("");
  const [removeDocument, setRemoveDocument] = useState<DebateDocument>();
  useEffect(() => {
    const close = () => setMenu(undefined);
    const closeOnKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", closeOnKey); };
  }, []);
  const openMenu = (event: ReactMouseEvent, documentItem: DebateDocument) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ document: documentItem, x: event.clientX, y: event.clientY });
  };
  const action = (callback: () => void) => { callback(); setMenu(undefined); };
  const startRename = (documentItem: DebateDocument) => { setMenu(undefined); setRenameDocument(documentItem); setRenameValue(documentItem.name); };
  const startRemove = (documentItem: DebateDocument) => { setMenu(undefined); setRemoveDocument(documentItem); };
  return <><div className="docs-side-panel"><div className="docs-side-heading"><span>Documents</span><Tag type="gray">{snapshot.documents.length}</Tag></div><div className="docs-side-actions"><button type="button" onClick={onCreate}>New note</button><button type="button" onClick={onLink}>Link Google Doc</button></div>{snapshot.documents.length === 0 ? <p className="muted-copy">No documents yet.</p> : snapshot.documents.map((doc) => <div className={`document-row ${selectedId === doc.id ? "is-selected" : ""}`} key={doc.id} onContextMenu={(event) => openMenu(event, doc)}><button type="button" className="document-item" onClick={() => onSelect(doc.id)}><Document size={20} /><span><strong>{doc.name}</strong><small>{doc.sourceType === "google_docs" ? "Google Docs" : "Offline note"}</small></span></button><button type="button" className="document-menu-trigger" aria-label={`Actions for ${doc.name}`} onClick={(event) => { event.stopPropagation(); openMenu(event, doc); }}><OverflowMenuVertical /></button></div>)}</div>{menu && createPortal(<div className="document-context-menu" style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 248)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 300)) }} onMouseDown={(event) => event.stopPropagation()}><button type="button" onClick={() => startRename(menu.document)}>Rename</button><button type="button" onClick={() => action(() => bridge.dispatch("document.duplicate", { id: menu.document.id }))}>Duplicate</button>{menu.document.externalUrl && <><button type="button" onClick={() => action(() => onEditGoogle(menu.document))}>Edit link</button><button type="button" onClick={() => action(() => void navigator.clipboard?.writeText(menu.document.externalUrl ?? ""))}>Copy link</button></>}<button type="button" className="is-danger" onClick={() => startRemove(menu.document)}>Remove</button></div>, document.body)}<Modal open={Boolean(renameDocument)} modalHeading="Rename document" primaryButtonText="Rename" primaryButtonDisabled={!renameValue.trim()} secondaryButtonText="Cancel" onRequestClose={() => setRenameDocument(undefined)} onRequestSubmit={() => { if (renameDocument && renameValue.trim()) bridge.dispatch("document.rename", { id: renameDocument.id, name: renameValue.trim() }); setRenameDocument(undefined); }}><TextInput id="rename-document" labelText="Document name" value={renameValue} onChange={(event) => setRenameValue(event.currentTarget.value)} autoFocus /></Modal><Modal open={Boolean(removeDocument)} danger modalHeading="Remove document" primaryButtonText="Remove" secondaryButtonText="Cancel" onRequestClose={() => setRemoveDocument(undefined)} onRequestSubmit={() => { if (removeDocument) bridge.dispatch("document.delete", { id: removeDocument.id }); setRemoveDocument(undefined); }}><p>Remove {removeDocument?.name ?? "this document"} from the workspace?</p></Modal></>;
}

function SearchModal({ open, onClose, snapshot, navigate }: { open: boolean; onClose: () => void; snapshot: Snapshot; navigate: (page: Page) => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const documents = snapshot.documents.filter((doc) => !normalized || doc.name.toLowerCase().includes(normalized));
  const cards = snapshot.cards.filter((card) => !normalized || `${card.title} ${card.text}`.toLowerCase().includes(normalized));
  return <Modal open={open} passiveModal modalHeading="Search workspace" onRequestClose={() => { setQuery(""); onClose(); }}><TextInput id="workspace-search" labelText="Search documents and evidence" value={query} onChange={(event) => setQuery(event.currentTarget.value)} autoFocus />{query.trim() && <div className="search-results">{documents.map((doc) => <button key={doc.id} onClick={() => { navigate("documents"); setQuery(""); onClose(); }}><Document size={20} /><span>{doc.name}<small>Document</small></span></button>)}{cards.map((card) => <button key={card.id} onClick={() => { navigate("evidence"); setQuery(""); onClose(); }}><FolderOpen size={20} /><span>{card.title}<small>Evidence card</small></span></button>)}{documents.length === 0 && cards.length === 0 && <p className="muted-copy">No matching workspace items.</p>}</div>}</Modal>;
}

function PageView({ snapshot, bridge, navigate, selectedDocumentId, googleDialog, onCloseGoogleDialog }: { snapshot: Snapshot; bridge: EngineBridge; navigate: (page: Page) => void; selectedDocumentId: string; googleDialog: { open: boolean; document?: DebateDocument }; onCloseGoogleDialog: () => void }) {
  switch (snapshot.activePage) {
    case "documents": return <DocumentsPage snapshot={snapshot} bridge={bridge} selectedId={selectedDocumentId} googleDialog={googleDialog} onCloseGoogleDialog={onCloseGoogleDialog} />;
    case "evidence": return <EvidencePage snapshot={snapshot} bridge={bridge} />;
    case "ai": return <AiPage snapshot={snapshot} bridge={bridge} />;
    case "history": return <HistoryPage snapshot={snapshot} bridge={bridge} />;
    case "settings": return <SettingsPage snapshot={snapshot} bridge={bridge} />;
    default: return <RoundPage snapshot={snapshot} bridge={bridge} navigate={navigate} />;
  }
}

function PageHeader({ title, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function formatTimer(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, "0")}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
}

function RoundPage({ snapshot, bridge, navigate }: { snapshot: Snapshot; bridge: EngineBridge; navigate: (page: Page) => void }) {
  const [matchName, setMatchName] = useState("");
  const [groupName, setGroupName] = useState("");
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
            <Select id="event-format" labelText="Format" value={eventFormat} onChange={(event) => setEventFormat(event.currentTarget.value)}>
              <SelectItem value="pf" text="Public Forum" />
              <SelectItem value="ld" text="Lincoln-Douglas" />
              <SelectItem value="policy" text="Policy" />
              <SelectItem value="congress" text="Congress" />
              <SelectItem value="worlds" text="World Schools" />
            </Select>
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
  const selectedSpeaker = session.currentSpeakerId ?? session.debaters[0]?.id ?? "";
  const speakerNotes = session.speakerNotes ?? {};
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
              <div className="timer-value">{formatTimer(session.speechRemainingMs)}</div>
              <div className="timer-controls">
                <Button hasIconOnly tooltipPosition="right" iconDescription={session.speechRunning ? "Pause timer" : "Start timer"} renderIcon={session.speechRunning ? Pause : Play} onClick={() => bridge.dispatch("timer.action", { timerType: "speech", action: session.speechRunning ? "pause" : "start" })} />
                <Button kind="tertiary" renderIcon={Renew} onClick={() => bridge.dispatch("timer.action", { timerType: "speech", action: "reset" })}>Reset</Button>
              </div>
            </Tile>
            <Tile className="handout-tile"><div className="tile-kicker">Round handout</div><h2>{session.handout?.title || "No title yet"}</h2><p>{session.handout?.problem || "The resolution will appear here."}</p><p className="muted-copy">{session.handout?.details || "Add notes and documents in the lobby."}</p></Tile>
            <Tile><div className="tile-kicker">Speech order</div><div className="speech-list">{session.speechOrder.map((speech, index) => <button className={`speech-row ${index === session.currentSpeechIndex ? "is-current" : ""}`} key={speech.id} disabled={!session.isHost} onClick={() => bridge.dispatch("session.selectSpeech", { index })}><span>{speech.label}</span><span>{Math.round(speech.durationMs / 60000)} min</span></button>)}</div></Tile>
          </section>
          <aside className="round-aside"><Tile><h3>Room members</h3>{session.debaters.length === 0 ? <p className="muted-copy">No other members yet.</p> : session.debaters.map((debater) => <div className="member-row" key={debater.id}><span>{debater.name}<small>{debater.team ? ` · ${debater.team}` : ""}</small></span><Tag type={debater.status === "connected" || debater.status === "approved" ? "green" : "gray"}>{debater.status}</Tag></div>)}</Tile><Tile><h3>Prep timer</h3><div className="small-timer">{formatTimer(session.prepRemainingMs)}</div><div className="timer-actions"><Button kind="tertiary" onClick={() => bridge.dispatch("timer.action", { timerType: "prep", action: session.prepRunning ? "pause" : "start" })}>{session.prepRunning ? "Pause" : "Start"}</Button><Button kind="ghost" onClick={() => bridge.dispatch("timer.action", { timerType: "prep", action: "reset" })}>Reset</Button></div></Tile><Tile><h3>Speaker notes</h3><Select id="current-speaker" labelText="Speaker" value={selectedSpeaker} onChange={(event) => bridge.dispatch("session.selectSpeaker", { id: event.currentTarget.value })}>{session.debaters.map((debater) => <SelectItem key={debater.id} value={debater.id} text={debater.name} />)}</Select><TextArea id="speaker-notes" labelText="Private notes" value={speakerNotes[selectedSpeaker] ?? ""} onChange={(event) => bridge.dispatch("session.updateNotes", { speakerId: selectedSpeaker, text: event.currentTarget.value })} rows={4} disabled={!selectedSpeaker} /></Tile><CustomTimers session={session} bridge={bridge} /><Tile><h3>Round controls</h3>{session.isHost && <><Toggle id="auto-advance" labelText="Auto-advance speech" labelA="Off" labelB="On" toggled={session.autoAdvance === true} onToggle={(toggled) => bridge.dispatch("session.setAutoAdvance", { enabled: toggled })} /><Button kind="tertiary" onClick={() => bridge.dispatch("session.advanceSpeech", { direction: "previous" })}>Previous speech</Button><Button kind="tertiary" onClick={() => bridge.dispatch("session.advanceSpeech", { direction: "next" })}>Next speech</Button><Button kind="ghost" onClick={() => bridge.dispatch("timer.resetAll")}>Reset timers</Button><div className="winner-actions"><Button kind="danger--tertiary" onClick={() => { if (window.confirm("Save this round as an affirmative win?")) bridge.dispatch("session.saveRound", { winner: "affirmative" }); }}>Affirmative won</Button><Button kind="danger--tertiary" onClick={() => { if (window.confirm("Save this round as a negative win?")) bridge.dispatch("session.saveRound", { winner: "negative" }); }}>Negative won</Button></div></>}</Tile></aside>
        </div>
      )}
    </>
  );
}

function JoinRoom({ bridge }: { bridge: EngineBridge }) {
  const [code, setCode] = useState("");
  return <div className="join-form"><TextInput id="room-code" labelText="Room code" value={code} onChange={(event) => setCode(event.currentTarget.value.toUpperCase())} /><Button kind="secondary" onClick={() => bridge.dispatch("session.join", { roomCode: code.trim() })}>Join room</Button></div>;
}

function CustomTimers({ session, bridge }: { session: NonNullable<Snapshot["session"]>; bridge: EngineBridge }) {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("01:00");
  const timers = session.customTimers ?? [];
  return <Tile><h3>Custom timers</h3>{timers.map((timer) => <div className="custom-timer-row" key={timer.id}><div><strong>{timer.name}</strong><span>{formatTimer(timer.remainingMs)}</span></div><div><Button kind="ghost" size="sm" onClick={() => bridge.dispatch("customTimer.action", { id: timer.id, action: timer.running ? "pause" : "start" })}>{timer.running ? "Pause" : "Start"}</Button><Button kind="ghost" size="sm" onClick={() => bridge.dispatch("customTimer.action", { id: timer.id, action: "reset" })}>Reset</Button><Button kind="danger--ghost" size="sm" onClick={() => bridge.dispatch("customTimer.delete", { id: timer.id })}>Remove</Button></div></div>)}<div className="custom-timer-form"><TextInput id="custom-timer-name" labelText="Timer name" value={name} onChange={(event) => setName(event.currentTarget.value)} /><TextInput id="custom-timer-duration" labelText="Duration" helperText="mm:ss" value={duration} onChange={(event) => setDuration(event.currentTarget.value)} /><Button kind="tertiary" disabled={!name.trim()} onClick={() => { bridge.dispatch("customTimer.create", { name, duration }); setName(""); }}>Add timer</Button></div></Tile>;
}

function Lobby({ session, snapshot, bridge }: { session: NonNullable<Snapshot["session"]>; snapshot: Snapshot; bridge: EngineBridge }) {
  const [title, setTitle] = useState(session.handout?.title ?? "");
  const [problem, setProblem] = useState(session.handout?.problem ?? "");
  const [details, setDetails] = useState(session.handout?.details ?? "");
  const selectedIds = new Set(session.documentIds ?? []);
  const updateHandout = (field: "title" | "problem" | "details", value: string) => {
    const next = { title, problem, details, [field]: value };
    bridge.dispatch("session.updateHandout", next);
  };
  return <div className="lobby-grid"><Tile><div className="tile-kicker">Room code</div><div className="room-code">{session.roomCode}</div><p className="helper-text">Share this code with your debate partner.</p><Button kind="tertiary" renderIcon={CopyLink} onClick={() => void navigator.clipboard?.writeText(session.roomCode)}>Copy code</Button>{session.isHost && session.pendingRequests && session.pendingRequests.length > 0 && <div className="pending-requests"><h3>Join requests</h3>{session.pendingRequests.map((request) => <div className="request-row" key={request.id}><span>{request.name}</span><span><Button kind="ghost" size="sm" onClick={() => bridge.dispatch("session.approveJoin", { id: request.id })}>Approve</Button><Button kind="danger--ghost" size="sm" onClick={() => bridge.dispatch("session.rejectJoin", { id: request.id })}>Reject</Button></span></div>)}</div>}</Tile><Tile><h2>Prepare the round</h2><TextInput id="resolution" labelText="Resolution" value={problem} disabled={!session.isHost} onChange={(event) => { const value = event.currentTarget.value; setProblem(value); updateHandout("problem", value); }} /><TextInput id="handout-title" labelText="Handout title" value={title} disabled={!session.isHost} onChange={(event) => { const value = event.currentTarget.value; setTitle(value); updateHandout("title", value); }} /><TextArea id="handout-details" labelText="Prep notes" value={details} disabled={!session.isHost} onChange={(event) => { const value = event.currentTarget.value; setDetails(value); updateHandout("details", value); }} rows={5} /><div className="selected-docs"><h3>Documents in this round</h3>{snapshot.documents.length === 0 ? <p className="muted-copy">No documents yet. Add one in Documents.</p> : snapshot.documents.map((doc) => <label className="document-check" key={doc.id}><input type="checkbox" checked={selectedIds.has(doc.id)} disabled={!session.isHost} onChange={(event) => { const next = event.currentTarget.checked ? [...selectedIds, doc.id] : [...selectedIds].filter((id) => id !== doc.id); bridge.dispatch("session.setDocuments", { ids: next }); }} /><span>{doc.name}</span><Tag type="gray">{doc.sourceType === "google_docs" ? "Google Docs" : "Offline"}</Tag></label>)}</div>{session.isHost && <Button onClick={() => bridge.dispatch("session.startDebate")}>Start debate</Button>}</Tile></div>;
}

function DocumentsPage({ snapshot, bridge, selectedId, googleDialog, onCloseGoogleDialog }: { snapshot: Snapshot; bridge: EngineBridge; selectedId: string; googleDialog: { open: boolean; document?: DebateDocument }; onCloseGoogleDialog: () => void }) {
  const selected = snapshot.documents.find((doc) => doc.id === selectedId) ?? snapshot.documents[0];
  return <><PageHeader title="Documents" /><section className="document-detail document-detail-standalone">{selected ? <DocumentDetail document={selected} bridge={bridge} /> : <EmptyState icon={Document} title="No document selected" description="Create a note or link a Google Doc from the Documents sidebar." />}</section><LinkDocumentModal open={googleDialog.open} document={googleDialog.document} onClose={onCloseGoogleDialog} bridge={bridge} /></>;
}

function DocumentDetail({ document, bridge }: { document: DebateDocument; bridge: EngineBridge }) {
  const [content, setContent] = useState(document.content);
  const [editing, setEditing] = useState(document.sourceType !== "google_docs");
  useEffect(() => setContent(document.content), [document.id, document.content]);
  const isGoogle = document.sourceType === "google_docs" || document.type === "google_docs";
  return isGoogle ? <GoogleDocumentFrame document={document} /> : <div className={`offline-editor ${editing ? "is-editing" : "is-reading"}`}>{editing ? <TextArea id="offline-document" labelText="Document content" hideLabel value={content} onChange={(event) => setContent(event.currentTarget.value)} onBlur={() => bridge.dispatch("document.updateContent", { id: document.id, content })} rows={20} /> : <div className="markdown-preview"><MarkdownContent value={content} /></div>}<div className="editor-footer"><span>{content.length} characters</span><Button kind="ghost" onClick={() => setEditing((value) => !value)} renderIcon={Edit}>{editing ? "Finish editing" : "Edit note"}</Button></div></div>;
}

function MarkdownContent({ value }: { value: string }) {
  const html = value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^[-*] (.*)$/gm, "<li>$1</li>").replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br />");
  return <div dangerouslySetInnerHTML={{ __html: html ? `<p>${html}</p>` : "<p class=\"muted-copy\">Nothing written yet.</p>" }} />;
}

function GoogleDocumentFrame({ document }: { document: DebateDocument }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [frameState, setFrameState] = useState<"loading" | "loaded" | "error">("loading");
  const [frameError, setFrameError] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const [nativeFrame, setNativeFrame] = useState(false);
  useEffect(() => {
    let disposed = false;
    let child: TauriWebview | undefined;
    let childCreated = false;
    let resizeObserver: ResizeObserver | undefined;
    let onResize: (() => void) | undefined;
    const mount = async () => {
      const internals = (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      if (!internals || !document.externalUrl || !hostRef.current) return;
      try {
        const [{ Webview }, { getCurrentWindow }, { LogicalPosition, LogicalSize }] = await Promise.all([import("@tauri-apps/api/webview"), import("@tauri-apps/api/window"), import("@tauri-apps/api/dpi")]);
        if (disposed || !hostRef.current) return;
        setNativeFrame(true);
        const shell = hostRef.current;
        const toolbar = shell.querySelector<HTMLElement>(".frame-toolbar");
        const layout = async () => {
          if (!child || !childCreated || !hostRef.current) return;
          const shellRect = hostRef.current.getBoundingClientRect();
          const toolbarRect = toolbar?.getBoundingClientRect();
          const top = toolbarRect?.bottom ?? shellRect.top;
          await child.setPosition(new LogicalPosition(shellRect.left, top));
          await child.setSize(new LogicalSize(shellRect.width, Math.max(240, shellRect.bottom - top)));
        };
        const label = `google-doc-${document.id.replace(/[^a-zA-Z0-9_/:.-]/g, "-")}`;
        const existing = await Webview.getByLabel(label);
        if (existing) await existing.close();
        const documentUrl = normalizeGoogleDocsUrl(document.externalUrl) ?? document.externalUrl;
        const webview = new Webview(getCurrentWindow(), label, { url: googleSignInUrl(documentUrl), x: 0, y: 0, width: 100, height: 100, focus: false, acceptFirstMouse: true });
        child = webview;
        await webview.once("tauri://created", async () => { if (!disposed) { childCreated = true; setFrameError(""); setFrameState("loaded"); await layout(); } });
        await webview.once("tauri://error", async (event) => { if (!disposed) { setNativeFrame(false); setFrameError(typeof event === "string" && event ? event : "The native webview could not load this URL."); setFrameState("error"); await webview.close().catch(() => undefined); } });
        resizeObserver = new ResizeObserver(() => void layout());
        resizeObserver.observe(shell);
        onResize = () => void layout();
        window.addEventListener("resize", onResize);
      } catch (error) {
        console.error("Unable to create native Google Docs webview", error);
        if (child) await child.hide().catch(() => undefined);
        if (!disposed) { setNativeFrame(false); setFrameError(error instanceof Error ? error.message : String(error)); setFrameState("error"); }
      }
    };
    void mount();
    return () => { disposed = true; resizeObserver?.disconnect(); if (onResize) window.removeEventListener("resize", onResize); if (child) void child.close(); };
  }, [document.externalUrl, document.id, frameKey]);
  const retry = () => { setFrameError(""); setFrameState("loading"); setNativeFrame(false); setFrameKey((key) => key + 1); };
  return <div ref={hostRef} className={`google-frame-shell ${nativeFrame ? "native-google-frame" : ""}`}><div className="frame-toolbar"><span>{frameState === "loading" ? "Loading Google Docs…" : frameState === "error" ? "The embedded view could not load" : "Google Docs"}</span>{frameState === "error" && <Button kind="ghost" size="sm" onClick={retry}>Retry</Button>}</div>{frameState === "error" && <p className="frame-error-detail">{frameError || "The embedded view reported a load failure. Use Retry or Open in browser to continue."}</p>}{!nativeFrame && <iframe key={frameKey} className="google-doc-frame" title={`Google Docs: ${document.name}`} src={document.externalUrl} allow="clipboard-read; clipboard-write" onLoad={() => setFrameState("loaded")} onError={() => { setFrameError("The browser frame reported a load failure."); setFrameState("error"); }} />}</div>;
}

function LinkDocumentModal({ open, document, onClose, bridge }: { open: boolean; document?: DebateDocument; onClose: () => void; bridge: EngineBridge }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [aiContext, setAiContext] = useState("");
  const [validationError, setValidationError] = useState("");
  useEffect(() => { if (open) { setName(document?.name ?? ""); setUrl(document?.externalUrl ?? ""); setAiContext(document?.content ?? ""); setValidationError(""); } }, [document?.id, open]);
  const editing = Boolean(document);
  return <Modal open={open} modalHeading={editing ? "Edit Google Doc link" : "Link a Google Doc"} primaryButtonText={editing ? "Save changes" : "Link document"} primaryButtonDisabled={!name.trim() || !url.trim()} secondaryButtonText="Cancel" onRequestClose={onClose} onRequestSubmit={() => { const normalized = normalizeGoogleDocsUrl(url); if (!normalized) { setValidationError("Enter a Google Docs document URL."); return; } bridge.dispatch(editing ? "document.updateGoogle" : "document.linkGoogle", { id: document?.id, name, url: normalized, aiContext }); setName(""); setUrl(""); setAiContext(""); onClose(); }}><TextInput id="google-doc-name" labelText="Document name" value={name} onChange={(event) => setName(event.currentTarget.value)} /><TextInput id="google-doc-url" labelText="Google Docs URL" invalid={Boolean(validationError)} invalidText={validationError} value={url} onChange={(event) => { setUrl(event.currentTarget.value); setValidationError(""); }} /><TextArea id="google-doc-context" labelText="Approved AI context (optional)" helperText="Paste only the text you want AI Coach to use." value={aiContext} onChange={(event) => setAiContext(event.currentTarget.value)} rows={6} /></Modal>;
}

function EvidencePage({ snapshot, bridge }: { snapshot: Snapshot; bridge: EngineBridge }) {
  const [newCard, setNewCard] = useState(false);
  const [editingCard, setEditingCard] = useState<EvidenceCard>();
  return <><PageHeader eyebrow="Research workspace" title="Evidence Library" description="Collect sources and keep cards ready for the next round." actions={<Button renderIcon={Add} onClick={() => { setEditingCard(undefined); setNewCard(true); }}>Add evidence</Button>} /><div className="card-grid">{snapshot.cards.length === 0 ? <EmptyState icon={FolderOpen} title="No evidence cards" description="Add a source, citation, and body text to build your library." /> : snapshot.cards.map((card) => <EvidenceTile card={card} key={card.id} bridge={bridge} onEdit={() => { setEditingCard(card); setNewCard(true); }} />)}</div><NewCardModal open={newCard} card={editingCard} onClose={() => { setNewCard(false); setEditingCard(undefined); }} bridge={bridge} /></>;
}

function EvidenceTile({ card, bridge, onEdit }: { card: EvidenceCard; bridge: EngineBridge; onEdit: () => void }) {
  return <Tile className="evidence-tile"><div className="evidence-heading"><h3>{card.title}</h3><OverflowMenu ariaLabel={`Actions for ${card.title}`}><OverflowMenuItem itemText="Edit" onClick={onEdit} /><OverflowMenuItem itemText="Keep private" onClick={() => bridge.dispatch("card.move", { id: card.id, folder: "private" })} /><OverflowMenuItem itemText="Share with team" onClick={() => bridge.dispatch("card.move", { id: card.id, folder: "team" })} /><OverflowMenuItem itemText="Share publicly" onClick={() => bridge.dispatch("card.move", { id: card.id, folder: "public" })} /><OverflowMenuItem itemText="Delete" isDelete onClick={() => { if (window.confirm(`Delete ${card.title}?`)) bridge.dispatch("card.delete", { id: card.id }); }} /></OverflowMenu></div><p>{card.text}</p>{card.sourceUrl && <a href={card.sourceUrl} target="_blank" rel="noreferrer">{card.sourceUrl}</a>}<div className="tile-footer"><Tag type={card.folder === "private" ? "gray" : "green"}>{card.folder === "private" ? "Private" : card.folder === "team" ? "Team" : "Public"}</Tag><span>{card.author || "Unattributed"}</span></div></Tile>;
}

function NewCardModal({ open, card, onClose, bridge }: { open: boolean; card?: EvidenceCard; onClose: () => void; bridge: EngineBridge }) {
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [text, setText] = useState("");
  const [folder, setFolder] = useState("private");
  useEffect(() => { if (open) { setTitle(card?.title ?? ""); setSourceUrl(card?.sourceUrl ?? ""); setText(card?.text ?? ""); setFolder(card?.folder ?? "private"); } }, [card?.id, open]);
  const editing = Boolean(card);
  return <Modal open={open} modalHeading={editing ? "Edit evidence card" : "Add evidence card"} primaryButtonText={editing ? "Save changes" : "Save card"} primaryButtonDisabled={!title.trim() || !text.trim()} secondaryButtonText="Cancel" onRequestClose={onClose} onRequestSubmit={() => { bridge.dispatch(editing ? "card.update" : "card.create", { id: card?.id, title, sourceUrl, text, folder }); onClose(); }}><TextInput id="card-title" labelText="Title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} /><TextInput id="card-source" labelText="Source website" value={sourceUrl} onChange={(event) => setSourceUrl(event.currentTarget.value)} /><Select id="card-folder" labelText="Workspace" value={folder} onChange={(event) => setFolder(event.currentTarget.value)}><SelectItem value="private" text="Private" /><SelectItem value="team" text="Team" /><SelectItem value="public" text="Public" /></Select><TextArea id="card-body" labelText="Evidence body" value={text} onChange={(event) => setText(event.currentTarget.value)} rows={8} /></Modal>;
}

function AiPage({ snapshot, bridge }: { snapshot: Snapshot; bridge: EngineBridge }) {
  const [message, setMessage] = useState("");
  const chat = snapshot.ai.chats.find((item) => item.id === snapshot.ai.activeChatId) ?? snapshot.ai.chats[0];
  const cited = new Set(snapshot.ai.citedDocIds ?? []);
  return <><PageHeader title="AI Coach" actions={<Button kind="ghost" renderIcon={Add} onClick={() => bridge.dispatch("ai.newChat")}>New chat</Button>} /><div className="ai-layout"><aside className="chat-list"><div className="chat-section-title">Chats</div>{snapshot.ai.chats.length === 0 && <p className="muted-copy">Start a chat to practice an argument.</p>}{snapshot.ai.chats.map((item) => <div className={`chat-row ${item.id === chat?.id ? "is-selected" : ""}`} key={item.id}><button className="chat-item" onClick={() => bridge.dispatch("ai.selectChat", { id: item.id })}>{item.title}</button><OverflowMenu ariaLabel={`Actions for ${item.title}`}><OverflowMenuItem itemText="Rename" onClick={() => { const title = window.prompt("Chat name", item.title); if (title?.trim()) bridge.dispatch("ai.renameChat", { id: item.id, title: title.trim() }); }} /><OverflowMenuItem itemText="Delete" isDelete onClick={() => { if (window.confirm(`Delete ${item.title}?`)) bridge.dispatch("ai.deleteChat", { id: item.id }); }} /></OverflowMenu></div>)}<div className="ai-context"><div className="chat-section-title">Approved context</div>{snapshot.documents.filter((doc) => doc.content.trim()).length === 0 ? <p className="muted-copy">Add AI context to a document first.</p> : snapshot.documents.filter((doc) => doc.content.trim()).map((doc) => <Checkbox key={doc.id} id={`context-${doc.id}`} labelText={doc.name} checked={cited.has(doc.id)} onChange={(_, { checked }) => bridge.dispatch("ai.toggleCitation", { id: doc.id, selected: checked })} />)}</div></aside><section className="chat-panel">{chat?.messages.length ? chat.messages.map((item, index) => <div className={`message ${item.role}`} key={`${item.timestamp}-${index}`}><span className="message-role">{item.role === "user" ? "You" : "AI Coach"}</span><p>{item.text}</p></div>) : <EmptyState icon={Chat} title="Start a coaching chat" description="Choose approved document context, then send a prompt." />}{snapshot.ai.loading && <InlineNotification kind="info" lowContrast title="AI Coach is thinking" hideCloseButton />}<div className="chat-composer"><TextArea id="ai-message" labelText="Message" hideLabel placeholder="Ask for a rebuttal drill..." value={message} onChange={(event) => setMessage(event.currentTarget.value)} rows={3} /><Button disabled={snapshot.ai.loading || !chat} onClick={() => { if (!message.trim()) return; bridge.dispatch("ai.sendMessage", { text: message.trim() }); setMessage(""); }}>Send</Button></div></section></div></>;
}

function HistoryPage({ snapshot, bridge }: { snapshot: Snapshot; bridge: EngineBridge }) {
  return <><PageHeader eyebrow="Review" title="History" description="Look back at rounds, notes, and results to guide the next practice session." /><div className="history-list">{snapshot.history.length === 0 ? <EmptyState icon={Time} title="No rounds recorded" description="Completed rounds will appear here." /> : snapshot.history.map((record) => <Tile className="history-row" key={record.id}><div><h3>{record.matchName || "Untitled round"}</h3><p>{record.opponentName && <>{record.opponentName} · </>}{new Date(record.timestamp).toLocaleDateString()}</p></div><Tag type={record.winLoss === "win" ? "green" : "gray"}>{record.winLoss || "Unmarked"}</Tag><OverflowMenu ariaLabel={`Actions for ${record.matchName || "round"}`}><OverflowMenuItem itemText="Delete" isDelete onClick={() => bridge.dispatch("history.delete", { id: record.id })} /></OverflowMenu></Tile>)}</div></>;
}

function SettingsPage({ snapshot, bridge }: { snapshot: Snapshot; bridge: EngineBridge }) {
  const [name, setName] = useState(snapshot.settings.userName);
  const [endpoint, setEndpoint] = useState(snapshot.settings.aiEndpoint);
  const [model, setModel] = useState(snapshot.settings.aiModel);
  const [apiKey, setApiKey] = useState("");
  const [turnUrl, setTurnUrl] = useState(snapshot.settings.turnServerUrl);
  const [turnUsername, setTurnUsername] = useState(snapshot.settings.turnUsername);
  const [turnCredential, setTurnCredential] = useState(snapshot.settings.turnCredential);
  const fileInput = useRef<HTMLInputElement>(null);
  const exportWorkspace = () => {
    const bundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      documents: snapshot.documents,
      cards: snapshot.cards,
      history: snapshot.history.map((record) => ({ ...record, speechOrder: [] })),
      aiChats: snapshot.ai.chats,
      settings: { userName: snapshot.settings.userName, aiEndpoint: snapshot.settings.aiEndpoint, aiModel: snapshot.settings.aiModel },
    };
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `dialektik-workspace-${new Date().toISOString().slice(0, 10)}.dialektik.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };
  const restoreWorkspace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>;
      bridge.dispatch("workspace.import", { data, strategy: "keepNewest" });
    } catch {
      window.alert("That workspace backup could not be read.");
    }
  };
  return <><PageHeader title="Settings" /><div className="settings-layout"><section className="settings-section"><h2>Profile</h2><TextInput id="user-name" labelText="Your name" value={name} onChange={(event) => setName(event.currentTarget.value)} onBlur={() => bridge.dispatch("settings.save", { userName: name })} /><p className="helper-text">This name is shown to teammates in a room.</p></section><section className="settings-section"><h2>AI Coach</h2><TextInput id="ai-endpoint" labelText="API endpoint" value={endpoint} onChange={(event) => setEndpoint(event.currentTarget.value)} onBlur={() => bridge.dispatch("settings.save", { aiEndpoint: endpoint })} /><TextInput id="ai-model" labelText="Model" value={model} onChange={(event) => setModel(event.currentTarget.value)} onBlur={() => bridge.dispatch("settings.save", { aiModel: model })} /><TextInput id="ai-key" type="password" labelText="API key" placeholder={snapshot.settings.hasAiKey ? "Saved securely" : "Not configured"} value={apiKey} onChange={(event) => setApiKey(event.currentTarget.value)} onBlur={() => apiKey && bridge.dispatch("settings.save", { aiApiKey: apiKey })} /><p className="helper-text">Keys are stored locally and are never included in workspace backups.</p></section><section className="settings-section"><h2>Round connections</h2><TextArea id="turn-server-url" labelText="TURN server URLs" helperText="One URL per line. Leave blank to use direct peer connections." value={turnUrl} onChange={(event) => setTurnUrl(event.currentTarget.value)} onBlur={() => bridge.dispatch("settings.save", { turnServerUrl: turnUrl })} rows={3} /><TextInput id="turn-username" labelText="TURN username" value={turnUsername} onChange={(event) => setTurnUsername(event.currentTarget.value)} onBlur={() => bridge.dispatch("settings.save", { turnUsername })} /><TextInput id="turn-credential" type="password" labelText="TURN credential" value={turnCredential} onChange={(event) => setTurnCredential(event.currentTarget.value)} onBlur={() => bridge.dispatch("settings.save", { turnCredential })} /><Toggle id="manual-document-sync" labelText="Manual document sync" labelA="Off" labelB="On" toggled={snapshot.settings.manualDocumentSync} onToggle={(toggled) => bridge.dispatch("settings.save", { manualDocumentSync: toggled })} /><Toggle id="join-request-notifications" labelText="Join request notifications" labelA="Off" labelB="On" toggled={snapshot.settings.joinRequestNotifications} onToggle={(toggled) => bridge.dispatch("settings.save", { joinRequestNotifications: toggled })} /></section><section className="settings-section"><h2>Workspace</h2><div className="settings-stat"><strong>{snapshot.documents.length}</strong><span>documents</span><strong>{snapshot.cards.length}</strong><span>evidence cards</span><strong>{snapshot.history.length}</strong><span>rounds</span></div><div className="workspace-actions"><Button kind="secondary" onClick={exportWorkspace}>Export workspace</Button><Button kind="tertiary" onClick={() => fileInput.current?.click()}>Restore backup</Button><input ref={fileInput} type="file" accept="application/json,.dialektik.json" hidden onChange={(event) => void restoreWorkspace(event)} /></div><p className="helper-text">Backups include workspace content and safe AI settings. API keys, TURN credentials, and sharing scopes are excluded.</p></section><section className="settings-section settings-danger"><h2>Reset</h2><p className="helper-text">Remove local workspace content while keeping your connection settings.</p><Button kind="danger--tertiary" onClick={() => { if (window.confirm("Reset all local documents, evidence, chats, and history?")) bridge.dispatch("workspace.reset", { preserveSettings: true }); }}>Reset workspace</Button></section><section className="settings-section"><h2>About</h2><p>Dialektik {__APP_VERSION__}</p><p className="muted-copy">Local-first debate preparation for student debaters.</p></section></div></>;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Document; title: string; description: string }) {
  return <div className="empty-state"><Icon size={32} /><h2>{title}</h2><p>{description}</p></div>;
}

export default App;
