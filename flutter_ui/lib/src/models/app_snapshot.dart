import 'package:flutter/material.dart';

const _unknownSystemBrightness = Brightness.light;

enum AppPage {
  documents,
  inRound,
  ai,
  history,
  settings;

  static AppPage fromJson(Object? value) {
    return switch (value) {
      'documents' => AppPage.documents,
      'inround' || 'inRound' => AppPage.inRound,
      'ai' || 'coach' => AppPage.ai,
      'history' => AppPage.history,
      'settings' => AppPage.settings,
      _ => AppPage.inRound,
    };
  }

  String get actionValue {
    return switch (this) {
      AppPage.documents => 'documents',
      AppPage.inRound => 'inround',
      AppPage.ai => 'ai',
      AppPage.history => 'history',
      AppPage.settings => 'settings',
    };
  }
}

class AppSnapshot {
  const AppSnapshot({
    required this.activePage,
    required this.documents,
    required this.cards,
    required this.history,
    required this.session,
    required this.ai,
    required this.settings,
    this.systemBrightness = _unknownSystemBrightness,
    this.lastRoomCode,
    this.lastRoomIsHost = false,
  });

  factory AppSnapshot.initial() {
    return const AppSnapshot(
      activePage: AppPage.inRound,
      documents: [],
      cards: [],
      history: [],
      session: null,
      ai: AiState.empty(),
      settings: SettingsState.empty(),
    );
  }

  factory AppSnapshot.fromJson(Map<String, Object?> json) {
    return AppSnapshot(
      activePage: AppPage.fromJson(json['activePage']),
      systemBrightness: _brightnessFromJson(json['systemBrightness']),
      lastRoomCode: _string(json['lastRoomCode'], fallback: ''),
      lastRoomIsHost: json['lastRoomIsHost'] == true,
      documents: _list(json['documents']).map(DebateDocument.fromJson).toList(),
      cards: _list(json['cards']).map(EvidenceCard.fromJson).toList(),
      history: _list(json['history']).map(HistoryRecord.fromJson).toList(),
      session: json['session'] is Map<String, Object?>
          ? SessionState.fromJson(json['session']! as Map<String, Object?>)
          : null,
      ai: AiState.fromJson((json['ai'] as Map?)?.cast<String, Object?>()),
      settings: SettingsState.fromJson(
          (json['settings'] as Map?)?.cast<String, Object?>()),
    );
  }

  final AppPage activePage;
  final Brightness systemBrightness;
  final String? lastRoomCode;
  final bool lastRoomIsHost;
  final List<DebateDocument> documents;
  final List<EvidenceCard> cards;
  final List<HistoryRecord> history;
  final SessionState? session;
  final AiState ai;
  final SettingsState settings;

  static List<Map<String, Object?>> _list(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => item.cast<String, Object?>())
        .toList();
  }
}

class DebateDocument {
  const DebateDocument({
    required this.id,
    required this.name,
    required this.content,
    required this.folder,
    required this.mode,
    this.ownerId,
    this.ownerName,
    this.lastModified,
    this.partnerCaret,
    this.partnerName,
  });

  factory DebateDocument.fromJson(Map<String, Object?> json) {
    return DebateDocument(
      id: _string(json['id']),
      name: _string(json['name'], fallback: 'Untitled.md'),
      content: _string(json['content']),
      folder: _string(json['partnerAccess'], fallback: 'private'),
      mode: _string(json['encryptedHash'], fallback: 'write'),
      ownerId: json['ownerId'] as String?,
      ownerName: json['ownerName'] as String?,
      lastModified: json['lastModified'] is num
          ? (json['lastModified']! as num).toInt()
          : null,
      partnerCaret: json['partnerCaret'] as int?,
      partnerName: json['partnerName'] as String?,
    );
  }

  final String id;
  final String name;
  final String content;
  final String folder;
  final String mode;
  final String? ownerId;
  final String? ownerName;
  final int? lastModified;
  final int? partnerCaret;
  final String? partnerName;

  String get title =>
      name.replaceFirst(RegExp(r'\.md$', caseSensitive: false), '');
  bool get isShared => folder != 'private';
  bool get isWritable => mode != 'read';
  bool isOwnedBy({String? userId, required String userName}) {
    if (ownerId != null && ownerId!.isNotEmpty) {
      return ownerId == userId;
    }
    if (ownerName != null && ownerName!.isNotEmpty) {
      return ownerName == userName;
    }
    return true;
  }
}

class EvidenceCard {
  const EvidenceCard({
    required this.id,
    required this.title,
    required this.text,
    required this.sourceUrl,
    this.docId,
    this.folder = 'private',
    this.author = '',
  });

