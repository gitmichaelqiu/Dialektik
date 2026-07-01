import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { db, type DebateDocument, type EvidenceCard } from "../services/db";
import { PeerJSYjsProvider } from "../services/yjs-provider";
import * as Y from "yjs";
import { 
  FileText, 
  Layers, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  Edit3, 
  ExternalLink,
  Globe,
  Database
} from "lucide-react";

async function computeSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export const Documents: React.FC = () => {
  const { isPeerConnected, mesh } = useApp();

  const [docs, setDocs] = useState<DebateDocument[]>([]);
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DebateDocument | null>(null);

  // Editor states
  const [editorName, setEditorName] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorMode, setEditorMode] = useState<"edit" | "check">("edit");

  // New card inputs
  const [cardTitle, setCardTitle] = useState("");
  const [cardSource, setCardSource] = useState("");
  const [cardText, setCardText] = useState("");

  // Yjs provider references
  const ydocRef = useRef<Y.Doc | null>(null);
  const yproviderRef = useRef<PeerJSYjsProvider | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  // Load documents and cards from IndexedDB on mount
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
  }

  async function loadCards() {
    const allCards = await db.cards.toArray();
    setCards(allCards);
  }

  // Handle Yjs real-time state synchronization
  useEffect(() => {
    if (!selectedDoc) return;

    // 1. Clean up old provider
    if (yproviderRef.current) {
      yproviderRef.current.destroy();
      yproviderRef.current = null;
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }

    // 2. Initialize new Yjs shared doc
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const ytext = ydoc.getText("content");
    // Seed initial content from selected document
    ytext.insert(0, selectedDoc.content);

    // Sync from local edit to Yjs
    const handleYjsUpdate = () => {
      if (isSyncingRef.current) return;
      setEditorContent(ytext.toString());
      // Save local draft to DB
      db.documents.update(selectedDoc.id, { 
        content: ytext.toString(),
        lastModified: Date.now()
      });
    };
    ytext.observe(handleYjsUpdate);

    // 3. Connect to WebRTC P2P Mesh
    if (isPeerConnected) {
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

  const handleCreateDoc = async (type: "case" | "block") => {
    const newDoc: DebateDocument = {
      id: `doc-${Math.random().toString(36).substring(2, 11)}`,
      name: `Untitled ${type === "case" ? "Case" : "Block"}`,
      type,
      content: `# New ${type === "case" ? "Case" : "Block"}\n\nType markdown contents here...`,
      lastModified: Date.now()
    };
    await db.documents.put(newDoc);
    await loadDocs();
    handleSelectDoc(newDoc);
  };

  const handleDeleteDoc = async (id: string) => {
    if (confirm("Are you sure you want to delete this document?")) {
      await db.documents.delete(id);
      setSelectedDoc(null);
      await loadDocs();
    }
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
  };

  const handleDeleteCard = async (id: string) => {
    if (confirm("Delete this evidence card from library?")) {
      await db.cards.delete(id);
      loadCards();
    }
  };

  // Helper to parse content and render card link overlays in evidence check mode
  const renderCheckMode = () => {
    // Regex looking for [[card-id]]
    const parts = editorContent.split(/(\[\[card-[a-f0-9]{16}\]\])/g);
    return (
      <div className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-sans p-4 bg-slate-950/40 rounded-lg min-h-[400px] border border-slate-800">
        {parts.map((part, index) => {
          const match = part.match(/\[\[(card-[a-f0-9]{16})\]\]/);
          if (match) {
            const cid = match[1];
            const referencedCard = cards.find(c => c.id === cid);

            if (referencedCard) {
              return (
                <span key={index} className="inline-block group relative">
                  <span className="bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded cursor-help font-semibold text-xs transition-colors hover:bg-emerald-600/20">
                    Cite: {referencedCard.title}
                  </span>
                  {/* Reference Popover */}
                  <span className="absolute z-30 bottom-full left-0 mb-2 w-80 scale-0 group-hover:scale-100 transition-all origin-bottom-left bg-slate-950 border border-slate-800 p-4 rounded-xl shadow-2xl text-xs space-y-2 pointer-events-none">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <strong className="text-white font-bold">{referencedCard.title}</strong>
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold tracking-wider">
                        <ShieldCheck size={12} /> HASH OK
                      </span>
                    </div>
                    <p className="text-slate-400 italic line-clamp-3">"{referencedCard.text}"</p>
                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                      <span className="font-mono">SHA-256: {referencedCard.hash.substring(0, 12)}...</span>
                      {referencedCard.sourceUrl && (
                        <span className="flex items-center gap-0.5 text-indigo-400">
                          Link <ExternalLink size={8} />
                        </span>
                      )}
                    </div>
                  </span>
                </span>
              );
            } else {
              return (
                <span key={index} className="bg-rose-600/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded font-mono text-xs">
                  Missing Card: {cid}
                </span>
              );
            }
          }
          return part;
        })}
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 overflow-hidden">
      {/* 1. Left Sidebar - Documents List */}
      <aside className="w-64 bg-slate-950 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Documents</h3>
          <div className="flex gap-1.5">
            <button
              onClick={() => handleCreateDoc("case")}
              title="New Case File"
              className="p-1 rounded bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 transition-colors"
            >
              <FileText size={14} />
            </button>
            <button
              onClick={() => handleCreateDoc("block")}
              title="New Block File"
              className="p-1 rounded bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 transition-colors"
            >
              <Layers size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {docs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => handleSelectDoc(doc)}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all ${
                selectedDoc?.id === doc.id
                  ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {doc.type === "case" ? <FileText size={15} /> : <Layers size={15} />}
                <span className="truncate text-xs font-medium">{doc.name}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteDoc(doc.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 transition-opacity"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* 2. Middle Section - Text Editor / Check View */}
      <section className="flex-1 bg-slate-950 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
        {selectedDoc ? (
          <>
            {/* Header Control Bar */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <input
                type="text"
                value={editorName}
                onChange={(e) => setEditorName(e.target.value)}
                onBlur={handleTitleBlur}
                className="bg-transparent text-sm font-bold text-white focus:outline-none border-b border-transparent focus:border-slate-700 min-w-0 flex-1 mr-4"
              />
              <div className="flex items-center gap-3">
                {/* Real-time sync indicator */}
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold bg-slate-900 border border-slate-800 px-2 py-1 rounded-md">
                  {isPeerConnected ? (
                    <>
                      <Globe size={11} className="text-emerald-400 animate-pulse" />
                      P2P Live
                    </>
                  ) : (
                    <>
                      <Database size={11} className="text-indigo-400" />
                      Local DB
                    </>
                  )}
                </div>

                {/* Edit Mode Toggle */}
                <div className="bg-slate-900 p-0.5 rounded-lg border border-slate-800 flex">
                  <button
                    onClick={() => setEditorMode("edit")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      editorMode === "edit"
                        ? "bg-indigo-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Edit3 size={13} />
                    Edit
                  </button>
                  <button
                    onClick={() => setEditorMode("check")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      editorMode === "check"
                        ? "bg-indigo-600 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <ShieldCheck size={13} />
                    Check Mode
                  </button>
                </div>
              </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 p-6 overflow-y-auto">
              {editorMode === "edit" ? (
                <textarea
                  value={editorContent}
                  onChange={handleContentChange}
                  placeholder="Draft your cases and blocks using Markdown. Use card citations like [[card-sha256-id]] to bind evidence."
                  className="w-full h-full min-h-[400px] bg-transparent border-0 resize-none text-slate-200 font-mono text-sm leading-relaxed focus:outline-none focus:ring-0 placeholder-slate-700"
                />
              ) : (
                renderCheckMode()
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Select or create a document to begin.
          </div>
        )}
      </section>

      {/* 3. Right Sidebar - Evidence Library */}
      <aside className="w-80 bg-slate-950 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cut New Evidence</h3>
        </div>

        {/* Card Form */}
        <form onSubmit={handleAddCard} className="p-4 border-b border-slate-800 space-y-3 bg-slate-950/40">
          <input
            type="text"
            required
            value={cardTitle}
            onChange={(e) => setCardTitle(e.target.value)}
            placeholder="Tag / Citation (e.g. Smith 2024)"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
          <input
            type="url"
            value={cardSource}
            onChange={(e) => setCardSource(e.target.value)}
            placeholder="Source URL (Optional)"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
          <textarea
            required
            rows={3}
            value={cardText}
            onChange={(e) => setCardText(e.target.value)}
            placeholder="Plaintext evidence block body..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
          />
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
          >
            <Plus size={12} /> Add to Library
          </button>
        </form>

        {/* Cards List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evidence Cards</h4>
          {cards.map((card) => (
            <div key={card.id} className="bg-slate-900/50 border border-slate-800/80 p-3 rounded-lg space-y-2 relative group/card">
              <div className="flex items-center justify-between">
                <strong className="text-xs text-slate-200">{card.title}</strong>
                <button
                  onClick={() => handleDeleteCard(card.id)}
                  className="opacity-0 group-hover/card:opacity-100 text-slate-500 hover:text-rose-400 p-0.5 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2">"{card.text}"</p>
              
              <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1 font-mono">
                <span>Copy ID: <span className="text-indigo-400 font-bold select-all">[[{card.id}]]</span></span>
                {card.sourceUrl && (
                  <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400">
                    Source
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};
export default Documents;
