import 'package:flutter/material.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../widgets/adaptive_scaffold.dart';

class InRoundScreen extends StatefulWidget {
  const InRoundScreen({
    super.key,
    required this.bridge,
    required this.snapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  State<InRoundScreen> createState() => _InRoundScreenState();
}

class _InRoundScreenState extends State<InRoundScreen> {
  final _matchController = TextEditingController(text: 'Practice Round');
  final _groupController = TextEditingController(text: 'Dialektik Team');
  final _joinCodeController = TextEditingController();
  final _handoutTitleController = TextEditingController();
  final _handoutProblemController = TextEditingController();
  final _handoutDetailsController = TextEditingController();
  final _customTimerNameController = TextEditingController();
  final _customTimerDurationController = TextEditingController(text: '01:00');
  final _notesController = TextEditingController();
  int _teamSize = 1;
  String? _localActiveSpeakerId;
  bool _hostIsDebater = true;

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
  void didUpdateWidget(covariant InRoundScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final session = widget.snapshot.session;
    if (session == null) return;
    if (_handoutTitleController.text != session.handout.title) {
      _handoutTitleController.text = session.handout.title;
    }
    if (_handoutProblemController.text != session.handout.problem) {
      _handoutProblemController.text = session.handout.problem;
    }
    if (_handoutDetailsController.text != session.handout.details) {
      _handoutDetailsController.text = session.handout.details;
    }
    final speakerId = _activeSpeakerId(session);
    final notes =
        speakerId == null ? '' : session.speakerNotes[speakerId] ?? '';
    if (_notesController.text != notes &&
        FocusManager.instance.primaryFocus?.context?.widget is! EditableText) {
      _notesController.text = notes;
    }
  }

  @override
  void dispose() {
    _matchController.dispose();
    _groupController.dispose();
    _joinCodeController.dispose();
    _handoutTitleController.dispose();
    _handoutProblemController.dispose();
    _handoutDetailsController.dispose();
    _customTimerNameController.dispose();
    _customTimerDurationController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasUsername = widget.snapshot.settings.userName.trim().isNotEmpty;
    final session = widget.snapshot.session;

    if (!hasUsername && session == null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Card(
          child: EmptyState(
            icon: Icons.person_off_outlined,
            message: 'A user name is required to host or join debate sessions.',
            action: FilledButton(
              onPressed: () => widget.bridge.dispatch(
                action('app.setActivePage', {'page': 'settings'}),
              ),
              child: const Text('Configure Username in Settings'),
            ),
          ),
        ),
      );
    }

    final compact = MediaQuery.sizeOf(context).width < 840;

    final startSessionPane = _StartSessionPane(
      matchController: _matchController,
      groupController: _groupController,
      teamSize: _teamSize,
      onTeamSizeChanged: (value) => setState(() => _teamSize = value),
      hostIsDebater: _hostIsDebater,
      onHostIsDebaterChanged: (value) => setState(() => _hostIsDebater = value),
      onHost: () => widget.bridge.dispatch(action('session.host', {
        'matchName': _matchController.text.trim(),
        'groupName': _groupController.text.trim(),
        'teamSize': _teamSize,
        'participate': _hostIsDebater,
      })),
    );

    final joinSessionPane = _JoinSessionPane(
      codeController: _joinCodeController,
      onJoin: () => widget.bridge.dispatch(action('session.join', {
        'roomCode': _joinCodeController.text.trim().toUpperCase(),
      })),
    );

    if (session == null) {
      if (compact) {
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            startSessionPane,
            const SizedBox(height: 16),
            joinSessionPane,
          ],
        );
      }
      return ResponsivePane(
        cacheKey: 'in_round_setup',
        children: [
          startSessionPane,
          joinSessionPane,
        ],
      );
    }

    final activeSpeakerId = _activeSpeakerId(session);
    final activeSpeaker = session.debaters
        .where((debater) => debater.id == activeSpeakerId)
        .firstOrNull;
    final active = session.status == 'active';

    final handoutPane = active
        ? _HandoutReadPane(session: session)
        : _LobbyHandoutPane(
            session: session,
            titleController: _handoutTitleController,
            problemController: _handoutProblemController,
            detailsController: _handoutDetailsController,
            onChanged: _updateHandout,
            onStart: () =>
                widget.bridge.dispatch(action('session.startDebate')),
            onCancel: () async {
              final confirm = await _confirmAction(
                context,
                title: 'Cancel Session',
                content: 'Are you sure you want to cancel and exit this lobby?',
              );
              if (confirm) {
                widget.bridge.dispatch(action('session.exit'));
              }
            },
          );

