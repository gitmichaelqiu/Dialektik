import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../widgets/adaptive_scaffold.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({
    super.key,
    required this.bridge,
    required this.snapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  String? _selectedRecordId;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

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
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final records = [...widget.snapshot.history]
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));

    final filteredRecords = records.where((r) {
      final query = _searchQuery.toLowerCase();
      return r.matchName.toLowerCase().contains(query) ||
          r.opponentName.toLowerCase().contains(query);
    }).toList();

    // Stats calculations
    final totalRounds = records.length;
    final wins = records.where((r) => r.result == 'win').length;
    final winRate = totalRounds > 0 ? (wins / totalRounds * 100).round() : 0;

    final affs = records.where((r) => r.side == 'affirmative').toList();
    final negs = records.where((r) => r.side == 'negative').toList();

    final affWins = affs.where((r) => r.result == 'win').length;
    final negWins = negs.where((r) => r.result == 'win').length;

    final affWinRate = affs.isNotEmpty ? (affWins / affs.length * 100).round() : 0;
    final negWinRate = negs.isNotEmpty ? (negWins / negs.length * 100).round() : 0;

    final selectedRecord = records.firstWhere(
      (r) => r.id == _selectedRecordId,
      orElse: () => records.isNotEmpty ? records.first : const HistoryRecord(
        id: '',
        matchName: '',
        opponentName: '',
        side: '',
        result: '',
        timestamp: 0,
        flows: [],
      ),
    );

    final compact = MediaQuery.sizeOf(context).width < 840;

    // Helper to build Stats Card
    Widget buildStatsCard() {
      final content = [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Win Performance',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: Theme.of(context).colorScheme.outline,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              '$winRate%',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: Theme.of(context).colorScheme.primary,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              '$wins Wins / $totalRounds Matches',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
        if (compact) const SizedBox(height: 16) else const SizedBox(width: 16),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Win-rate by side',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: Theme.of(context).colorScheme.outline,
                  ),
            ),
            const SizedBox(height: 12),
            Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Affirmative', style: TextStyle(fontSize: 12)),
                    Text('$affWinRate%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 4),
                LinearProgressIndicator(
                  value: affWinRate / 100,
                  backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                  color: Theme.of(context).colorScheme.primary,
                  minHeight: 6,
                  borderRadius: BorderRadius.circular(3),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Negative', style: TextStyle(fontSize: 12)),
                    Text('$negWinRate%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 4),
                LinearProgressIndicator(
                  value: negWinRate / 100,
                  backgroundColor: Theme.of(context).colorScheme.secondaryContainer,
                  color: Theme.of(context).colorScheme.secondary,
                  minHeight: 6,
                  borderRadius: BorderRadius.circular(3),
                ),
              ],
            ),
          ],
        ),
      ];

      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: compact
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: content,
                )
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(flex: 2, child: content[0]),
                    content[1],
                    Expanded(flex: 3, child: content[2]),
                  ],
                ),
        ),
      );
    }

    // Helper to build selected record details pane
    Widget buildDetailsPane(HistoryRecord record, bool insideDialog) {
      if (record.id.isEmpty) {
        return const Card(
          child: EmptyState(
            icon: Icons.emoji_events_outlined,
            message: 'Select a saved round to review speech notes and outcomes.',
          ),
        );
      }

      final dateStr = DateTime.fromMillisecondsSinceEpoch(record.timestamp).toLocal().toString().split(' ')[0];

      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          record.matchName,
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 12,
                          runSpacing: 6,
                          children: [
                            Text('Date: $dateStr', style: Theme.of(context).textTheme.bodySmall),
                            Text('Opponent: ${record.opponentName.isEmpty ? "Unknown" : record.opponentName}', style: Theme.of(context).textTheme.bodySmall),
                            Text('Side: ${record.side}', style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: () async {
                      final nav = Navigator.of(context);
                      final confirm = await _confirmAction(
                        context,
                        title: 'Delete Log',
                        content: 'Are you sure you want to delete this round log from history? This action cannot be undone.',
                      );
                      if (confirm && mounted) {
                        widget.bridge.dispatch(action('history.delete', {'id': record.id}));
                        setState(() {
                          if (_selectedRecordId == record.id) {
                            _selectedRecordId = null;
                          }
                        });
                        if (insideDialog) nav.pop();
                      }
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Theme.of(context).colorScheme.error,
                      side: BorderSide(color: Theme.of(context).colorScheme.error),
                      visualDensity: VisualDensity.compact,
                    ),
                    child: const Text('Delete log'),
                  ),
                ],
              ),
              const Divider(height: 24),
              Text(
                'Speech note logs',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.outline,
                    ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: record.flows.isEmpty
                    ? const Center(child: Text('No notes logged for this speech.'))
                    : GridView.builder(
                        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                          maxCrossAxisExtent: 320,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 1.4,
                        ),
                        itemCount: record.flows.length,
                        itemBuilder: (context, index) {
                          final flow = record.flows[index];
                          return Card(
                            color: Theme.of(context).colorScheme.surfaceContainerLowest,
                            shape: RoundedRectangleBorder(
                              side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Badge(
                                    label: Text(flow.speechId),
                                    backgroundColor: Colors.teal.shade700,
                                  ),
                                  const SizedBox(height: 8),
                                  Expanded(
                                    child: SingleChildScrollView(
                                      child: Text(
                                        flow.notes.isEmpty ? 'No notes logged.' : flow.notes,
                                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                              height: 1.4,
                                            ),
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
            ],
          ),
        ),
      );
    }

    final historyListPane = Card(
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
                    onPressed: () => widget.bridge.dispatch(action('history.refresh')),
                    icon: const Icon(Icons.refresh),
                    tooltip: 'Refresh',
                  ),
                  IconButton(
                    onPressed: () {
                      final historyJson = records.map((r) => {
                        'id': r.id,
                        'matchName': r.matchName,
                        'opponentName': r.opponentName,
                        'sides': r.side,
                        'winLoss': r.result,
                        'timestamp': r.timestamp,
                        'flows': r.flows.map((f) => {
                          'speechId': f.speechId,
                          'notes': f.notes,
                        }).toList(),
                      }).toList();
                      Clipboard.setData(ClipboardData(text: jsonEncode(historyJson)));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('History exported and copied to clipboard!')),
                      );
                    },
                    icon: const Icon(Icons.download_outlined),
                    tooltip: 'Export',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _searchController,
              decoration: const InputDecoration(
                labelText: 'Search matches...',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (val) => setState(() => _searchQuery = val),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: filteredRecords.isEmpty
                  ? const EmptyState(
                      icon: Icons.history_outlined,
                      message: 'No debate sessions archived.',
                    )
                  : ListView.separated(
                      itemCount: filteredRecords.length,
                      separatorBuilder: (context, index) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final record = filteredRecords[index];
                        final isSelected = record.id == selectedRecord.id;
                        final dateStr = DateTime.fromMillisecondsSinceEpoch(record.timestamp).toLocal().toString().split(' ')[0];

                        return ListTile(
                          selected: !compact && isSelected,
                          selectedColor: Theme.of(context).colorScheme.primary,
                          selectedTileColor: Theme.of(context).colorScheme.primaryContainer,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          leading: CircleAvatar(
                            child: Icon(record.result == 'win'
                                ? Icons.emoji_events_outlined
                                : Icons.flag_outlined),
                          ),
                          title: Text(record.matchName, style: const TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Text(
                              '${record.opponentName.isEmpty ? 'Unknown opponent' : record.opponentName} • $dateStr'),
                          trailing: Chip(
                            label: Text(record.result.isEmpty ? 'pending' : record.result),
                          ),
                          onTap: () {
                            setState(() {
                              _selectedRecordId = record.id;
                            });
                            if (compact) {
                              showModalBottomSheet<void>(
                                context: context,
                                isScrollControlled: true,
                                builder: (context) {
                                  return FractionallySizedBox(
                                    heightFactor: 0.8,
                                    child: SafeArea(
                                      child: buildDetailsPane(record, true),
                                    ),
                                  );
                                },
                              );
                            }
                          },
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );

    if (compact) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            buildStatsCard(),
            const SizedBox(height: 16),
            Expanded(child: historyListPane),
          ],
        ),
      );
    }

    return ResponsivePane(
      cacheKey: 'history',
      children: [
        SizedBox(width: 320, child: historyListPane),
        Column(
          children: [
            buildStatsCard(),
            const SizedBox(height: 16),
            Expanded(child: buildDetailsPane(selectedRecord, false)),
          ],
        ),
      ],
    );
  }
}
