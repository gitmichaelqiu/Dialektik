import 'package:flutter/material.dart';

import '../bridge/engine_bridge.dart';
import '../models/app_snapshot.dart';
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
  late final TextEditingController _nameController;
  late final TextEditingController _aiEndpointController;
  late final TextEditingController _aiModelController;
  late final TextEditingController _aiKeyController;
  late final TextEditingController _githubOwnerController;
  late final TextEditingController _githubRepoController;
  late final TextEditingController _githubTokenController;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    final settings = widget.snapshot.settings;
    _nameController = TextEditingController(text: settings.userName);
    _aiEndpointController = TextEditingController(text: settings.aiEndpoint);
    _aiModelController = TextEditingController(text: settings.aiModel);
    _aiKeyController = TextEditingController();
    _githubOwnerController = TextEditingController(text: settings.githubOwner);
    _githubRepoController = TextEditingController(text: settings.githubRepo);
    _githubTokenController = TextEditingController();
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
    if (oldWidget.snapshot.settings.githubOwner != settings.githubOwner) {
      _githubOwnerController.text = settings.githubOwner;
    }
    if (oldWidget.snapshot.settings.githubRepo != settings.githubRepo) {
      _githubRepoController.text = settings.githubRepo;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _aiEndpointController.dispose();
    _aiModelController.dispose();
    _aiKeyController.dispose();
    _githubOwnerController.dispose();
    _githubRepoController.dispose();
    _githubTokenController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
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
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'API key'),
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
                  title: 'GitHub sync',
                  subtitle: widget.snapshot.settings.hasGithubToken
                      ? 'Token saved'
                      : 'Token not configured',
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _githubOwnerController,
                  decoration: const InputDecoration(labelText: 'Owner'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _githubRepoController,
                  decoration: const InputDecoration(labelText: 'Repository'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _githubTokenController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Token'),
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
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Reset Workspace'),
                    content: const Text('Are you sure you want to reset the local workspace? All local documents, custom settings, and history logs will be permanently deleted.'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Cancel'),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Reset'),
                      ),
                    ],
                  ),
                );
                if (confirm == true && mounted) {
                  widget.bridge.dispatch(action('workspace.reset'));
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
    widget.bridge.dispatch(action('settings.save', {
      'userName': _nameController.text.trim(),
      'aiEndpoint': _aiEndpointController.text.trim(),
      'aiModel': _aiModelController.text.trim(),
      'aiApiKey': _aiKeyController.text.trim(),
      'githubOwner': _githubOwnerController.text.trim(),
      'githubRepo': _githubRepoController.text.trim(),
      'githubToken': _githubTokenController.text.trim(),
    }));
    setState(() => _saved = true);
    Future<void>.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _saved = false);
    });
  }
}
