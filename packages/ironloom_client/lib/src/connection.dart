import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'contracts.dart';

/// A server connection retains its deployment prefix for every API request.
final class ServerConnection {
  ServerConnection(Uri address, {this.headers = const {}})
    : base = address.replace(
        path: address.path.endsWith('/') ? address.path : '${address.path}/',
        query: '',
        fragment: '',
      ) {
    if (!{'http', 'https'}.contains(base.scheme) ||
        base.host.isEmpty ||
        base.userInfo.isNotEmpty) {
      throw ArgumentError(
        'An HTTP server address without embedded credentials is required',
      );
    }
  }

  /// Flutter web supplies Uri.base.resolve('./') from the document base element.
  factory ServerConnection.web(Uri documentBase) =>
      ServerConnection(documentBase);
  final Uri base;

  /// Service-session/CSRF headers supplied by the selected backend authentication transport.
  final Map<String, String> headers;
  Uri endpoint(String path, [Map<String, String?> query = const {}]) {
    final url = base.resolve(path.replaceFirst(RegExp(r'^/'), ''));
    final values = {
      for (final e in query.entries)
        if (e.value != null) e.key: e.value!,
    };
    return values.isEmpty ? url : url.replace(queryParameters: values);
  }
}

/// A safe service failure independent of decoding and transport interruption.
final class ApiFailure implements Exception {
  ApiFailure(this.status, this.error);
  final int status;
  final ServiceError? error;
  bool get requiresResync =>
      {'cursor_expired', 'resync_required'}.contains(error?.kind);
  @override
  String toString() =>
      'Service request failed ($status${error == null ? '' : ', ${error!.kind}'})';
}

