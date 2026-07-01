import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { db, type DebateDocument, type EvidenceCard } from "../services/db";
import { PeerJSYjsProvider } from "../services/yjs-provider";
import * as Y from "yjs";
import { 
  FileText, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  Edit3, 
  Globe,
  Database,
  Copy,
  FolderOpen,
  Eye
} from "lucide-react";

async function computeSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export const Documents: React.FC = () => {
  const { isPeerConnected, mesh, isKeyDerived, session } = useApp();

  const [docs, setDocs] = useState<DebateDocument[]>([]);
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DebateDocument | null>(null);

  // Directory layout
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocFolder, setNewDocFolder] = useState<"private" | "team" | "public">("private");
  const [newDocMode, setNewDocMode] = useState<"read" | "write">("write");

  // Editor states
  const [editorName, setEditorName] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorMode, setEditorMode] = useState<"edit" | "read">("edit");

  // Evidence card form
  const [cardTitle, setCardTitle] = useState("");
  const [cardSource, setCardSource] = useState("");
  const [cardText, setCardText] = useState("");

  // Yjs Provider references
  const ydocRef = useRef<Y.Doc | null>(null);
  const yproviderRef = useRef<PeerJSYjsProvider | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  useEffect(() => {
    loadDocs();
    loadCards();
  }, []);

  async function loadDocs() {
    const allDocs = await db.documents.toArray();
    setDocs(allDocs);
    if (allDocs.length > 0 && !selectedDoc) {
      handleSelectDoc(allDocs[0]);
    }
    syncSharedDocs();
  }

  async function loadCards() {
    const allCards = await db.cards.toArray();
    setCards(allCards);
  }

  const syncSharedDocs = async () => {
    if (!isPeerConnected) return;
    try {
      const allDocs = await db.documents.toArray();
      for (const peerId of mesh.connections.keys()) {
        const myInfo = session?.debaters.find(d => d.id === mesh.peerId);
        const peerInfo = session?.debaters.find(d => d.id === peerId);
        const isSameTeam = myInfo && peerInfo && myInfo.team === peerInfo.team && myInfo.team !== undefined;
        
        const docsToSend = allDocs.filter(doc => {
          if (doc.partnerAccess === "public") return true;
          if (doc.partnerAccess === "team" && isSameTeam) return true;
          return false;
        });
        
        mesh.sendToPeer(peerId, {
          type: "shared-docs-sync",
          senderId: mesh.peerId,
          payload: docsToSend
        });
      }
    } catch (err) {
      console.error("Failed to sync shared docs:", err);
    }
  };

  // WebRTC shared documents sync handler
  useEffect(() => {
    if (!isPeerConnected) return;

    const handler = (_senderId: string, msg: any) => {
      if (msg.type === "shared-docs-sync") {
        const incomingDocs: DebateDocument[] = msg.payload;
        (async () => {
          let changed = false;
          for (const doc of incomingDocs) {
            const existing = await db.documents.get(doc.id);
            if (!existing) {
              await db.documents.put(doc);
              changed = true;
            } else if (doc.lastModified > existing.lastModified) {
              await db.documents.update(doc.id, {
                name: doc.name,
                content: doc.content,
                lastModified: doc.lastModified,
                partnerAccess: doc.partnerAccess,
                encryptedHash: doc.encryptedHash
              });
              changed = true;
            }
          }
          if (changed) {
            await loadDocs();
          }
        })();
      }
    };

    mesh.onMessage(handler);
    syncSharedDocs();
  }, [isPeerConnected, session]);

  // Handle Yjs real-time state synchronization
  useEffect(() => {
    if (!selectedDoc) return;

    // Clean up old provider
    if (yproviderRef.current) {
      yproviderRef.current.destroy();
      yproviderRef.current = null;
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }

    // Initialize new Yjs shared doc
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const ytext = ydoc.getText("content");
    // Seed initial content from selected document
    ytext.insert(0, selectedDoc.content);

    // Sync from local edit to Yjs
    const handleYjsUpdate = () => {
      if (isSyncingRef.current) return;
      setEditorContent(ytext.toString());
      db.documents.update(selectedDoc.id, { 
        content: ytext.toString(),
        lastModified: Date.now()
      });
    };
    ytext.observe(handleYjsUpdate);

    // Connect to WebRTC P2P Mesh for shared files
    // If it's a team or public folder and writable, sync changes
    const docFolder = selectedDoc.partnerAccess || "private";
    const isSharedWritable = docFolder !== "private" && (selectedDoc.encryptedHash !== "read"); // we use encryptedHash as mode string to bypass index limitation
    
    if (isPeerConnected && isSharedWritable) {
      const provider = new PeerJSYjsProvider(ydoc, mesh);
      yproviderRef.current = provider;
    }

    return () => {
      if (yproviderRef.current) yproviderRef.current.destroy();
      if (ydocRef.current) ydocRef.current.destroy();
    };
  }, [selectedDoc?.id, isPeerConnected]);

  const handleSelectDoc = (doc: DebateDocument) => {
    setSelectedDoc(doc);
    setEditorName(doc.name);
    setEditorContent(doc.content);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditorContent(val);

    if (ydocRef.current) {
      const ytext = ydocRef.current.getText("content");
      isSyncingRef.current = true;
      ydocRef.current.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, val);
      }, this);
      isSyncingRef.current = false;
    }

    if (selectedDoc) {
      db.documents.update(selectedDoc.id, { 
        content: val,
        lastModified: Date.now() 
      });
    }
  };

  const handleTitleBlur = () => {
    if (!selectedDoc || !editorName.trim()) return;
    db.documents.update(selectedDoc.id, { name: editorName });
    loadDocs();
  };

  // Create document in selected folder
  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim()) return;

    // Filter invalid title characters
    const cleanTitle = newDocTitle.trim().replace(/[\[\]#?/\\]/g, "");
    const filename = cleanTitle.endsWith(".md") ? cleanTitle : `${cleanTitle}.md`;

    const newDoc: DebateDocument = {
      id: `doc-${Math.random().toString(36).substring(2, 11)}`,
      name: filename,
      type: "case",
      content: "Type markdown content here...",
      lastModified: Date.now(),
      partnerAccess: newDocFolder, // store folder scope in partnerAccess
      encryptedHash: newDocMode // store sharing mode in encryptedHash
    };

    await db.documents.put(newDoc);
    setNewDocTitle("");
    await loadDocs();
    handleSelectDoc(newDoc);
  };

  // Move document
  const handleMoveDoc = async (folder: "private" | "team" | "public") => {
    if (!selectedDoc) return;
    await db.documents.update(selectedDoc.id, { partnerAccess: folder });
    await loadDocs();
    triggerToast(`Moved document to ${folder} folder.`);
  };

  // Toggle mode
  const handleToggleDocMode = async (mode: "read" | "write") => {
    if (!selectedDoc) return;
    await db.documents.update(selectedDoc.id, { encryptedHash: mode });
    await loadDocs();
    triggerToast(`Sharing mode updated to: ${mode === "write" ? "shared writable" : "shared read-only"}.`);
  };

  // Duplicate document
  const handleDuplicateDoc = async () => {
    if (!selectedDoc) return;
    const nameWithoutExt = selectedDoc.name.replace(".md", "");
    const newDoc: DebateDocument = {
      id: `doc-${Math.random().toString(36).substring(2, 11)}`,
      name: `${nameWithoutExt}_copy.md`,
      type: selectedDoc.type,
      content: selectedDoc.content,
      lastModified: Date.now(),
      partnerAccess: selectedDoc.partnerAccess || "private",
      encryptedHash: selectedDoc.encryptedHash || "write"
    };
    await db.documents.put(newDoc);
    await loadDocs();
    handleSelectDoc(newDoc);
    triggerToast("Document duplicated.");
  };

  // Delete document
  const handleDeleteDoc = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this document?")) {
      await db.documents.delete(id);
      setSelectedDoc(null);
      await loadDocs();
    }
  };

  // Mark as evidence
  const handleToggleEvidence = async () => {
    if (!selectedDoc) return;
    const nextStatus = selectedDoc.type === "case" ? "block" : "case"; // toggle type to mark as evidence
    await db.documents.update(selectedDoc.id, { type: nextStatus });
    await loadDocs();
    triggerToast(nextStatus === "block" ? "Marked as evidence." : "Removed from evidence.");
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardTitle || !cardText) return;

    const hash = await computeSHA256(cardText);
    const newCard: EvidenceCard = {
      id: `card-${hash.substring(0, 16)}`,
      title: cardTitle,
      sourceUrl: cardSource,
      text: cardText,
      hash,
      timestamp: Date.now(),
      author: "Local Partner",
      docId: selectedDoc?.id
    };

    await db.cards.put(newCard);
    setCardTitle("");
    setCardSource("");
    setCardText("");
    loadCards();
    triggerToast("Evidence card added.");
  };

  const handleDeleteCard = async (id: string) => {
    if (window.confirm("Delete this evidence card from library?")) {
      await db.cards.delete(id);
      loadCards();
    }
  };

  const triggerToast = (msg: string) => {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  };

  // Markdown rendering engine for wiki links and card embeds
  interface MarkdownRendererProps {
    content: string;
    cards: EvidenceCard[];
    docs: DebateDocument[];
    onNavigateDoc: (doc: DebateDocument) => void;
  }

  const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, cards, docs, onNavigateDoc }) => {
    // Regex matches [[folder/title]] or [[card-xxx]]
    const parts = content.split(/(\[\[[^\]]+\]\])/g);

    const renderInlineStyle = (text: string) => {
      let escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      escaped = escaped.replace(/__(.*?)__/g, "<strong>$1</strong>");
      escaped = escaped.replace(/\*(.*?)\*/g, "<em>$1</em>");
      escaped = escaped.replace(/_(.*?)_/g, "<em>$1</em>");
      escaped = escaped.replace(/`(.*?)`/g, "<code class='bg-slate-100 px-1 py-0.5 rounded font-mono text-[#2f5d62] text-[10px]'>$1</code>");

      return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
    };

    return (
      <div className="prose max-w-none text-slate-800 text-xs leading-relaxed font-sans p-6 bg-white rounded-xl min-h-[400px] border border-slate-300 space-y-4 shadow-2xs">
        {parts.map((part, index) => {
          const match = part.match(/\[\[([^\]]+)\]\]/);
          if (match) {
            const rawCitation = match[1].trim();

            // 1. Check if card citation
            if (rawCitation.startsWith("card-")) {
              const referencedCard = cards.find(c => c.id === rawCitation);
              if (referencedCard) {
                return (
                  <span key={index} className="inline-block group relative mx-0.5 align-middle select-none">
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-300 px-1.5 py-0.5 rounded cursor-help font-semibold text-[10px] hover:bg-emerald-100">
                      Cite: {referencedCard.title}
                    </span>
                    {/* Hover Card preview popover */}
                    <span className="absolute z-30 bottom-full left-0 mb-2 w-80 scale-0 group-hover:scale-100 transition-all origin-bottom-left bg-white border border-slate-350 p-4 rounded-xl shadow-2xl text-[10px] space-y-2 pointer-events-none text-slate-700">
                      <div className="flex items-center justify-between border-b pb-1.5">
                        <strong className="text-slate-900 font-bold">{referencedCard.title}</strong>
                        <span className="flex items-center gap-1 text-[9px] text-emerald-600 font-bold">
                          <ShieldCheck size={11} /> VERIFIED
                        </span>
                      </div>
                      <p className="text-slate-600 italic line-clamp-3">"{referencedCard.text}"</p>
                      <div className="flex items-center justify-between pt-1 text-[9px] text-slate-400">
                        <span className="font-mono">SHA-256: {referencedCard.hash.substring(0, 12)}...</span>
                        {referencedCard.sourceUrl && (
                          <span className="flex items-center gap-0.5 text-[#2f5d62]">Link</span>
                        )}
                      </div>
                    </span>
                  </span>
                );
              }
            }

            // 2. Check if wiki link [[folder/title]]
            const pathParts = rawCitation.split("/");
            if (pathParts.length === 2) {
              const folder = pathParts[0];
              const title = pathParts[1];
              const targetDoc = docs.find(d => (d.partnerAccess || "private") === folder && d.name.replace(".md", "") === title);

              if (targetDoc) {
                return (
                  <span key={index} className="inline-block group relative mx-0.5 align-middle select-none">
                    <button
                      type="button"
                      onClick={() => onNavigateDoc(targetDoc)}
                      className="bg-[#2f5d62]/10 text-[#2f5d62] border border-[#2f5d62]/20 px-1.5 py-0.5 rounded cursor-pointer font-semibold text-[10px] hover:bg-[#2f5d62]/20"
                    >
                      {title}
                    </button>
                    {/* Hover Wiki preview popover */}
                    <span className="absolute z-30 bottom-full left-0 mb-2 w-80 scale-0 group-hover:scale-100 transition-all origin-bottom-left bg-white border border-slate-350 p-4 rounded-xl shadow-2xl text-[10px] space-y-2 pointer-events-none text-slate-700">
                      <div className="flex items-center justify-between border-b pb-1.5">
                        <strong className="text-slate-900 font-bold">{targetDoc.name}</strong>
                        <span className="text-[9px] uppercase font-bold text-slate-400">{targetDoc.partnerAccess || "private"}</span>
                      </div>
                      <p className="text-slate-600 line-clamp-4 leading-relaxed font-mono text-[9px]">
                        {targetDoc.content.substring(0, 240)}...
                      </p>
                    </span>
                  </span>
                );
              }
            }

            // Fallback for missing link
            return (
              <span key={index} className="bg-rose-50 text-rose-700 border border-rose-300 px-1.5 py-0.5 rounded font-mono text-[10px] mx-0.5 align-middle">
                Missing Link: {rawCitation}
              </span>
            );
          }

          const lines = part.split("\n");
          return (
            <div key={index} className="inline space-y-2">
              {lines.map((line, lineIdx) => {
                if (line.startsWith("### ")) {
                  return <h3 key={lineIdx} className="text-xs font-bold text-slate-800 mt-4 mb-1.5 block">{renderInlineStyle(line.substring(4))}</h3>;
                }
                if (line.startsWith("## ")) {
                  return <h2 key={lineIdx} className="text-sm font-bold text-slate-900 mt-5 mb-2 border-b pb-1 block">{renderInlineStyle(line.substring(3))}</h2>;
                }
                if (line.startsWith("# ")) {
                  return <h1 key={lineIdx} className="text-base font-extrabold text-slate-900 mt-6 mb-3 block">{renderInlineStyle(line.substring(2))}</h1>;
                }
                if (line.startsWith("- ") || line.startsWith("* ")) {
                  return (
                    <ul key={lineIdx} className="list-disc list-inside pl-4 text-slate-600 my-1 block">
                      <li>{renderInlineStyle(line.substring(2))}</li>
                    </ul>
                  );
                }
                if (line.startsWith("> ")) {
                  return (
                    <blockquote key={lineIdx} className="border-l-2 border-slate-400 pl-4 italic text-slate-500 my-2 block">
                      {renderInlineStyle(line.substring(2))}
                    </blockquote>
                  );
                }
                if (!line.trim()) {
                  return <div key={lineIdx} className="h-2 block" />;
                }
                return <span key={lineIdx} className="block my-1">{renderInlineStyle(line)}</span>;
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // Group docs by folder
  const groupedDocs = docs.reduce<{ private: DebateDocument[]; team: DebateDocument[]; public: DebateDocument[] }>(
    (acc, doc) => {
      const folder = doc.partnerAccess || "private";
      if (folder === "private") acc.private.push(doc);
      else if (folder === "team") acc.team.push(doc);
      else if (folder === "public") acc.public.push(doc);
      return acc;
    },
    { private: [], team: [], public: [] }
  );

  return (
    <section className="documents-layout">
      {/* 1. Left Sidebar directory list */}
      <aside className="file-rail flex flex-col justify-between overflow-y-auto">
        <div className="space-y-4">
          <div className="panel-header compact border-b pb-2">
            <h2>Shared Folders</h2>
            <FolderOpen size={17} />
          </div>

          {/* New Document form */}
          <form onSubmit={handleCreateDoc} className="space-y-2 border-b pb-3">
            <input 
              value={newDocTitle} 
              onChange={(e) => setNewDocTitle(e.target.value)} 
              placeholder="New document title..."
              required
              className="text-xs py-1.5"
            />
            <div className={newDocFolder === "private" ? "mb-3" : "split-controls"}>
              <select 
                value={newDocFolder} 
                onChange={(e) => setNewDocFolder(e.target.value as any)}
                className="text-xs"
              >
                <option value="private">private</option>
                <option value="team">team</option>
                <option value="public">public</option>
              </select>
              {newDocFolder !== "private" && (
                <select 
                  value={newDocMode} 
                  onChange={(e) => setNewDocMode(e.target.value as any)}
                  className="text-xs"
                >
                  <option value="write">shared writable</option>
                  <option value="read">shared read-only</option>
                </select>
              )}
            </div>
            <button type="submit" className="command primary w-full text-xs py-1 flex items-center justify-center gap-1">
              <Plus size={13} /> Create File
            </button>
          </form>

          {/* Directory Folder Tree list */}
          {(["private", "team", "public"] as const).map(folder => (
            <div key={folder} className="folder-group">
              <span>{folder}</span>
              {groupedDocs[folder].length === 0 && (
                <div className="text-[10px] text-slate-400 italic px-2">Empty</div>
              )}
              {groupedDocs[folder].map(doc => (
                <button
                  type="button"
                  key={doc.id}
                  onClick={() => handleSelectDoc(doc)}
                  className={`file-item ${selectedDoc?.id === doc.id ? "selected" : ""}`}
                >
                  <FileText size={15} className="text-[#2f5d62]" />
                  <span>{doc.name}</span>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDoc(doc.id);
                    }}
                    className="hover:text-rose-600 p-0.5 opacity-60 hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Vault status block at bottom left of document tab */}
        <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg mt-auto space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700">
            <ShieldCheck size={13} className={isKeyDerived ? "text-emerald-600" : "text-rose-500"} />
            <span>Case Encryption Vault</span>
          </div>
          <p className="text-[9px] text-slate-500 leading-relaxed">
            {isKeyDerived ? "Decryption key derived. Private cases are secure." : "Vault is locked. Configure settings to unlock."}
          </p>
        </div>
      </aside>

      {/* 2. Middle Editor Section */}
      <section className="editor-pane">
        {selectedDoc ? (
          <>
            {/* Tool bar controls */}
            <div className="editor-toolbar border-b pb-2 gap-3 items-center">
              <input 
                value={editorName} 
                onChange={(e) => setEditorName(e.target.value)}
                onBlur={handleTitleBlur}
                className="font-bold border-b border-transparent focus:border-slate-300"
                placeholder="Rename file..."
              />
              
              <select
                value={selectedDoc.partnerAccess || "private"}
                onChange={(e) => handleMoveDoc(e.target.value as any)}
                className="text-xs"
              >
                <option value="private">private</option>
                <option value="team">team</option>
                <option value="public">public</option>
              </select>

              <select
                value={selectedDoc.encryptedHash || "write"}
                disabled={(selectedDoc.partnerAccess || "private") === "private"}
                onChange={(e) => handleToggleDocMode(e.target.value as any)}
                className="text-xs"
              >
                <option value="write">shared writable</option>
                <option value="read">shared read-only</option>
              </select>

              <button 
                type="button" 
                onClick={handleToggleEvidence}
                title={selectedDoc.type === "block" ? "Remove from evidence" : "Mark as evidence"}
                className={`icon-button ${selectedDoc.type === "block" ? "success" : ""}`}
              >
                <ShieldCheck size={16} />
              </button>

              <button 
                type="button" 
                onClick={handleDuplicateDoc}
                title="Duplicate file"
                className="icon-button"
              >
                <Copy size={16} />
              </button>

              <button 
                type="button" 
                onClick={() => handleDeleteDoc(selectedDoc.id)}
                title="Delete file"
                className="icon-button danger"
              >
                <Trash2 size={16} />
              </button>

              <div className="segmented document-mode ml-auto">
                <button 
                  type="button" 
                  className={editorMode === "edit" ? "selected" : ""} 
                  onClick={() => setEditorMode("edit")}
                >
                  <Edit3 size={12} className="inline mr-1" /> Edit
                </button>
                <button 
                  type="button" 
                  className={editorMode === "read" ? "selected" : ""} 
                  onClick={() => setEditorMode("read")}
                >
                  <Eye size={12} className="inline mr-1" /> Read
                </button>
              </div>
            </div>

            {/* Editing Box */}
            <div className="flex-1 min-h-0">
              {editorMode === "edit" ? (
                <textarea
                  value={editorContent}
                  onChange={handleContentChange}
                  placeholder="Type markdown contents... Cite evidence cards using [[card-sha256-id]] or wiki links [[folder/title]]."
                  className="w-full h-full min-h-[400px] p-6 focus:outline-none resize-none font-mono text-xs leading-relaxed"
                />
              ) : (
                <div className="h-full overflow-y-auto p-4 bg-slate-50">
                  <MarkdownRenderer 
                    content={editorContent} 
                    cards={cards} 
                    docs={docs} 
                    onNavigateDoc={handleSelectDoc}
                  />
                </div>
              )}
            </div>

            {/* Bottom Citation stats bar */}
            <div className="citation-bar text-[10px] text-slate-500 bg-slate-100 flex justify-between px-4 py-2 border-t">
              <span>Path: {selectedDoc.partnerAccess || "private"}/{selectedDoc.name.replace(".md", "")}</span>
              <span className="flex items-center gap-1">
                {isPeerConnected && selectedDoc.partnerAccess !== "private" ? (
                  <>
                    <Globe size={11} className="text-emerald-500" /> WebRTC live-sync active
                  </>
                ) : (
                  <>
                    <Database size={11} className="text-slate-400" /> Saved locally
                  </>
                )}
              </span>
            </div>
          </>
        ) : (
          <div className="empty-editor text-slate-400 text-xs">
            <FileText size={32} />
            <h1>No document selected</h1>
            <p>Create a file or select from the shared folders rail to begin.</p>
          </div>
        )}
      </section>

      {/* 3. Right Sidebar Evidence Library */}
      <aside className="w-80 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Cut Evidence Card</h3>
        </div>

        {/* Card Form */}
        <form onSubmit={handleAddCard} className="p-4 border-b border-slate-200 space-y-3 bg-slate-50/50">
          <input
            type="text"
            required
            value={cardTitle}
            onChange={(e) => setCardTitle(e.target.value)}
            placeholder="Citation (e.g. Smith 2024)"
            className="w-full text-xs"
          />
          <input
            type="url"
            value={cardSource}
            onChange={(e) => setCardSource(e.target.value)}
            placeholder="Source URL (Optional)"
            className="w-full text-xs"
          />
          <textarea
            required
            rows={3}
            value={cardText}
            onChange={(e) => setCardText(e.target.value)}
            placeholder="Evidence body text..."
            className="w-full text-xs resize-none"
          />
          <button type="submit" className="command primary w-full text-xs py-1.5 flex items-center justify-center gap-1">
            <Plus size={12} /> Add to Library
          </button>
        </form>

        {/* Cards List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evidence Cards</h4>
          {cards.map((card) => (
            <div key={card.id} className="bg-slate-50 border border-slate-200 p-3 rounded-lg space-y-2 relative group/card">
              <div className="flex items-center justify-between">
                <strong className="text-xs text-slate-800">{card.title}</strong>
                <button
                  onClick={() => handleDeleteCard(card.id)}
                  className="opacity-0 group-hover/card:opacity-100 text-slate-400 hover:text-rose-600 p-0.5 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <p className="text-[10px] text-slate-500 line-clamp-2">"{card.text}"</p>
              <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1 font-mono">
                <span>ID: <span className="text-[#2f5d62] font-bold select-all">[[{card.id}]]</span></span>
                {card.sourceUrl && (
                  <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#2f5d62]">
                    Source
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
};

export default Documents;
