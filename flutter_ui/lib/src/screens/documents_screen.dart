import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../widgets/adaptive_scaffold.dart';

enum _CardMenuAction { edit, move, delete }

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
  final FocusNode _contentFocusNode = FocusNode();

  Future<bool> _confirmAction(BuildContext context,
      {required String title, required String content}) async {
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
        ) ??
        false;
  }

  @override
  void initState() {
    super.initState();
    _selectedId = _cachedSelectedId;
    _readMode = _cachedReadMode;
    _contentController.addListener(_broadcastCursor);
    _contentFocusNode.addListener(_handleEditorFocusChanged);
  }

  final HighlightingTextController _contentController =
      HighlightingTextController();
  final TextEditingController _newTitleController = TextEditingController();
  final TextEditingController _cardTitleController = TextEditingController();
  final TextEditingController _cardSourceController = TextEditingController();
  final TextEditingController _cardTextController = TextEditingController();
  String _newFolder = 'private';
  String _newMode = 'write';
  String _newCardFolder = 'private';

  /// Tracks the last document content that was synced into controllers.
  /// Prevents _syncControllers from doing work when only timer values changed
  /// in the snapshot (which would otherwise trigger unnecessary rebuilds).
  String? _lastSyncedContent;
  String? _lastLocalContent;
  String? _lastSentCursor;
  String? _lastSentCursorDocumentId;

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

    // Recompute filtered docs with the latest snapshot before any sync logic.
    final session = widget.snapshot.session;
    final myUserId = widget.snapshot.settings.userId;
    final myTeam =
        session?.debaters.where((d) => d.id == myUserId).firstOrNull?.team;
    _computeFilteredDocs(session, myTeam, myUserId);

    // Only search for new documents when the list actually grew.
    if (widget.snapshot.documents.length >
        oldWidget.snapshot.documents.length) {
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
        _lastSyncedContent = newDoc.content;
        _lastLocalContent = newDoc.content;
      }
    }

    _syncControllers();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _contentController.removeListener(_broadcastCursor);
    _contentController.dispose();
    _contentFocusNode.removeListener(_handleEditorFocusChanged);
    _contentFocusNode.dispose();
    _newTitleController.dispose();
    _cardTitleController.dispose();
    _cardSourceController.dispose();
    _cardTextController.dispose();
    super.dispose();
  }

  void _broadcastCursor() {
    final doc = _selectedDocument;
    if (doc == null ||
        widget.snapshot.settings.manualDocumentSync ||
        !doc.isShared ||
        !doc.isWritable ||
        !_contentFocusNode.hasFocus) {
      return;
    }
    final selection = _contentController.selection;
    if (!selection.isValid || selection.baseOffset < 0) return;
    final line = _getLineFromCaret(_contentController.text, selection.baseOffset);
    if (line == null) return;
    final key = '${doc.id}:$line';
    if (_lastSentCursor == key) return;
    if (_lastSentCursorDocumentId != null &&
        _lastSentCursorDocumentId != doc.id) {
      widget.bridge.dispatch(action('document.cursor', {
        'id': _lastSentCursorDocumentId,
        'line': -1,
      }));
    }
    _lastSentCursor = key;
    _lastSentCursorDocumentId = doc.id;
    widget.bridge.dispatch(action('document.cursor', {
      'id': doc.id,
      'line': line,
    }));
  }

  void _handleEditorFocusChanged() {
    if (_contentFocusNode.hasFocus || _lastSentCursorDocumentId == null) return;
    widget.bridge.dispatch(action('document.cursor', {
      'id': _lastSentCursorDocumentId,
      'line': -1,
    }));
    _lastSentCursor = null;
    _lastSentCursorDocumentId = null;
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 840;

    final myUserId = widget.snapshot.settings.userId;
    final session = widget.snapshot.session;
    final myTeam =
        session?.debaters.where((d) => d.id == myUserId).firstOrNull?.team;

    _computeFilteredDocs(session, myTeam, myUserId);

    // Restore the cached selection if the doc is still accessible.
    _restoreSelection();

    final selected = _selectedDocument;
    final isOwner = selected == null ||
        selected.isOwnedBy(
          userId: myUserId,
          userName: widget.snapshot.settings.userName,
        );

    final filesPane = _FilesPane(
      documents: _filteredDocs,
      selectedId: selected?.id,
      myUserId: myUserId,
      myUserName: widget.snapshot.settings.userName,
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
          _lastSyncedContent = doc.content;
          _lastLocalContent = doc.content;
        });
        if (compact) _scaffoldKey.currentState?.closeDrawer();
      },
      onDelete: (doc) async {
        final confirm = await _confirmAction(
          context,
          title: 'Delete Document',
          content:
              'Are you sure you want to delete "${doc.title}"? This cannot be undone.',
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
      contentFocusNode: _contentFocusNode,
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
        final previous = _lastLocalContent ?? selected.content;
        if (!widget.snapshot.settings.manualDocumentSync &&
            selected.isShared &&
            selected.isWritable &&
            _editTouchesLine(previous, content, selected.partnerCaret)) {
          final offset = _contentController.selection.baseOffset;
          _contentController.value = TextEditingValue(
            text: previous,
            selection: TextSelection.collapsed(
              offset: offset.clamp(0, previous.length),
            ),
          );
          return;
        }
        final edit = _TextEditOp.between(previous, content);
        _lastLocalContent = content;
        if (edit == null) return;
        widget.bridge.dispatch(action('document.spliceContent', {
          'id': selected.id,
          'index': edit.index,
          'deleteCount': edit.deleteCount,
          'insertText': edit.insertText,
        }));
      },
      manualDocumentSync: widget.snapshot.settings.manualDocumentSync,
      onSync: () {
        if (selected == null) return;
        widget.bridge.dispatch(action('document.sync', {'id': selected.id}));
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Document sync sent')),
        );
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
        if (selected != null && _isSelfCitation(selected, citation)) return;
        final selection = _contentController.selection;
        final insertAt = selection.isValid
            ? selection.baseOffset
            : _contentController.text.length;
        final nextText = _contentController.text.replaceRange(
          insertAt,
          selection.isValid ? selection.extentOffset : insertAt,
          '[[$citation]]',
        );
        final previous = _contentController.text;
        if (selected != null &&
            !widget.snapshot.settings.manualDocumentSync &&
            selected.isShared &&
            selected.isWritable &&
            _editTouchesLine(previous, nextText, selected.partnerCaret)) {
          return;
        }
        _contentController.text = nextText;
        _lastLocalContent = nextText;
        if (selected != null) {
          final edit = _TextEditOp.between(previous, nextText);
          if (edit == null) return;
          widget.bridge.dispatch(action('document.spliceContent', {
            'id': selected.id,
            'index': edit.index,
            'deleteCount': edit.deleteCount,
            'insertText': edit.insertText,
          }));
        }
      },
      onNavigateDoc: (doc) => setState(() {
        _selectedId = doc.id;
        _cachedSelectedId = doc.id;
      }),
      isMobile: compact,
    );

    // Filter cards with same team-based visibility rules as documents.
    final myUserName = widget.snapshot.settings.userName;
    final filteredCards = widget.snapshot.cards.where((card) {
      if (card.folder != 'team') return true;
      if (myTeam == null) return true;
      // Find the author's team in the session
      final authorTeam = session?.debaters
          .where((d) => d.name == card.author)
          .firstOrNull
          ?.team;
      // Team card is visible if we authored it, or if the author is on our team
      return card.author == myUserName ||
          authorTeam == null ||
          authorTeam == myTeam;
    }).toList();

    final evidencePane = _EvidencePane(
      cards: filteredCards,
      titleController: _cardTitleController,
      sourceController: _cardSourceController,
      textController: _cardTextController,
      cardFolder: _newCardFolder,
      myUserName: widget.snapshot.settings.userName,
      onCardFolderChanged: (v) {
        if (v != null) setState(() => _newCardFolder = v);
      },
      onCreate: () {
        if (_cardTitleController.text.trim().isEmpty ||
            _cardTextController.text.trim().isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content:
                    Text('Please enter a citation title and evidence text.')),
          );
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
      onMenu: (card, action) async {
        switch (action) {
          case _CardMenuAction.edit:
            await _editCard(card);
          case _CardMenuAction.move:
            await _moveCard(card);
          case _CardMenuAction.delete:
            await _deleteCard(card);
        }
      },
      onInsert:
          (_readMode || (selected != null && !selected.isWritable && !isOwner))
              ? null
              : (card) {
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
                  final previous = _contentController.text;
                  _contentController.text = nextText;
                  _lastLocalContent = nextText;
                  final edit = _TextEditOp.between(previous, nextText);
                  if (edit == null) return;
                  widget.bridge.dispatch(action('document.spliceContent', {
                    'id': selectedDoc.id,
                    'index': edit.index,
                    'deleteCount': edit.deleteCount,
                    'insertText': edit.insertText,
                  }));
                  if (compact) _scaffoldKey.currentState?.closeEndDrawer();
                },
      canInsert: (card) => card.docId != selected?.id,
    );

    if (compact) {
      return Scaffold(
        key: _scaffoldKey,
        drawer: Drawer(child: SafeArea(child: filesPane)),
        endDrawer: Drawer(child: SafeArea(child: evidencePane)),
        appBar: AppBar(
          toolbarHeight: 36,
          actions: [
            IconButton.outlined(
              icon: const Icon(Icons.style, size: 18),
              tooltip: 'Evidence',
              onPressed: () => _scaffoldKey.currentState?.openEndDrawer(),
            ),
          ],
        ),
        body: _filteredDocs.isEmpty ? filesPane : editorPane,
      );
    }

    return ResponsivePane(
      cacheKey: 'documents',
      mainPaneIndex: 1,
      children: [
        FocusTraversalGroup(child: filesPane),
        FocusTraversalGroup(child: editorPane),
        FocusTraversalGroup(child: evidencePane),
      ],
    );
  }

  bool _isSelfCitation(DebateDocument document, String citation) {
    final card =
        widget.snapshot.cards.where((item) => item.id == citation).firstOrNull;
    if (card != null) return card.docId == document.id;

    final parts = citation.split('/');
    return parts.length == 2 &&
        parts[0] == document.folder &&
        parts[1] == document.title;
  }

  Future<void> _editCard(EvidenceCard card) async {
    final titleController = TextEditingController(text: card.title);
    final sourceController = TextEditingController(text: card.sourceUrl);
    final textController = TextEditingController(text: card.text);
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit evidence card'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                decoration: const InputDecoration(labelText: 'Citation'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: sourceController,
                decoration: const InputDecoration(labelText: 'Source URL'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: textController,
                minLines: 4,
                maxLines: 8,
                decoration: const InputDecoration(
                  labelText: 'Evidence text',
                  alignLabelWithHint: true,
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, {
              'title': titleController.text.trim(),
              'sourceUrl': sourceController.text.trim(),
              'text': textController.text.trim(),
            }),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    titleController.dispose();
    sourceController.dispose();
    textController.dispose();

    if (result == null || result['title']!.isEmpty || result['text']!.isEmpty) {
      return;
    }
    widget.bridge.dispatch(action('card.update', {
      'id': card.id,
      ...result,
    }));
  }

  Future<void> _moveCard(EvidenceCard card) async {
    final folder = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Move evidence card'),
        children: [
          for (final option in const [
            ('private', 'Private'),
            ('team', 'Team'),
            ('public', 'Public'),
          ])
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, option.$1),
              child: Row(
                children: [
                  Icon(
                    option.$1 == 'private' ? Icons.lock_outline : Icons.public,
                  ),
                  const SizedBox(width: 12),
                  Text(option.$2),
                  const Spacer(),
                  if (card.folder == option.$1) const Icon(Icons.check),
                ],
              ),
            ),
        ],
      ),
    );
    if (folder == null || folder == card.folder) return;
    widget.bridge.dispatch(action('card.move', {
      'id': card.id,
      'folder': folder,
    }));
  }

  Future<void> _deleteCard(EvidenceCard card) async {
    final confirm = await _confirmAction(
      context,
      title: 'Delete Card',
      content: 'Are you sure you want to delete card "${card.title}"?',
    );
    if (confirm) {
      widget.bridge.dispatch(action('card.delete', {'id': card.id}));
    }
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

    // Skip entirely when document content hasn't materially changed since last
    // sync. Timer-only snapshot updates (every ~500ms from the polling loop)
    // would otherwise trigger unnecessary controller work and cursor jumps.
    if (doc.content == _lastSyncedContent) {
      _maybeUpdateHighlight(doc);
      return;
    }

    // Never overwrite the editor while the user is actively typing.
    if (_contentController.text != doc.content && documentHasFocus == false) {
      final saved = _contentController.selection;
      _contentController.text = doc.content;
      if (saved.isValid && saved.baseOffset <= doc.content.length) {
        _contentController.selection = saved;
      }
      _lastSyncedContent = doc.content;
      _lastLocalContent = doc.content;
    } else if (_contentController.text == doc.content) {
      // Content already matches (idle state). Mark synced so future
      // timer-only ticks early-return instead of running these checks.
      _lastSyncedContent = doc.content;
      _lastLocalContent = doc.content;
    }
    // Otherwise: user is actively typing with unsaved text.
    // Don't mark synced — next tick re-checks.

    _maybeUpdateHighlight(doc);
  }

  /// Compute the filtered document list based on folder access rules.
  void _computeFilteredDocs(
    SessionState? session,
    String? myTeam,
    String? myUserId,
  ) {
    _filteredDocs = widget.snapshot.documents.where((doc) {
      if (doc.folder != 'team') return true;
      if (myTeam == null) return true;
      // Find the owner's team in the session
      final ownerTeam =
          session?.debaters.where((d) => d.id == doc.ownerId).firstOrNull?.team;
      // Team doc is visible if we own it, or if the owner is on our team
      return doc.ownerId == myUserId ||
          ownerTeam == null ||
          ownerTeam == myTeam;
    }).toList();
  }

  /// Restore the cached document selection if the document is still accessible.
  /// Falls back to the first available document if the cached one was removed
  /// or its access permissions changed. Syncs controllers so the editor shows
  /// the correct content immediately on the first build.
  void _restoreSelection() {
    if (_filteredDocs.isEmpty) {
      _selectedId = null;
      return;
    }
    if (_selectedId != null &&
        _filteredDocs.any((doc) => doc.id == _selectedId)) {
      // Cached selection is still valid — ensure controllers are in sync.
      final doc = _filteredDocs.firstWhere((d) => d.id == _selectedId);
      if (_nameController.text != doc.title) _nameController.text = doc.title;
      if (_contentController.text != doc.content) {
        _contentController.text = doc.content;
      }
      _lastSyncedContent = doc.content;
      _lastLocalContent = doc.content;
      return;
    }
    // Cached doc lost access — fall back to first available doc.
    _selectedId = _filteredDocs.first.id;
    _cachedSelectedId = _selectedId;
    final doc = _filteredDocs.first;
    _nameController.text = doc.title;
    _contentController.text = doc.content;
    _lastSyncedContent = doc.content;
    _lastLocalContent = doc.content;
  }

  /// Update the partner-caret highlight line without touching the text.
  void _maybeUpdateHighlight(DebateDocument doc) {
    final newLine = !widget.snapshot.settings.manualDocumentSync &&
            doc.isShared &&
            doc.isWritable
        ? _getLineFromCaret(doc.content, doc.partnerCaret)
        : null;
    if (newLine != _contentController.highlightedLine) {
      _contentController.highlightColor =
          Theme.of(context).colorScheme.primaryContainer.withAlpha(76);
      _contentController.highlightedLine = newLine;
    }
  }

  bool _editTouchesLine(String previous, String next, int? lockedLine) {
    if (lockedLine == null) return false;
    final edit = _TextEditOp.between(previous, next);
    if (edit == null) return false;
    final start = edit.index.clamp(0, previous.length);
    final end = (edit.index + edit.deleteCount).clamp(0, previous.length);
    final startLine = previous.substring(0, start).split('\n').length - 1;
    final endLine = previous.substring(0, end).split('\n').length - 1;
    return startLine <= lockedLine && endLine >= lockedLine;
  }

  bool get documentHasFocus {
    return _contentFocusNode.hasFocus;
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
  void _handleCreate(BuildContext context) {
    if (newTitleController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a document name.')),
      );
      return;
    }
    onCreate();
  }

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
    this.myUserName = '',
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
  final String myUserName;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: FocusTraversalGroup(
          policy: ReadingOrderTraversalPolicy(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SectionHeader(
                title: 'Documents',
                subtitle: 'Private, team, and public files',
                trailing: IconButton.filledTonal(
                  onPressed: () => _handleCreate(context),
                  icon: const Icon(Icons.add),
                  tooltip: 'Create document',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: newTitleController,
                decoration: const InputDecoration(labelText: 'New document'),
                onSubmitted: (_) => _handleCreate(context),
              ),
              const SizedBox(height: 8),
              LayoutBuilder(
                builder: (context, constraints) {
                  final useRow = constraints.maxWidth >= 320;
                  final folder = DropdownButtonFormField<String>(
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
                  );
                  final mode = DropdownButtonFormField<String>(
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
                  );
                  if (useRow) {
                    return Row(
                      children: [
                        Expanded(child: folder),
                        const SizedBox(width: 8),
                        Expanded(child: mode),
                      ],
                    );
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      folder,
                      const SizedBox(height: 8),
                      mode,
                    ],
                  );
                },
              ),
              const SizedBox(height: 12),
              Expanded(
                child: documents.isEmpty
                    ? EmptyState(
                        icon: Icons.article_outlined,
                        message: 'No documents yet.',
                        action: FilledButton.icon(
                          onPressed: () => _handleCreate(context),
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
                              myUserName: myUserName,
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
    this.myUserName = '',
  });

  final String title;
  final List<DebateDocument> documents;
  final String? selectedId;
  final ValueChanged<DebateDocument> onSelect;
  final ValueChanged<DebateDocument> onDelete;
  final ValueChanged<DebateDocument> onDuplicate;
  final String? myUserId;
  final String myUserName;

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
                subtitle: Text(
                  doc.isWritable ? 'Writable' : 'Read-only',
                  maxLines: 1,
                  softWrap: false,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.copy),
                      tooltip: 'Duplicate',
                      onPressed: () => onDuplicate(doc),
                    ),
                    if (doc.isOwnedBy(userId: myUserId, userName: myUserName))
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
    required this.contentFocusNode,
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
    required this.manualDocumentSync,
    required this.onSync,
    this.isMobile = false,
  });

  final DebateDocument? document;
  final TextEditingController nameController;
  final TextEditingController contentController;
  final FocusNode contentFocusNode;
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
  final bool manualDocumentSync;
  final VoidCallback onSync;
  final bool isMobile;

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
    final collaborationLockedLine = !manualDocumentSync &&
            doc.isShared &&
            doc.isWritable
        ? doc.partnerCaret
        : null;
    final collaborationEditor = doc.partnerName;
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
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 240),
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
                    ButtonSegment(value: false, label: Text('Edit')),
                    ButtonSegment(value: true, label: Text('Read')),
                  ],
                  selected: {effectiveReadMode},
                  onSelectionChanged: forceRead
                      ? null
                      : (value) => onToggleReadMode(value.first),
                ),
                if (manualDocumentSync && doc.folder != 'private')
                  FilledButton.tonalIcon(
                    onPressed: onSync,
                    icon: const Icon(Icons.sync),
                    label: const Text('Sync'),
                  ),
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
                                if (target.id != doc.id)
                                  MenuItemButton(
                                    leadingIcon:
                                        const Icon(Icons.description_outlined),
                                    child: Text(target.title),
                                    onPressed: () => onInsertCitation(
                                        '${target.folder}/${target.title}'),
                                  ),
                              for (final card in cards
                                  .where((card) => card.docId != doc.id))
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
                          child: Focus(
                            onKeyEvent: (node, event) {
                              if (event is KeyDownEvent &&
                                  event.logicalKey == LogicalKeyboardKey.tab &&
                                  !HardwareKeyboard.instance.isShiftPressed) {
                                final sel = contentController.selection;
                                if (sel.isValid && sel.start >= 0) {
                                  final text = contentController.text;
                                  final newText =
                                      '${text.substring(0, sel.start)}    ${text.substring(sel.end)}';
                                  contentController.text = newText;
                                  contentController.selection =
                                      TextSelection.collapsed(
                                          offset: sel.start + 4);
                                  onChanged(newText);
                                }
                                return KeyEventResult.handled;
                              }
                              return KeyEventResult.ignored;
                            },
                            child: Tooltip(
                              message: collaborationEditor == null ||
                                      collaborationLockedLine == null
                                  ? ''
                                  : '$collaborationEditor is editing this line',
                              preferBelow: false,
                              child: TextField(
                                key: ValueKey('editor_${doc.id}'),
                                controller: contentController,
                                focusNode: contentFocusNode,
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
      crossAxisAlignment: CrossAxisAlignment.stretch,
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
            child: Align(
              alignment: Alignment.topLeft,
              child: SelectableText.rich(
                _buildDocumentSpan(context),
                textAlign: TextAlign.start,
              ),
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
        continue;
      }

      if (inCodeBlock) {
        final codeBg = Theme.of(context).colorScheme.surfaceContainerHighest;
        spans.add(TextSpan(
          text: '$line\n',
          style: TextStyle(
            fontFamily: 'monospace',
            backgroundColor: codeBg,
          ),
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
      final inlineSpans = _parseInlineMarkdownWithCitations(
        trimmed,
        lineStyle!,
        context,
      );
      spans.addAll(inlineSpans);
      if (!isLast) spans.add(const TextSpan(text: '\n'));
    }
    return TextSpan(
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.45),
      children: spans,
    );
  }

  List<InlineSpan> _parseInlineMarkdownWithCitations(
    String text,
    TextStyle base,
    BuildContext context,
  ) {
    final spans = <InlineSpan>[];
    for (final part in _splitCitations(text)) {
      if (part.isCitation) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: _CitationLink(
              citation: part.text,
              documents: documents,
              cards: cards,
              onNavigateDoc: onNavigateDoc,
            ),
          ),
        );
      } else {
        spans.addAll(_parseInlineMarkdown(part.text, base));
      }
    }
    return spans;
  }

  /// Parse inline markdown syntax into styled [TextSpan]s.
  List<TextSpan> _parseInlineMarkdown(String text, TextStyle base) {
    final spans = <TextSpan>[];
    final regex = RegExp(r'`([^`]+)`' // inline code
        r'|\*\*([^*]+)\*\*' // **bold**
        r'|__([^_]+)__' // __bold__
        r'|\*([^*]+)\*' // *italic*
        r'|_([^_]+)_' // _italic_
        r'|~~([^~]+)~~' // ~~strikethrough~~
        r'|==([^=]+)==' // ==highlight==
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
  List<InlineSpan> _parseInline(
      String text, TextStyle base, BuildContext context) {
    final spans = <InlineSpan>[];
    final regex = RegExp(r'`([^`]+)`' // inline code
        r'|\*\*([^*]+)\*\*' // **bold**
        r'|__([^_]+)__' // __bold__
        r'|\*([^*]+)\*' // *italic*
        r'|_([^_]+)_' // _italic_
        r'|\[([^\]]+)\]\(([^)]+)\)' // [text](url)
        r'|~~([^~]+)~~' // ~~strikethrough~~
        r'|==([^=]+)==' // ==highlight==
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
            backgroundColor:
                Theme.of(context).colorScheme.surfaceContainerHighest,
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

class _CitationLink extends StatefulWidget {
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
  State<_CitationLink> createState() => _CitationLinkState();
}

class _CitationLinkState extends State<_CitationLink> {
  OverlayEntry? _previewEntry;

  DebateDocument? get _document => _resolveDocument();

  EvidenceCard? get _card => widget.citation.startsWith('card-')
      ? widget.cards.where((item) => item.id == widget.citation).firstOrNull
      : null;

  bool get _exists => _card != null || _document != null;

  String get _title =>
      _card?.title ??
      _document?.title ??
      'File does not exist: ${widget.citation}';

  String get _content => _card?.text ?? _document?.content ?? '';

  @override
  void dispose() {
    _removePreview();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final doc = _document;
    final color = _exists
        ? Theme.of(context).colorScheme.primary
        : Theme.of(context).colorScheme.error;

    return MouseRegion(
      onEnter: (_) => _showPreview(),
      onExit: (_) => _removePreview(),
      child: InkWell(
        borderRadius: BorderRadius.circular(4),
        onTap: doc == null
            ? null
            : () {
                _removePreview();
                widget.onNavigateDoc(doc);
              },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 1),
          child: Text(
            _title,
            style: TextStyle(
              color: color,
              decoration:
                  _exists ? TextDecoration.underline : TextDecoration.none,
              decorationColor: _exists ? color : null,
            ),
          ),
        ),
      ),
    );
  }

  void _showPreview() {
    if (!_exists || _previewEntry != null) return;

    final overlay = Overlay.of(context, rootOverlay: true);
    final linkBox = context.findRenderObject() as RenderBox?;
    final overlayBox = overlay.context.findRenderObject() as RenderBox?;
    if (linkBox == null || overlayBox == null || !linkBox.hasSize) return;

    final globalTopLeft = linkBox.localToGlobal(Offset.zero);
    final localTopLeft = overlayBox.globalToLocal(globalTopLeft);
    final overlaySize = overlayBox.size;
    const margin = 8.0;
    final previewWidth = math.min(320.0, overlaySize.width - margin * 2);
    final previewHeight = math.min(220.0, overlaySize.height * 0.36);
    if (previewWidth <= 0 || previewHeight <= 0) return;

    final below =
        overlaySize.height - (localTopLeft.dy + linkBox.size.height) - margin;
    final above = localTopLeft.dy - margin;
    final showAbove = below < previewHeight && above > below;
    final rawTop = showAbove
        ? localTopLeft.dy - previewHeight - margin
        : localTopLeft.dy + linkBox.size.height + margin;
    final rawLeft = localTopLeft.dx;
    final top = rawTop
        .clamp(margin,
            math.max(margin, overlaySize.height - previewHeight - margin))
        .toDouble();
    final left = rawLeft
        .clamp(
            margin, math.max(margin, overlaySize.width - previewWidth - margin))
        .toDouble();

    final previewText = _content.split('\n').take(5).join('\n');
    final theme = Theme.of(context);
    final entry = OverlayEntry(
      builder: (context) => Positioned(
        left: left,
        top: top,
        width: previewWidth,
        height: previewHeight,
        child: Theme(
          data: theme,
          child: Material(
            elevation: 8,
            borderRadius: BorderRadius.circular(8),
            clipBehavior: Clip.antiAlias,
            color: theme.colorScheme.surface,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const Divider(height: 16),
                  Expanded(
                    child: SingleChildScrollView(
                      child: _InlineMarkdown(
                        text: previewText.isEmpty
                            ? 'No content available.'
                            : previewText,
                        documents: widget.documents,
                        cards: widget.cards,
                        onNavigateDoc: widget.onNavigateDoc,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    _previewEntry = entry;
    overlay.insert(entry);
  }

  void _removePreview() {
    _previewEntry?.remove();
    _previewEntry = null;
  }

  DebateDocument? _resolveDocument() {
    if (widget.citation.startsWith('card-')) {
      if (_card?.docId == null) return null;
      return widget.documents
          .where((doc) => doc.id == _card!.docId)
          .firstOrNull;
    }
    final parts = widget.citation.split('/');
    if (parts.length != 2) return null;
    return widget.documents
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
    required this.onInsert,
    required this.onMenu,
    this.canInsert,
    this.cardFolder = 'private',
    this.myUserName = '',
    this.onCardFolderChanged,
  });

  final List<EvidenceCard> cards;
  final TextEditingController titleController;
  final TextEditingController sourceController;
  final TextEditingController textController;
  final VoidCallback onCreate;
  final ValueChanged<EvidenceCard>? onInsert;
  final Future<void> Function(EvidenceCard, _CardMenuAction) onMenu;
  final bool Function(EvidenceCard)? canInsert;
  final String cardFolder;
  final String myUserName;
  final ValueChanged<String?>? onCardFolderChanged;

  @override
  Widget build(BuildContext context) {
    const folders = ['private', 'team', 'public'];
    final grouped = {
      for (final f in folders) f: cards.where((c) => c.folder == f).toList(),
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
                              canInsert: canInsert,
                              onMenu: onMenu,
                              myUserName: myUserName,
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
    required this.onMenu,
    this.canInsert,
    this.myUserName = '',
  });

  final String title;
  final List<EvidenceCard> cards;
  final ValueChanged<EvidenceCard>? onInsert;
  final bool Function(EvidenceCard)? canInsert;
  final Future<void> Function(EvidenceCard, _CardMenuAction) onMenu;
  final String myUserName;

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      initiallyExpanded: true,
      title: Text('$title (${cards.length})'),
      children: cards.map((card) {
        return ListTile(
          dense: true,
          leading: Icon(
            card.folder == 'private' ? Icons.lock_outline : Icons.public,
            size: 18,
          ),
          title: Text(card.title, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle:
              Text(card.text, maxLines: 2, overflow: TextOverflow.ellipsis),
          trailing: Wrap(
            children: [
              IconButton(
                icon: const Icon(Icons.add_link),
                tooltip: 'Insert citation',
                onPressed: onInsert == null || canInsert?.call(card) == false
                    ? null
                    : () => onInsert!(card),
              ),
              if (card.author == myUserName || myUserName.isEmpty)
                PopupMenuButton<_CardMenuAction>(
                  icon: const Icon(Icons.more_vert),
                  tooltip: 'Card actions',
                  onSelected: (action) => onMenu(card, action),
                  itemBuilder: (context) => const [
                    PopupMenuItem(
                      value: _CardMenuAction.edit,
                      child: Text('Edit'),
                    ),
                    PopupMenuItem(
                      value: _CardMenuAction.move,
                      child: Text('Move'),
                    ),
                    PopupMenuItem(
                      value: _CardMenuAction.delete,
                      child: Text('Delete'),
                    ),
                  ],
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

class _TextEditOp {
  const _TextEditOp({
    required this.index,
    required this.deleteCount,
    required this.insertText,
  });

  final int index;
  final int deleteCount;
  final String insertText;

  static _TextEditOp? between(String previous, String next) {
    if (previous == next) return null;

    var prefix = 0;
    final maxPrefix =
        previous.length < next.length ? previous.length : next.length;
    while (prefix < maxPrefix &&
        previous.codeUnitAt(prefix) == next.codeUnitAt(prefix)) {
      prefix++;
    }

    var previousSuffix = previous.length;
    var nextSuffix = next.length;
    while (previousSuffix > prefix &&
        nextSuffix > prefix &&
        previous.codeUnitAt(previousSuffix - 1) ==
            next.codeUnitAt(nextSuffix - 1)) {
      previousSuffix--;
      nextSuffix--;
    }

    return _TextEditOp(
      index: prefix,
      deleteCount: previousSuffix - prefix,
      insertText: next.substring(prefix, nextSuffix),
    );
  }
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
  TextSpan buildTextSpan(
      {required BuildContext context,
      TextStyle? style,
      required bool withComposing}) {
    final lines = text.split('\n');
    if (highlightedLine == null ||
        highlightedLine! < 0 ||
        highlightedLine! >= lines.length) {
      return super.buildTextSpan(
          context: context, style: style, withComposing: withComposing);
    }

    final List<TextSpan> children = [];
    for (int i = 0; i < lines.length; i++) {
      final lineText = lines[i] + (i == lines.length - 1 ? '' : '\n');
      if (i == highlightedLine) {
        children.add(TextSpan(
          text: lineText,
          style: (style ?? const TextStyle()).copyWith(
            backgroundColor:
                highlightColor ?? Colors.teal.shade50.withAlpha(76),
          ),
        ));
      } else {
        children.add(TextSpan(text: lineText, style: style));
      }
    }
    return TextSpan(children: children, style: style);
  }
}