/// HTTP commands and streamed events. Reconnection never calls a mutation method.
final class IronloomClient {
  IronloomClient(
    this.connection,
    this.httpClient, {
    this.timeout = const Duration(seconds: 30),
  });
  final ServerConnection connection;
  final http.Client httpClient;
  final Duration timeout;
  Map<String, String> get _headers => {
    'Accept': 'application/json',
    ...connection.headers,
  };
  Future<Object?> _request(
    String method,
    String path, {
    WireModel? body,
    Map<String, String?> query = const {},
  }) async {
    final request = http.Request(method, connection.endpoint(path, query))
      ..headers.addAll(_headers);
    if (body != null) {
      body.validate();
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body.toJson());
    }
    final response = await httpClient.send(request).timeout(timeout);
    final bytes = <int>[];
    await for (final chunk in response.stream.timeout(timeout)) {
      if (bytes.length + chunk.length > maxResponseBytes) {
        throw ApiFailure(502, null);
      }
      bytes.addAll(chunk);
    }
    final text = utf8.decode(bytes);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      ServiceError? error;
      try {
        error = decode(text, ServiceError.fromJson);
      } on ValidationErrors {
        /* Redact unrecognized error bodies. */
      }
      throw ApiFailure(response.statusCode, error);
    }
    if (text.trim().isEmpty) return null;
    try {
      return jsonDecode(text);
    } on FormatException {
      throw ApiFailure(502, null);
    }
  }

  /// Bounded metadata/command responses; history is paginated instead of unbounded buffering.
  static const maxResponseBytes = 8 * 1024 * 1024;
  Future<T> _model<T>(
    String method,
    String path,
    T Function(Object?) fromJson, {
    WireModel? body,
    Map<String, String?> query = const {},
  }) async => fromJson(await _request(method, path, body: body, query: query));
  Future<AuthenticatedSession> local(LoginRequest request) => _model(
    'POST',
    'api/v1/auth/local',
    AuthenticatedSession.fromJson,
    body: request,
  );
  Future<AuthenticatedSession> oidcCallback(OidcCallback request) => _model(
    'POST',
    'api/v1/auth/oidc/callback',
    AuthenticatedSession.fromJson,
    body: request,
  );
  Future<Uri> oidcStart(OidcStart request) async {
    final result = await _request(
      'POST',
      'api/v1/auth/oidc/start',
      body: request,
    );
    if (result is! String) throw ApiFailure(502, null);
    final url = Uri.tryParse(result);
    if (url == null ||
        url.scheme != 'https' ||
        url.host.isEmpty ||
        url.userInfo.isNotEmpty) {
      throw ApiFailure(502, null);
    }
    return url;
  }

  Future<BootstrapState> bootstrap(BootstrapRedeem request) => _model(
    'POST',
    'api/v1/auth/bootstrap',
    BootstrapState.fromJson,
    body: request,
  );
  Future<void> logout() => _request('POST', 'api/v1/auth/logout');
  Future<ConfigurationSnapshot> configuration({ProjectId? project}) => _model(
    'GET',
    'api/v1/configuration',
    ConfigurationSnapshot.fromJson,
    query: {'project_id': project?.value},
  );
  Future<ConfigurationSnapshot> configure(ConfigurationCommand request) =>
      _model(
        'POST',
        'api/v1/configuration',
        ConfigurationSnapshot.fromJson,
        body: request,
      );
  Future<ConversationSnapshot> createConversation(CreateConversation request) =>
      _model(
        'POST',
        'api/v1/conversations',
        ConversationSnapshot.fromJson,
        body: request,
      );
  Future<ConversationSnapshot> snapshot(ConversationId id) => _model(
    'GET',
    'api/v1/sessions/${Uri.encodeComponent(id.value)}/snapshot',
    ConversationSnapshot.fromJson,
  );
  Future<HistoryPage> history(ConversationId id, HistoryQuery query) => _model(
    'GET',
    'api/v1/sessions/${Uri.encodeComponent(id.value)}/history',
    HistoryPage.fromJson,
    query: {
      'as_of': encodeCursor(query.asOf),
      'before': query.before?.value,
      'limit': query.limit.toJson(),
    },
  );
  Future<List<SessionSummary>> sessions(SessionQuery query) => _model(
    'GET',
    'api/v1/sessions',
    (json) {
      if (json is! List<Object?>) throw ApiFailure(502, null);
      return List.unmodifiable(json.map(SessionSummary.fromJson));
    },
    query: {
      'after': query.after?.value,
      'limit': query.limit.toJson(),
      'archived': '${query.archived}',
      'provider': query.provider?.value,
      'source': query.source?.value,
    },
  );
  Future<LessonPage> lessons(LessonQuery query) => _model(
    'GET',
    'api/v1/projects/${Uri.encodeComponent(query.projectId.value)}/lessons',
    LessonPage.fromJson,
    query: {
      'assignment_id': query.assignmentId?.value,
      'scope': query.scope?.value,
      'after': query.after?.value,
      'limit': query.limit.toJson(),
    },
  );
  Future<CommandReceipt> command(Command request) =>
      _model('POST', 'api/v1/commands', CommandReceipt.fromJson, body: request);

  Future<ProjectPage> projects(ProjectQuery query) => _model(
    'GET',
    'api/v1/projects',
    ProjectPage.fromJson,
    query: {'after': query.after?.value, 'limit': query.limit.toJson()},
  );
  Future<ProjectSummary> createProject(CreateProject request) =>
      _model('POST', 'api/v1/projects', ProjectSummary.fromJson, body: request);
  Future<ProjectSummary> selfGrant(ProjectId project, CommandId command) =>
      _model(
        'POST',
        'api/v1/projects/${Uri.encodeComponent(project.value)}/self-grant',
        ProjectSummary.fromJson,
        body: command,
      );
  Future<List<CredentialSummary>> credentials() =>
      _model('GET', 'api/v1/credentials', (json) {
        if (json is! List<Object?>) throw ApiFailure(502, null);
        return List.unmodifiable(json.map(CredentialSummary.fromJson));
      });
  Future<CredentialSummary?> credential(CredentialCommand request) => _model(
    'POST',
    'api/v1/credentials',
    (json) => json == null ? null : CredentialSummary.fromJson(json),
    body: request,
  );
  Future<NativeConnectionState> nativeConnection(NodeId node) => _model(
    'GET',
    'api/v1/native/connections/${Uri.encodeComponent(node.value)}',
    NativeConnectionState.fromJson,
  );
  Future<NativeConnectionState> configureNative(
    NativeConnectionCommand request,
  ) => _model(
    'POST',
    'api/v1/native/connections',
    NativeConnectionState.fromJson,
    body: request,
  );
  Future<SourcePage> searchModels(SourceQuery request, {ProjectId? project}) =>
      _model(
        'POST',
        'api/v1/models/search',
        SourcePage.fromJson,
        body: request,
        query: {'project_id': project?.value},
      );
  Future<DownloadProgress> download(DownloadCommand request) => _model(
    'POST',
    'api/v1/models/downloads',
    DownloadProgress.fromJson,
    body: request,
  );
  Future<DownloadProgress> downloadProgress(ActorId id) => _model(
    'GET',
    'api/v1/models/downloads/${Uri.encodeComponent(id.value)}',
    DownloadProgress.fromJson,
  );

  /// Emits validated events after a durable cursor. The caller owns reconnect policy.
  Stream<ServiceEvent> events(ReplayCursor cursor) async* {
    final request =
        http.Request(
            'GET',
            connection.endpoint('api/v1/events', {
              'conversation_id': cursor.conversationId.value,
            }),
          )
          ..headers.addAll({
            ..._headers,
            'Accept': 'text/event-stream',
            'Last-Event-ID': encodeCursor(cursor),
          });
    final response = await httpClient.send(request).timeout(timeout);
    if (response.statusCode != 200) {
      // Bound and redact error response bodies rather than exposing upstream HTML/text.
      final bytes = <int>[];
      await for (final chunk in response.stream.timeout(timeout)) {
        if (bytes.length + chunk.length > maxResponseBytes) {
          throw ApiFailure(response.statusCode, null);
        }
        bytes.addAll(chunk);
      }
      ServiceError? error;
      if (bytes.length <= maxResponseBytes) {
        try {
          error = decode(utf8.decode(bytes), ServiceError.fromJson);
        } on Object {
          /* safe public error only */
        }
      }
      throw ApiFailure(response.statusCode, error);
    }
    var last = cursor.sequence;
    await for (final frame in decodeSse(response.stream)) {
      if (frame.event == 'ironloom.error') {
        throw ApiFailure(409, decode(frame.data, ServiceError.fromJson));
      }
      if (frame.event != 'ironloom.event') continue;
      final event = decode(frame.data, ServiceEvent.fromJson);
      if (event.cursor.conversationId.value != cursor.conversationId.value) {
        throw ApiFailure(502, null);
      }
      if (frame.id != null && encodeCursor(event.cursor) != frame.id) {
        throw ApiFailure(502, null);
      }
      if (event.cursor.sequence.compareTo(last) <= 0) continue;
      last = event.cursor.sequence;
      yield event;
    }
  }

  void close() => httpClient.close();
}