    final timersPane = _TimersPane(
      bridge: widget.bridge,
      session: session,
      customNameController: _customTimerNameController,
      customDurationController: _customTimerDurationController,
    );

    final debatersOrNotesPane = active
        ? _NotesPane(
            session: session,
            activeSpeaker: activeSpeaker,
            controller: _notesController,
            onSpeakerSelected: (debater) {
              setState(() => _localActiveSpeakerId = debater.id);
              widget.bridge.dispatch(
                  action('session.selectSpeaker', {'id': debater.id}));
            },
            onNotesChanged: (text) {
              if (activeSpeakerId == null) return;
              widget.bridge.dispatch(action('session.updateNotes', {
                'speakerId': activeSpeakerId,
                'text': text,
              }));
            },
            onAiOutline: () =>
                widget.bridge.dispatch(action('session.aiOutline')),
            onSaveRound: (winner) async {
              final confirm = await _confirmAction(
                context,
                title: 'End Round & Declare Winner',
                content: 'Are you sure you want to declare ${winner == 'affirmative' ? 'Affirmative' : 'Negative'} as the winner and save the round to history?',
              );
              if (confirm) {
                widget.bridge.dispatch(action('session.saveRound', {'winner': winner}));
              }
            },
            onExit: () async {
              final confirm = await _confirmAction(
                context,
                title: 'Exit Round',
                content: 'Are you sure you want to exit? Any unsaved round progress will be lost.',
              );
              if (confirm) {
                widget.bridge.dispatch(action('session.exit'));
              }
            },
          )
        : _DebatersPane(
            bridge: widget.bridge,
            session: session,
          );

    if (compact) {
      return DefaultTabController(
        length: 3,
        child: Scaffold(
          appBar: AppBar(
            toolbarHeight: 0,
            bottom: TabBar(
              tabs: [
                const Tab(icon: Icon(Icons.description), text: 'Handout'),
                const Tab(icon: Icon(Icons.timer), text: 'Timers'),
                Tab(
                  icon: Icon(active ? Icons.edit_note : Icons.group),
                  text: active ? 'Notes' : 'Debaters',
                ),
              ],
            ),
          ),
          body: TabBarView(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: handoutPane,
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: timersPane,
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: debatersOrNotesPane,
              ),
            ],
          ),
        ),
      );
    }

    return ResponsivePane(
      cacheKey: 'in_round_active',
      children: [
        handoutPane,
        timersPane,
        debatersOrNotesPane,
      ],
    );
  }

  String? _activeSpeakerId(SessionState session) {
    return _localActiveSpeakerId ??
        session.currentSpeakerId ??
        (session.debaters.isEmpty ? null : session.debaters.first.id);
  }

  void _updateHandout() {
    widget.bridge.dispatch(action('session.updateHandout', {
      'title': _handoutTitleController.text,
      'problem': _handoutProblemController.text,
      'details': _handoutDetailsController.text,
    }));
  }
}

class _StartSessionPane extends StatelessWidget {
  const _StartSessionPane({
    required this.matchController,
    required this.groupController,
    required this.teamSize,
    required this.onTeamSizeChanged,
    required this.hostIsDebater,
    required this.onHostIsDebaterChanged,
    required this.onHost,
  });

