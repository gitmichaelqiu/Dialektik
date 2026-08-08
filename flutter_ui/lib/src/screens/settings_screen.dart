import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../services/auto_update_service.dart';
import '../services/app_version_service.dart';
import '../services/join_request_notification_service.dart';
import '../services/workspace_bundle_service.dart';
import '../widgets/adaptive_scaffold.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.bridge,
    required this.snapshot,
  });

  final EngineBridge bridge;
  final AppSnapshot snapshot;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  static const _maskedApiKey = '••••••••••••••••••••••••••••••••';

  late final TextEditingController _nameController;
  late final TextEditingController _aiEndpointController;
  late final TextEditingController _aiModelController;
  late final TextEditingController _aiKeyController;
  late final TextEditingController _turnServerController;
  late final TextEditingController _turnUsernameController;
  late final TextEditingController _turnCredentialController;
  late final FocusNode _aiKeyFocusNode;
  bool _checkingForUpdates = false;
  bool _transferringWorkspace = false;
  bool _hasSavedApiKey = false;
  bool _apiKeyPlaceholderActive = false;
  bool _updatingApiKeyField = false;
  bool _apiKeySavePending = false;
  bool? _pendingApiKeyState;
  bool _manualDocumentSync = false;
  bool _joinRequestNotifications = false;
  AppVersionInfo? _appVersion;
  Timer? _settingsSaveTimer;

  @override
  void initState() {
    super.initState();
    final settings = widget.snapshot.settings;
    _nameController = TextEditingController(text: settings.userName);
    _aiEndpointController = TextEditingController(text: settings.aiEndpoint);
    _aiModelController = TextEditingController(text: settings.aiModel);
    _turnServerController = TextEditingController(text: settings.turnServerUrl);
    _turnUsernameController =
        TextEditingController(text: settings.turnUsername);
    _turnCredentialController =
        TextEditingController(text: settings.turnCredential);
    _aiKeyController = TextEditingController(
      text: settings.hasAiKey ? _maskedApiKey : '',
    );
    _aiKeyFocusNode = FocusNode()..addListener(_handleApiKeyFocus);
    _hasSavedApiKey = settings.hasAiKey;
    _apiKeyPlaceholderActive = settings.hasAiKey;
    _manualDocumentSync = settings.manualDocumentSync;
    _joinRequestNotifications = settings.joinRequestNotifications;
    unawaited(_loadAppVersion());
  }

  Future<void> _loadAppVersion() async {
    final version = await AppVersionService.load();
    if (!mounted) return;
    setState(() => _appVersion = version);
  }

  @override
  void didUpdateWidget(covariant SettingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final settings = widget.snapshot.settings;
    if (oldWidget.snapshot.settings.userName != settings.userName) {
      _nameController.text = settings.userName;
    }
    if (oldWidget.snapshot.settings.aiEndpoint != settings.aiEndpoint) {
      _aiEndpointController.text = settings.aiEndpoint;
    }
    if (oldWidget.snapshot.settings.aiModel != settings.aiModel) {
      _aiModelController.text = settings.aiModel;
    }
    if (oldWidget.snapshot.settings.turnServerUrl != settings.turnServerUrl) {
      _turnServerController.text = settings.turnServerUrl;
    }
    if (oldWidget.snapshot.settings.turnUsername != settings.turnUsername) {
      _turnUsernameController.text = settings.turnUsername;
    }
    if (oldWidget.snapshot.settings.turnCredential != settings.turnCredential) {
      _turnCredentialController.text = settings.turnCredential;
    }
    if (oldWidget.snapshot.settings.manualDocumentSync !=
        settings.manualDocumentSync) {
      _manualDocumentSync = settings.manualDocumentSync;
    }
    if (oldWidget.snapshot.settings.joinRequestNotifications !=
        settings.joinRequestNotifications) {
      _joinRequestNotifications = settings.joinRequestNotifications;
    }
    final apiKeyStateSettled =
        !_apiKeySavePending || settings.hasAiKey == _pendingApiKeyState;
    if (apiKeyStateSettled) {
      _apiKeySavePending = false;
      _pendingApiKeyState = null;
      if (settings.hasAiKey) {
        _hasSavedApiKey = true;
        if (!_aiKeyFocusNode.hasFocus && !_apiKeyPlaceholderActive) {
          _showMaskedApiKey();
        }
      } else if (oldWidget.snapshot.settings.hasAiKey) {
        _hasSavedApiKey = false;
        if (!_aiKeyFocusNode.hasFocus) {
          _apiKeyPlaceholderActive = false;
          _aiKeyController.clear();
        }
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _aiEndpointController.dispose();
    _aiModelController.dispose();
    _aiKeyController.dispose();
    _turnServerController.dispose();
    _turnUsernameController.dispose();
    _turnCredentialController.dispose();
    _settingsSaveTimer?.cancel();
    _aiKeyFocusNode
      ..removeListener(_handleApiKeyFocus)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final centeredPadding = (MediaQuery.sizeOf(context).width - 960) / 2;
    final horizontalPadding = centeredPadding > 16 ? centeredPadding : 16.0;
    return ListView(
      padding: EdgeInsets.fromLTRB(
        horizontalPadding,
        16,
        horizontalPadding,
        16,
      ),
      children: [
        _buildAboutCard(context),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionHeader(
                  title: 'Notifications',
                  subtitle: 'Stay informed while viewing another tab',
                ),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('System notifications for join requests'),
                  subtitle: const Text(
                    'Show a system notification when someone requests to join your room.',
                  ),
                  value: _joinRequestNotifications,
                  onChanged: (value) {
                    setState(() => _joinRequestNotifications = value);
                    if (value) {
                      unawaited(
                          JoinRequestNotificationService.requestPermission());
                    }
                    widget.bridge.dispatch(action('settings.save', {
                      'joinRequestNotifications': value,
                    }));
                  },
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionHeader(
                  title: 'Profile',
                  subtitle: 'Local identity used in shared sessions',
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(labelText: 'User name'),
                  onChanged: (_) => _scheduleSettingsSave(),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionHeader(
                  title: 'Network settings',
                  subtitle: 'Optional TURN server for different networks',
                ),
                const SizedBox(height: 8),
                Text(
                  'Leave these fields empty for direct connections on the same network. For Metered, enter one or more TURN URLs separated by commas or new lines.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _turnServerController,
                  minLines: 1,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'TURN server URL(s)',
                    hintText: 'turn:global.relay.metered.ca:80',
                  ),
                  onChanged: (_) {
                    setState(() {});
                    _scheduleSettingsSave();
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _turnUsernameController,
                  decoration: const InputDecoration(labelText: 'TURN username'),
                  onChanged: (_) {
                    setState(() {});
                    _scheduleSettingsSave();
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _turnCredentialController,
                  obscureText: true,
                  decoration:
                      const InputDecoration(labelText: 'TURN credential'),
                  onChanged: (_) {
                    setState(() {});
                    _scheduleSettingsSave();
                  },
                ),
                const SizedBox(height: 8),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Manual document sync'),
                  subtitle: const Text(
                    'Only send shared document content when you press Sync. Other room state remains automatic.',
                  ),
                  value: _manualDocumentSync,
                  onChanged: _turnConfigured
                      ? (value) {
                          setState(() => _manualDocumentSync = value);
                          widget.bridge.dispatch(action('settings.save', {
                            'turnServerUrl': _turnServerController.text.trim(),
                            'turnUsername': _turnUsernameController.text.trim(),
                            'turnCredential':
                                _turnCredentialController.text.trim(),
                            'manualDocumentSync': value,
                          }));
                        }
                      : null,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionHeader(
                  title: 'AI settings',
                  subtitle: widget.snapshot.settings.hasAiKey
                      ? 'API key saved'
                      : 'No API key saved',
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _aiEndpointController,
                  decoration: const InputDecoration(labelText: 'Endpoint'),
                  onChanged: (_) => _scheduleSettingsSave(),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _aiModelController,
                  decoration: const InputDecoration(labelText: 'Model'),
                  onChanged: (_) => _scheduleSettingsSave(),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _aiKeyController,
                  focusNode: _aiKeyFocusNode,
                  obscureText: true,
                  obscuringCharacter: '•',
                  decoration: const InputDecoration(labelText: 'API key'),
                  onTap: _handleApiKeyFocus,
                  onChanged: _handleApiKeyChanged,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionHeader(
                  title: 'Backup and restore',
                  subtitle: 'Keep your local debate workspace portable',
                ),
                const SizedBox(height: 8),
                Text(
                  '${widget.snapshot.documents.length} documents • '
                  '${widget.snapshot.cards.length} evidence cards • '
                  '${widget.snapshot.history.length} rounds',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 6),
                Text(
                  'Backups include documents, linked Google Doc metadata and '
                  'AI context, evidence, round history, AI chats, and safe '
                  'settings. API keys and network credentials are excluded.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    FilledButton.icon(
                      onPressed:
                          _transferringWorkspace ? null : _exportWorkspace,
                      icon: const Icon(Icons.download_outlined),
                      label: const Text('Export workspace'),
                    ),
                    OutlinedButton.icon(
                      onPressed:
                          _transferringWorkspace ? null : _importWorkspace,
                      icon: const Icon(Icons.upload_file_outlined),
                      label: const Text('Restore backup'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            OutlinedButton.icon(
              onPressed: () async {
                final resetMode = await showDialog<String>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Reset Workspace'),
                    content: const Text(
                      'This clears local workspace data. Export a backup first '
                      'if you may need these documents, evidence cards, or '
                      'rounds later.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Cancel'),
                      ),
                      OutlinedButton(
                        onPressed: () => Navigator.pop(context, 'preserve'),
                        child: const Text('Reset data only'),
                      ),
                      FilledButton.tonal(
                        onPressed: () => Navigator.pop(context, 'everything'),
                        child: const Text('Reset everything'),
                      ),
                    ],
                  ),
                );
                if (resetMode != null && mounted) {
                  widget.bridge.dispatch(action('workspace.reset', {
                    'preserveSettings': resetMode == 'preserve',
                  }));
                }
              },
              icon: const Icon(Icons.warning_amber_outlined),
              label: const Text('Reset local workspace'),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _exportWorkspace() async {
    setState(() => _transferringWorkspace = true);
    try {
      final bundle = WorkspaceBundleService.encode(
        widget.snapshot,
        appVersion: _appVersion?.version ?? 'unknown',
      );
      await WorkspaceBundleService.save(bundle);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Workspace backup exported.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not export backup: $error')),
      );
    } finally {
      if (mounted) setState(() => _transferringWorkspace = false);
    }
  }

  Future<void> _importWorkspace() async {
    setState(() => _transferringWorkspace = true);
    try {
      final bundle = await WorkspaceBundleService.pickAndDecode();
      if (bundle == null || !mounted) return;
      final strategy = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Restore workspace backup'),
          content: SizedBox(
            width: 480,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${bundle.documentCount} documents • ${bundle.cardCount} '
                  'evidence cards • ${bundle.historyCount} rounds',
                ),
                if (bundle.warnings.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  for (final warning in bundle.warnings)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        '• $warning',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                ],
                const SizedBox(height: 12),
                const Text(
                  'Choose how records with the same ID should be handled.',
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, 'keepBoth'),
              child: const Text('Keep both'),
            ),
            OutlinedButton(
              onPressed: () => Navigator.pop(context, 'overwrite'),
              child: const Text('Overwrite'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, 'keepNewest'),
              child: const Text('Keep newest'),
            ),
          ],
        ),
      );
      if (strategy == null || !mounted) return;
      await widget.bridge.dispatch(action('workspace.import', {
        'data': bundle.data,
        'strategy': strategy,
      }));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Workspace backup restored.')),
      );
    } on FormatException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message.toString())),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not restore backup: $error')),
      );
    } finally {
      if (mounted) setState(() => _transferringWorkspace = false);
    }
  }

  void _save() {
    final payload = <String, Object?>{
      'userName': _nameController.text.trim(),
      'aiEndpoint': _aiEndpointController.text.trim(),
      'aiModel': _aiModelController.text.trim(),
      'turnServerUrl': _turnServerController.text.trim(),
      'turnUsername': _turnUsernameController.text.trim(),
      'turnCredential': _turnCredentialController.text.trim(),
      'manualDocumentSync': _manualDocumentSync && _turnConfigured,
      'joinRequestNotifications': _joinRequestNotifications,
    };
    final apiKey = _aiKeyController.text.trim();
    final maskIsUntouched = _apiKeyPlaceholderActive ||
        (_hasSavedApiKey && apiKey == _maskedApiKey);
    if (!maskIsUntouched) {
      payload['aiApiKey'] = apiKey;
      _hasSavedApiKey = apiKey.isNotEmpty;
      _apiKeySavePending = true;
      _pendingApiKeyState = _hasSavedApiKey;
    }
    widget.bridge.dispatch(action('settings.save', payload));
    if (_hasSavedApiKey) {
      _showMaskedApiKey();
    } else {
      _apiKeyPlaceholderActive = false;
      _aiKeyController.clear();
    }
  }

  void _scheduleSettingsSave() {
    _settingsSaveTimer?.cancel();
    _settingsSaveTimer = Timer(const Duration(milliseconds: 450), _save);
  }

  bool get _turnConfigured =>
      _turnServerController.text.trim().isNotEmpty &&
      _turnUsernameController.text.trim().isNotEmpty &&
      _turnCredentialController.text.trim().isNotEmpty;

  void _handleApiKeyFocus() {
    if (!_aiKeyFocusNode.hasFocus || !_apiKeyPlaceholderActive) return;
    _selectMaskedApiKey();
  }

  void _handleApiKeyChanged(String _) {
    if (_updatingApiKeyField) return;
    _apiKeyPlaceholderActive = false;
    _scheduleSettingsSave();
  }

  void _selectMaskedApiKey() {
    _aiKeyController.selection = TextSelection(
      baseOffset: 0,
      extentOffset: _aiKeyController.text.length,
    );
  }

  void _showMaskedApiKey() {
    _apiKeyPlaceholderActive = true;
    _updatingApiKeyField = true;
    _aiKeyController.value = const TextEditingValue(
      text: _maskedApiKey,
      selection: TextSelection.collapsed(offset: _maskedApiKey.length),
    );
    _updatingApiKeyField = false;
  }

  Future<void> _checkForUpdates() async {
    setState(() => _checkingForUpdates = true);
    try {
      final availableVersion = await AutoUpdateService.checkForUpdates();
      if (mounted && !AutoUpdateService.isSupportedDesktop) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(availableVersion == null
                ? 'Dialektik is up to date.'
                : 'A new update is available: $availableVersion'),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Unable to check for updates: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _checkingForUpdates = false);
    }
  }

  Widget _buildAboutCard(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(
              title: 'About Dialektik',
              subtitle: 'A local-first workspace for debate teams',
            ),
            const SizedBox(height: 12),
            const Text(
              'Dialektik helps debate teams prepare cases, organize evidence, '
              'manage rounds, and collaborate directly between devices. Your '
              'workspace is stored locally, with shared data synchronized '
              'peer-to-peer when you choose to connect.',
            ),
            const SizedBox(height: 12),
            Text(
              _appVersion == null
                  ? 'Version unavailable'
                  : 'Version ${_appVersion!.displayVersion}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.icon(
                  onPressed: AutoUpdateService.isSupportedPlatform &&
                          !_checkingForUpdates
                      ? _checkForUpdates
                      : null,
                  icon: _checkingForUpdates
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.system_update_outlined),
                  label: Text(_checkingForUpdates
                      ? 'Checking for updates...'
                      : 'Check for updates'),
                ),
                OutlinedButton.icon(
                  onPressed: _openRepository,
                  icon: const Icon(Icons.code),
                  label: const Text('Open GitHub repository'),
                ),
              ],
            ),
            if (!AutoUpdateService.isSupportedDesktop) ...[
              const SizedBox(height: 8),
              Text(
                'Mobile checks GitHub for newer releases only. Installation is not performed from this app.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _openRepository() async {
    final launched = await launchUrl(
      Uri.parse('https://github.com/gitmichaelqiu/Dialektik'),
      mode: LaunchMode.externalApplication,
    );
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to open the GitHub repository.')),
      );
    }
  }
}
