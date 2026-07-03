import 'package:flutter/material.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../widgets/adaptive_scaffold.dart';

class AiScreen extends StatefulWidget {
  const AiScreen({
    super.key,
    required this.bridge,
    required this.snapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  State<AiScreen> createState() => _AiScreenState();
}

class _AiScreenState extends State<AiScreen> {
  final TextEditingController _messageController = TextEditingController();

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeChat = widget.snapshot.ai.chats.firstWhere(
      (chat) => chat.id == widget.snapshot.ai.activeChatId,
      orElse: () => widget.snapshot.ai.chats.isEmpty
          ? const AiChat(id: '', title: 'New chat', messages: [])
          : widget.snapshot.ai.chats.first,
    );

    return ResponsivePane(
      cacheKey: 'ai',
      children: [
        _ChatListPane(
          chats: widget.snapshot.ai.chats,
          activeChatId: activeChat.id,
          onNewChat: () => widget.bridge.dispatch(action('ai.newChat')),
          onSelect: (chat) =>
              widget.bridge.dispatch(action('ai.selectChat', {'id': chat.id})),
          onRename: (chat, title) =>
              widget.bridge.dispatch(action('ai.renameChat', {
            'id': chat.id,
            'title': title,
          })),
          onDelete: (chat) =>
              widget.bridge.dispatch(action('ai.deleteChat', {'id': chat.id})),
        ),
        _ChatPane(
          chat: activeChat,
          loading: widget.snapshot.ai.loading,
          controller: _messageController,
          onSend: () {
            final text = _messageController.text.trim();
            if (text.isEmpty) return;
            _messageController.clear();
            widget.bridge.dispatch(action('ai.sendMessage', {'text': text}));
          },
        ),
        _CitedFilesPane(
          documents: widget.snapshot.documents,
          onToggle: (doc, value) =>
              widget.bridge.dispatch(action('ai.toggleCitation', {
            'id': doc.id,
            'selected': value,
          })),
        ),
      ],
    );
  }
}

class _ChatListPane extends StatelessWidget {
  const _ChatListPane({
    required this.chats,
    required this.activeChatId,
    required this.onNewChat,
    required this.onSelect,
    required this.onRename,
    required this.onDelete,
  });

  final List<AiChat> chats;
  final String activeChatId;
  final VoidCallback onNewChat;
  final ValueChanged<AiChat> onSelect;
  final void Function(AiChat chat, String title) onRename;
  final ValueChanged<AiChat> onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionHeader(
              title: 'AI Coach',
              subtitle: 'Debate assistance and cited files',
              trailing: IconButton.filledTonal(
                onPressed: onNewChat,
                icon: const Icon(Icons.add_comment_outlined),
                tooltip: 'New chat',
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: chats.isEmpty
                  ? EmptyState(
                      icon: Icons.auto_awesome_outlined,
                      message: 'Start a coaching chat.',
                      action: FilledButton.icon(
                        onPressed: onNewChat,
                        icon: const Icon(Icons.add),
                        label: const Text('New chat'),
                      ),
                    )
                  : ListView.builder(
                      itemCount: chats.length,
                      itemBuilder: (context, index) {
                        final chat = chats[index];
                        return ListTile(
                          selected: chat.id == activeChatId,
                          leading: const Icon(Icons.chat_bubble_outline),
                          title:
                              Text(chat.title, overflow: TextOverflow.ellipsis),
                          onTap: () => onSelect(chat),
                          trailing: PopupMenuButton<String>(
                            onSelected: (value) async {
                              if (value == 'delete') {
                                onDelete(chat);
                                return;
                              }
                              final title =
                                  await _promptTitle(context, chat.title);
                              if (title != null && title.trim().isNotEmpty) {
                                onRename(chat, title.trim());
                              }
                            },
                            itemBuilder: (context) => const [
                              PopupMenuItem(
                                  value: 'rename', child: Text('Rename')),
                              PopupMenuItem(
                                  value: 'delete', child: Text('Delete')),
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

  Future<String?> _promptTitle(BuildContext context, String currentTitle) {
    final controller = TextEditingController(text: currentTitle);
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rename chat'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Chat name'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, controller.text),
              child: const Text('Save')),
        ],
      ),
    );
  }
}

class _ChatPane extends StatelessWidget {
  const _ChatPane({
    required this.chat,
    required this.loading,
    required this.controller,
    required this.onSend,
  });

  final AiChat chat;
  final bool loading;
  final TextEditingController controller;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            SectionHeader(
              title: chat.title,
              subtitle: loading ? 'Thinking' : 'Ready',
              trailing: loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : null,
            ),
            const SizedBox(height: 12),
            Expanded(
              child: chat.messages.isEmpty
                  ? const EmptyState(
                      icon: Icons.psychology_alt_outlined,
                      message:
                          'Ask for argument feedback, blocks, or round prep.',
                    )
                  : ListView.separated(
                      itemCount: chat.messages.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final message = chat.messages[index];
                        final mine = message.role == 'user';
                        return Align(
                          alignment: mine
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 560),
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: mine
                                    ? Theme.of(context)
                                        .colorScheme
                                        .primaryContainer
                                    : Theme.of(context)
                                        .colorScheme
                                        .surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Text(message.text),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    minLines: 1,
                    maxLines: 5,
                    decoration:
                        const InputDecoration(hintText: 'Message AI Coach'),
                    onSubmitted: (_) => onSend(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: loading ? null : onSend,
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CitedFilesPane extends StatelessWidget {
  const _CitedFilesPane({
    required this.documents,
    required this.onToggle,
  });

  final List<DebateDocument> documents;
  final void Function(DebateDocument doc, bool selected) onToggle;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(
              title: 'Cited files',
              subtitle: 'Select local documents for AI context',
            ),
            const SizedBox(height: 12),
            Expanded(
              child: documents.isEmpty
                  ? const EmptyState(
                      icon: Icons.folder_open_outlined,
                      message: 'Create documents before citing files.',
                    )
                  : ListView.builder(
                      itemCount: documents.length,
                      itemBuilder: (context, index) {
                        final doc = documents[index];
                        return CheckboxListTile(
                          value: doc.isShared || doc.folder == 'private',
                          onChanged: (value) => onToggle(doc, value ?? false),
                          title: Text(doc.title),
                          subtitle: Text(
                              '${doc.folder} • ${doc.isWritable ? 'writable' : 'read-only'}'),
                          controlAffinity: ListTileControlAffinity.leading,
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
