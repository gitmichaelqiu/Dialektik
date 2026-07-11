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
                    const Icon(Icons.auto_awesome,
                        size: 48, color: Colors.grey),
                    const SizedBox(height: 16),
                    Text(
                      'AI Coach Not Configured',
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'To use the AI prep coach, please configure your OpenAI-compatible API key and endpoint in the Settings screen.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: () {
                        widget.bridge.dispatch(
                            action('app.setActivePage', {'page': 'settings'}));
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
        if (activeChat.messages.isEmpty &&
            widget.snapshot.ai.chats.isNotEmpty) {
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
      citedDocIds: widget.snapshot.ai.citedDocIds,
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
      mainPaneIndex: 1,
      children: [
        FocusTraversalGroup(child: chatListPane),
        FocusTraversalGroup(child: chatPane),
        FocusTraversalGroup(child: citedFilesPane),
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
                        final showThinking = !mine &&
                            message.thinking != null &&
                            message.thinking!.isNotEmpty;
                        return Align(
                          alignment: mine
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 560),
                            child: Column(
                              crossAxisAlignment: mine
                                  ? CrossAxisAlignment.end
                                  : CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (showThinking)
                                  _ThinkingSection(thinking: message.thinking!),
                                DecoratedBox(
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
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        _ChatMarkdown(message.text),
                                        const SizedBox(height: 6),
                                        Align(
                                          alignment: Alignment.centerRight,
                                          child: Material(
                                            color: Colors.transparent,
                                            child: InkWell(
                                              borderRadius:
                                                  BorderRadius.circular(4),
                                              onTap: () {
                                                Clipboard.setData(
                                                  ClipboardData(
                                                      text: message.text),
                                                );
                                                ScaffoldMessenger.of(context)
                                                    .showSnackBar(
                                                  const SnackBar(
                                                    content: Text(
                                                      'Copied to clipboard',
                                                    ),
                                                    duration:
                                                        Duration(seconds: 1),
                                                  ),
                                                );
                                              },
                                              child: Padding(
                                                padding:
                                                    const EdgeInsets.all(4),
                                                child: Icon(
                                                  Icons.content_copy,
                                                  size: 14,
                                                  color: Theme.of(context)
                                                      .colorScheme
                                                      .onSurfaceVariant,
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
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
                  child: Focus(
                    onKeyEvent: (node, event) {
                      if (event is KeyDownEvent &&
                          event.logicalKey == LogicalKeyboardKey.tab &&
                          !HardwareKeyboard.instance.isShiftPressed) {
                        final sel = controller.selection;
                        if (sel.isValid && sel.start >= 0) {
                          final text = controller.text;
                          final newText =
                              '${text.substring(0, sel.start)}    ${text.substring(sel.end)}';
                          controller.text = newText;
                          controller.selection =
                              TextSelection.collapsed(offset: sel.start + 4);
                        }
                        return KeyEventResult.handled;
                      }
                      return KeyEventResult.ignored;
                    },
                    child: Shortcuts(
                      shortcuts: const {
                        SingleActivator(LogicalKeyboardKey.enter): SendIntent(),
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
                          decoration: const InputDecoration(
                              hintText: 'Message AI Coach'),
                        ),
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
    required this.citedDocIds,
    required this.onToggle,
  });

  final List<DebateDocument> documents;
  final List<String> citedDocIds;
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
                        final isCited = citedDocIds.contains(doc.id);
                        return CheckboxListTile(
                          value: isCited,
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

/// An expandable section that shows AI thinking/reasoning content.
class _ThinkingSection extends StatefulWidget {
  const _ThinkingSection({required this.thinking});

  final String thinking;

  @override
  State<_ThinkingSection> createState() => _ThinkingSectionState();
}

class _ThinkingSectionState extends State<_ThinkingSection> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => setState(() => _expanded = !_expanded),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.auto_awesome,
                      size: 16,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _expanded ? 'Hide reasoning' : 'Show reasoning',
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                            color: Theme.of(context).colorScheme.primary,
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      _expanded
                          ? Icons.keyboard_arrow_up
                          : Icons.keyboard_arrow_down,
                      size: 18,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ],
                ),
                if (_expanded) ...[
                  const SizedBox(height: 8),
                  _ChatMarkdown(widget.thinking),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SendIntent extends Intent {
  const SendIntent();
}

/// Renders markdown text as rich TextSpans with inline formatting.
class _ChatMarkdown extends StatelessWidget {
  const _ChatMarkdown(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final baseStyle = Theme.of(context).textTheme.bodyMedium;
    return SelectableText.rich(
      _buildSpans(context),
      style: baseStyle?.copyWith(height: 1.45),
    );
  }

  TextSpan _buildSpans(BuildContext context) {
    final lines = text.split('\n');
    final children = <InlineSpan>[];
    var inCodeBlock = false;
    var codeBlockContent = <String>[];
    final baseStyle = Theme.of(context).textTheme.bodyMedium;

    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      final trimmed = line.trimRight();
      final isLast = i == lines.length - 1;

      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          // End code block
          final codeBg = Theme.of(context).colorScheme.surfaceContainerHighest;
          children.add(WidgetSpan(
            alignment: PlaceholderAlignment.top,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              margin: const EdgeInsets.symmetric(vertical: 4),
              decoration: BoxDecoration(
                color: codeBg,
                borderRadius: BorderRadius.circular(6),
              ),
              child: SelectableText(
                codeBlockContent.join('\n'),
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: baseStyle?.fontSize != null
                      ? baseStyle!.fontSize! - 1
                      : 13,
                ),
              ),
            ),
          ));
          codeBlockContent.clear();
        }
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.add(line);
        continue;
      }

      if (trimmed.isEmpty) {
        children.add(const TextSpan(text: '\n'));
        continue;
      }

      // Heading
      final heading = RegExp(r'^(#{1,6})\s+(.+)$').firstMatch(trimmed);
      if (heading != null) {
        final level = heading.group(1)!.length;
        final text2 = heading.group(2)!;
        final style = switch (level) {
          1 => Theme.of(context).textTheme.titleLarge,
          2 => Theme.of(context).textTheme.titleMedium,
          _ => Theme.of(context).textTheme.titleSmall,
        };
        children.add(TextSpan(
          text: '$text2${isLast ? '' : '\n'}',
          style: style?.copyWith(fontWeight: FontWeight.w700),
        ));
        continue;
      }

      // Blockquote
      final quote = RegExp(r'^>\s?(.+)$').firstMatch(trimmed);
      if (quote != null) {
        children.add(TextSpan(
          text: '${quote.group(1)}${isLast ? '' : '\n'}',
          style: TextStyle(
            fontStyle: FontStyle.italic,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ));
        continue;
      }

      // Unordered list
      final unordered = RegExp(r'^\s*[-*+]\s+(.+)$').firstMatch(trimmed);
      if (unordered != null) {
        children.add(TextSpan(
          text: '\u{2022} ${unordered.group(1)}${isLast ? '' : '\n'}',
        ));
        continue;
      }

      // Regular inline text
      children.addAll(_parseInline(trimmed, baseStyle!, isLast, context));
    }

    return TextSpan(
      style: baseStyle?.copyWith(height: 1.45),
      children: children,
    );
  }

  List<InlineSpan> _parseInline(
      String text, TextStyle base, bool isLast, BuildContext context) {
    final spans = <InlineSpan>[];
    final regex = RegExp(
      r'`([^`]+)`' // inline code
      r'|\*\*([^*]+)\*\*' // **bold**
      r'|__([^_]+)__' // __bold__
      r'|\*([^*]+)\*' // *italic*
      r'|_([^_]+)_' // _italic_
      r'|~~([^~]+)~~' // ~~strikethrough~~
      r'|==([^=]+)==', // ==highlight==
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
          style: const TextStyle(
            fontFamily: 'monospace',
          ),
        ));
      } else if (bold1 != null || bold2 != null) {
        spans.add(TextSpan(
          text: bold1 ?? bold2,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ));
      } else if (italic1 != null || italic2 != null) {
        spans.add(TextSpan(
          text: italic1 ?? italic2,
          style: const TextStyle(fontStyle: FontStyle.italic),
        ));
      } else if (strike != null) {
        spans.add(TextSpan(
          text: strike,
          style: const TextStyle(decoration: TextDecoration.lineThrough),
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
    if (spans.isEmpty) spans.add(TextSpan(text: text));
    if (!isLast) spans.add(const TextSpan(text: '\n'));
    return spans;
  }
}