  factory EvidenceCard.fromJson(Map<String, Object?> json) {
    return EvidenceCard(
      id: _string(json['id']),
      title: _string(json['title'], fallback: 'Evidence card'),
      text: _string(json['text']),
      sourceUrl: _string(json['sourceUrl']),
      docId: json['docId'] as String?,
      folder: _string(json['folder'], fallback: 'private'),
      author: _string(json['author']),
    );
  }

  final String id;
  final String title;
  final String text;
  final String sourceUrl;
  final String? docId;
  final String folder;
  final String author;

  bool get isShared => folder != 'private';
}

class HistoryFlow {
  const HistoryFlow({
    required this.speechId,
    required this.notes,
  });

  factory HistoryFlow.fromJson(Map<String, Object?> json) {
    return HistoryFlow(
      speechId: _string(json['speechId'], fallback: _string(json['speech'])),
      notes: _string(json['notes']),
    );
  }

  final String speechId;
  final String notes;
}

class HistoryRecord {
  const HistoryRecord({
    required this.id,
    required this.matchName,
    required this.opponentName,
    required this.side,
    required this.result,
    required this.timestamp,
    required this.flows,
  });

  factory HistoryRecord.fromJson(Map<String, Object?> json) {
    return HistoryRecord(
      id: _string(json['id']),
      matchName: _string(json['matchName'], fallback: 'Debate round'),
      opponentName: _string(json['opponentName']),
      side: _string(json['sides'], fallback: _string(json['side'])),
      result: _string(json['winLoss'], fallback: _string(json['result'])),
      timestamp: _number(json['timestamp'], fallback: 0),
      flows:
          AppSnapshot._list(json['flows']).map(HistoryFlow.fromJson).toList(),
    );
  }

  final String id;
  final String matchName;
  final String opponentName;
  final String side;
  final String result;
  final int timestamp;
  final List<HistoryFlow> flows;
}

class JoinRequest {
  const JoinRequest({
    required this.id,
    required this.name,
  });

  factory JoinRequest.fromJson(Map<String, Object?> json) {
    return JoinRequest(
      id: _string(json['id']),
      name: _string(json['name']),
    );
  }

  final String id;
  final String name;
}

class SessionState {
  const SessionState({
    required this.roomCode,
    required this.matchName,
    required this.groupName,
    required this.status,
    required this.handout,
    required this.debaters,
    this.currentSpeakerId,
    required this.speakerNotes,
    required this.speechRemainingMs,
    required this.speechRunning,
    required this.prepRemainingMs,
    required this.prepRunning,
    required this.customTimers,
    required this.pendingRequests,
    required this.isHost,
  });

  factory SessionState.fromJson(Map<String, Object?> json) {
    return SessionState(
      roomCode: _string(json['roomCode']),
      matchName: _string(json['matchName'], fallback: 'Debate session'),
      groupName: _string(json['groupName']),
      status: _string(json['status'], fallback: 'lobby'),
      handout: HandoutState.fromJson(
          (json['handout'] as Map?)?.cast<String, Object?>()),
      debaters:
          AppSnapshot._list(json['debaters']).map(Debater.fromJson).toList(),
      currentSpeakerId: json['currentSpeakerId'] as String?,
      speakerNotes: (json['speakerNotes'] as Map?)?.cast<String, Object?>().map(
                (key, value) => MapEntry(key, value is String ? value : ''),
              ) ??
          const {},
      speechRemainingMs: _number(json['speechRemainingMs'], fallback: 240000),
      speechRunning: json['speechRunning'] == true,
      prepRemainingMs: _number(json['prepRemainingMs'], fallback: 180000),
      prepRunning: json['prepRunning'] == true,
      customTimers: AppSnapshot._list(json['customTimers'])
          .map(RoundTimer.fromJson)
          .toList(),
      pendingRequests: AppSnapshot._list(json['pendingRequests'])
          .map(JoinRequest.fromJson)
          .toList(),
      isHost: json['isHost'] == true,
    );
  }

  final String roomCode;
  final String matchName;
  final String groupName;
  final String status;
  final HandoutState handout;
  final List<Debater> debaters;
  final String? currentSpeakerId;
  final Map<String, String> speakerNotes;
  final int speechRemainingMs;
  final bool speechRunning;
  final int prepRemainingMs;
  final bool prepRunning;
  final List<RoundTimer> customTimers;
  final List<JoinRequest> pendingRequests;
  final bool isHost;
}

class HandoutState {
  const HandoutState({
    required this.title,
    required this.problem,
    required this.details,
  });

