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

async function computeSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export const Documents: React.FC = () => {
  const { isPeerConnected, mesh, session } = useApp();
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
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [linkMenu, setLinkMenu] = useState<{ visible: boolean; query: string; start: number; end: number }>({
    visible: false,
    query: "",
    start: 0,
    end: 0
  });
  const [pendingDelete, setPendingDelete] = useState<{ type: "document" | "card"; id: string; label: string } | null>(null);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

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

    const unsubscribeMessage = mesh.onMessage(handler);
    const unsubscribeConnect = mesh.onConnectionOpen(() => {
      syncSharedDocs();
    });
    syncSharedDocs();
    return () => {
      unsubscribeMessage();
      unsubscribeConnect();
    };
  }, [isPeerConnected, session]);

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
      db.documents.update(selectedDoc.id, { 
        content: val,
        lastModified: Date.now() 
      });
      setSelectedDoc({ ...selectedDoc, content: val, lastModified: Date.now() });
      setDocs(prev => prev.map(doc => doc.id === selectedDoc.id ? { ...doc, content: val, lastModified: Date.now() } : doc));
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
    setLinkMenu({ visible: true, query: trigger.query, start: trigger.start, end: trigger.end });
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

  const handleTitleBlur = () => {
    if (!selectedDoc || !editorName.trim()) return;
    const nextDoc = { ...selectedDoc, name: editorName };
    setSelectedDoc(nextDoc);
    setDocs(prev => prev.map(doc => doc.id === selectedDoc.id ? nextDoc : doc));
    db.documents.update(selectedDoc.id, { name: editorName });
    loadDocs();
  };

  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim()) return;

    const cleanTitle = newDocTitle.trim().replace(/[\[\]#?/\\]/g, "");
    const filename = cleanTitle.endsWith(".md") ? cleanTitle : `${cleanTitle}.md`;

    const newDoc: DebateDocument = {
      id: `doc-${Math.random().toString(36).substring(2, 11)}`,
      name: filename,
      type: "case",
      content: "Type markdown content here...",
      lastModified: Date.now(),
      partnerAccess: newDocFolder as any,
      encryptedHash: newDocMode
    };

    await db.documents.put(newDoc);
    setNewDocTitle("");
    await loadDocs();
    handleSelectDoc(newDoc);
  };

  const handleMoveDoc = async (folder: "private" | "team" | "public") => {
    if (!selectedDoc) return;
    const nextDoc = { ...selectedDoc, partnerAccess: folder, lastModified: Date.now() };
    setSelectedDoc(nextDoc);
    setDocs(prev => prev.map(doc => doc.id === selectedDoc.id ? nextDoc : doc));
    await db.documents.update(selectedDoc.id, { partnerAccess: folder });
    await loadDocs();
    triggerToast(`Moved document to ${folder} folder.`);
  };

  const handleToggleDocMode = async (mode: "read" | "write") => {
    if (!selectedDoc) return;
    const nextDoc = { ...selectedDoc, encryptedHash: mode, lastModified: Date.now() };
    setSelectedDoc(nextDoc);
    setDocs(prev => prev.map(doc => doc.id === selectedDoc.id ? nextDoc : doc));
    await db.documents.update(selectedDoc.id, { encryptedHash: mode });
    await loadDocs();
    triggerToast(`Sharing mode updated to: ${mode === "write" ? "shared writable" : "shared read-only"}.`);
  };

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

  const requestDeleteDoc = (doc: DebateDocument) => {
    setPendingDelete({ type: "document", id: doc.id, label: doc.name.replace(/\.md$/i, "") });
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === "document") {
      await db.documents.delete(pendingDelete.id);
      setSelectedDoc(null);
      await loadDocs();
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
    triggerToast("Evidence card added.");
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
      escaped = escaped.replace(/`(.*?)`/g, "<code style='background-color: var(--mantine-color-gray-1); padding: 2px 4px; border-radius: var(--mantine-radius-sm); font-family: monospace; font-size: 10px;'>$1</code>");

      return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
    };

    return (
      <Stack gap="xs">
        {parts.map((part, index) => {
          const match = part.match(/\[\[([^\]]+)\]\]/);
          if (match) {
            const rawCitation = match[1].trim();

            if (rawCitation.startsWith("card-")) {
              const referencedCard = cards.find(c => c.id === rawCitation);
              if (referencedCard) {
                return (
                  <HoverCard key={index} width={320} shadow="md">
                    <HoverCard.Target>
                      <Badge color="emerald" variant="light" style={{ cursor: "help" }} size="xs">
                        Cite: {referencedCard.title}
                      </Badge>
                    </HoverCard.Target>
                    <HoverCard.Dropdown>
                      <Stack gap="xs">
                        <Group justify="space-between" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", paddingBottom: 4 }}>
                          <Text fw={700} size="xs">{referencedCard.title}</Text>
                          <Badge color="teal" variant="light" size="xs" leftSection={<ShieldCheck size={11} />}>VERIFIED</Badge>
                        </Group>
                        <Text size="xs" style={{ fontStyle: "italic" }}>"{referencedCard.text}"</Text>
                        <Group justify="space-between">
                          <Text size="xs" c="dimmed">SHA-256: {referencedCard.hash.substring(0, 12)}...</Text>
                          {referencedCard.sourceUrl && (
                            <Text size="xs" c="teal">Link</Text>
                          )}
                        </Group>
                      </Stack>
                    </HoverCard.Dropdown>
                  </HoverCard>
                );
              }
            }

            const pathParts = rawCitation.split("/");
            if (pathParts.length === 2) {
              const folder = pathParts[0];
              const title = pathParts[1];
              const targetDoc = docs.find(d => (d.partnerAccess || "private") === folder && d.name.replace(".md", "") === title);

              if (targetDoc) {
                return (
                  <HoverCard key={index} width={320} shadow="md">
                    <HoverCard.Target>
                      <Button 
                        variant="light" 
                        color="teal" 
                        size="xs" 
                        onClick={() => onNavigateDoc(targetDoc)}
                        styles={{ root: { height: "auto", padding: "2px 6px" } }}
                      >
                        {title}
                      </Button>
                    </HoverCard.Target>
                    <HoverCard.Dropdown>
                      <Stack gap="xs">
                        <Group justify="space-between" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", paddingBottom: 4 }}>
                          <Text fw={700} size="xs">{targetDoc.name}</Text>
                          <Badge color="gray" variant="light" size="xs">{targetDoc.partnerAccess || "private"}</Badge>
                        </Group>
                        <Text size="xs" c="dimmed" style={{ maxHeight: 100, overflowY: "hidden" }}>
                          {targetDoc.content.substring(0, 240)}...
                        </Text>
                      </Stack>
                    </HoverCard.Dropdown>
                  </HoverCard>
                );
              }
            }

            return (
              <Badge key={index} color="red" variant="light" size="xs">
                Missing Link: {rawCitation}
              </Badge>
            );
          }

          const lines = part.split("\n");
          return (
            <span key={index}>
              {lines.map((line, lineIdx) => {
                if (line.startsWith("### ")) {
                  return <Title key={lineIdx} order={6} mt="xs" mb="xs">{renderInlineStyle(line.substring(4))}</Title>;
                }
                if (line.startsWith("## ")) {
                  return <Title key={lineIdx} order={5} mt="sm" mb="xs" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", paddingBottom: 2 }}>{renderInlineStyle(line.substring(3))}</Title>;
                }
                if (line.startsWith("# ")) {
                  return <Title key={lineIdx} order={4} mt="md" mb="sm">{renderInlineStyle(line.substring(2))}</Title>;
                }
                if (line.startsWith("- ") || line.startsWith("* ")) {
                  return (
                    <Text key={lineIdx} size="xs" pl="sm" my={2}>
                      • {renderInlineStyle(line.substring(2))}
                    </Text>
                  );
                }
                if (line.startsWith("> ")) {
                  return (
                    <blockquote key={lineIdx} style={{ borderLeft: "2px solid var(--mantine-color-gray-3)", paddingLeft: "var(--mantine-spacing-sm)", fontStyle: "italic", margin: "var(--mantine-spacing-xs) 0" }}>
                      {renderInlineStyle(line.substring(2))}
                    </blockquote>
                  );
                }
                if (!line.trim()) {
                  return <div key={lineIdx} style={{ height: 4 }} />;
                }
                return <Text key={lineIdx} size="xs" my={2}>{renderInlineStyle(line)}</Text>;
              })}
            </span>
          );
        })}
      </Stack>
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

  return (
    <Stack gap="md" style={{ flex: 1, height: "100%", minHeight: 0, overflow: isMobile ? "auto" : "hidden" }}>
      {toastNotification && (
        <Notification color="teal" onClose={() => setToastNotification(null)}>
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
                      <Text size="xs" fw={800} c="dimmed" style={{ textTransform: "uppercase" }}>{folder}</Text>
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
                    size="xs"
                    style={{ fontWeight: 700, width: "30%" }}
                  />

                  <Group gap="xs">
                    <Select
                      value={selectedDoc.partnerAccess || "private"}
                      onChange={(val) => handleMoveDoc(val as any)}
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
                      disabled={(selectedDoc.partnerAccess || "private") === "private"}
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
                      <textarea
                        ref={editorRef}
                        value={editorContent}
                        onChange={handleContentChange}
                        onSelect={handleEditorSelect}
                        onKeyUp={handleEditorSelect}
                        onBlur={() => setTimeout(() => setLinkMenu(menu => ({ ...menu, visible: false })), 140)}
                        placeholder="Type markdown contents... Cite evidence cards using [[card-sha256-id]] or wiki links [[folder/title]]."
                        style={{
                          width: "100%",
                          flex: 1,
                          padding: "var(--mantine-spacing-md)",
                          border: 0,
                          outline: 0,
                          resize: "none",
                          fontFamily: "monospace",
                          fontSize: "12px",
                          lineHeight: 1.6
                        }}
                      />
                      
                      {linkMenu.visible && (
                        <Paper 
                          withBorder 
                          p={4} 
                          radius="md" 
                          style={{ position: "absolute", top: "40px", left: "20px", zIndex: 60, width: 280, maxHeight: 180, overflowY: "auto" }}
                        >
                          <Stack gap={4}>
                            {docs
                              .filter(doc => {
                                const label = `${doc.partnerAccess || "private"}/${doc.name.replace(/\.md$/i, "")}`.toLowerCase();
                                return label.includes(linkMenu.query.toLowerCase());
                              })
                              .slice(0, 8)
                              .map(doc => (
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
                            {docs.length === 0 && <Text size="xs" c="dimmed" p="xs">No files available</Text>}
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
                    placeholder="Citation (e.g. Smith 2024)"
                    size="xs"
                  />
                  <TextInput
                    type="url"
                    value={cardSource}
                    onChange={(e) => setCardSource(e.target.value)}
                    placeholder="Source URL (Optional)"
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
