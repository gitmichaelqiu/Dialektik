import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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

class _InRoundScreenState extends State<InRoundScreen>
    with TickerProviderStateMixin {
  final _matchController = TextEditingController();
  final _groupController = TextEditingController();
  final _joinCodeController = TextEditingController();
  final _handoutTitleController = TextEditingController();
  final _handoutProblemController = TextEditingController();
  final _handoutDetailsController = TextEditingController();
  final _handoutTitleFocusNode = FocusNode();
  final _handoutProblemFocusNode = FocusNode();
  final _handoutDetailsFocusNode = FocusNode();
  final _customTimerNameController = TextEditingController();
  final _customTimerDurationController = TextEditingController(text: '01:00');
  final _notesController = TextEditingController();
  int _teamSize = 1;
  String? _localActiveSpeakerId;
  bool _hostIsDebater = true;
  String _lastLocalHandoutTitle = '';
  String _lastLocalHandoutProblem = '';
  String _lastLocalHandoutDetails = '';

  Future<bool> _confirmAction(BuildContext context,
      {required String title, required String content}) async {
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
        ) ??
        false;
  }

  final Set<String> _shownRequestIds = {};
  final Set<String> _shownDisconnectedIds = {};
  bool _wasPending = false;
  bool _isJoining = false;
  bool _userInitiatedExit = false;
  bool _showSpeakerPosition = false;
  String? _previousSpeakerId;
  bool _speakerInitialized = false;
  String? _copiedRoomCode; // guards auto-copy notification for host room code
  TabController? _tabController;
  static int _savedTabIndex = 0;

  @override
  void didUpdateWidget(covariant InRoundScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final session = widget.snapshot.session;
    if (_isJoining && session != null && session.status != 'pending_approval') {
      // Join completed — clear the guard flag.
      _isJoining = false;
    }
    if (session == null) {
      if (_wasPending && !_userInitiatedExit && !_isJoining) {
        // Transitioned from pending_approval → null without user clicking
        // exit: host rejected us.
        _wasPending = false;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              behavior: SnackBarBehavior.fixed,
              backgroundColor: Colors.red.shade800,
              content: const Row(
                children: [
                  Icon(Icons.cancel, color: Colors.white70, size: 20),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text('Your request was rejected by the host.',
                        style: TextStyle(color: Colors.white)),
                  ),
                ],
              ),
              duration: const Duration(seconds: 4),
            ),
          );
        });
      }
      _wasPending = false;
      _isJoining = false;
      _userInitiatedExit = false;
      _speakerInitialized = false;
      _shownRequestIds.clear();
      _copiedRoomCode = null;
      return;
    }
    if (session.status == 'pending_approval') {
      _wasPending = true;
    }
    // Auto-copy room code when the host creates a new room.
    if (session.isHost &&
        session.roomCode.isNotEmpty &&
        _copiedRoomCode != session.roomCode) {
      _copiedRoomCode = session.roomCode;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Clipboard.setData(ClipboardData(text: session.roomCode));
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.fixed,
            backgroundColor: Colors.teal.shade700,
            content: Row(
              children: [
                const Icon(Icons.copy, color: Colors.white70, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Room code ${session.roomCode} copied to clipboard!',
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ],
            ),
            duration: const Duration(seconds: 3),
          ),
        );
      });
    }
    // Don't overwrite actively-edited text fields with stale snapshot data.
    final isEditing = _handoutTitleFocusNode.hasFocus ||
        _handoutProblemFocusNode.hasFocus ||
        _handoutDetailsFocusNode.hasFocus;
    if (!isEditing) {
      if (_handoutTitleController.text != session.handout.title) {
        _handoutTitleController.text = session.handout.title;
      }
      if (_handoutProblemController.text != session.handout.problem) {
        _handoutProblemController.text = session.handout.problem;
      }
      if (_handoutDetailsController.text != session.handout.details) {
        _handoutDetailsController.text = session.handout.details;
      }
      _lastLocalHandoutTitle = session.handout.title;
      _lastLocalHandoutProblem = session.handout.problem;
      _lastLocalHandoutDetails = session.handout.details;
    }
    final speakerId = _activeSpeakerId(session);
    final notes =
        speakerId == null ? '' : session.speakerNotes[speakerId] ?? '';
    if (_notesController.text != notes && !isEditing) {
      _notesController.text = notes;
    }

    if (session.isHost && session.pendingRequests.isNotEmpty) {
      for (final req in session.pendingRequests) {
        if (!_shownRequestIds.contains(req.id)) {
          _shownRequestIds.add(req.id);
          WidgetsBinding.instance.addPostFrameCallback((_) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                behavior: SnackBarBehavior.fixed,
                backgroundColor: Colors.black87,
                content: Row(
                  children: [
                    const Icon(Icons.person_add,
                        color: Colors.white70, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Join request from ${req.name}',
                        style: const TextStyle(
                            color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        widget.bridge.dispatch(
                            action('session.rejectJoin', {'id': req.id}));
                        ScaffoldMessenger.of(context).hideCurrentSnackBar();
                      },
                      child: const Text('Reject',
                          style: TextStyle(color: Colors.redAccent)),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: () {
                        widget.bridge.dispatch(
                            action('session.approveJoin', {'id': req.id}));
                        ScaffoldMessenger.of(context).hideCurrentSnackBar();
                      },
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.teal.shade700,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                      ),
                      child: const Text('Approve'),
                    ),
                  ],
                ),
                duration: const Duration(days: 1),
              ),
            );
          });
        }
      }
    }

    // Notify host when a debater disconnects.
    if (session.isHost) {
      for (final d in session.debaters) {
        if (d.disconnected && !_shownDisconnectedIds.contains(d.id)) {
          _shownDisconnectedIds.add(d.id);
          WidgetsBinding.instance.addPostFrameCallback((_) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                behavior: SnackBarBehavior.fixed,
                backgroundColor: Colors.orange.shade800,
                content: Row(
                  children: [
                    const Icon(Icons.link_off, color: Colors.white70, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text('${d.name} disconnected.',
                          style: const TextStyle(color: Colors.white)),
                    ),
                  ],
                ),
                duration: const Duration(seconds: 3),
              ),
            );
          });
        }
      }
    }

    // Notify only the selected client when the host assigns a new active speaker.
    // Only fire on actual changes, not on initial mount or tab re-entry.
    if (!_speakerInitialized) {
      _previousSpeakerId = session.currentSpeakerId;
      _speakerInitialized = true;
    }
    if (session.currentSpeakerId != null &&
        session.currentSpeakerId != _previousSpeakerId) {
      final prevId = _previousSpeakerId;
      _previousSpeakerId = session.currentSpeakerId;
      final myUserId = widget.snapshot.settings.userId;
      if (!session.isHost &&
          session.currentSpeakerId == myUserId &&
          prevId != session.currentSpeakerId) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              behavior: SnackBarBehavior.fixed,
              backgroundColor: Colors.teal.shade700,
              content: const Row(
                children: [
                  Icon(Icons.mic, color: Colors.white70, size: 20),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text('You are the active speaker!',
                        style: TextStyle(color: Colors.white)),
                  ),
                ],
              ),
              duration: Duration(seconds: 3),
            ),
          );
        });
      }
    }
  }

  void _initTabController() {
    if (_tabController != null && _tabController!.length == 3) return;
    _tabController?.dispose();
    _tabController =
        TabController(length: 3, vsync: this, initialIndex: _savedTabIndex);
    _tabController!.addListener(() {
      if (!_tabController!.indexIsChanging) {
        _savedTabIndex = _tabController!.index;
      }
    });
  }

  @override
  void dispose() {
    _tabController?.dispose();
    _matchController.dispose();
    _groupController.dispose();
    _joinCodeController.dispose();
    _handoutTitleController.dispose();
    _handoutProblemController.dispose();
    _handoutDetailsController.dispose();
    _handoutTitleFocusNode.dispose();
    _handoutProblemFocusNode.dispose();
    _handoutDetailsFocusNode.dispose();
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

    final lastCode = widget.snapshot.lastRoomCode;
    final wasHost = widget.snapshot.lastRoomIsHost;
    final rejoinAction = lastCode != null && lastCode.isNotEmpty
        ? () {
            _isJoining = true;
            if (wasHost) {
              widget.bridge.dispatch(
                action('session.host', {
                  'matchName': 'Practice Round',
                  'groupName': 'Dialektik Team',
                  'teamSize': 1
                }),
              );
            } else {
              widget.bridge.dispatch(
                action('session.join', {'roomCode': lastCode}),
              );
            }
          }
        : null;
    final rejoinLabel = wasHost && lastCode != null && lastCode.isNotEmpty
        ? 'Re-host last room ($lastCode)'
        : null;

    final joinSessionPane = _JoinSessionPane(
      codeController: _joinCodeController,
      onJoin: () {
        _isJoining = true;
        widget.bridge.dispatch(action('session.join', {
          'roomCode': _joinCodeController.text.trim().toUpperCase(),
        }));
      },
      rejoinLabel: rejoinLabel,
      onRejoin: rejoinAction,
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

    if (session.status == 'pending_approval') {
      return Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 24),
                  Text(
                    'Waiting for Host Approval',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'You have requested to join room ${session.roomCode}. The host must approve your request before you can enter the debate session.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 24),
                  OutlinedButton.icon(
                    onPressed: () {
                      _userInitiatedExit = true;
                      widget.bridge.dispatch(action('session.exit'));
                    },
                    icon: const Icon(Icons.close),
                    label: const Text('Cancel Request'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    // The host-set active speaker (for display) vs the locally-selected
    // notes speaker (for writing notes).
    final hostSpeakerId = session.currentSpeakerId;
    final hostSpeaker = hostSpeakerId != null
        ? session.debaters.where((d) => d.id == hostSpeakerId).firstOrNull
        : null;
    final notesSpeakerId = _activeSpeakerId(session);
    final notesSpeaker = session.debaters
            .where((debater) => debater.id == notesSpeakerId)
            .firstOrNull ??
        (notesSpeakerId == 'general'
            ? const Debater(
                id: 'general', name: 'General Notes', status: 'approved')
            : null);
    final active = session.status == 'active';

    final handoutPane = active
        ? _HandoutReadPane(session: session)
        : _LobbyHandoutPane(
            session: session,
            titleController: _handoutTitleController,
            problemController: _handoutProblemController,
            detailsController: _handoutDetailsController,
            titleFocusNode: _handoutTitleFocusNode,
            problemFocusNode: _handoutProblemFocusNode,
            detailsFocusNode: _handoutDetailsFocusNode,
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
                _userInitiatedExit = true;
                widget.bridge.dispatch(action('session.exit'));
              }
            },
          );

    final timersPane = _TimersPane(
      bridge: widget.bridge,
      session: session,
      customNameController: _customTimerNameController,
      customDurationController: _customTimerDurationController,
      showPosition: _showSpeakerPosition,
      onSpeakerSelected: active
          ? (debater) {
              widget.bridge.dispatch(
                  action('session.selectSpeaker', {'id': debater.id}));
            }
          : null,
    );

    final debatersOrNotesPane = active
        ? _NotesPane(
            session: session,
            hostSpeaker: hostSpeaker,
            notesSpeaker: notesSpeaker,
            controller: _notesController,
            onSpeakerSelected: (debater) {
              setState(() => _localActiveSpeakerId = debater.id);
            },
            onNotesChanged: (text) {
              if (notesSpeakerId == null) return;
              widget.bridge.dispatch(action('session.updateNotes', {
                'speakerId': notesSpeakerId,
                'text': text,
              }));
            },
            showPosition: _showSpeakerPosition,
            onTogglePosition: () =>
                setState(() => _showSpeakerPosition = !_showSpeakerPosition),
            onSaveRound: (winner) async {
              final confirm = await _confirmAction(
                context,
                title: 'End Round & Declare Winner',
                content:
                    'Are you sure you want to declare ${winner == 'affirmative' ? 'Affirmative' : 'Negative'} as the winner and save the round to history?',
              );
              if (confirm) {
                widget.bridge
                    .dispatch(action('session.saveRound', {'winner': winner}));
              }
            },
            onExit: () async {
              final confirm = await _confirmAction(
                context,
                title: 'Exit Round',
                content:
                    'Are you sure you want to exit? Any unsaved round progress will be lost.',
              );
              if (confirm) {
                _userInitiatedExit = true;
                widget.bridge.dispatch(action('session.exit'));
              }
            },
          )
        : _DebatersPane(
            bridge: widget.bridge,
            session: session,
          );

    // Ensure tab controller exists (created once, updated on rebuild).
    _initTabController();
    return compact
        ? Scaffold(
            appBar: AppBar(
              toolbarHeight: 0,
              bottom: TabBar(
                controller: _tabController,
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
              controller: _tabController,
              children: [
                FocusTraversalGroup(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: handoutPane,
                  ),
                ),
                FocusTraversalGroup(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: timersPane,
                  ),
                ),
                FocusTraversalGroup(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: debatersOrNotesPane,
                  ),
                ),
              ],
            ),
          )
        : ResponsivePane(
            cacheKey: 'in_round_active',
            children: [
              FocusTraversalGroup(child: handoutPane),
              FocusTraversalGroup(child: timersPane),
              FocusTraversalGroup(child: debatersOrNotesPane),
            ],
          );
  }

  String? _activeSpeakerId(SessionState session) {
    return _localActiveSpeakerId ??
        session.currentSpeakerId ??
        (session.debaters.isEmpty ? 'general' : session.debaters.first.id);
  }

  void _updateHandout() {
    _dispatchHandoutEdit(
      field: 'title',
      previous: _lastLocalHandoutTitle,
      next: _handoutTitleController.text,
    );
    _dispatchHandoutEdit(
      field: 'problem',
      previous: _lastLocalHandoutProblem,
      next: _handoutProblemController.text,
    );
    _dispatchHandoutEdit(
      field: 'details',
      previous: _lastLocalHandoutDetails,
      next: _handoutDetailsController.text,
    );
    _lastLocalHandoutTitle = _handoutTitleController.text;
    _lastLocalHandoutProblem = _handoutProblemController.text;
    _lastLocalHandoutDetails = _handoutDetailsController.text;
  }

  void _dispatchHandoutEdit({
    required String field,
    required String previous,
    required String next,
  }) {
    final edit = _TextEditOp.between(previous, next);
    if (edit == null) return;
    widget.bridge.dispatch(action('session.spliceHandout', {
      'field': field,
      'index': edit.index,
      'deleteCount': edit.deleteCount,
      'insertText': edit.insertText,
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
        child: FocusTraversalGroup(
          policy: ReadingOrderTraversalPolicy(),
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
      ),
    );
  }
}

class _JoinSessionPane extends StatelessWidget {
  const _JoinSessionPane({
    required this.codeController,
    required this.onJoin,
    this.rejoinLabel,
    this.onRejoin,
  });

  final TextEditingController codeController;
  final VoidCallback onJoin;
  final String? rejoinLabel;
  final VoidCallback? onRejoin;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
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
                  onPressed: () {
                    if (codeController.text.trim().isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Please enter a room code.')),
                      );
                      return;
                    }
                    onJoin();
                  },
                  icon: const Icon(Icons.login),
                  label: const Text('Join'),
                ),
              ),
              if (onRejoin != null && rejoinLabel != null) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: onRejoin,
                    icon: const Icon(Icons.replay),
                    label: Text(rejoinLabel!),
                  ),
                ),
              ],
            ],
          ),
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
    required this.titleFocusNode,
    required this.problemFocusNode,
    required this.detailsFocusNode,
    required this.onChanged,
    required this.onStart,
    required this.onCancel,
  });

  final SessionState session;
  final TextEditingController titleController;
  final TextEditingController problemController;
  final TextEditingController detailsController;
  final FocusNode titleFocusNode;
  final FocusNode problemFocusNode;
  final FocusNode detailsFocusNode;
  final VoidCallback onChanged;
  final VoidCallback onStart;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final header = <Widget>[
      SectionHeader(
        title: 'Debate handout',
        subtitle: 'Draft the resolution',
      ),
      const SizedBox(height: 8),
      Row(
        children: [
          Expanded(
            child: Text(
              'Room Code: ${session.roomCode}',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.secondary,
                  ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            constraints: const BoxConstraints(),
            padding: EdgeInsets.zero,
            iconSize: 16,
            icon: const Icon(Icons.copy),
            tooltip: 'Copy Room Code',
            onPressed: () {
              Clipboard.setData(ClipboardData(text: session.roomCode));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                    content: Text('Room code copied to clipboard!'),
                    duration: Duration(seconds: 1)),
              );
            },
          ),
        ],
      ),
    ];

    final fields = <Widget>[
      TextField(
        controller: titleController,
        focusNode: titleFocusNode,
        enabled: session.isHost,
        decoration: const InputDecoration(labelText: 'Title'),
        onChanged: (_) => onChanged(),
      ),
      const SizedBox(height: 8),
      TextField(
        controller: problemController,
        focusNode: problemFocusNode,
        enabled: session.isHost,
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
        focusNode: detailsFocusNode,
        enabled: session.isHost,
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
          onPressed: session.isHost ? onStart : null,
          icon: const Icon(Icons.play_arrow),
          label: Text(
              session.isHost ? 'Start debate' : 'Waiting for host to start...'),
        ),
      ),
      const SizedBox(height: 8),
      SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          onPressed: onCancel,
          icon: const Icon(Icons.cancel_outlined),
          label: Text(session.isHost ? 'Cancel session' : 'Exit session'),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.red,
            side: const BorderSide(color: Colors.red),
          ),
        ),
      ),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: LayoutBuilder(
          builder: (context, constraints) {
            if (!constraints.hasBoundedHeight) {
              return SingleChildScrollView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [...header, const SizedBox(height: 12), ...fields],
                ),
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ...header,
                const SizedBox(height: 12),
                Expanded(
                  child: SingleChildScrollView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: fields,
                    ),
                  ),
                ),
              ],
            );
          },
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
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SectionHeader(
                title: session.handout.title.isEmpty
                    ? session.matchName
                    : session.handout.title,
                subtitle: session.groupName,
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Room Code: ${session.roomCode}',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: Theme.of(context).colorScheme.secondary,
                          ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    constraints: const BoxConstraints(),
                    padding: EdgeInsets.zero,
                    iconSize: 16,
                    icon: const Icon(Icons.copy),
                    tooltip: 'Copy Room Code',
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: session.roomCode));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('Room code copied to clipboard!'),
                            duration: Duration(seconds: 1)),
                      );
                    },
                  ),
                ],
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
              Text(session.handout.details.isEmpty
                  ? 'No additional context.'
                  : session.handout.details),
            ],
          ),
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
    this.showPosition = false,
    this.onSpeakerSelected,
  });

  final EngineBridge bridge;
  final SessionState session;
  final TextEditingController customNameController;
  final TextEditingController customDurationController;
  final bool showPosition;
  final ValueChanged<Debater>? onSpeakerSelected;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SectionHeader(
                title: 'Round timers',
                subtitle: 'Speech, prep, and custom timers',
                trailing: session.isHost
                    ? IconButton(
                        onPressed: () =>
                            bridge.dispatch(action('timer.resetAll')),
                        icon: const Icon(Icons.restart_alt),
                      )
                    : null,
              ),
              const SizedBox(height: 12),
              _TimerTile(
                name: 'Speech',
                remainingMs: session.speechRemainingMs,
                running: session.speechRunning,
                enabled: session.isHost,
                durationMs: 240000,
                onDurationChanged: session.isHost
                    ? (ms) => bridge.dispatch(action('timer.action', {
                          'timerType': 'speech',
                          'action': 'reset',
                          'durationSeconds': (ms / 1000).round(),
                        }))
                    : null,
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
                enabled: session.isHost,
                durationMs: 180000,
                onDurationChanged: session.isHost
                    ? (ms) => bridge.dispatch(action('timer.action', {
                          'timerType': 'prep',
                          'action': 'reset',
                          'durationSeconds': (ms / 1000).round(),
                        }))
                    : null,
                onAction: (timerAction) =>
                    bridge.dispatch(action('timer.action', {
                  'timerType': 'prep',
                  'action': timerAction,
                })),
              ),
              const Divider(height: 24),
              if (session.isHost) ...[
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
              ],
              if (session.customTimers.isEmpty)
                const EmptyState(
                    icon: Icons.timer_outlined, message: 'No custom timers.')
              else
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: session.customTimers.length,
                  itemBuilder: (context, index) {
                    final timer = session.customTimers[index];
                    return _TimerTile(
                      name: timer.name,
                      remainingMs: timer.remainingMs,
                      running: timer.running,
                      removable: true,
                      enabled: session.isHost,
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
              if (onSpeakerSelected != null && session.debaters.isNotEmpty) ...[
                const Divider(height: 16),
                Text('Active speaker',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                // Affirmative row
                _SpeakerTeamRow(
                  label: 'Affirmative',
                  color: Colors.teal,
                  debaters: session.debaters
                      .where((d) => !d.disconnected && d.team == 'affirmative')
                      .toList(),
                  currentSpeakerId: session.currentSpeakerId,
                  showPosition: showPosition,
                  isHost: session.isHost,
                  onSelect: onSpeakerSelected!,
                ),
                const SizedBox(height: 6),
                // Negative row
                _SpeakerTeamRow(
                  label: 'Negative',
                  color: Colors.deepOrange,
                  debaters: session.debaters
                      .where((d) => !d.disconnected && d.team == 'negative')
                      .toList(),
                  currentSpeakerId: session.currentSpeakerId,
                  showPosition: showPosition,
                  isHost: session.isHost,
                  onSelect: onSpeakerSelected!,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SpeakerTeamRow extends StatelessWidget {
  const _SpeakerTeamRow({
    required this.label,
    required this.color,
    required this.debaters,
    required this.currentSpeakerId,
    required this.showPosition,
    required this.isHost,
    required this.onSelect,
  });

  final String label;
  final MaterialColor color;
  final List<Debater> debaters;
  final String? currentSpeakerId;
  final bool showPosition;
  final bool isHost;
  final ValueChanged<Debater> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    // Use filled chip style for selected with proper contrast in both themes.
    final selectedColor = isDark ? color.shade200 : color.shade100;
    final selectedTextColor = isDark ? Colors.black : color.shade900;
    return Row(
      children: [
        SizedBox(
          width: 80,
          child: Text(label,
              style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                  color: isDark ? color.shade200 : color.shade700)),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final d in debaters) ...[
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      label: Text(
                        showPosition
                            ? '${d.team == 'affirmative' ? 'AFF' : 'NEG'} ${d.position ?? '-'}'
                            : d.name,
                        style: TextStyle(
                            fontSize: 12,
                            color: d.id == currentSpeakerId
                                ? selectedTextColor
                                : null),
                      ),
                      selected: d.id == currentSpeakerId,
                      selectedColor: selectedColor,
                      onSelected: isHost ? (_) => onSelect(d) : null,
                      visualDensity: VisualDensity.compact,
                      disabledColor: null,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
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
    this.enabled = true,
    this.durationMs,
    this.onDurationChanged,
  });

  final String name;
  final int remainingMs;
  final bool running;
  final bool removable;
  final VoidCallback? onRemove;
  final ValueChanged<String> onAction;
  final bool enabled;
  final int? durationMs;
  final ValueChanged<int>? onDurationChanged;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Row(
        children: [
          Flexible(
            child: Text(name, overflow: TextOverflow.ellipsis),
          ),
          if (onDurationChanged != null && durationMs != null) ...[
            const SizedBox(width: 8),
            SizedBox(
              width: 60,
              child: TextField(
                enabled: enabled,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12),
                decoration: const InputDecoration(
                  isDense: true,
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                ),
                controller: TextEditingController(
                  text: _formatDuration(durationMs!).replaceFirst('0:', ''),
                ),
                onSubmitted: (val) {
                  final parts = val.split(':');
                  final m = int.tryParse(parts[0]) ?? 4;
                  final s =
                      parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
                  onDurationChanged!(((m * 60) + s) * 1000);
                },
              ),
            ),
          ],
        ],
      ),
      subtitle: Text(_formatDuration(remainingMs),
          style: Theme.of(context).textTheme.headlineSmall),
      trailing: Wrap(
        spacing: 4,
        children: [
          IconButton.filledTonal(
            onPressed:
                enabled ? () => onAction(running ? 'pause' : 'start') : null,
            icon: Icon(running ? Icons.pause : Icons.play_arrow),
          ),
          IconButton(
            onPressed: enabled ? () => onAction('reset') : null,
            icon: const Icon(Icons.restart_alt),
          ),
          if (removable)
            IconButton(
              onPressed: enabled ? onRemove : null,
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
    final showPending = session.isHost && session.pendingRequests.isNotEmpty;
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
            if (showPending) ...[
              Text('Pending requests',
                  style: Theme.of(context)
                      .textTheme
                      .labelLarge
                      ?.copyWith(color: Theme.of(context).colorScheme.primary)),
              const SizedBox(height: 4),
              for (final req in session.pendingRequests)
                _PendingRequestTile(
                  name: req.name,
                  onApprove: () => bridge
                      .dispatch(action('session.approveJoin', {'id': req.id})),
                  onReject: () => bridge
                      .dispatch(action('session.rejectJoin', {'id': req.id})),
                ),
              const Divider(height: 24),
            ],
            Expanded(
              child: session.debaters.isEmpty
                  ? EmptyState(
                      icon: Icons.person_add_alt,
                      message: session.isHost
                          ? 'Waiting for debaters to join…'
                          : 'Waiting for host approval…',
                    )
                  : ListView.builder(
                      itemCount: session.debaters.length,
                      itemBuilder: (context, index) {
                        final debater = session.debaters[index];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: debater.disconnected
                                ? Theme.of(context)
                                    .colorScheme
                                    .surfaceContainerHighest
                                : null,
                            child: debater.disconnected
                                ? Icon(Icons.do_not_disturb_alt,
                                    color: Theme.of(context).colorScheme.error)
                                : const Icon(Icons.person),
                          ),
                          title: debater.disconnected
                              ? Text(debater.name,
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodyMedium
                                      ?.copyWith(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onSurfaceVariant,
                                        decoration: TextDecoration.lineThrough,
                                      ))
                              : Text(debater.name),
                          subtitle: Text(
                              '${debater.team ?? 'unassigned'} • position ${debater.position ?? '-'}'),
                          enabled: !debater.disconnected,
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

class _PendingRequestTile extends StatelessWidget {
  const _PendingRequestTile({
    required this.name,
    required this.onApprove,
    required this.onReject,
  });

  final String name;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        dense: true,
        leading: CircleAvatar(
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          child: Icon(Icons.person_outline,
              color: Theme.of(context).colorScheme.primary),
        ),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w500)),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            FilledButton.tonal(
              onPressed: onApprove,
              style: FilledButton.styleFrom(
                visualDensity: VisualDensity.compact,
              ),
              child: const Text('Approve'),
            ),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: onReject,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.red,
                visualDensity: VisualDensity.compact,
              ),
              child: const Text('Reject'),
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
    required this.hostSpeaker,
    required this.notesSpeaker,
    required this.controller,
    required this.onSpeakerSelected,
    required this.onNotesChanged,
    required this.onSaveRound,
    required this.onExit,
    this.showPosition = false,
    this.onTogglePosition,
  });

  final SessionState session;
  final Debater? hostSpeaker;
  final Debater? notesSpeaker;
  final TextEditingController controller;
  final ValueChanged<Debater> onSpeakerSelected;
  final ValueChanged<String> onNotesChanged;
  final ValueChanged<String> onSaveRound;
  final VoidCallback onExit;
  final bool showPosition;
  final VoidCallback? onTogglePosition;

  @override
  Widget build(BuildContext context) {
    final subtitle = hostSpeaker != null
        ? 'Active: ${hostSpeaker!.name}'
        : (notesSpeaker != null
            ? 'Notes: ${notesSpeaker!.name}'
            : 'Select a speaker');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionHeader(
              title: 'Speaker notes',
              subtitle: subtitle,
              trailing: onTogglePosition != null
                  ? IconButton(
                      icon: Icon(showPosition ? Icons.person : Icons.badge),
                      tooltip: showPosition ? 'Show name' : 'Show position',
                      onPressed: onTogglePosition,
                    )
                  : null,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final debater in session.debaters.isEmpty
                    ? [
                        const Debater(
                            id: 'general',
                            name: 'General Notes',
                            status: 'approved')
                      ]
                    : session.debaters)
                  ChoiceChip(
                    label: Text(
                      showPosition && debater.id != 'general'
                          ? '${debater.team == 'affirmative' ? 'AFF' : 'NEG'} • ${debater.position ?? '-'}'
                          : debater.name,
                    ),
                    selected: notesSpeaker?.id == debater.id,
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

class _TextEditOp {
  const _TextEditOp({
    required this.index,
    required this.deleteCount,
    required this.insertText,
  });

  final int index;
  final int deleteCount;
  final String insertText;

  static _TextEditOp? between(String previous, String next) {
    if (previous == next) return null;

    var prefix = 0;
    final maxPrefix =
        previous.length < next.length ? previous.length : next.length;
    while (prefix < maxPrefix &&
        previous.codeUnitAt(prefix) == next.codeUnitAt(prefix)) {
      prefix++;
    }

    var previousSuffix = previous.length;
    var nextSuffix = next.length;
    while (previousSuffix > prefix &&
        nextSuffix > prefix &&
        previous.codeUnitAt(previousSuffix - 1) ==
            next.codeUnitAt(nextSuffix - 1)) {
      previousSuffix--;
      nextSuffix--;
    }

    return _TextEditOp(
      index: prefix,
      deleteCount: previousSuffix - prefix,
      insertText: next.substring(prefix, nextSuffix),
    );
  }
}