/// One bounded SSE frame; comments and transport heartbeats never become work events.
final class SseFrame {
  const SseFrame(this.event, this.data, this.id);
  final String event;
  final String data;
  final String? id;
}

/// Incrementally decodes UTF-8 and CR/LF framing across arbitrary network chunk boundaries.
Stream<SseFrame> decodeSse(
  Stream<List<int>> bytes, {
  int maximumFrameBytes = 1024 * 1024,
}) async* {
  var event = 'message';
  String? id;
  final data = <String>[];
  var size = 0;
  await for (final line in _boundedLines(bytes, maximumFrameBytes)) {
    size += utf8.encode(line).length;
    if (size > maximumFrameBytes) throw ApiFailure(502, null);
    if (line.isEmpty) {
      if (data.isNotEmpty) yield SseFrame(event, data.join('\n'), id);
      data.clear();
      event = 'message';
      id = null;
      size = 0;
      continue;
    }
    if (line.startsWith(':')) continue;
    final separator = line.indexOf(':');
    final field = separator < 0 ? line : line.substring(0, separator);
    var value = separator < 0 ? '' : line.substring(separator + 1);
    if (value.startsWith(' ')) value = value.substring(1);
    switch (field) {
      case 'event':
        event = value;
      case 'id':
        if (!value.contains('\u0000')) id = value;
      case 'data':
        data.add(value);
    }
  }
  // A partial frame at EOF is not a completed event or successful execution.
}

Stream<String> _boundedLines(Stream<List<int>> bytes, int maximum) async* {
  var line = '';
  var afterCr = false;
  var first = true;
  await for (var chunk in bytes.transform(utf8.decoder)) {
    if (first && chunk.isNotEmpty) {
      first = false;
      if (chunk.startsWith('\uFEFF')) chunk = chunk.substring(1);
    }
    var start = 0;
    for (var i = 0; i < chunk.length; i++) {
      final c = chunk.codeUnitAt(i);
      if (afterCr) {
        afterCr = false;
        if (c == 10) {
          start = i + 1;
          continue;
        }
      }
      if (c == 10 || c == 13) {
        final segment = chunk.substring(start, i);
        if (line.length + segment.length > maximum) throw ApiFailure(502, null);
        yield line + segment;
        line = '';
        start = i + 1;
        afterCr = c == 13;
      }
    }
    final segment = chunk.substring(start);
    if (line.length + segment.length > maximum) throw ApiFailure(502, null);
    line += segment;
  }
  // Discard unterminated data. EOF cannot complete an SSE event.
}
