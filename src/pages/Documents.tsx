import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { db, type DebateDocument, type EvidenceCard } from "../services/db";
import { liveQuery } from "dexie";
import { PeerJSYjsProvider } from "../services/yjs-provider";
import * as Y from "yjs";
import { 
  FileText, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  Globe,
  Database,
  Copy,
  FolderOpen
} from "lucide-react";
import { 
  Button, 
  Card, 
  TextInput, 
  Textarea,
  Text, 
  Stack, 
  Group, 
  Select,
  SegmentedControl,
  Paper, 
  Badge, 
  Title, 
  Grid,
  ScrollArea,
  ActionIcon,
  Modal,
  Notification,
  HoverCard,
  NavLink
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

async function computeSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface RemoteCursor {
  docId: string;
  name: string;
  caret: number;
  updatedAt: number;
}

export const Documents: React.FC = () => {
  const { isPeerConnected, mesh, session, userId, userName } = useApp();
  const isMobile = useMediaQuery("(max-width: 48em)");

  const [docs, setDocs] = useState<DebateDocument[]>([]);
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DebateDocument | null>(null);

  // Directory layout
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocFolder, setNewDocFolder] = useState<string>("private");
  const [newDocMode, setNewDocMode] = useState<string>("write");

  // Editor states
  const [editorName, setEditorName] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorMode, setEditorMode] = useState<"edit" | "read">("edit");
  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const editorModeRef = useRef(editorMode);
  const [linkMenu, setLinkMenu] = useState<{ visible: boolean; query: string; start: number; end: number; top: number }>({
    visible: false,
    query: "",
    start: 0,
    end: 0,
    top: 40
  });
  const [pendingDelete, setPendingDelete] = useState<{ type: "document" | "card"; id: string; label: string } | null>(null);
  const [toastNotification, setToastNotification] = useState<string | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});

  // Evidence card form
  const [cardTitle, setCardTitle] = useState("");
  const [cardSource, setCardSource] = useState("");
  const [cardText, setCardText] = useState("");

  // Yjs Provider references
  const ydocRef = useRef<Y.Doc | null>(null);
  const yproviderRef = useRef<PeerJSYjsProvider | null>(null);
  const isSyncingRef = useRef<boolean>(false);
  const syncSnapshotTimerRef = useRef<number | null>(null);

  useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);

  useEffect(() => {
    loadCards();

    const subscription = liveQuery(() => db.documents.toArray()).subscribe({
      next: (allDocs) => {
        setDocs(allDocs);
        setSelectedDoc(current => {
          if (!current) {
            const firstDoc = allDocs[0];
            if (firstDoc) {
              setEditorName(firstDoc.name);
              setEditorContent(firstDoc.content);
              return firstDoc;
            }
            return null;
          }

          const refreshed = allDocs.find(doc => doc.id === current.id);
          if (!refreshed) {
            setEditorName("");
            setEditorContent("");
            return null;
          }

          setEditorName(refreshed.name);
          const isEditingCurrentDoc = editorModeRef.current === "edit" && document.activeElement === editorRef.current;
          if (!isEditingCurrentDoc) {
            setEditorContent(refreshed.content);
          }
          return refreshed;
        });
      },
      error: (err) => console.error("Failed to subscribe to documents:", err)
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadDocs() {
    const allDocs = await db.documents.toArray();
    setDocs(allDocs);
    if (selectedDoc) {
      const refreshed = allDocs.find(doc => doc.id === selectedDoc.id);
      if (refreshed) {
        setSelectedDoc(refreshed);
        setEditorName(refreshed.name);
        setEditorContent(refreshed.content);
      }
    } else if (allDocs.length > 0) {
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
        const myInfo = session?.debaters.find(d => d.connectionId === mesh.peerId);
        const peerInfo = session?.debaters.find(d => d.connectionId === peerId);
        const isSameTeam = myInfo && peerInfo && myInfo.team === peerInfo.team && myInfo.team !== undefined;
        
        const ownedSharedDocs = allDocs.filter(doc => (!doc.ownerId || doc.ownerId === userId) && doc.partnerAccess !== "private");
        const canPeerSeeDoc = (doc: DebateDocument) => {
          if (doc.partnerAccess === "public") return true;
          if (doc.partnerAccess === "team" && isSameTeam) return true;
          return false;
        };
        const docsToSend = ownedSharedDocs.filter(canPeerSeeDoc);
        const removeIds = ownedSharedDocs.filter(doc => !canPeerSeeDoc(doc)).map(doc => doc.id);
        
        mesh.sendToPeer(peerId, {
          type: "shared-docs-sync",
          senderId: mesh.peerId,
          payload: { docs: docsToSend, removeIds }
        });
      }
    } catch (err) {
      console.error("Failed to sync shared docs:", err);
    }
  };

  const broadcastDocumentSnapshot = (doc: DebateDocument) => {
    if (!isPeerConnected || (doc.partnerAccess || "private") === "private") return;
    if (!isDocumentOwner(doc)) return;
    if (syncSnapshotTimerRef.current) {
      window.clearTimeout(syncSnapshotTimerRef.current);
    }
    syncSnapshotTimerRef.current = window.setTimeout(() => {
      syncSnapshotTimerRef.current = null;
      syncSharedDocs();
    }, 180);
  };

  useEffect(() => {
    if (!isPeerConnected) return;

    const handler = (_senderId: string, msg: any) => {
      if (msg.type === "shared-docs-sync") {
        const incomingDocs: DebateDocument[] = Array.isArray(msg.payload) ? msg.payload : msg.payload?.docs || [];
        const removeIds: string[] = Array.isArray(msg.payload) ? [] : msg.payload?.removeIds || [];
        (async () => {
          let changed = false;
          for (const id of removeIds) {
            const existing = await db.documents.get(id);
            if (existing && existing.ownerId !== userId) {
              await db.documents.delete(id);
              changed = true;
            }
          }
          for (const doc of incomingDocs) {
            const existing = await db.documents.get(doc.id);
            if (existing?.ownerId === userId) continue;
            if (!existing) {
              await db.documents.put(doc);
              changed = true;
            } else if (doc.lastModified > existing.lastModified) {
              await db.documents.update(doc.id, {
                name: doc.name,
                content: doc.content,
                lastModified: doc.lastModified,
                partnerAccess: doc.partnerAccess,
                encryptedHash: doc.encryptedHash,
                ownerId: doc.ownerId,
                ownerName: doc.ownerName
              });
              changed = true;
            }
          }
          if (changed) {
            setDocs(await db.documents.toArray());
          }
        })();
      } else if (msg.type === "doc-cursor" && msg.payload?.docId && _senderId !== mesh.peerId) {
        setRemoteCursors(prev => ({
          ...prev,
          [_senderId]: {
            docId: msg.payload.docId,
            name: msg.payload.name || "Partner",
            caret: Number(msg.payload.caret || 0),
            updatedAt: Date.now()
          }
        }));
      }
    };

    const unsubscribeMessage = mesh.onMessage(handler);
    const unsubscribeConnect = mesh.onConnectionOpen(() => {
      syncSharedDocs();
    });
    syncSharedDocs();
    return () => {
      if (syncSnapshotTimerRef.current) {
        window.clearTimeout(syncSnapshotTimerRef.current);
      }
      unsubscribeMessage();
      unsubscribeConnect();
    };
  }, [isPeerConnected, session, userId]);

  useEffect(() => {
    if (!selectedDoc) return;

    if (yproviderRef.current) {
      yproviderRef.current.destroy();
      yproviderRef.current = null;
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const ytext = ydoc.getText("content");
    ytext.insert(0, selectedDoc.content);

    const handleYjsUpdate = () => {
      if (isSyncingRef.current) return;
      const nextContent = ytext.toString();
      const nextDoc = { ...selectedDoc, content: nextContent, lastModified: Date.now() };
      setEditorContent(nextContent);
      setSelectedDoc(nextDoc);
      setDocs(prev => prev.map(doc => doc.id === selectedDoc.id ? nextDoc : doc));
      db.documents.update(selectedDoc.id, { 
        content: nextContent,
        lastModified: nextDoc.lastModified
      });
      broadcastDocumentSnapshot(nextDoc);
    };
    ytext.observe(handleYjsUpdate);

    const docFolder = selectedDoc.partnerAccess || "private";
    const isSharedWritable = docFolder !== "private" && (selectedDoc.encryptedHash !== "read");
    
    if (isPeerConnected && isSharedWritable) {
      const provider = new PeerJSYjsProvider(ydoc, mesh, selectedDoc.id);
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

  const isDocumentOwner = (doc: DebateDocument | null) => {
    return !doc?.ownerId || doc.ownerId === userId;
  };

  const isSelectedDocWritable = () => {
    if (!selectedDoc) return false;
    return isDocumentOwner(selectedDoc) || selectedDoc.encryptedHash !== "read";
  };

  const persistEditorContent = (val: string) => {
    setEditorContent(val);

    if (ydocRef.current) {
      const ytext = ydocRef.current.getText("content");
      isSyncingRef.current = true;
      ydocRef.current.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, val);
      }, "local-editor");
      isSyncingRef.current = false;
    }

    if (selectedDoc) {
      const nextDoc = { ...selectedDoc, content: val, lastModified: Date.now() };
      db.documents.update(selectedDoc.id, { 
        content: val,
        lastModified: nextDoc.lastModified 
      });
      setSelectedDoc(nextDoc);
      setDocs(prev => prev.map(doc => doc.id === selectedDoc.id ? nextDoc : doc));
      broadcastDocumentSnapshot(nextDoc);
    }
  };

  const getWikiTrigger = (value: string, caret: number) => {
    const beforeCaret = value.slice(0, caret);
    const start = beforeCaret.lastIndexOf("[[");
    if (start === -1) return null;
    const closeBeforeCaret = beforeCaret.lastIndexOf("]]");
    if (closeBeforeCaret > start) return null;
    const end = value.slice(caret, caret + 2) === "]]" ? caret + 2 : caret;
    const query = value.slice(start + 2, caret);
    if (query.includes("\n")) return null;
    return { start, end, query };
  };

  const updateLinkMenu = (value: string, caret: number) => {
    const trigger = getWikiTrigger(value, caret);
    if (!trigger) {
      setLinkMenu(menu => ({ ...menu, visible: false }));
      return;
    }
    const textarea = editorRef.current;
    const lineHeight = 19.2;
    const paddingTop = 16;
    const menuHeight = 220;
    let top = 40;
    if (textarea) {
      const currentLine = value.slice(0, caret).split("\n").length - 1;
      const lineTop = paddingTop + currentLine * lineHeight - textarea.scrollTop;
      const belowTop = lineTop + lineHeight + 8;
      const aboveTop = lineTop - menuHeight - 8;
      top = belowTop + menuHeight < textarea.clientHeight ? belowTop : Math.max(8, aboveTop);
    }
    setLinkMenu({ visible: true, query: trigger.query, start: trigger.start, end: trigger.end, top });
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let val = e.target.value;
    let caret = e.target.selectionStart;
    const justTypedWikiOpen = val.slice(caret - 2, caret) === "[[" && editorContent.slice(caret - 2, caret) !== "[[";

    if (justTypedWikiOpen) {
      val = `${val.slice(0, caret)}]]${val.slice(caret)}`;
      requestAnimationFrame(() => editorRef.current?.setSelectionRange(caret, caret));
    }

    persistEditorContent(val);
    updateLinkMenu(val, caret);
  };

  const handleEditorSelect = () => {
    const textarea = editorRef.current;
    if (!textarea) return;
    updateLinkMenu(textarea.value, textarea.selectionStart);
    if (!selectedDoc || selectedDoc.partnerAccess === "private" || !isPeerConnected) return;
    mesh.broadcast({
      type: "doc-cursor",
      senderId: mesh.peerId,
      payload: {
        docId: selectedDoc.id,
        name: userName || "Partner",
        caret: textarea.selectionStart
      }
    });
  };

  const getLineFromCaret = (caret: number) => {
    return editorContent.slice(0, Math.max(0, caret)).split("\n").length - 1;
  };

  const insertWikiLink = (doc: DebateDocument) => {
    const title = doc.name.replace(/\.md$/i, "");
    const mention = `[[${doc.partnerAccess || "private"}/${title}]]`;
    const nextContent = `${editorContent.slice(0, linkMenu.start)}${mention}${editorContent.slice(linkMenu.end)}`;
    const nextCaret = linkMenu.start + mention.length;
    persistEditorContent(nextContent);
    setLinkMenu(menu => ({ ...menu, visible: false }));
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const insertCardLink = (card: EvidenceCard) => {
    const mention = `[[${card.id}]]`;
    const nextContent = `${editorContent.slice(0, linkMenu.start)}${mention}${editorContent.slice(linkMenu.end)}`;
    const nextCaret = linkMenu.start + mention.length;
    persistEditorContent(nextContent);
    setLinkMenu(menu => ({ ...menu, visible: false }));
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleTitleBlur = () => {
    if (!selectedDoc || !editorName.trim()) return;
    const cleanTitle = editorName.trim().replace(/[\[\]#?/\\]/g, "");
    const requestedName = cleanTitle.endsWith(".md") ? cleanTitle : `${cleanTitle}.md`;
    const nextName = getAvailableFilename(requestedName, selectedDoc.id);
    const nextDoc = { ...selectedDoc, name: nextName, lastModified: Date.now() };
    setSelectedDoc(nextDoc);
    setDocs(prev => prev.map(doc => doc.id === selectedDoc.id ? nextDoc : doc));
    setEditorName(nextName);
    db.documents.update(selectedDoc.id, { name: nextName, lastModified: nextDoc.lastModified });
    broadcastDocumentSnapshot(nextDoc);
    loadDocs();
  };

  const getAvailableFilename = (requestedName: string, currentDocId?: string) => {
    const extension = requestedName.toLowerCase().endsWith(".md") ? ".md" : "";
    const baseName = (extension ? requestedName.slice(0, -3) : requestedName).trim() || "Untitled";
    const existing = new Set(
      docs
        .filter(doc => doc.id !== currentDocId)
        .map(doc => doc.name.toLowerCase())
    );

    let candidate = `${baseName}.md`;
    let index = 2;
    while (existing.has(candidate.toLowerCase())) {
      candidate = `${baseName}_${index}.md`;
      index += 1;
    }
    return candidate;
  };

  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim()) return;

    const cleanTitle = newDocTitle.trim().replace(/[\[\]#?/\\]/g, "");
    const filename = getAvailableFilename(cleanTitle.endsWith(".md") ? cleanTitle : `${cleanTitle}.md`);

    const newDoc: DebateDocument = {
      id: `doc-${Math.random().toString(36).substring(2, 11)}`,
      name: filename,
      type: "case",
      content: "",
      lastModified: Date.now(),
      partnerAccess: newDocFolder as any,
      encryptedHash: newDocMode,
      ownerId: userId,
      ownerName: userName || "Local Partner"
    };

    await db.documents.put(newDoc);
    setNewDocTitle("");
    await loadDocs();
    broadcastDocumentSnapshot(newDoc);
    handleSelectDoc(newDoc);
  };

  const handleMoveDoc = async (folder: "private" | "team" | "public") => {
    if (!selectedDoc) return;
    if (!isDocumentOwner(selectedDoc)) {
      triggerToast("Only the owner can change document sharing.");
      return;
    }
    const nextDoc = { ...selectedDoc, partnerAccess: folder, lastModified: Date.now() };
    setSelectedDoc(nextDoc);
    setDocs(prev => prev.map(doc => doc.id === selectedDoc.id ? nextDoc : doc));
    await db.documents.update(selectedDoc.id, { partnerAccess: folder, lastModified: nextDoc.lastModified });
    await loadDocs();
    syncSharedDocs();
    triggerToast(`Moved document to ${folder} folder.`);
  };

  const handleToggleDocMode = async (mode: "read" | "write") => {
    if (!selectedDoc) return;
    if (!isDocumentOwner(selectedDoc)) {
      triggerToast("Only the owner can change writable settings.");
      return;
    }
    const nextDoc = { ...selectedDoc, encryptedHash: mode, lastModified: Date.now() };
    setSelectedDoc(nextDoc);
    setDocs(prev => prev.map(doc => doc.id === selectedDoc.id ? nextDoc : doc));
    await db.documents.update(selectedDoc.id, { encryptedHash: mode, lastModified: nextDoc.lastModified });
    await loadDocs();
    syncSharedDocs();
    triggerToast(`Sharing mode updated to: ${mode === "write" ? "shared writable" : "shared read-only"}.`);
  };

  const handleDuplicateDoc = async () => {
    if (!selectedDoc) return;
    const nameWithoutExt = selectedDoc.name.replace(".md", "");
    const newDoc: DebateDocument = {
      id: `doc-${Math.random().toString(36).substring(2, 11)}`,
      name: getAvailableFilename(`${nameWithoutExt}_copy.md`),
      type: selectedDoc.type,
      content: selectedDoc.content,
      lastModified: Date.now(),
      partnerAccess: selectedDoc.partnerAccess || "private",
      encryptedHash: selectedDoc.encryptedHash || "write",
      ownerId: userId,
      ownerName: userName || "Local Partner"
    };
    await db.documents.put(newDoc);
    await loadDocs();
    broadcastDocumentSnapshot(newDoc);
    handleSelectDoc(newDoc);
    triggerToast("Document duplicated.");
  };

  const requestDeleteDoc = (doc: DebateDocument) => {
    setPendingDelete({ type: "document", id: doc.id, label: doc.name.replace(/\.md$/i, "") });
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === "document") {
      await db.documents.delete(pendingDelete.id);
      setSelectedDoc(null);
      await loadDocs();
      syncSharedDocs();
      triggerToast("Document deleted.");
    } else {
      await db.cards.delete(pendingDelete.id);
      await loadCards();
      triggerToast("Evidence card deleted.");
    }
    setPendingDelete(null);
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
    const card = cards.find(item => item.id === id);
    setPendingDelete({ type: "card", id, label: card?.title || "Evidence card" });
  };

  const triggerToast = (msg: string) => {
    setToastNotification(msg);
    setTimeout(() => setToastNotification(null), 2500);
  };

  interface MarkdownRendererProps {
    content: string;
    cards: EvidenceCard[];
    docs: DebateDocument[];
    onNavigateDoc: (doc: DebateDocument) => void;
  }

  const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, cards, docs, onNavigateDoc }) => {
    const markdownContent = content.replace(/\[\[([^\]]+)\]\]/g, (_match, rawCitation: string) => {
      const citation = rawCitation.trim();
      const label = citation.startsWith("card-")
        ? cards.find(card => card.id === citation)?.title || citation
        : docs.find(doc => {
          const [folder, title] = citation.split("/");
          return (doc.partnerAccess || "private") === folder && doc.name.replace(/\.md$/i, "") === title;
        })?.name.replace(/\.md$/i, "") || citation;
      return `[${label}](dialektik-citation:${encodeURIComponent(citation)})`;
    });

    const renderCitation = (rawCitation: string) => {
      if (rawCitation.startsWith("card-")) {
        const referencedCard = cards.find(c => c.id === rawCitation);
        if (!referencedCard) {
          return <Badge color="red" variant="light" size="xs" component="span">Missing Link: {rawCitation}</Badge>;
        }

        const linkedDoc = referencedCard.docId ? docs.find(doc => doc.id === referencedCard.docId) : null;

        return (
          <HoverCard width={320} shadow="md">
            <HoverCard.Target>
              <Text
                component="button"
                type="button"
                size="sm"
                c="teal"
                td="underline"
                onClick={(event) => {
                  event.preventDefault();
                  if (linkedDoc) onNavigateDoc(linkedDoc);
                }}
                style={{ border: 0, padding: "1px 4px", background: "var(--mantine-color-teal-0)", borderRadius: "var(--mantine-radius-xs)", cursor: linkedDoc ? "pointer" : "help", verticalAlign: "baseline" }}
              >
                {referencedCard.title}
              </Text>
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Stack gap="xs">
                <Group justify="space-between" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", paddingBottom: 4 }}>
                  <Text fw={700} size="xs">{referencedCard.title}</Text>
                  <Badge color="teal" variant="light" size="xs" leftSection={<ShieldCheck size={11} />}>Verified</Badge>
                </Group>
                <Text size="xs" fs="italic">"{referencedCard.text}"</Text>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">SHA-256: {referencedCard.hash.substring(0, 12)}...</Text>
                  {referencedCard.sourceUrl && <Text size="xs" c="teal">Link</Text>}
                </Group>
                {linkedDoc && <Text size="xs" c="dimmed">Click to open {linkedDoc.name.replace(/\.md$/i, "")}.</Text>}
              </Stack>
            </HoverCard.Dropdown>
          </HoverCard>
        );
      }

      const pathParts = rawCitation.split("/");
      if (pathParts.length === 2) {
        const folder = pathParts[0];
        const title = pathParts[1];
        const targetDoc = docs.find(d => (d.partnerAccess || "private") === folder && d.name.replace(".md", "") === title);

        if (targetDoc) {
          return (
            <HoverCard width={320} shadow="md">
              <HoverCard.Target>
                <Text
                  component="button"
                  type="button"
                  size="sm"
                  c="teal"
                  td="underline"
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigateDoc(targetDoc);
                  }}
                  style={{ border: 0, padding: "1px 4px", background: "var(--mantine-color-teal-0)", borderRadius: "var(--mantine-radius-xs)", cursor: "pointer", verticalAlign: "baseline" }}
                >
                  {targetDoc.name.replace(/\.md$/i, "")}
                </Text>
              </HoverCard.Target>
              <HoverCard.Dropdown>
                <Stack gap="xs">
                  <Group justify="space-between" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", paddingBottom: 4 }}>
                    <Text fw={700} size="xs">{targetDoc.name}</Text>
                    <Badge color="gray" variant="light" size="xs">{targetDoc.partnerAccess || "private"}</Badge>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={4}>
                    {targetDoc.content || "Empty document"}
                  </Text>
                </Stack>
              </HoverCard.Dropdown>
            </HoverCard>
          );
        }
      }

      return <Badge color="red" variant="light" size="xs" component="span">Missing Link: {rawCitation}</Badge>;
    };

    return (
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url) => url}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith("dialektik-citation:")) {
                return renderCitation(decodeURIComponent(href.replace("dialektik-citation:", "")));
              }
              return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
            },
            h1: ({ children }) => <Title order={3} mt="md" mb="xs">{children}</Title>,
            h2: ({ children }) => <Title order={4} mt="md" mb="xs">{children}</Title>,
            h3: ({ children }) => <Title order={5} mt="sm" mb="xs">{children}</Title>,
            p: ({ children }) => <Text size="sm" my="xs" style={{ lineHeight: 1.7 }}>{children}</Text>,
            li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
            blockquote: ({ children }) => (
              <blockquote style={{ borderLeft: "3px solid var(--mantine-color-gray-3)", margin: "var(--mantine-spacing-sm) 0", paddingLeft: "var(--mantine-spacing-md)", color: "var(--mantine-color-gray-7)" }}>
                {children}
              </blockquote>
            ),
            code: ({ children, className }) => {
              const inline = !className;
              return inline ? (
                <code style={{ backgroundColor: "var(--mantine-color-gray-1)", padding: "2px 5px", borderRadius: "var(--mantine-radius-sm)" }}>{children}</code>
              ) : (
                <code className={className}>{children}</code>
              );
            },
            pre: ({ children }) => (
              <pre style={{ overflowX: "auto", backgroundColor: "var(--mantine-color-gray-1)", padding: "var(--mantine-spacing-sm)", borderRadius: "var(--mantine-radius-md)" }}>
                {children}
              </pre>
            ),
            table: ({ children }) => (
              <ScrollArea type="auto">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--mantine-font-size-sm)" }}>{children}</table>
              </ScrollArea>
            ),
            th: ({ children }) => <th style={{ border: "1px solid var(--mantine-color-gray-3)", padding: 6, textAlign: "left" }}>{children}</th>,
            td: ({ children }) => <td style={{ border: "1px solid var(--mantine-color-gray-3)", padding: 6 }}>{children}</td>
          }}
        >
          {markdownContent}
        </ReactMarkdown>
      </div>
    );
  };

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

  const linkQuery = linkMenu.query.toLowerCase();
  const matchingDocs = docs
    .filter(doc => {
      const label = `${doc.partnerAccess || "private"}/${doc.name.replace(/\.md$/i, "")}`.toLowerCase();
      return label.includes(linkQuery);
    })
    .slice(0, 6);
  const matchingCards = cards
    .filter(card => {
      const label = `${card.title} ${card.id} ${card.text}`.toLowerCase();
      return label.includes(linkQuery);
    })
    .slice(0, 6);
  const canEditSelectedDoc = isSelectedDocWritable();
  const visibleRemoteCursors = selectedDoc
    ? Object.entries(remoteCursors)
      .filter(([senderId]) => senderId !== mesh.peerId)
      .map(([, cursor]) => cursor)
      .filter(cursor => cursor.docId === selectedDoc.id && Date.now() - cursor.updatedAt < 15000)
    : [];
  const remoteCursorLines = Array.from(new Set(visibleRemoteCursors.map(cursor => getLineFromCaret(cursor.caret))));

  return (
    <Stack gap="md" style={{ flex: 1, height: "100%", minHeight: 0, overflow: isMobile ? "auto" : "hidden" }}>
      {toastNotification && (
        <Notification
          color="teal"
          onClose={() => setToastNotification(null)}
          style={{ position: "fixed", top: 72, right: 20, zIndex: 1000, width: "min(360px, calc(100vw - 32px))", boxShadow: "var(--mantine-shadow-md)" }}
        >
          {toastNotification}
        </Notification>
      )}

      <Modal 
        opened={!!pendingDelete} 
        onClose={() => setPendingDelete(null)} 
        title={<Text fw={700}>Delete Item?</Text>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            {pendingDelete?.label} will be removed from this local workspace.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmPendingDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Grid
        style={{ flex: 1, height: isMobile ? "auto" : "100%", minHeight: 0, overflow: isMobile ? "visible" : "hidden" }}
        styles={{ inner: { height: isMobile ? "auto" : "100%" } }}
        align="stretch"
        gutter="md"
      >
        <Grid.Col span={{ base: 12, md: 3 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 88px)" : "100%", minHeight: 0 }}>
          <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
              <Group justify="space-between" align="center">
                <Text fw={700} size="sm">Shared Folders</Text>
                <FolderOpen size={17} color="var(--mantine-color-gray-6)" />
              </Group>

              <form onSubmit={handleCreateDoc}>
                <Stack gap="xs">
                  <TextInput 
                    value={newDocTitle} 
                    onChange={(e) => setNewDocTitle(e.target.value)} 
                    placeholder="New document title..."
                    required
                    size="xs"
                  />
                  
                  <Select 
                    value={newDocFolder} 
                    onChange={(val) => setNewDocFolder(val || "private")}
                    data={[
                      { label: "private", value: "private" },
                      { label: "team", value: "team" },
                      { label: "public", value: "public" }
                    ]}
                    size="xs"
                  />
                  {newDocFolder !== "private" && (
                    <Select 
                      value={newDocMode} 
                      onChange={(val) => setNewDocMode(val || "write")}
                      data={[
                        { label: "shared writable", value: "write" },
                        { label: "shared read-only", value: "read" }
                      ]}
                      size="xs"
                    />
                  )}
                  <Button type="submit" color="teal" size="xs" leftSection={<Plus size={13} />} fullWidth>
                    Create File
                  </Button>
                </Stack>
              </form>

              <ScrollArea.Autosize mah="100%" style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                <Stack gap="md" pr="xs">
                  {(["private", "team", "public"] as const).map(folder => (
                    <Stack gap="xs" key={folder}>
                      <Text size="xs" fw={700} c="dimmed">
                        {folder.charAt(0).toUpperCase() + folder.slice(1)}
                      </Text>
                      {groupedDocs[folder].length === 0 && (
                        <Text size="xs" style={{ italic: "true" }} c="dimmed" pl="xs">Empty</Text>
                      )}
                      {groupedDocs[folder].map(doc => (
                        <NavLink
                          key={doc.id}
                          active={selectedDoc?.id === doc.id}
                          label={doc.name.replace(/\.md$/i, "")}
                          leftSection={<FileText size={14} />}
                          rightSection={
                            <ActionIcon 
                              variant="subtle" 
                              color="red" 
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                requestDeleteDoc(doc);
                              }}
                            >
                              <Trash2 size={12} />
                            </ActionIcon>
                          }
                          onClick={() => handleSelectDoc(doc)}
                          variant="light"
                          color="teal"
                          styles={{ root: { borderRadius: "var(--mantine-radius-md)" } }}
                        />
                      ))}
                    </Stack>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 88px)" : "100%", minHeight: 0 }}>
          <Card withBorder p={0} radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            {selectedDoc ? (
              <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
                {/* Editor Header Toolbar */}
                <Group p="sm" justify="space-between" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", backgroundColor: "var(--mantine-color-gray-0)" }}>
                  <TextInput 
                    value={editorName} 
                    onChange={(e) => setEditorName(e.target.value)}
                    onBlur={handleTitleBlur}
                    placeholder="Rename file..."
                    disabled={!isDocumentOwner(selectedDoc)}
                    size="xs"
                    style={{ fontWeight: 700, width: "30%" }}
                  />

                  <Group gap="xs">
                    <Select
                      value={selectedDoc.partnerAccess || "private"}
                      onChange={(val) => handleMoveDoc(val as any)}
                      disabled={!isDocumentOwner(selectedDoc)}
                      data={[
                        { label: "private", value: "private" },
                        { label: "team", value: "team" },
                        { label: "public", value: "public" }
                      ]}
                      size="xs"
                      style={{ width: 90 }}
                    />

                    <Select
                      value={selectedDoc.encryptedHash || "write"}
                      disabled={(selectedDoc.partnerAccess || "private") === "private" || !isDocumentOwner(selectedDoc)}
                      onChange={(val) => handleToggleDocMode(val as any)}
                      data={[
                        { label: "shared writable", value: "write" },
                        { label: "shared read-only", value: "read" }
                      ]}
                      size="xs"
                      style={{ width: 130 }}
                    />

                    <ActionIcon 
                      variant="outline" 
                      onClick={handleDuplicateDoc}
                      color="teal"
                      size="md"
                    >
                      <Copy size={16} />
                    </ActionIcon>

                    <SegmentedControl
                      value={editorMode}
                      onChange={(val) => setEditorMode(val as any)}
                      data={[
                        { label: "Edit", value: "edit" },
                        { label: "Read", value: "read" }
                      ]}
                      size="xs"
                      color="teal"
                    />
                  </Group>
                </Group>

                {/* Editor Pane / Workspace */}
                <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
                  {editorMode === "edit" ? (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
                      <div
                        aria-hidden
                        style={{
                          position: "absolute",
                          inset: 0,
                          overflow: "hidden",
                          pointerEvents: "none",
                          background: "var(--mantine-color-white)"
                        }}
                      >
                        {remoteCursorLines.map(line => {
                          const lineHeight = 19.2;
                          const top = 16 + line * lineHeight - editorScrollTop;
                          if (top < -lineHeight || top > 10000) return null;
                          return (
                            <div
                              key={line}
                              style={{
                                position: "absolute",
                                top,
                                left: 0,
                                right: 0,
                                height: lineHeight,
                                background: "var(--mantine-color-teal-0)",
                                borderLeft: "3px solid var(--mantine-color-teal-5)"
                              }}
                            />
                          );
                        })}
                      </div>
                      <textarea
                        ref={editorRef}
                        value={editorContent}
                        onChange={handleContentChange}
                        onSelect={handleEditorSelect}
                        onKeyUp={handleEditorSelect}
                        onScroll={(event) => setEditorScrollTop(event.currentTarget.scrollTop)}
                        onBlur={() => setTimeout(() => setLinkMenu(menu => ({ ...menu, visible: false })), 140)}
                        placeholder="Type markdown. Cite evidence cards with [[card-id]] or files with [[folder/title]]."
                        readOnly={!canEditSelectedDoc}
                        style={{
                          width: "100%",
                          flex: 1,
                          padding: "var(--mantine-spacing-md)",
                          border: 0,
                          borderRadius: 0,
                          background: "transparent",
                          outline: 0,
                          resize: "none",
                          cursor: canEditSelectedDoc ? "text" : "not-allowed",
                          fontFamily: "monospace",
                          fontSize: "12px",
                          lineHeight: 1.6,
                          position: "relative",
                          zIndex: 1
                        }}
                      />
                      
                      {linkMenu.visible && (
                        <Paper 
                          withBorder 
                          p={4} 
                          radius="md" 
                          style={{ position: "absolute", top: linkMenu.top, left: "20px", zIndex: 60, width: 320, maxHeight: 220, overflowY: "auto" }}
                        >
                          <Stack gap={4}>
                            {matchingDocs.length > 0 && <Text size="10px" fw={700} c="dimmed" px="xs">Documents</Text>}
                            {matchingDocs.map(doc => (
                                <Button
                                  key={doc.id}
                                  variant="subtle"
                                  color="gray"
                                  size="xs"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    insertWikiLink(doc);
                                  }}
                                  justify="flex-start"
                                  leftSection={<FileText size={13} />}
                                >
                                  {doc.partnerAccess || "private"}/{doc.name.replace(/\.md$/i, "")}
                                </Button>
                              ))}
                            {matchingCards.length > 0 && <Text size="10px" fw={700} c="dimmed" px="xs" pt={matchingDocs.length ? 4 : 0}>Evidence cards</Text>}
                            {matchingCards.map(card => (
                              <Button
                                key={card.id}
                                variant="subtle"
                                color="gray"
                                size="xs"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  insertCardLink(card);
                                }}
                                justify="flex-start"
                                leftSection={<ShieldCheck size={13} />}
                              >
                                {card.title}
                              </Button>
                            ))}
                            {matchingDocs.length === 0 && matchingCards.length === 0 && (
                              <Text size="xs" c="dimmed" p="xs">No matching citations</Text>
                            )}
                          </Stack>
                        </Paper>
                      )}
                    </div>
                  ) : (
                    <ScrollArea style={{ flex: 1, minHeight: 0 }} p="md" type="auto" offsetScrollbars>
                      <MarkdownRenderer 
                        content={editorContent} 
                        cards={cards} 
                        docs={docs} 
                        onNavigateDoc={handleSelectDoc}
                      />
                    </ScrollArea>
                  )}
                </div>

                {/* Citation Status Bar */}
                <Group p="xs" justify="space-between" style={{ borderTop: "1px solid var(--mantine-color-gray-2)", backgroundColor: "var(--mantine-color-gray-1)" }}>
                  <Text size="xs" c="dimmed">
                    Path: {selectedDoc.partnerAccess || "private"}/{selectedDoc.name.replace(".md", "")}
                  </Text>
                  <Group gap="xs">
                    {isPeerConnected && selectedDoc.partnerAccess !== "private" ? (
                      <>
                        <Globe size={13} color="var(--mantine-color-teal-6)" />
                        <Text size="xs" c="dimmed">WebRTC live-sync active</Text>
                      </>
                    ) : (
                      <>
                        <Database size={13} color="var(--mantine-color-gray-5)" />
                        <Text size="xs" c="dimmed">Saved locally</Text>
                      </>
                    )}
                  </Group>
                </Group>
              </Stack>
            ) : (
              <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs">
                <FileText size={32} color="var(--mantine-color-gray-4)" />
                <Title order={4}>No document selected</Title>
                <Text size="xs" c="dimmed">Create a file or select from the folders rail to begin.</Text>
              </Stack>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 3 }} style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 88px)" : "100%", minHeight: 0 }}>
          <Card withBorder p="sm" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
              <Group justify="space-between" align="center">
                <Text fw={700} size="sm">Evidence Cards</Text>
                <ShieldCheck size={17} color="var(--mantine-color-teal-6)" />
              </Group>

              <form onSubmit={handleAddCard}>
                <Stack gap="xs">
                  <TextInput
                    required
                    value={cardTitle}
                    onChange={(e) => setCardTitle(e.target.value)}
                    placeholder="Citation"
                    size="xs"
                  />
                  <TextInput
                    type="url"
                    value={cardSource}
                    onChange={(e) => setCardSource(e.target.value)}
                    placeholder="Source URL"
                    size="xs"
                  />
                  <Textarea
                    required
                    rows={3}
                    value={cardText}
                    onChange={(e) => setCardText(e.target.value)}
                    placeholder="Evidence body text..."
                    size="xs"
                    style={{ resize: "none" }}
                  />
                  <Button type="submit" color="teal" size="xs" leftSection={<Plus size={12} />} fullWidth>
                    Add to Library
                  </Button>
                </Stack>
              </form>

              <ScrollArea.Autosize mah="100%" style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
                <Stack gap={0} pr="xs">
                  {cards.map((card) => (
                    <Paper key={card.id} p="xs" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", borderRadius: 0 }}>
                      <Stack gap={4}>
                        <Group justify="space-between" align="center">
                          <Text size="xs" fw={700}>{card.title}</Text>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="xs"
                            onClick={() => handleDeleteCard(card.id)}
                          >
                            <Trash2 size={12} />
                          </ActionIcon>
                        </Group>
                        <Text size="xs" c="dimmed" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          "{card.text}"
                        </Text>
                        <Group justify="space-between" align="center">
                          <Text size="xs" c="dimmed">
                            ID: <span style={{ color: "var(--mantine-color-teal-6)", fontWeight: 700 }}>[[{card.id}]]</span>
                          </Text>
                          {card.sourceUrl && (
                            <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", color: "var(--mantine-color-teal-6)" }}>
                              Source
                            </a>
                          )}
                        </Group>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
};

export default Documents;
