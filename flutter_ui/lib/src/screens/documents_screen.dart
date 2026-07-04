import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../widgets/adaptive_scaffold.dart';

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({
    super.key,
    required this.bridge,
    required this.snapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  static String? _cachedSelectedId;
  static bool _cachedReadMode = false;

  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  String? _selectedId;
  bool _readMode = false;
  final TextEditingController _nameController = TextEditingController();

  Future<bool> _confirmAction(BuildContext context, {required String title, required String content}) async {
    return await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(content),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    ) ?? false;
  }

  @override
  void initState() {
    super.initState();
    _selectedId = _cachedSelectedId;
    _readMode = _cachedReadMode;
  }
  final HighlightingTextController _contentController = HighlightingTextController();
  final TextEditingController _newTitleController = TextEditingController();
  final TextEditingController _cardTitleController = TextEditingController();
  final TextEditingController _cardSourceController = TextEditingController();
  final TextEditingController _cardTextController = TextEditingController();
  String _newFolder = 'private';
  String _newMode = 'write';
  String _newCardFolder = 'private';

  List<DebateDocument> _filteredDocs = const [];

  DebateDocument? get _selectedDocument {
    final docs = _filteredDocs;
    if (docs.isEmpty) return null;
    return docs.firstWhere(
      (doc) => doc.id == _selectedId,
      orElse: () => docs.first,
    );
  }

  @override
  void didUpdateWidget(covariant DocumentsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);

    // Switch selection to new document and go to Edit mode upon creation
    final oldIds = oldWidget.snapshot.documents.map((d) => d.id).toSet();
    final currentDocs = widget.snapshot.documents;
    String? newDocId;
    for (final doc in currentDocs) {
      if (!oldIds.contains(doc.id)) {
        newDocId = doc.id;
        break;
      }
    }
    if (newDocId != null) {
      _selectedId = newDocId;
      _cachedSelectedId = newDocId;
      _readMode = false;
      _cachedReadMode = false;
      final newDoc = currentDocs.firstWhere((d) => d.id == newDocId);
      _nameController.text = newDoc.title;
      _contentController.text = newDoc.content;
    }

    _syncControllers();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _contentController.dispose();
    _newTitleController.dispose();
    _cardTitleController.dispose();
    _cardSourceController.dispose();
    _cardTextController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _syncControllers();
    final selected = _selectedDocument;
    final compact = MediaQuery.sizeOf(context).width < 840;

    final myUserId = widget.snapshot.settings.userId;
    final isOwner = selected == null ||
        (selected.ownerId != null && selected.ownerId == myUserId) ||
        (selected.ownerName != null &&
            selected.ownerName!.isNotEmpty &&
            selected.ownerName == widget.snapshot.settings.userName);

    // Determine user's team from session for team-folder filtering.
    final session = widget.snapshot.session;
    final myTeam = session?.debaters
        .where((d) => d.id == myUserId)
        .firstOrNull
        ?.team;

    _filteredDocs = widget.snapshot.documents.where((doc) {
      if (doc.folder != 'team') return true;
      if (myTeam == null) return true;
      // Find the owner's team in the session
      final ownerTeam = session?.debaters
          .where((d) => d.id == doc.ownerId)
          .firstOrNull
          ?.team;
      // Team doc is visible if we own it, or if the owner is on our team
      return doc.ownerId == myUserId || ownerTeam == null || ownerTeam == myTeam;
    }).toList();

    final filesPane = _FilesPane(
      documents: _filteredDocs,
      selectedId: selected?.id,
      myUserId: myUserId,
      newTitleController: _newTitleController,
      newFolder: _newFolder,
      newMode: _newMode,
      onFolderChanged: (value) {
        setState(() {
          _newFolder = value;
          if (value == 'private') {
            _newMode = 'write';
          }
        });
      },
      onModeChanged: (value) => setState(() => _newMode = value),
      onCreate: _createDocument,
      onSelect: (doc) {
        setState(() {
          _selectedId = doc.id;
          _cachedSelectedId = doc.id;
          _nameController.text = doc.title;
          _contentController.text = doc.content;
        });
        if (compact) _scaffoldKey.currentState?.closeDrawer();
      },
      onDelete: (doc) async {
        final confirm = await _confirmAction(
          context,
          title: 'Delete Document',
          content: 'Are you sure you want to delete "${doc.title}"? This cannot be undone.',
        );
        if (confirm) {
          widget.bridge.dispatch(action('document.delete', {'id': doc.id}));
        }
      },
      onDuplicate: (doc) {
        widget.bridge.dispatch(action('document.duplicate', {'id': doc.id}));
      },
    );

    final editorPane = _EditorPane(
      document: selected,
      nameController: _nameController,
      contentController: _contentController,
      readMode: _readMode,
      documents: widget.snapshot.documents,
      cards: widget.snapshot.cards,
      isOwner: isOwner,
      onToggleReadMode: (value) => setState(() {
        _readMode = value;
        _cachedReadMode = value;
      }),
      onRename: () {
        if (selected == null) return;
        widget.bridge.dispatch(action('document.rename', {
          'id': selected.id,
          'name': _nameController.text.trim(),
        }));
      },
      onChanged: (content) {
        if (selected == null) return;
        widget.bridge.dispatch(action('document.updateContent', {
          'id': selected.id,
          'content': content,
        }));
      },
      onMove: (folder) {
        if (selected == null) return;
        widget.bridge.dispatch(
            action('document.move', {'id': selected.id, 'folder': folder}));
      },
      onModeChanged: (mode) {
        if (selected == null) return;
        widget.bridge.dispatch(
            action('document.setMode', {'id': selected.id, 'mode': mode}));
      },
      onInsertCitation: (citation) {
        final selection = _contentController.selection;
        final insertAt = selection.isValid
            ? selection.baseOffset
            : _contentController.text.length;
        final nextText = _contentController.text.replaceRange(
          insertAt,
          selection.isValid ? selection.extentOffset : insertAt,
          '[[$citation]]',
        );
        _contentController.text = nextText;
        if (selected != null) {
          widget.bridge.dispatch(action('document.updateContent', {
            'id': selected.id,
            'content': nextText,
          }));
        }
      },
      onNavigateDoc: (doc) => setState(() {
        _selectedId = doc.id;
        _cachedSelectedId = doc.id;
      }),
      isMobile: compact,
      onOpenFiles: () => _scaffoldKey.currentState?.openDrawer(),
      onOpenEvidence: () => _scaffoldKey.currentState?.openEndDrawer(),
    );

    final evidencePane = _EvidencePane(
      cards: widget.snapshot.cards,
      titleController: _cardTitleController,
      sourceController: _cardSourceController,
      textController: _cardTextController,
      cardFolder: _newCardFolder,
      onCardFolderChanged: (v) {
        if (v != null) setState(() => _newCardFolder = v);
      },
      onCreate: () {
        if (_cardTitleController.text.trim().isEmpty ||
            _cardTextController.text.trim().isEmpty) {
          return;
        }
        widget.bridge.dispatch(action('card.create', {
          'title': _cardTitleController.text.trim(),
          'sourceUrl': _cardSourceController.text.trim(),
          'text': _cardTextController.text.trim(),
          'docId': selected?.id,
          'folder': _newCardFolder,
        }));
        _cardTitleController.clear();
        _cardSourceController.clear();
        _cardTextController.clear();
        if (compact) _scaffoldKey.currentState?.closeEndDrawer();
      },
      onDelete: (card) async {
        final confirm = await _confirmAction(
          context,
          title: 'Delete Card',
          content: 'Are you sure you want to delete card "${card.title}"?',
        );
        if (confirm) {
          widget.bridge.dispatch(action('card.delete', {'id': card.id}));
        }
      },
      onInsert: (_readMode || (selected != null && !selected.isWritable && !isOwner)) ? null : (card) {
        final selectedDoc = _selectedDocument;
        if (selectedDoc == null) return;
        final selection = _contentController.selection;
        final insertAt = selection.isValid
            ? selection.baseOffset
            : _contentController.text.length;
        final nextText = _contentController.text.replaceRange(
          insertAt,
          selection.isValid ? selection.extentOffset : insertAt,
          '[[${card.id}]]',
        );
        _contentController.text = nextText;
        widget.bridge.dispatch(action('document.updateContent', {
          'id': selectedDoc.id,
          'content': nextText,
        }));
        if (compact) _scaffoldKey.currentState?.closeEndDrawer();
      },
    );

    if (compact) {
      return Scaffold(
        key: _scaffoldKey,
        drawer: Drawer(child: SafeArea(child: filesPane)),
        endDrawer: Drawer(child: SafeArea(child: evidencePane)),
        body: widget.snapshot.documents.isEmpty ? filesPane : editorPane,
      );
    }

    return ResponsivePane(
      cacheKey: 'documents',
      children: [
        filesPane,
        editorPane,
        evidencePane,
      ],
    );
  }

  int? _getLineFromCaret(String text, int? caret) {
    if (caret == null || caret < 0 || caret > text.length) return null;
    return text.substring(0, caret).split('\n').length - 1;
  }

  void _syncControllers() {
    final doc = _selectedDocument;
    if (doc == null) return;
    if (_selectedId == null || _selectedId != doc.id) {
      _selectedId = doc.id;
      _cachedSelectedId = doc.id;
    }
    if (_nameController.text != doc.title) _nameController.text = doc.title;
    if (_contentController.text != doc.content && documentHasFocus == false) {
      final saved = _contentController.selection;
      _contentController.text = doc.content;
      // Restore cursor position if still valid to prevent jumps.
      if (saved.isValid && saved.baseOffset <= doc.content.length) {
        _contentController.selection = saved;
      }
    }
    _contentController.highlightColor = Theme.of(context).colorScheme.primaryContainer.withAlpha(76);
    _contentController.highlightedLine = _getLineFromCaret(doc.content, doc.partnerCaret);
  }

  bool get documentHasFocus {
    return FocusManager.instance.primaryFocus?.context?.widget is EditableText;
  }

  void _createDocument() {
    final title = _newTitleController.text.trim();
    if (title.isEmpty) return;
    widget.bridge.dispatch(action('document.create', {
      'name': title.endsWith('.md') ? title : '$title.md',
      'folder': _newFolder,
      'mode': _newMode,
    }));
    _newTitleController.clear();
  }
}

