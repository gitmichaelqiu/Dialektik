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
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
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
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionHeader(
                  title: 'AI Coach',
                  subtitle: 'Debate assistance and citations',
                  trailing: IconButton.filledTonal(
                    onPressed: () =>
                        widget.bridge.dispatch(action('ai.newChat')),
                    icon: const Icon(Icons.add_comment_outlined),
                    tooltip: 'New chat',
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: widget.snapshot.ai.chats.isEmpty
                      ? const EmptyState(
                          icon: Icons.auto_awesome_outlined,
                          message: 'Start a coaching chat.',
                        )
                      : ListView.builder(
                          itemCount: widget.snapshot.ai.chats.length,
                          itemBuilder: (context, index) {
                            final chat = widget.snapshot.ai.chats[index];
                            return ListTile(
                              selected: chat.id == activeChat.id,
                              leading: const Icon(Icons.chat_bubble_outline),
                              title: Text(chat.title,
                                  overflow: TextOverflow.ellipsis),
                              onTap: () => widget.bridge.dispatch(
                                  action('ai.selectChat', {'id': chat.id})),
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                SectionHeader(
                  title: activeChat.title,
                  subtitle: widget.snapshot.ai.loading ? 'Thinking' : 'Ready',
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: activeChat.messages.isEmpty
                      ? const EmptyState(
                          icon: Icons.psychology_alt_outlined,
                          message: 'Ask for argument feedback or round prep.',
                        )
                      : ListView.separated(
                          itemCount: activeChat.messages.length,
                          separatorBuilder: (context, index) =>
                              const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final message = activeChat.messages[index];
                            final mine = message.role == 'user';
                            return Align(
                              alignment: mine
                                  ? Alignment.centerRight
                                  : Alignment.centerLeft,
                              child: ConstrainedBox(
                                constraints:
                                    const BoxConstraints(maxWidth: 520),
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
                        controller: _controller,
                        minLines: 1,
                        maxLines: 4,
                        decoration:
                            const InputDecoration(hintText: 'Message AI Coach'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: widget.snapshot.ai.loading
                          ? null
                          : () {
                              final text = _controller.text.trim();
                              if (text.isEmpty) return;
                              _controller.clear();
                              widget.bridge.dispatch(
                                  action('ai.sendMessage', {'text': text}));
                            },
                      icon: const Icon(Icons.send),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
