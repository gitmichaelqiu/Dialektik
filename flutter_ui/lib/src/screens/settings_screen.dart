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
  late final TextEditingController _modelController;

  @override
  void initState() {
    super.initState();
    _nameController =
        TextEditingController(text: widget.snapshot.settings.userName);
    _modelController =
        TextEditingController(text: widget.snapshot.settings.aiModel);
  }

  @override
  void didUpdateWidget(covariant SettingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.snapshot.settings.userName !=
        widget.snapshot.settings.userName) {
      _nameController.text = widget.snapshot.settings.userName;
    }
    if (oldWidget.snapshot.settings.aiModel !=
        widget.snapshot.settings.aiModel) {
      _modelController.text = widget.snapshot.settings.aiModel;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _modelController.dispose();
    super.dispose();
  }

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
              const SectionHeader(
                title: 'Settings',
                subtitle: 'Profile and AI configuration',
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(labelText: 'User name'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _modelController,
                decoration: const InputDecoration(labelText: 'AI model'),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () =>
                    widget.bridge.dispatch(action('settings.save', {
                  'userName': _nameController.text.trim(),
                  'aiModel': _modelController.text.trim(),
                })),
                child: const Text('Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
