import 'dart:convert';
import 'dart:typed_data';

import 'package:file_saver/file_saver.dart';
import 'package:file_selector/file_selector.dart';

import '../models/app_snapshot.dart';

class WorkspaceBundleService {
  const WorkspaceBundleService._();

  static const int schemaVersion = 1;

  static String encode(AppSnapshot snapshot, {required String appVersion}) {
    final bundle = {
      'manifest': {
        'format': 'dialektik-workspace',
        'schemaVersion': schemaVersion,
        'appVersion': appVersion,
        'exportedAt': DateTime.now().toUtc().toIso8601String(),
      },
      'data': {
        'documents': snapshot.documents
            .map((document) => {
                  'id': document.id,
                  'name': document.name,
                  'content': document.content,
                  'sourceType': document.sourceType,
                  'externalUrl': document.externalUrl,
                  'partnerAccess': document.folder,
                  'encryptedHash': document.mode,
                  'ownerId': document.ownerId,
                  'ownerName': document.ownerName,
                  'lastModified': document.lastModified,
                })
            .toList(),
        'cards': snapshot.cards
            .map((card) => {
                  'id': card.id,
                  'title': card.title,
                  'text': card.text,
                  'sourceUrl': card.sourceUrl,
                  'docId': card.docId,
                  'folder': card.folder,
                  'author': card.author,
                })
            .toList(),
        'history': snapshot.history
            .map((record) => {
                  'id': record.id,
                  'matchName': record.matchName,
                  'opponentName': record.opponentName,
                  'sides': record.side,
                  'winLoss': record.result,
                  'timestamp': record.timestamp,
                  'flows': record.flows
                      .map((flow) => {
                            'speechId': flow.speechId,
                            'notes': flow.notes,
                          })
                      .toList(),
                })
            .toList(),
        'aiChats': snapshot.ai.chats
            .map((chat) => {
                  'id': chat.id,
                  'title': chat.title,
                  'messages': chat.messages
                      .map((message) => {
                            'role': message.role,
                            'text': message.text,
                            if (message.thinking != null)
                              'thinking': message.thinking,
                          })
                      .toList(),
                })
            .toList(),
        'settings': {
          'userName': snapshot.settings.userName,
          'aiEndpoint': snapshot.settings.aiEndpoint,
          'aiModel': snapshot.settings.aiModel,
          'manualDocumentSync': snapshot.settings.manualDocumentSync,
          'joinRequestNotifications':
              snapshot.settings.joinRequestNotifications,
        },
      },
    };
    return const JsonEncoder.withIndent('  ').convert(bundle);
  }

  static WorkspaceBundleData decode(String source) {
    final decoded = jsonDecode(source);
    if (decoded is! Map) {
      throw const FormatException('This is not a Dialektik workspace bundle.');
    }
    final root = decoded.cast<String, Object?>();
    final manifest = (root['manifest'] as Map?)?.cast<String, Object?>();
    final data = (root['data'] as Map?)?.cast<String, Object?>();
    if (manifest == null ||
        manifest['format'] != 'dialektik-workspace' ||
        data == null) {
      throw const FormatException('This is not a Dialektik workspace bundle.');
    }
    final version = manifest['schemaVersion'];
    if (version is! num || version.toInt() < 1) {
      throw const FormatException('The workspace bundle version is invalid.');
    }
    for (final key in const ['documents', 'cards', 'history']) {
      if (data[key] is! List) {
        throw FormatException('The workspace bundle is missing $key.');
      }
    }

    final warnings = <String>[];
    if (version.toInt() > schemaVersion) {
      warnings.add(
        'This backup was created by a newer Dialektik data format. Some '
        'fields may not be restored.',
      );
    }
    warnings.addAll(_citationWarnings(data));
    return WorkspaceBundleData(
      manifest: manifest,
      data: data,
      warnings: warnings,
    );
  }

  static Future<void> save(String source) async {
    final date = DateTime.now().toIso8601String().split('T').first;
    await FileSaver.instance.saveFile(
      name: 'dialektik-backup-$date',
      bytes: Uint8List.fromList(utf8.encode(source)),
      fileExtension: 'dialektik',
      mimeType: MimeType.json,
    );
  }

  static Future<WorkspaceBundleData?> pickAndDecode() async {
    const typeGroup = XTypeGroup(
      label: 'Dialektik workspace',
      extensions: ['dialektik', 'json'],
      mimeTypes: ['application/json'],
      uniformTypeIdentifiers: ['public.json'],
      webWildCards: ['application/json'],
    );
    final file = await openFile(acceptedTypeGroups: const [typeGroup]);
    if (file == null) return null;
    return decode(await file.readAsString());
  }

  static List<String> _citationWarnings(Map<String, Object?> data) {
    final cards = _maps(data['cards']);
    final cardIds = cards.map((card) => card['id']).whereType<String>().toSet();
    final missing = <String>{};
    for (final document in _maps(data['documents'])) {
      final content = document['content'];
      if (content is! String) continue;
      for (final match in RegExp(r'\[\[([^\]]+)\]\]').allMatches(content)) {
        final id = match.group(1);
        if (id != null && !cardIds.contains(id)) missing.add(id);
      }
    }
    if (missing.isEmpty) return const [];
    return [
      '${missing.length} evidence citation${missing.length == 1 ? '' : 's'} '
          'refer to cards that are not included in this backup.',
    ];
  }

  static List<Map<String, Object?>> _maps(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => item.cast<String, Object?>())
        .toList();
  }
}

class WorkspaceBundleData {
  const WorkspaceBundleData({
    required this.manifest,
    required this.data,
    required this.warnings,
  });

  final Map<String, Object?> manifest;
  final Map<String, Object?> data;
  final List<String> warnings;

  int get documentCount => _count('documents');
  int get cardCount => _count('cards');
  int get historyCount => _count('history');

  int _count(String key) => data[key] is List ? (data[key]! as List).length : 0;
}
