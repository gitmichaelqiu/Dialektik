import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final TextEditingController _messageController = TextEditingController();

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasAi = widget.snapshot.settings.hasAiKey;
    if (!hasAi) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.auto_awesome, size: 48, color: Colors.grey),
                    const SizedBox(height: 16),
                    Text(
                      'AI Coach Not Configured',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'To use the AI prep coach, please configure your OpenAI-compatible API key and endpoint in the Settings screen.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: () {
                        widget.bridge.dispatch(action('app.setActivePage', {'page': 'settings'}));
                      },
                      icon: const Icon(Icons.settings),
                      label: const Text('Go to Settings'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    final activeChat = widget.snapshot.ai.chats.firstWhere(
      (chat) => chat.id == widget.snapshot.ai.activeChatId,
      orElse: () => widget.snapshot.ai.chats.isEmpty
          ? const AiChat(id: '', title: 'New chat', messages: [])
          : widget.snapshot.ai.chats.first,
    );
    final compact = MediaQuery.sizeOf(context).width < 840;

    final chatListPane = _ChatListPane(
      chats: widget.snapshot.ai.chats,
      activeChatId: activeChat.id,
      onNewChat: () {
        if (activeChat.messages.isEmpty && widget.snapshot.ai.chats.isNotEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('You are already in a new chat.')),
          );
        } else {
          widget.bridge.dispatch(action('ai.newChat'));
        }
      },
      onSelect: (chat) {
        widget.bridge.dispatch(action('ai.selectChat', {'id': chat.id}));
        if (compact) _scaffoldKey.currentState?.closeDrawer();
      },
      onRename: (chat, title) =>
          widget.bridge.dispatch(action('ai.renameChat', {
        'id': chat.id,
        'title': title,
      })),
      onDelete: (chat) =>
          widget.bridge.dispatch(action('ai.deleteChat', {'id': chat.id})),
    );

    final chatPane = _ChatPane(
      chat: activeChat,
      loading: widget.snapshot.ai.loading,
      controller: _messageController,
      onSend: () {
        final text = _messageController.text.trim();
        if (text.isEmpty) return;
        _messageController.clear();
        widget.bridge.dispatch(action('ai.sendMessage', {'text': text}));
      },
      isMobile: compact,
      onOpenChats: () => _scaffoldKey.currentState?.openDrawer(),
      onOpenCitedFiles: () => _scaffoldKey.currentState?.openEndDrawer(),
    );

    final citedFilesPane = _CitedFilesPane(
      documents: widget.snapshot.documents,
      onToggle: (doc, value) =>
          widget.bridge.dispatch(action('ai.toggleCitation', {
        'id': doc.id,
        'selected': value,
      })),
    );

    if (compact) {
      return Scaffold(
        key: _scaffoldKey,
        drawer: Drawer(child: SafeArea(child: chatListPane)),
        endDrawer: Drawer(child: SafeArea(child: citedFilesPane)),
        body: chatPane,
      );
    }

    return ResponsivePane(
      cacheKey: 'ai',
      children: [
        chatListPane,
        chatPane,
        citedFilesPane,
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
    this.isMobile = false,
    this.onOpenChats,
    this.onOpenCitedFiles,
  });

  final AiChat chat;
  final bool loading;
  final TextEditingController controller;
  final VoidCallback onSend;
  final bool isMobile;
  final VoidCallback? onOpenChats;
  final VoidCallback? onOpenCitedFiles;

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
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (isMobile) ...[
                    IconButton(
                      icon: const Icon(Icons.chat_bubble_outline),
                      onPressed: onOpenChats,
                      tooltip: 'Chats',
                    ),
                    IconButton(
                      icon: const Icon(Icons.folder_outlined),
                      onPressed: onOpenCitedFiles,
                      tooltip: 'Cited Files',
                    ),
                  ],
                  if (loading) ...[
                    const SizedBox(width: 8),
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ],
                ],
              ),
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
                  child: Shortcuts(
                    shortcuts: {
                      const SingleActivator(LogicalKeyboardKey.enter): const SendIntent(),
                    },
                    child: Actions(
                      actions: {
                        SendIntent: CallbackAction<SendIntent>(
                          onInvoke: (intent) {
                            if (controller.text.trim().isNotEmpty) {
                              onSend();
                            }
                            return null;
                          },
                        ),
                      },
                      child: TextField(
                        controller: controller,
                        minLines: 1,
                        maxLines: 5,
                        textInputAction: TextInputAction.newline,
                        decoration:
                            const InputDecoration(hintText: 'Message AI Coach'),
                      ),
                    ),
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

class SendIntent extends Intent {
  const SendIntent();
}
