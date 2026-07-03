import 'package:flutter/material.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../widgets/adaptive_scaffold.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({
    super.key,
    required this.bridge,
    required this.snapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final records = [...snapshot.history]
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SectionHeader(
                title: 'History',
                subtitle: 'Saved debate rounds',
                trailing: Wrap(
                  children: [
                    IconButton(
                      onPressed: () =>
                          bridge.dispatch(action('history.refresh')),
                      icon: const Icon(Icons.refresh),
                      tooltip: 'Refresh',
                    ),
                    IconButton(
                      onPressed: () =>
                          bridge.dispatch(action('history.export')),
                      icon: const Icon(Icons.download_outlined),
                      tooltip: 'Export',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: records.isEmpty
                    ? const EmptyState(
                        icon: Icons.history_outlined,
                        message: 'No debate sessions archived.',
                      )
                    : ListView.separated(
                        itemCount: records.length,
                        separatorBuilder: (context, index) =>
                            const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final record = records[index];
                          return ListTile(
                            leading: CircleAvatar(
                              child: Icon(record.result == 'win'
                                  ? Icons.emoji_events_outlined
                                  : Icons.flag_outlined),
                            ),
                            title: Text(record.matchName),
                            subtitle: Text(
                                '${record.opponentName.isEmpty ? 'Unknown opponent' : record.opponentName} • ${record.side}'),
                            trailing: Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                Chip(
                                    label: Text(record.result.isEmpty
                                        ? 'pending'
                                        : record.result)),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline),
                                  tooltip: 'Delete',
                                  onPressed: () => bridge.dispatch(action(
                                      'history.delete', {'id': record.id})),
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
      ),
    );
  }
}