class _FilesPane extends StatelessWidget {
  const _FilesPane({
    required this.documents,
    required this.selectedId,
    required this.newTitleController,
    required this.newFolder,
    required this.newMode,
    required this.onFolderChanged,
    required this.onModeChanged,
    required this.onCreate,
    required this.onSelect,
    required this.onDelete,
    required this.onDuplicate,
    this.myUserId,
  });

  final List<DebateDocument> documents;
  final String? selectedId;
  final TextEditingController newTitleController;
  final String newFolder;
  final String newMode;
  final ValueChanged<String> onFolderChanged;
  final ValueChanged<String> onModeChanged;
  final VoidCallback onCreate;
  final ValueChanged<DebateDocument> onSelect;
  final ValueChanged<DebateDocument> onDelete;
  final ValueChanged<DebateDocument> onDuplicate;
  final String? myUserId;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionHeader(
              title: 'Documents',
              subtitle: 'Private, team, and public files',
              trailing: IconButton.filledTonal(
                onPressed: onCreate,
                icon: const Icon(Icons.add),
                tooltip: 'Create document',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: newTitleController,
              decoration: const InputDecoration(labelText: 'New document'),
              onSubmitted: (_) => onCreate(),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: newFolder,
                    decoration: const InputDecoration(labelText: 'Folder'),
                    isExpanded: true,
                    items: const [
                      DropdownMenuItem(
                          value: 'private', child: Text('Private')),
                      DropdownMenuItem(value: 'team', child: Text('Team')),
                      DropdownMenuItem(value: 'public', child: Text('Public')),
                    ],
                    onChanged: (value) {
                      if (value != null) onFolderChanged(value);
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: newFolder == 'private' ? 'write' : newMode,
                    decoration: const InputDecoration(labelText: 'Mode'),
                    isExpanded: true,
                    items: const [
                      DropdownMenuItem(value: 'write', child: Text('Writable')),
                      DropdownMenuItem(value: 'read', child: Text('Read-only')),
                    ],
                    onChanged: newFolder == 'private'
                        ? null
                        : (value) {
                            if (value != null) onModeChanged(value);
                          },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: documents.isEmpty
                  ? EmptyState(
                      icon: Icons.article_outlined,
                      message: 'No documents yet.',
                      action: FilledButton.icon(
                        onPressed: onCreate,
                        icon: const Icon(Icons.add),
                        label: const Text('Create'),
                      ),
                    )
                  : ListView(
                      children: [
                        for (final folder in const [
                          'private',
                          'team',
                          'public'
                        ])
                          _FolderGroup(
                            title:
                                '${folder[0].toUpperCase()}${folder.substring(1)}',
                            documents: documents
                                .where((doc) => doc.folder == folder)
                                .toList(),
                            selectedId: selectedId,
                            myUserId: myUserId,
                            onSelect: onSelect,
                            onDelete: onDelete,
                            onDuplicate: onDuplicate,
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FolderGroup extends StatelessWidget {
  const _FolderGroup({
    required this.title,
    required this.documents,
    required this.selectedId,
    required this.onSelect,
    required this.onDelete,
    required this.onDuplicate,
    this.myUserId,
  });

  final String title;
  final List<DebateDocument> documents;
  final String? selectedId;
  final ValueChanged<DebateDocument> onSelect;
  final ValueChanged<DebateDocument> onDelete;
  final ValueChanged<DebateDocument> onDuplicate;
  final String? myUserId;

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      initiallyExpanded: documents.isNotEmpty,
      title: Text(title),
      children: documents.isEmpty
          ? [const ListTile(dense: true, title: Text('Empty'))]
          : documents.map((doc) {
              return ListTile(
                selected: doc.id == selectedId,
                leading: Icon(doc.isShared ? Icons.public : Icons.lock_outline),
                title: Text(doc.title, overflow: TextOverflow.ellipsis),
                subtitle: Text(doc.isWritable ? 'Writable' : 'Read-only'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.copy),
                      tooltip: 'Duplicate',
                      onPressed: () => onDuplicate(doc),
                    ),
                    if (myUserId != null && doc.ownerId == myUserId)
                      IconButton(
                        icon: const Icon(Icons.delete_outline),
                        tooltip: 'Delete',
                        onPressed: () => onDelete(doc),
                      ),
                  ],
                ),
                onTap: () => onSelect(doc),
              );
            }).toList(),
    );
  }
}

class _EditorPane extends StatelessWidget {
  const _EditorPane({
    required this.document,
    required this.nameController,
    required this.contentController,
    required this.readMode,
    required this.documents,
    required this.cards,
    required this.isOwner,
    required this.onToggleReadMode,
    required this.onRename,
    required this.onChanged,
    required this.onMove,
    required this.onModeChanged,
    required this.onInsertCitation,
    required this.onNavigateDoc,
    this.isMobile = false,
    this.onOpenFiles,
    this.onOpenEvidence,
  });

  final DebateDocument? document;
  final TextEditingController nameController;
  final TextEditingController contentController;
  final bool readMode;
  final List<DebateDocument> documents;
  final List<EvidenceCard> cards;
  final bool isOwner;
  final ValueChanged<bool> onToggleReadMode;
  final VoidCallback onRename;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onMove;
  final ValueChanged<String> onModeChanged;
  final ValueChanged<String> onInsertCitation;
  final ValueChanged<DebateDocument> onNavigateDoc;
  final bool isMobile;
  final VoidCallback? onOpenFiles;
  final VoidCallback? onOpenEvidence;

  @override
  Widget build(BuildContext context) {
    final doc = document;
    if (doc == null) {
      return const Card(
        child: EmptyState(
          icon: Icons.edit_document,
          message: 'Select a document to start editing.',
        ),
      );
    }

    // Third parties with read-only documents are forced into Read mode.
    final forceRead = !isOwner && !doc.isWritable;
    final effectiveReadMode = readMode || forceRead;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SizedBox(
                  width: 240,
                  child: TextField(
                    controller: nameController,
                    enabled: isOwner,
                    decoration: const InputDecoration(labelText: 'File name'),
                    onSubmitted: (_) => onRename(),
                    onEditingComplete: onRename,
                  ),
                ),
                DropdownButton<String>(
                  value: doc.folder,
                  items: const [
                    DropdownMenuItem(value: 'private', child: Text('Private')),
                    DropdownMenuItem(value: 'team', child: Text('Team')),
                    DropdownMenuItem(value: 'public', child: Text('Public')),
                  ],
                  onChanged: isOwner
                      ? (value) {
                          if (value != null) onMove(value);
                        }
                      : null,
                ),
                DropdownButton<String>(
                  value: doc.mode,
                  items: const [
                    DropdownMenuItem(value: 'write', child: Text('Writable')),
                    DropdownMenuItem(value: 'read', child: Text('Read-only')),
                  ],
                  onChanged: isOwner && doc.folder != 'private'
                      ? (value) {
                          if (value != null) onModeChanged(value);
                        }
                      : null,
                ),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(
                        value: false,
                        label: Text('Edit'),
                        icon: Icon(Icons.edit_outlined)),
                    ButtonSegment(
                        value: true,
                        label: Text('Read'),
                        icon: Icon(Icons.visibility_outlined)),
                  ],
                  selected: {effectiveReadMode},
                  onSelectionChanged: forceRead
                      ? null
                      : (value) => onToggleReadMode(value.first),
                ),
                if (isMobile) ...[
                  IconButton.outlined(
                    onPressed: onOpenFiles,
                    icon: const Icon(Icons.folder_open),
                    tooltip: 'Files',
                  ),
                  IconButton.outlined(
                    onPressed: onOpenEvidence,
                    icon: const Icon(Icons.style),
                    tooltip: 'Evidence',
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: effectiveReadMode
                  ? _ReadMode(
                      content: doc.content,
                      documents: documents,
                      cards: cards,
                      onNavigateDoc: onNavigateDoc,
                      docTitle: doc.title,
                    )
                  : Column(
                      children: [
                        Align(
                          alignment: Alignment.centerLeft,
                          child: MenuAnchor(
                            builder: (context, controller, child) {
                              return TextButton.icon(
                                onPressed: () => controller.isOpen
                                    ? controller.close()
                                    : controller.open(),
                                icon: const Icon(Icons.add_link),
                                label: const Text('Insert citation'),
                              );
                            },
                            menuChildren: [
                              for (final target in documents)
                                MenuItemButton(
                                  leadingIcon:
                                      const Icon(Icons.description_outlined),
                                  child: Text(target.title),
                                  onPressed: () => onInsertCitation(
                                      '${target.folder}/${target.title}'),
                                ),
                              for (final card in cards)
                                MenuItemButton(
                                  leadingIcon:
                                      const Icon(Icons.fact_check_outlined),
                                  child: Text(card.title),
                                  onPressed: () => onInsertCitation(card.id),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        Expanded(
                          child: TextField(
                            key: ValueKey('editor_${doc.id}'),
                            controller: contentController,
                            expands: true,
                            maxLines: null,
                            minLines: null,
                            readOnly: !doc.isWritable && !isOwner,
                            textAlignVertical: TextAlignVertical.top,
                            decoration: const InputDecoration(
                              labelText: 'Markdown',
                              alignLabelWithHint: true,
                            ),
                            onChanged: onChanged,
                          ),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReadMode extends StatelessWidget {
  const _ReadMode({
    required this.content,
    required this.documents,
    required this.cards,
    required this.onNavigateDoc,
    this.docTitle,
  });

  final String content;
  final List<DebateDocument> documents;
  final List<EvidenceCard> cards;
  final ValueChanged<DebateDocument> onNavigateDoc;
  final String? docTitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: IconButton(
            icon: const Icon(Icons.copy_rounded, size: 18),
            tooltip: 'Copy raw text',
            onPressed: () {
              final prefix = docTitle != null ? '# ${docTitle}\n\n' : '';
              Clipboard.setData(ClipboardData(text: '$prefix$content'));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Raw text copied to clipboard'),
                  duration: Duration(seconds: 1),
                ),
              );
            },
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.only(bottom: 12),
            child: SelectableText.rich(
              _buildDocumentSpan(context),
            ),
          ),
        ),
      ],
    );
  }

  TextSpan _buildDocumentSpan(BuildContext context) {
    final lines = content.split('\n');
    final spans = <InlineSpan>[];
    var inCodeBlock = false;
    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      final trimmed = line.trimRight();
      final isLast = i == lines.length - 1;

      if (trimmed.isEmpty) {
        spans.add(const TextSpan(text: '\n'));
        continue;
      }

      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        spans.add(TextSpan(
          text: '$line\n',
          style: const TextStyle(
            fontFamily: 'monospace',
            backgroundColor: Color(0x1A000000),
          ),
        ));
        continue;
      }

      if (inCodeBlock) {
        spans.add(TextSpan(
          text: '$line\n',
          style: const TextStyle(fontFamily: 'monospace'),
        ));
        continue;
      }

      final heading = RegExp(r'^(#{1,6})\s+(.+)$').firstMatch(trimmed);
      if (heading != null) {
        final level = heading.group(1)!.length;
        final text = heading.group(2)!;
        final style = switch (level) {
          1 => Theme.of(context).textTheme.headlineSmall,
          2 => Theme.of(context).textTheme.titleLarge,
          3 => Theme.of(context).textTheme.titleMedium,
          _ => Theme.of(context).textTheme.titleSmall,
        };
        spans.add(TextSpan(
          text: '$text${isLast ? '' : '\n'}',
          style: style?.copyWith(fontWeight: FontWeight.w700),
        ));
        continue;
      }

      // Unordered list
      final unordered = RegExp(r'^\s*[-*+]\s+(.+)$').firstMatch(trimmed);
      if (unordered != null) {
        spans.add(TextSpan(
          text: '\u{2022} ${unordered.group(1)}${isLast ? '' : '\n'}',
        ));
        continue;
      }

      // Ordered list
      final ordered = RegExp(r'^\s*(\d+)\.\s+(.+)$').firstMatch(trimmed);
      if (ordered != null) {
        spans.add(TextSpan(
          text: '${ordered.group(1)}. ${ordered.group(2)}${isLast ? '' : '\n'}',
        ));
        continue;
      }

      // Blockquote
      final quote = RegExp(r'^>\s?(.+)$').firstMatch(trimmed);
      if (quote != null) {
        spans.add(TextSpan(
          text: '${quote.group(1)}${isLast ? '' : '\n'}',
          style: TextStyle(
            fontStyle: FontStyle.italic,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ));
        continue;
      }

      // Code block end
      if (trimmed == '```') {
        inCodeBlock = false;
        continue;
      }

      // Regular line — parse inline formatting (bold, italic, code, etc.)
      final lineStyle = Theme.of(context).textTheme.bodyMedium;
      final inlineSpans = _parseInlineMarkdown(trimmed, lineStyle!);
      spans.addAll(inlineSpans);
      if (!isLast) spans.add(const TextSpan(text: '\n'));
    }
    return TextSpan(
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.45),
      children: spans,
    );
  }

  /// Parse inline markdown syntax into styled [TextSpan]s.
  List<TextSpan> _parseInlineMarkdown(String text, TextStyle base) {
    final spans = <TextSpan>[];
    final regex = RegExp(
      r'`([^`]+)`'                                      // inline code
      r'|\*\*([^*]+)\*\*'                                // **bold**
      r'|__([^_]+)__'                                    // __bold__
      r'|\*([^*]+)\*'                                    // *italic*
      r'|_([^_]+)_'                                      // _italic_
      r'|~~([^~]+)~~'                                    // ~~strikethrough~~
      r'|==([^=]+)=='                                    // ==highlight==
    );

    var lastEnd = 0;
    for (final match in regex.allMatches(text)) {
      if (match.start > lastEnd) {
        spans.add(TextSpan(text: text.substring(lastEnd, match.start)));
      }
      lastEnd = match.end;

      final code = match.group(1);
      final bold1 = match.group(2);
      final bold2 = match.group(3);
      final italic1 = match.group(4);
      final italic2 = match.group(5);
      final strike = match.group(6);
      final highlight = match.group(7);

      if (code != null) {
        spans.add(TextSpan(
          text: code,
          style: TextStyle(
            fontFamily: 'monospace',
            backgroundColor: const Color(0x1A000000),
          ),
        ));
      } else if (bold1 != null || bold2 != null) {
        spans.add(TextSpan(
          text: bold1 ?? bold2,
          style: TextStyle(fontWeight: FontWeight.w700),
        ));
      } else if (italic1 != null || italic2 != null) {
        spans.add(TextSpan(
          text: italic1 ?? italic2,
          style: TextStyle(fontStyle: FontStyle.italic),
        ));
      } else if (strike != null) {
        spans.add(TextSpan(
          text: strike,
          style: TextStyle(decoration: TextDecoration.lineThrough),
        ));
      } else if (highlight != null) {
        spans.add(TextSpan(
          text: highlight,
          style: TextStyle(
            backgroundColor: Colors.yellow.shade200,
            color: Colors.black87,
          ),
        ));
      }
    }
    if (lastEnd < text.length) {
      spans.add(TextSpan(text: text.substring(lastEnd)));
    }
    return spans.isEmpty ? [TextSpan(text: text)] : spans;
  }
}

class _InlineMarkdown extends StatelessWidget {
  const _InlineMarkdown({
    required this.text,
    required this.documents,
    required this.cards,
    required this.onNavigateDoc,
    this.style,
  });

  final String text;
  final TextStyle? style;
  final List<DebateDocument> documents;
  final List<EvidenceCard> cards;
  final ValueChanged<DebateDocument> onNavigateDoc;

  @override
  Widget build(BuildContext context) {
    final baseStyle = style ?? Theme.of(context).textTheme.bodyMedium;
    final citationParts = _splitCitations(text);
    return SelectableText.rich(
      TextSpan(
        style: baseStyle?.copyWith(
          color: Theme.of(context).colorScheme.onSurface,
          height: 1.45,
        ),
        children: [
          for (final part in citationParts)
            if (part.isCitation)
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: _CitationLink(
                  citation: part.text,
                  documents: documents,
                  cards: cards,
                  onNavigateDoc: onNavigateDoc,
                ),
              )
            else
              ..._parseInline(part.text, baseStyle!, context),
        ],
      ),
    );
  }

  /// Parse inline markdown syntax into styled [TextSpan]s.
  List<InlineSpan> _parseInline(String text, TextStyle base, BuildContext context) {
    final spans = <InlineSpan>[];
    final regex = RegExp(
      r'`([^`]+)`'                                      // inline code
      r'|\*\*([^*]+)\*\*'                                // **bold**
      r'|__([^_]+)__'                                    // __bold__
      r'|\*([^*]+)\*'                                    // *italic*
      r'|_([^_]+)_'                                      // _italic_
      r'|\[([^\]]+)\]\(([^)]+)\)'                         // [text](url)
      r'|~~([^~]+)~~'                                    // ~~strikethrough~~
      r'|==([^=]+)=='                                    // ==highlight==
    );

    var lastEnd = 0;
    for (final match in regex.allMatches(text)) {
      // Plain text before this match
      if (match.start > lastEnd) {
        spans.add(TextSpan(text: text.substring(lastEnd, match.start)));
      }
      lastEnd = match.end;

      // Determine which group matched
      final code = match.group(1);
      final bold1 = match.group(2);
      final bold2 = match.group(3);
      final italic1 = match.group(4);
      final italic2 = match.group(5);
      final linkText = match.group(6);
      final linkUrl = match.group(7);
      final strike = match.group(8);
      final highlight = match.group(9);

      if (code != null) {
        spans.add(TextSpan(
          text: code,
          style: TextStyle(
            fontFamily: 'monospace',
            backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
          ),
        ));
      } else if (bold1 != null || bold2 != null) {
        spans.add(TextSpan(
          text: bold1 ?? bold2,
          style: TextStyle(fontWeight: FontWeight.w700),
        ));
      } else if (italic1 != null || italic2 != null) {
        spans.add(TextSpan(
          text: italic1 ?? italic2,
          style: TextStyle(fontStyle: FontStyle.italic),
        ));
      } else if (linkText != null && linkUrl != null) {
        spans.add(TextSpan(
          text: linkText,
          style: TextStyle(
            color: Theme.of(context).colorScheme.primary,
            decoration: TextDecoration.underline,
          ),
        ));
      } else if (strike != null) {
        spans.add(TextSpan(
          text: strike,
          style: TextStyle(decoration: TextDecoration.lineThrough),
        ));
      } else if (highlight != null) {
        spans.add(TextSpan(
          text: highlight,
          style: TextStyle(
            backgroundColor: Colors.yellow.shade200,
            color: Colors.black87,
          ),
        ));
      }
    }

    // Remaining text after last match
    if (lastEnd < text.length) {
      spans.add(TextSpan(text: text.substring(lastEnd)));
    }

    // If no matches found, return plain text
    return spans.isEmpty ? [TextSpan(text: text)] : spans;
  }
}

class _CitationLink extends StatelessWidget {
  const _CitationLink({
    required this.citation,
    required this.documents,
    required this.cards,
    required this.onNavigateDoc,
  });

  final String citation;
  final List<DebateDocument> documents;
  final List<EvidenceCard> cards;
  final ValueChanged<DebateDocument> onNavigateDoc;

  @override
  Widget build(BuildContext context) {
    final card = citation.startsWith('card-')
        ? cards.where((item) => item.id == citation).firstOrNull
        : null;
    final doc = _resolveDocument();
    final exists = card != null || doc != null;
    final title = card?.title ?? doc?.title ?? 'File does not exist: $citation';

    return Tooltip(
      richMessage: TextSpan(
        text: title,
        children: [
          TextSpan(
              text: exists ? '\n${card?.text ?? doc?.content}' : '\nMissing citation'),
        ],
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(6),
        onTap: doc == null ? null : () => onNavigateDoc(doc),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 2),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: exists
                ? Theme.of(context).colorScheme.primaryContainer
                : Theme.of(context).colorScheme.error,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            title,
            style: TextStyle(
              color: exists
                  ? Theme.of(context).colorScheme.primary
                  : Theme.of(context).colorScheme.onError,
              decoration: exists ? TextDecoration.underline : TextDecoration.none,
              decorationColor: exists ? Theme.of(context).colorScheme.primary : null,
            ),
          ),
        ),
      ),
    );
  }

  DebateDocument? _resolveDocument() {
    if (citation.startsWith('card-')) {
      final card = cards.where((item) => item.id == citation).firstOrNull;
      if (card?.docId == null) return null;
      return documents.where((doc) => doc.id == card!.docId).firstOrNull;
    }
    final parts = citation.split('/');
    if (parts.length != 2) return null;
    return documents
        .where((doc) => doc.folder == parts[0] && doc.title == parts[1])
        .firstOrNull;
  }
}

