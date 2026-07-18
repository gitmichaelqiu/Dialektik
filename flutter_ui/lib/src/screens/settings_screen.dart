import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
import '../services/auto_update_service.dart';
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
  bool _saved = false;
  bool _checkingForUpdates = false;
  bool _hasSavedApiKey = false;
  bool _apiKeyPlaceholderActive = false;
  bool _updatingApiKeyField = false;
  bool _apiKeySavePending = false;
  bool? _pendingApiKeyState;

  @override
  void initState() {
    super.initState();
    final settings = widget.snapshot.settings;
    _nameController = TextEditingController(text: settings.userName);
    _aiEndpointController = TextEditingController(text: settings.aiEndpoint);
    _aiModelController = TextEditingController(text: settings.aiModel);
    _turnServerController = TextEditingController(text: settings.turnServerUrl);
    _turnUsernameController = TextEditingController(text: settings.turnUsername);
    _turnCredentialController =
        TextEditingController(text: settings.turnCredential);
    _aiKeyController = TextEditingController(
      text: settings.hasAiKey ? _maskedApiKey : '',
    );
    _aiKeyFocusNode = FocusNode()..addListener(_handleApiKeyFocus);
    _hasSavedApiKey = settings.hasAiKey;
    _apiKeyPlaceholderActive = settings.hasAiKey;
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
    _aiKeyFocusNode
      ..removeListener(_handleApiKeyFocus)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
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
                  title: 'Profile',
                  subtitle: 'Local identity used in shared sessions',
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(labelText: 'User name'),
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
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _turnUsernameController,
                  decoration: const InputDecoration(labelText: 'TURN username'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _turnCredentialController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'TURN credential'),
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
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _aiModelController,
                  decoration: const InputDecoration(labelText: 'Model'),
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
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            FilledButton.icon(
              onPressed: _save,
              icon: Icon(_saved ? Icons.check : Icons.save_outlined),
              label: Text(_saved ? 'Saved' : 'Save settings'),
            ),
            OutlinedButton.icon(
              onPressed: () async {
                final resetMode = await showDialog<String>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Reset Workspace'),
                    content: const Text(
                        'Choose whether to keep your profile, AI, and network settings while clearing local workspace data.'),
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

  void _save() {
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a user name.')),
      );
      return;
    }
    final payload = <String, Object?>{
      'userName': _nameController.text.trim(),
      'aiEndpoint': _aiEndpointController.text.trim(),
      'aiModel': _aiModelController.text.trim(),
      'turnServerUrl': _turnServerController.text.trim(),
      'turnUsername': _turnUsernameController.text.trim(),
      'turnCredential': _turnCredentialController.text.trim(),
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
    setState(() => _saved = true);
    Future<void>.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _saved = false);
    });
  }

  void _handleApiKeyFocus() {
    if (!_aiKeyFocusNode.hasFocus || !_apiKeyPlaceholderActive) return;
    _selectMaskedApiKey();
  }

  void _handleApiKeyChanged(String _) {
    if (_updatingApiKeyField) return;
    _apiKeyPlaceholderActive = false;
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
      await AutoUpdateService.checkForUpdates();
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
              'Version 0.1.1',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.icon(
                  onPressed: AutoUpdateService.isSupportedDesktop &&
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
                'Updates are available on macOS and Windows desktop builds.',
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
