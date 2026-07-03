import 'package:flutter/material.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../widgets/adaptive_scaffold.dart';

class InRoundScreen extends StatelessWidget {
  const InRoundScreen({
    super.key,
    required this.bridge,
    required this.snapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final session = snapshot.session;
    if (session == null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Card(
          child: EmptyState(
            icon: Icons.groups_outlined,
            message: 'Start or join a debate session.',
            action: Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.icon(
                  onPressed: () => bridge.dispatch(action('session.host')),
                  icon: const Icon(Icons.add),
                  label: const Text('Host'),
                ),
                OutlinedButton.icon(
                  onPressed: () => bridge.dispatch(action('session.join')),
                  icon: const Icon(Icons.login),
                  label: const Text('Join'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return ResponsivePane(
      children: [
        _SessionSummary(session: session),
        _TimersPanel(bridge: bridge, session: session),
        _DebatersPanel(session: session),
      ],
    );
  }
}

class _SessionSummary extends StatelessWidget {
  const _SessionSummary({required this.session});

  final SessionState session;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionHeader(
              title: session.matchName,
              subtitle: 'Room ${session.roomCode} • ${session.status}',
            ),
            const SizedBox(height: 16),
            Text('Group', style: Theme.of(context).textTheme.labelMedium),
            Text(
                session.groupName.isEmpty ? 'No group set' : session.groupName),
            const Spacer(),
            FilledButton.tonalIcon(
              onPressed: () {},
              icon: const Icon(Icons.logout),
              label: const Text('Exit session'),
            ),
          ],
        ),
      ),
    );
  }
}

class _TimersPanel extends StatelessWidget {
  const _TimersPanel({
    required this.bridge,
    required this.session,
  });

  final EngineBridge bridge;
  final SessionState session;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(
              title: 'Timers',
              subtitle: 'Synced from the JavaScript engine',
            ),
            const SizedBox(height: 16),
            _TimerTile(
              name: 'Speech',
              remainingMs: session.speechRemainingMs,
              onAction: (timerAction) =>
                  bridge.dispatch(action('timer.action', {
                'timerType': 'speech',
                'action': timerAction,
              })),
            ),
            _TimerTile(
              name: 'Prep',
              remainingMs: session.prepRemainingMs,
              onAction: (timerAction) =>
                  bridge.dispatch(action('timer.action', {
                'timerType': 'prep',
                'action': timerAction,
              })),
            ),
            const Divider(height: 32),
            Expanded(
              child: session.customTimers.isEmpty
                  ? const EmptyState(
                      icon: Icons.timer_outlined,
                      message: 'No custom timers.',
                    )
                  : ListView.builder(
                      itemCount: session.customTimers.length,
                      itemBuilder: (context, index) {
                        final timer = session.customTimers[index];
                        return _TimerTile(
                          name: timer.name,
                          remainingMs: timer.remainingMs,
                          running: timer.running,
                          onAction: (timerAction) =>
                              bridge.dispatch(action('customTimer.action', {
                            'id': timer.id,
                            'action': timerAction,
                          })),
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

class _TimerTile extends StatelessWidget {
  const _TimerTile({
    required this.name,
    required this.remainingMs,
    required this.onAction,
    this.running = false,
  });

  final String name;
  final int remainingMs;
  final bool running;
  final ValueChanged<String> onAction;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(name),
      subtitle: Text(_formatDuration(remainingMs),
          style: Theme.of(context).textTheme.headlineSmall),
      trailing: Wrap(
        spacing: 4,
        children: [
          IconButton.filledTonal(
            onPressed: () => onAction(running ? 'pause' : 'start'),
            icon: Icon(running ? Icons.pause : Icons.play_arrow),
          ),
          IconButton(
            onPressed: () => onAction('reset'),
            icon: const Icon(Icons.restart_alt),
          ),
        ],
      ),
    );
  }
}

class _DebatersPanel extends StatelessWidget {
  const _DebatersPanel({required this.session});

  final SessionState session;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(
              title: 'Debaters',
              subtitle: 'Teams and speaking positions',
            ),
            const SizedBox(height: 16),
            Expanded(
              child: session.debaters.isEmpty
                  ? const EmptyState(
                      icon: Icons.person_add_alt,
                      message: 'Waiting for debaters.',
                    )
                  : ListView.builder(
                      itemCount: session.debaters.length,
                      itemBuilder: (context, index) {
                        final debater = session.debaters[index];
                        return ListTile(
                          leading:
                              const CircleAvatar(child: Icon(Icons.person)),
                          title: Text(debater.name),
                          subtitle: Text(
                              '${debater.team ?? 'unassigned'} • position ${debater.position ?? '-'}'),
                          trailing: Text(debater.status),
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

String _formatDuration(int ms) {
  final seconds = (ms / 1000).ceil();
  final minutes = seconds ~/ 60;
  final rest = seconds % 60;
  return '$minutes:${rest.toString().padLeft(2, '0')}';
}