class _EvidencePane extends StatelessWidget {
  const _EvidencePane({
    required this.cards,
    required this.titleController,
    required this.sourceController,
    required this.textController,
    required this.onCreate,
    required this.onDelete,
    required this.onInsert,
    this.cardFolder = 'private',
    this.onCardFolderChanged,
  });

  final List<EvidenceCard> cards;
  final TextEditingController titleController;
  final TextEditingController sourceController;
  final TextEditingController textController;
  final VoidCallback onCreate;
  final ValueChanged<EvidenceCard> onDelete;
  final ValueChanged<EvidenceCard>? onInsert;
  final String cardFolder;
  final ValueChanged<String?>? onCardFolderChanged;

  @override
  Widget build(BuildContext context) {
    const folders = ['private', 'team', 'public'];
    final grouped = {
      for (final f in folders)
        f: cards.where((c) => c.folder == f).toList(),
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(
              title: 'Evidence',
              subtitle: 'Cards available for citation',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: titleController,
              decoration: const InputDecoration(labelText: 'Citation'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: sourceController,
              decoration: const InputDecoration(labelText: 'Source URL'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: textController,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Evidence text',
                      alignLabelWithHint: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                DropdownButton<String?>(
                  value: cardFolder,
                  items: const [
                    DropdownMenuItem(value: 'private', child: Text('Private')),
                    DropdownMenuItem(value: 'team', child: Text('Team')),
                    DropdownMenuItem(value: 'public', child: Text('Public')),
                  ],
                  onChanged: onCardFolderChanged,
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onCreate,
                icon: const Icon(Icons.add),
                label: const Text('Add card'),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: cards.isEmpty
                  ? const EmptyState(
                      icon: Icons.fact_check_outlined,
                      message: 'No evidence cards yet.',
                    )
                  : ListView(
                      children: [
                        for (final folder in folders)
                          if (grouped[folder]!.isNotEmpty)
                            _CardFolderGroup(
                              title: folder == 'private'
                                  ? 'Private'
                                  : folder == 'team'
                                      ? 'Team'
                                      : 'Public',
                              cards: grouped[folder]!,
                              onInsert: onInsert,
                              onDelete: onDelete,
                            ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CardFolderGroup extends StatelessWidget {
  const _CardFolderGroup({
    required this.title,
    required this.cards,
    required this.onInsert,
    required this.onDelete,
  });

  final String title;
  final List<EvidenceCard> cards;
  final ValueChanged<EvidenceCard>? onInsert;
  final ValueChanged<EvidenceCard> onDelete;

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      initiallyExpanded: true,
      title: Text('$title (${cards.length})'),
      children: cards.map((card) {
        return ListTile(
          dense: true,
          leading: Icon(
            card.folder == 'private'
                ? Icons.lock_outline
                : Icons.public,
            size: 18,
          ),
          title: Text(card.title),
          subtitle: Text(card.text,
              maxLines: 2, overflow: TextOverflow.ellipsis),
          trailing: Wrap(
            children: [
              IconButton(
                icon: const Icon(Icons.add_link),
                tooltip: 'Insert citation',
                onPressed:
                    onInsert == null ? null : () => onInsert!(card),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline),
                tooltip: 'Delete card',
                onPressed: () => onDelete(card),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class _TextPart {
  const _TextPart(this.text, this.isCitation);

  final String text;
  final bool isCitation;
}

List<_TextPart> _splitCitations(String text) {
  final matches = RegExp(r'\[\[([^\]]+)\]\]').allMatches(text);
  var cursor = 0;
  final parts = <_TextPart>[];
  for (final match in matches) {
    if (match.start > cursor) {
      parts.add(_TextPart(text.substring(cursor, match.start), false));
    }
    parts.add(_TextPart(match.group(1) ?? '', true));
    cursor = match.end;
  }
  if (cursor < text.length) {
    parts.add(_TextPart(text.substring(cursor), false));
  }
  return parts;
}


extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

class HighlightingTextController extends TextEditingController {
  HighlightingTextController({super.text});

  int? _highlightedLine;
  int? get highlightedLine => _highlightedLine;
  set highlightedLine(int? value) {
    if (_highlightedLine != value) {
      _highlightedLine = value;
      notifyListeners();
    }
  }

  Color? highlightColor;

  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    final lines = text.split('\n');
    if (highlightedLine == null || highlightedLine! < 0 || highlightedLine! >= lines.length) {
      return super.buildTextSpan(context: context, style: style, withComposing: withComposing);
    }

    final List<TextSpan> children = [];
    for (int i = 0; i < lines.length; i++) {
      final lineText = lines[i] + (i == lines.length - 1 ? '' : '\n');
      if (i == highlightedLine) {
        children.add(TextSpan(
          text: lineText,
          style: (style ?? const TextStyle()).copyWith(
            backgroundColor: highlightColor ?? Colors.teal.shade50.withAlpha(76),
          ),
        ));
      } else {
        children.add(TextSpan(text: lineText, style: style));
      }
    }
    return TextSpan(children: children, style: style);
  }
}