  const HandoutState.empty()
      : title = '',
        problem = '',
        details = '';

  factory HandoutState.fromJson(Map<String, Object?>? json) {
    if (json == null) return const HandoutState.empty();
    return HandoutState(
      title: _string(json['title']),
      problem: _string(json['problem']),
      details: _string(json['details']),
    );
  }

  final String title;
  final String problem;
  final String details;
}

class Debater {
  const Debater({
    required this.id,
    required this.name,
    required this.status,
    this.team,
    this.position,
    this.disconnected = false,
  });

  factory Debater.fromJson(Map<String, Object?> json) {
    return Debater(
      id: _string(json['id']),
      name: _string(json['name'], fallback: 'Debater'),
      status: _string(json['status'], fallback: 'pending'),
      team: json['team'] as String?,
      position:
          json['position'] is num ? (json['position']! as num).toInt() : null,
      disconnected: json['disconnected'] == true,
    );
  }

  final String id;
  final String name;
  final String status;
  final String? team;
  final int? position;
  final bool disconnected;
}

class RoundTimer {
  const RoundTimer({
    required this.id,
    required this.name,
    required this.remainingMs,
    required this.running,
  });

  factory RoundTimer.fromJson(Map<String, Object?> json) {
    return RoundTimer(
      id: _string(json['id']),
      name: _string(json['name'], fallback: 'Timer'),
      remainingMs: _number(json['remainingMs'], fallback: 0),
      running: json['running'] == true,
    );
  }

  final String id;
  final String name;
  final int remainingMs;
  final bool running;
}

class AiState {
  const AiState({
    required this.chats,
    required this.activeChatId,
    required this.loading,
  });

  const AiState.empty()
      : chats = const [],
        activeChatId = null,
        loading = false;

  factory AiState.fromJson(Map<String, Object?>? json) {
    if (json == null) return const AiState.empty();
    return AiState(
      chats: AppSnapshot._list(json['chats']).map(AiChat.fromJson).toList(),
      activeChatId: json['activeChatId'] as String?,
      loading: json['loading'] == true,
    );
  }

  final List<AiChat> chats;
  final String? activeChatId;
  final bool loading;
}

class AiChat {
  const AiChat({
    required this.id,
    required this.title,
    required this.messages,
  });

  factory AiChat.fromJson(Map<String, Object?> json) {
    return AiChat(
      id: _string(json['id']),
      title: _string(json['title'], fallback: 'New chat'),
      messages:
          AppSnapshot._list(json['messages']).map(AiMessage.fromJson).toList(),
    );
  }

  final String id;
  final String title;
  final List<AiMessage> messages;
}

class AiMessage {
  const AiMessage({
    required this.role,
    required this.text,
  });

  factory AiMessage.fromJson(Map<String, Object?> json) {
    return AiMessage(
      role: _string(json['role'], fallback: 'assistant'),
      text: _string(json['text']),
    );
  }

  final String role;
  final String text;
}

class SettingsState {
  const SettingsState({
    required this.userName,
    required this.aiEndpoint,
    required this.aiModel,
    required this.hasAiKey,
    required this.githubOwner,
    required this.githubRepo,
    required this.hasGithubToken,
    this.userId,
  });

  const SettingsState.empty()
      : userName = '',
        aiEndpoint = '',
        aiModel = '',
        hasAiKey = false,
        githubOwner = '',
        githubRepo = '',
        hasGithubToken = false,
        userId = null;

  factory SettingsState.fromJson(Map<String, Object?>? json) {
    if (json == null) return const SettingsState.empty();
    return SettingsState(
      userName: _string(json['userName']),
      userId: json['userId'] as String?,
      aiEndpoint: _string(json['aiEndpoint']),
      aiModel: _string(json['aiModel']),
      hasAiKey: json['hasAiKey'] == true,
      githubOwner: _string(json['githubOwner']),
      githubRepo: _string(json['githubRepo']),
      hasGithubToken: json['hasGithubToken'] == true,
    );
  }

  final String userName;
  final String? userId;
  final String aiEndpoint;
  final String aiModel;
  final bool hasAiKey;
  final String githubOwner;
  final String githubRepo;
  final bool hasGithubToken;
}

String _string(Object? value, {String fallback = ''}) {
  return value is String && value.isNotEmpty ? value : fallback;
}

int _number(Object? value, {required int fallback}) {
  return value is num ? value.toInt() : fallback;
}

Brightness _brightnessFromJson(Object? value) {
  return value == 'dark' ? Brightness.dark : Brightness.light;
}