  final TextEditingController matchController;
  final TextEditingController groupController;
  final int teamSize;
  final ValueChanged<int> onTeamSizeChanged;
  final bool hostIsDebater;
  final ValueChanged<bool> onHostIsDebaterChanged;
  final VoidCallback onHost;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(
              title: 'Start debate session',
              subtitle:
                  'Host a synced room for partner prep and round management',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: matchController,
              decoration: const InputDecoration(labelText: 'Match name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: groupController,
              decoration: const InputDecoration(labelText: 'School or group'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: teamSize,
              decoration: const InputDecoration(labelText: 'Team size'),
              items: [1, 2, 3, 4]
                  .map((value) =>
                      DropdownMenuItem(value: value, child: Text('$value')))
                  .toList(),
              onChanged: (value) {
                if (value != null) onTeamSizeChanged(value);
              },
            ),
            const SizedBox(height: 8),
            CheckboxListTile(
              title: const Text('Participate as debater'),
              value: hostIsDebater,
              onChanged: (val) => onHostIsDebaterChanged(val ?? true),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onHost,
                icon: const Icon(Icons.add),
                label: const Text('Host room'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _JoinSessionPane extends StatelessWidget {
  const _JoinSessionPane({
    required this.codeController,
    required this.onJoin,
  });

  final TextEditingController codeController;
  final VoidCallback onJoin;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(
              title: 'Join room',
              subtitle: 'Request access using the host room code',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: codeController,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Room code'),
              onSubmitted: (_) => onJoin(),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onJoin,
                icon: const Icon(Icons.login),
                label: const Text('Join'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LobbyHandoutPane extends StatelessWidget {
  const _LobbyHandoutPane({
    required this.session,
    required this.titleController,
    required this.problemController,
    required this.detailsController,
    required this.onChanged,
    required this.onStart,
    required this.onCancel,
  });

  final SessionState session;
  final TextEditingController titleController;
  final TextEditingController problemController;
  final TextEditingController detailsController;
  final VoidCallback onChanged;
  final VoidCallback onStart;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionHeader(
              title: 'Debate handout',
              subtitle: 'Room Code: ${session.roomCode} • Draft the resolution',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: titleController,
              decoration: const InputDecoration(labelText: 'Title'),
              onChanged: (_) => onChanged(),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: problemController,
              minLines: 4,
              maxLines: 7,
              decoration: const InputDecoration(
                labelText: 'Resolution or problem',
                alignLabelWithHint: true,
              ),
              onChanged: (_) => onChanged(),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: detailsController,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                labelText: 'Context',
                alignLabelWithHint: true,
              ),
              onChanged: (_) => onChanged(),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onStart,
                icon: const Icon(Icons.play_arrow),
                label: const Text('Start debate'),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onCancel,
                icon: const Icon(Icons.cancel_outlined),
                label: const Text('Cancel session'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.red,
                  side: const BorderSide(color: Colors.red),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HandoutReadPane extends StatelessWidget {
  const _HandoutReadPane({required this.session});

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
              title: session.handout.title.isEmpty
                  ? session.matchName
                  : session.handout.title,
              subtitle: 'Room ${session.roomCode} • ${session.groupName}',
            ),
            const SizedBox(height: 16),
            Text('Debate resolution',
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            Text(session.handout.problem.isEmpty
                ? 'No resolution entered.'
                : session.handout.problem),
            const Divider(height: 32),
            Text('Context', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            Expanded(
              child: SingleChildScrollView(
                child: Text(session.handout.details.isEmpty
                    ? 'No additional context.'
                    : session.handout.details),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TimersPane extends StatelessWidget {
  const _TimersPane({
    required this.bridge,
    required this.session,
    required this.customNameController,
    required this.customDurationController,
  });

  final EngineBridge bridge;
  final SessionState session;
  final TextEditingController customNameController;
  final TextEditingController customDurationController;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionHeader(
              title: 'Round timers',
              subtitle: 'Speech, prep, and custom timers',
              trailing: IconButton(
                onPressed: () => bridge.dispatch(action('timer.resetAll')),
                icon: const Icon(Icons.restart_alt),
              ),
            ),
            const SizedBox(height: 12),
            _TimerTile(
              name: 'Speech',
              remainingMs: session.speechRemainingMs,
              running: session.speechRunning,
              onAction: (timerAction) =>
                  bridge.dispatch(action('timer.action', {
                'timerType': 'speech',
                'action': timerAction,
              })),
            ),
            _TimerTile(
              name: 'Prep',
              remainingMs: session.prepRemainingMs,
              running: session.prepRunning,
              onAction: (timerAction) =>
                  bridge.dispatch(action('timer.action', {
                'timerType': 'prep',
                'action': timerAction,
              })),
            ),
            const Divider(height: 24),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: customNameController,
                    decoration:
                        const InputDecoration(labelText: 'Custom timer'),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 96,
                  child: TextField(
                    controller: customDurationController,
                    decoration: const InputDecoration(labelText: 'MM:SS'),
                  ),
                ),
                IconButton.filledTonal(
                  onPressed: () {
                    if (customNameController.text.trim().isEmpty) return;
                    bridge.dispatch(action('customTimer.create', {
                      'name': customNameController.text.trim(),
                      'duration': customDurationController.text.trim(),
                    }));
                    customNameController.clear();
                  },
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Expanded(
              child: session.customTimers.isEmpty
                  ? const EmptyState(
                      icon: Icons.timer_outlined, message: 'No custom timers.')
                  : ListView.builder(
                      itemCount: session.customTimers.length,
                      itemBuilder: (context, index) {
                        final timer = session.customTimers[index];
                        return _TimerTile(
                          name: timer.name,
                          remainingMs: timer.remainingMs,
                          running: timer.running,
                          removable: true,
                          onRemove: () => bridge.dispatch(
                              action('customTimer.delete', {'id': timer.id})),
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
    this.removable = false,
    this.onRemove,
  });

  final String name;
  final int remainingMs;
  final bool running;
  final bool removable;
  final VoidCallback? onRemove;
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
          if (removable)
            IconButton(
              onPressed: onRemove,
              icon: const Icon(Icons.delete_outline),
            ),
        ],
      ),
    );
  }
}

class _DebatersPane extends StatelessWidget {
  const _DebatersPane({
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
              title: 'Debaters',
              subtitle: 'Approve debaters and assign teams',
            ),
            const SizedBox(height: 12),
            Expanded(
              child: session.debaters.isEmpty
                  ? const EmptyState(
                      icon: Icons.person_add_alt,
                      message: 'Waiting for debaters.')
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
                          trailing: Wrap(
                            children: [
                              DropdownButton<String>(
                                value: debater.team ?? 'affirmative',
                                items: const [
                                  DropdownMenuItem(
                                      value: 'affirmative', child: Text('Aff')),
                                  DropdownMenuItem(
                                      value: 'negative', child: Text('Neg')),
                                ],
                                onChanged: (value) {
                                  if (value == null) return;
                                  bridge.dispatch(
                                      action('session.assignDebater', {
                                    'id': debater.id,
                                    'team': value,
                                    'position': debater.position ?? 1,
                                  }));
                                },
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
    );
  }
}

class _NotesPane extends StatelessWidget {
  const _NotesPane({
    required this.session,
    required this.activeSpeaker,
    required this.controller,
    required this.onSpeakerSelected,
    required this.onNotesChanged,
    required this.onAiOutline,
    required this.onSaveRound,
    required this.onExit,
  });

  final SessionState session;
  final Debater? activeSpeaker;
  final TextEditingController controller;
  final ValueChanged<Debater> onSpeakerSelected;
  final ValueChanged<String> onNotesChanged;
  final VoidCallback onAiOutline;
  final ValueChanged<String> onSaveRound;
  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionHeader(
              title: 'Speaker notes',
              subtitle: activeSpeaker == null
                  ? 'Select a speaker'
                  : 'Active: ${activeSpeaker!.name}',
              trailing: IconButton.filledTonal(
                onPressed: onAiOutline,
                icon: const Icon(Icons.auto_awesome),
                tooltip: 'AI outline',
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final debater in session.debaters)
                  ChoiceChip(
                    label: Text(debater.name),
                    selected: activeSpeaker?.id == debater.id,
                    onSelected: (_) => onSpeakerSelected(debater),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: TextField(
                controller: controller,
                expands: true,
                minLines: null,
                maxLines: null,
                textAlignVertical: TextAlignVertical.top,
                decoration: const InputDecoration(
                  labelText: 'Flow notes',
                  alignLabelWithHint: true,
                ),
                onChanged: onNotesChanged,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onExit,
                    icon: const Icon(Icons.logout),
                    label: const Text('Exit'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: MenuAnchor(
                    builder: (context, menuController, child) {
                      return FilledButton.icon(
                        onPressed: () => menuController.isOpen
                            ? menuController.close()
                            : menuController.open(),
                        icon: const Icon(Icons.emoji_events_outlined),
                        label: const Text('Declare Winner'),
                      );
                    },
                    menuChildren: [
                      MenuItemButton(
                        onPressed: () => onSaveRound('affirmative'),
                        child: const Text('Affirmative Wins'),
                      ),
                      MenuItemButton(
                        onPressed: () => onSaveRound('negative'),
                        child: const Text('Negative Wins'),
                      ),
                    ],
                  ),
                ),
              ],
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

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
