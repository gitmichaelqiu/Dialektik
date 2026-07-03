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
                trailing: IconButton(
                  onPressed: () => bridge.dispatch(action('history.refresh')),
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh',
                ),
              ),
              const SizedBox(height: 16),
              const Expanded(
                child: EmptyState(
                  icon: Icons.history_outlined,
                  message:
                      'Round history will appear here when supplied by the engine.',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
