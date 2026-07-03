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
  String? _selectedId;
  late final TextEditingController _contentController;

  @override
  void initState() {
    super.initState();
    _contentController = TextEditingController();
  }

  @override
  void didUpdateWidget(covariant DocumentsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final doc = _selectedDocument;
    if (doc != null && _contentController.text != doc.content) {
      _contentController.text = doc.content;
    }
  }

  @override
  void dispose() {
    _contentController.dispose();
    super.dispose();
  }

  DebateDocument? get _selectedDocument {
    if (widget.snapshot.documents.isEmpty) return null;
    return widget.snapshot.documents.firstWhere(
      (doc) => doc.id == _selectedId,
      orElse: () => widget.snapshot.documents.first,
    );
  }

  @override
  Widget build(BuildContext context) {
    final doc = _selectedDocument;
    if (doc != null && _selectedId == null) {
      _selectedId = doc.id;
      _contentController.text = doc.content;
    }

    return ResponsivePane(
      children: [
        _DocumentList(
          documents: widget.snapshot.documents,
          selectedId: doc?.id,
          onSelect: (nextDoc) {
            setState(() {
              _selectedId = nextDoc.id;
              _contentController.text = nextDoc.content;
            });
          },
          onCreate: () => widget.bridge.dispatch(action('document.create')),
        ),
        _DocumentEditor(
          document: doc,
          controller: _contentController,
          onChanged: (content) {
            if (doc == null) return;
            widget.bridge.dispatch(action('document.updateContent', {
              'id': doc.id,
              'content': content,
            }));
          },
          onRename: (name) {
            if (doc == null) return;
            widget.bridge.dispatch(action('document.rename', {
              'id': doc.id,
              'name': name,
            }));
          },
        ),
        _EvidenceList(cards: widget.snapshot.cards),
      ],
    );
  }
}

class _DocumentList extends StatelessWidget {
  const _DocumentList({
    required this.documents,
    required this.selectedId,
    required this.onSelect,
    required this.onCreate,
  });

  final List<DebateDocument> documents;
  final String? selectedId;
  final ValueChanged<DebateDocument> onSelect;
  final VoidCallback onCreate;

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
                tooltip: 'New document',
              ),
            ),
            const SizedBox(height: 16),
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
                  : ListView.builder(
                      itemCount: documents.length,
                      itemBuilder: (context, index) {
                        final doc = documents[index];
                        return ListTile(
                          selected: doc.id == selectedId,
                          leading: const Icon(Icons.description_outlined),
                          title:
                              Text(doc.title, overflow: TextOverflow.ellipsis),
                          subtitle: Text(
                              '${doc.folder} • ${doc.isWritable ? 'writable' : 'read-only'}'),
                          onTap: () => onSelect(doc),
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

class _DocumentEditor extends StatelessWidget {
  const _DocumentEditor({
    required this.document,
    required this.controller,
    required this.onChanged,
    required this.onRename,
  });

  final DebateDocument? document;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onRename;

  @override
  Widget build(BuildContext context) {
    if (document == null) {
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
            TextFormField(
              key: ValueKey(document!.id),
              initialValue: document!.name,
              decoration: const InputDecoration(labelText: 'File name'),
              onFieldSubmitted: onRename,
            ),
            const SizedBox(height: 12),
            Expanded(
              child: TextField(
                controller: controller,
                expands: true,
                maxLines: null,
                minLines: null,
                readOnly: !document!.isWritable,
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
    );
  }
}

class _EvidenceList extends StatelessWidget {
  const _EvidenceList({required this.cards});

  final List<EvidenceCard> cards;

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
            const SizedBox(height: 16),
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
