import 'package:flutter/material.dart';

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

  @override
  void initState() {
    super.initState();
    _selectedId = _cachedSelectedId;
    _readMode = _cachedReadMode;
  }
  final TextEditingController _contentController = TextEditingController();
  final TextEditingController _newTitleController = TextEditingController();
  final TextEditingController _cardTitleController = TextEditingController();
  final TextEditingController _cardSourceController = TextEditingController();
  final TextEditingController _cardTextController = TextEditingController();
  String _newFolder = 'private';
  String _newMode = 'write';

  DebateDocument? get _selectedDocument {
    if (widget.snapshot.documents.isEmpty) return null;
    return widget.snapshot.documents.firstWhere(
      (doc) => doc.id == _selectedId,
      orElse: () => widget.snapshot.documents.first,
    );
  }

  @override
  void didUpdateWidget(covariant DocumentsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
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

    final filesPane = _FilesPane(
      documents: widget.snapshot.documents,
      selectedId: selected?.id,
      newTitleController: _newTitleController,
      newFolder: _newFolder,
      newMode: _newMode,
      onFolderChanged: (value) => setState(() => _newFolder = value),
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
      onDelete: (doc) =>
          widget.bridge.dispatch(action('document.delete', {'id': doc.id})),
    );

    final editorPane = _EditorPane(
      document: selected,
      nameController: _nameController,
      contentController: _contentController,
      readMode: _readMode,
      documents: widget.snapshot.documents,
      cards: widget.snapshot.cards,
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
      onDuplicate: () {
        if (selected == null) return;
        widget.bridge
            .dispatch(action('document.duplicate', {'id': selected.id}));
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
        }));
        _cardTitleController.clear();
        _cardSourceController.clear();
        _cardTextController.clear();
        if (compact) _scaffoldKey.currentState?.closeEndDrawer();
      },
      onDelete: (card) =>
          widget.bridge.dispatch(action('card.delete', {'id': card.id})),
      onInsert: (card) {
        final selectedDoc = _selectedDocument;
        if (selectedDoc == null) return;
        final text = '${_contentController.text}\n\n[[${card.id}]]';
        _contentController.text = text;
        widget.bridge.dispatch(action('document.updateContent', {
          'id': selectedDoc.id,
          'content': text,
        }));
        if (compact) _scaffoldKey.currentState?.closeEndDrawer();
      },
    );

    if (compact) {
      return Scaffold(
        key: _scaffoldKey,
        drawer: Drawer(child: SafeArea(child: filesPane)),
        endDrawer: Drawer(child: SafeArea(child: evidencePane)),
        body: editorPane,
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

  void _syncControllers() {
    final doc = _selectedDocument;
    if (doc == null) return;
    if (_selectedId == null || _selectedId != doc.id) {
      _selectedId = doc.id;
      _cachedSelectedId = doc.id;
    }
    if (_nameController.text != doc.title) _nameController.text = doc.title;
    if (_contentController.text != doc.content && documentHasFocus == false) {
      _contentController.text = doc.content;
    }
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
                    initialValue: newFolder,
                    decoration: const InputDecoration(labelText: 'Folder'),
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
                    initialValue: newMode,
                    decoration: const InputDecoration(labelText: 'Mode'),
                    items: const [
                      DropdownMenuItem(value: 'write', child: Text('Writable')),
                      DropdownMenuItem(value: 'read', child: Text('Read-only')),
                    ],
                    onChanged: (value) {
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
                            onSelect: onSelect,
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

class _FolderGroup extends StatelessWidget {
  const _FolderGroup({
    required this.title,
    required this.documents,
    required this.selectedId,
    required this.onSelect,
    required this.onDelete,
  });

  final String title;
  final List<DebateDocument> documents;
  final String? selectedId;
  final ValueChanged<DebateDocument> onSelect;
  final ValueChanged<DebateDocument> onDelete;

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
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline),
                  tooltip: 'Delete',
                  onPressed: () => onDelete(doc),
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
    required this.onToggleReadMode,
    required this.onRename,
    required this.onChanged,
    required this.onMove,
    required this.onModeChanged,
    required this.onDuplicate,
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
  final ValueChanged<bool> onToggleReadMode;
  final VoidCallback onRename;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onMove;
  final ValueChanged<String> onModeChanged;
  final VoidCallback onDuplicate;
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
                  onChanged: (value) {
                    if (value != null) onMove(value);
                  },
                ),
                DropdownButton<String>(
                  value: doc.mode,
                  items: const [
                    DropdownMenuItem(value: 'write', child: Text('Writable')),
                    DropdownMenuItem(value: 'read', child: Text('Read-only')),
                  ],
                  onChanged: doc.folder == 'private'
                      ? null
                      : (value) {
                          if (value != null) onModeChanged(value);
                        },
                ),
                IconButton.outlined(
                  onPressed: onDuplicate,
                  icon: const Icon(Icons.copy),
                  tooltip: 'Duplicate',
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
                  selected: {readMode},
                  onSelectionChanged: (value) => onToggleReadMode(value.first),
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
              child: readMode
                  ? _ReadMode(
                      content: doc.content,
                      documents: documents,
                      cards: cards,
                      onNavigateDoc: onNavigateDoc,
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
                            controller: contentController,
                            expands: true,
                            maxLines: null,
                            minLines: null,
                            readOnly: !doc.isWritable,
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
  });

  final String content;
  final List<DebateDocument> documents;
  final List<EvidenceCard> cards;
  final ValueChanged<DebateDocument> onNavigateDoc;

  @override
  Widget build(BuildContext context) {
    final lines = content.split('\n');
    final children = <Widget>[];
    var inCodeBlock = false;
    for (final line in lines) {
      if (line.trimRight().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      children.add(
        _MarkdownLine(
          line: line,
          inCodeBlock: inCodeBlock,
          documents: documents,
          cards: cards,
          onNavigateDoc: onNavigateDoc,
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.only(bottom: 12),
      children: children,
    );
  }
}

class _MarkdownLine extends StatelessWidget {
  const _MarkdownLine({
    required this.line,
    required this.inCodeBlock,
    required this.documents,
    required this.cards,
    required this.onNavigateDoc,
  });

  final String line;
  final bool inCodeBlock;
  final List<DebateDocument> documents;
  final List<EvidenceCard> cards;
  final ValueChanged<DebateDocument> onNavigateDoc;

  @override
  Widget build(BuildContext context) {
    final trimmed = line.trimRight();
    if (trimmed.isEmpty) return const SizedBox(height: 10);
    if (inCodeBlock) {
      return Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        child: Text(trimmed, style: const TextStyle(fontFamily: 'monospace')),
      );
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
      return Padding(
        padding: EdgeInsets.only(top: level == 1 ? 8 : 6, bottom: 6),
        child: _InlineMarkdown(
          text: text,
          style: style?.copyWith(fontWeight: FontWeight.w700),
          documents: documents,
          cards: cards,
          onNavigateDoc: onNavigateDoc,
        ),
      );
    }

    final unordered = RegExp(r'^\s*[-*+]\s+(.+)$').firstMatch(trimmed);
    if (unordered != null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(width: 18, child: Text('•')),
            Expanded(
              child: _InlineMarkdown(
                text: unordered.group(1)!,
                documents: documents,
                cards: cards,
                onNavigateDoc: onNavigateDoc,
              ),
            ),
          ],
        ),
      );
    }

    final ordered = RegExp(r'^\s*(\d+)\.\s+(.+)$').firstMatch(trimmed);
    if (ordered != null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 30, child: Text('${ordered.group(1)}.')),
            Expanded(
              child: _InlineMarkdown(
                text: ordered.group(2)!,
                documents: documents,
                cards: cards,
                onNavigateDoc: onNavigateDoc,
              ),
            ),
          ],
        ),
      );
    }

    final quote = RegExp(r'^>\s?(.+)$').firstMatch(trimmed);
    if (quote != null) {
      return Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.only(left: 12),
        decoration: BoxDecoration(
          border: Border(
            left: BorderSide(color: Theme.of(context).colorScheme.outline),
          ),
        ),
        child: _InlineMarkdown(
          text: quote.group(1)!,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
          documents: documents,
          cards: cards,
          onNavigateDoc: onNavigateDoc,
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: _InlineMarkdown(
        text: trimmed,
        documents: documents,
        cards: cards,
        onNavigateDoc: onNavigateDoc,
      ),
    );
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
    final parts = _splitCitations(text);
    return RichText(
      text: TextSpan(
        style: baseStyle?.copyWith(
          color: Theme.of(context).colorScheme.onSurface,
          height: 1.45,
        ),
        children: [
          for (final part in parts)
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
              TextSpan(text: _stripInlineMarkdown(part.text)),
        ],
      ),
    );
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
    final title = card?.title ?? doc?.title ?? citation;

    return Tooltip(
      richMessage: TextSpan(
        text: title,
        children: [
          TextSpan(
              text: '\n${card?.text ?? doc?.content ?? 'Missing citation'}'),
        ],
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(6),
        onTap: doc == null ? null : () => onNavigateDoc(doc),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 2),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            title,
            style: TextStyle(
              color: Theme.of(context).colorScheme.primary,
              decoration: TextDecoration.underline,
              decorationColor: Theme.of(context).colorScheme.primary,
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
  });

  final List<EvidenceCard> cards;
  final TextEditingController titleController;
  final TextEditingController sourceController;
  final TextEditingController textController;
  final VoidCallback onCreate;
  final ValueChanged<EvidenceCard> onDelete;
  final ValueChanged<EvidenceCard> onInsert;

  @override
  Widget build(BuildContext context) {
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
            TextField(
              controller: textController,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Evidence text'),
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
                  : ListView.separated(
                      itemCount: cards.length,
                      separatorBuilder: (context, index) =>
                          const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final card = cards[index];
                        return ListTile(
                          dense: true,
                          title: Text(card.title),
                          subtitle: Text(card.text,
                              maxLines: 2, overflow: TextOverflow.ellipsis),
                          trailing: Wrap(
                            children: [
                              IconButton(
                                icon: const Icon(Icons.add_link),
                                tooltip: 'Insert citation',
                                onPressed: () => onInsert(card),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_outline),
                                tooltip: 'Delete card',
                                onPressed: () => onDelete(card),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
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

String _stripInlineMarkdown(String text) {
  return text
      .replaceAllMapped(RegExp(r'`([^`]+)`'), (match) => match.group(1) ?? '')
      .replaceAllMapped(
          RegExp(r'\*\*([^*]+)\*\*'), (match) => match.group(1) ?? '')
      .replaceAllMapped(RegExp(r'__([^_]+)__'), (match) => match.group(1) ?? '')
      .replaceAllMapped(RegExp(r'\*([^*]+)\*'), (match) => match.group(1) ?? '')
      .replaceAllMapped(RegExp(r'_([^_]+)_'), (match) => match.group(1) ?? '')
      .replaceAllMapped(
          RegExp(r'\[([^\]]+)\]\([^)]+\)'), (match) => match.group(1) ?? '');
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
