import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:test/test.dart';

Map<String, Object?> state() => {
  'session': {
    'conversation_id': 'c',
    'project_id': 'p',
    'archived': false,
    'last_human_interaction_ms': '1',
  },
  'cursor': {'conversation_id': 'c', 'sequence': '0'},
  'revision': '1',
  'pending_questions': <Object?>[],
};
Map<String, Object?> event(int sequence) => {
  'cursor': {'conversation_id': 'c', 'sequence': '$sequence'},
  'command_id': 'cmd',
  'project_id': 'p',
  'event': {
    'worker_id': 'w',
    'turn_id': 't',
    'item_id': 'i',
    'assignment_id': 'a',
    'kind': 'text_delta',
    'text': 'hello',
  },
};
void main() {
  test(
    'deployment path and connection headers stay scoped to one server',
    () async {
      final client = IronloomClient(
        ServerConnection(
          Uri.parse('https://host/dev/ivy/p/8000/'),
          headers: {'X-CSRF-Token': 'fixture'},
        ),
        MockClient((request) async {
          expect(
            request.url.toString(),
            'https://host/dev/ivy/p/8000/api/v1/conversations',
          );
          expect(request.headers['X-CSRF-Token'], 'fixture');
          expect(request.body, '{"command_id":"new","project_id":"p"}');
          return http.Response(jsonEncode(state()), 200);
        }),
      );
      final result = await client.createConversation(
        CreateConversation(
          commandId: CommandId('new'),
          projectId: ProjectId('p'),
        ),
      );
      expect(result.cursor.sequence.isZero, isTrue);
      client.close();
    },
  );
  test(
    'SSE frames tolerate split UTF8/CRLF and ignore incomplete EOF',
    () async {
      final bytes = utf8.encode(
        ': heartbeat\r\nevent: ironloom.event\r\nid: x\r\ndata: café\r\ndata: next\r\n\r\ndata: incomplete',
      );
      final frames = await decodeSse(Stream.fromIterable(bytes.map((b) => [b])))
          .toList();
      expect(frames.length, 1);
      expect(frames.single.data, 'café\nnext');
      expect(frames.single.id, 'x');
      await expectLater(
        decodeSse(
          Stream.value(utf8.encode('data: ${'x' * 100}')),
          maximumFrameBytes: 20,
        ).toList(),
        throwsA(isA<ApiFailure>()),
      );
    },
  );
  test('reconnect replays after consumed cursor and never dispatches a command', () async {
    var posts = 0;
    var streams = 0;
    final client = IronloomClient(
      ServerConnection(Uri.parse('https://host/prefix/')),
      MockClient.streaming((request, _) async {
        if (request.method == 'POST') posts++;
        if (request.url.path.endsWith('/snapshot')) {
          return http.StreamedResponse(
            Stream.value(utf8.encode(jsonEncode(state()))),
            200,
          );
        }
        if (request.url.path.endsWith('/history')) {
          return http.StreamedResponse(
            Stream.value(
              utf8.encode(
                jsonEncode({'as_of': state()['cursor'], 'items': <Object?>[]}),
              ),
            ),
            200,
          );
        }
        expect(request.url.path, '/prefix/api/v1/events');
        final expected = ReplayCursor(
          conversationId: ConversationId('c'),
          sequence: Counter(streams == 0 ? '0' : '1'),
        );
        expect(request.headers['Last-Event-ID'], encodeCursor(expected));
        streams++;
        final value = ServiceEvent.fromJson(event(1));
        return http.StreamedResponse(
          Stream.value(
            utf8.encode(
              'event: ironloom.event\nid: ${encodeCursor(value.cursor)}\ndata: ${jsonEncode(value.toJson())}\n\n',
            ),
          ),
          200,
        );
      }),
    );
    final chat = ChatConnection(client, MemoryCommandJournal());
    final delivered = <ServiceEvent>[];
    final subscription = chat.events.listen(delivered.add);
    await chat.connect(ConversationId('c'));
    await Future<void>.delayed(Duration.zero);
    await chat.reconnect();
    await Future<void>.delayed(Duration.zero);
    expect(posts, 0);
    expect(streams, 2);
    expect(delivered.length, 1);
    await subscription.cancel();
    await chat.close();
    client.close();
  });
  test('lost command response retains the exact idempotency key for explicit retry', () async {
    final journal = MemoryCommandJournal();
    var lost = true;
    final ids = <String>[];
    final client = IronloomClient(
      ServerConnection(Uri.parse('https://host/')),
      MockClient((request) async {
        if (request.url.path.endsWith('/snapshot')) {
          return http.Response(jsonEncode(state()), 200);
        }
        final payload = jsonDecode(request.body) as Map<String, Object?>;
        ids.add(payload['command_id']! as String);
        if (lost) {
          lost = false;
          throw http.ClientException('connection lost');
        }
        return http.Response(
          jsonEncode({
            'command_id': ids.last,
            'disposition': 'replayed',
            'cursor': state()['cursor'],
          }),
          200,
        );
      }),
    );
    final chat = ChatConnection(client, journal)
      ..snapshot = ConversationSnapshot.fromJson(state());
    await expectLater(
      chat.send(
        CommandAction(
          'input',
          InputCommand(conversationId: ConversationId('c'), text: 'hello'),
        ),
      ),
      throwsA(isA<http.ClientException>()),
    );
    final pending = await journal.pending();
    expect(pending.length, 1);
    await chat.retry(pending.single);
    expect(ids[0], ids[1]);
    expect(await journal.pending(), isEmpty);
    await chat.close();
    client.close();
  });
  test('unrecognized service errors do not expose response bodies', () async {
    final client = IronloomClient(
      ServerConnection(Uri.parse('https://host/')),
      MockClient((_) async => http.Response('secret upstream response', 500)),
    );
    await expectLater(
      client.configuration(),
      throwsA(
        isA<ApiFailure>().having(
          (e) => e.toString(),
          'redaction',
          isNot(contains('secret')),
        ),
      ),
    );
    client.close();
  });
  test(
    'conflicting commands retain their exact envelope and report no dispatch',
    () async {
      final journal = MemoryCommandJournal();
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://host/')),
        MockClient((request) async {
          if (request.url.path.endsWith('/snapshot')) {
            return http.Response(jsonEncode(state()), 200);
          }
          final body = jsonDecode(request.body) as Map<String, Object?>;
          return http.Response(
            jsonEncode({
              'command_id': body['command_id'],
              'disposition': 'conflict',
              'cursor': state()['cursor'],
            }),
            200,
          );
        }),
      );
      final chat = ChatConnection(client, journal)
        ..snapshot = ConversationSnapshot.fromJson(state());
      await expectLater(
        chat.send(
          CommandAction(
            'input',
            InputCommand(
              conversationId: ConversationId('c'),
              text: 'keep this input',
            ),
          ),
        ),
        throwsA(isA<CommandConflict>()),
      );
      final pending = await journal.pending();
      expect(
        (pending.single.action.data.toJson() as Map<String, Object?>)['text'],
        'keep this input',
      );
      await expectLater(
        chat.retry(pending.single),
        throwsA(isA<CommandConflict>()),
      );
      expect(
        (await journal.pending()).single.commandId.value,
        pending.single.commandId.value,
      );
      await chat.close();
      client.close();
    },
  );
  test('chunked expired-cursor error hydrates new snapshot and history without a command', () async {
    var snapshots = 0, streams = 0;
    final client = IronloomClient(
      ServerConnection(Uri.parse('https://host/')),
      MockClient.streaming((request, body) async {
        if (request.url.path.endsWith('/events')) {
          streams++;
          return http.StreamedResponse(
            Stream.fromIterable(
              streams == 1
                  ? [utf8.encode('"cursor_'), utf8.encode('expired"')]
                  : <List<int>>[],
            ),
            streams == 1 ? 409 : 200,
          );
        }
        expect(request.method, 'GET');
        if (request.url.path.endsWith('/snapshot')) {
          snapshots++;
          final data = state();
          data['cursor'] = {'conversation_id': 'c', 'sequence': '$snapshots'};
          return http.StreamedResponse(
            Stream.value(utf8.encode(jsonEncode(data))),
            200,
          );
        }
        final asOf = decodeCursor(request.url.queryParameters['as_of']!);
        return http.StreamedResponse(
          Stream.value(
            utf8.encode(
              jsonEncode({
                'as_of': asOf.toJson(),
                'items': <Object?>[],
                'next_before': null,
              }),
            ),
          ),
          200,
        );
      }),
    );
    final chat = ChatConnection(client, MemoryCommandJournal());
    await chat.connect(ConversationId('c'));
    await Future<void>.delayed(const Duration(milliseconds: 10));
    expect((chat.interruption as ApiFailure).requiresResync, isTrue);
    final old = chat.history;
    await chat.reconnect();
    expect(snapshots, 2);
    expect(identical(chat.history, old), isFalse);
    expect(chat.history!.asOf.sequence.toJson(), '2');
    await chat.close();
    client.close();
  });
  test('reviewed download contract requires durable repository binding', () {
    // b382d23 shared fixture: download-retains-repository-binding.
    final payload = jsonDecode(
      r'''{"source": {"publisher": "fixture-publisher", "host": "fixture-host", "repository_url": "https://example.com/model", "revision": "pinned-revision", "checksum": null, "access": "accessible", "license": null}, "repository_id": "fixture-repository", "download_id": "download", "received_bytes": "0", "total_bytes": null, "resume_token_ref": null, "cancel_requested": false, "terminated": false}''',
    ) as Map<String, Object?>;
    final value = decode(jsonEncode(payload), DownloadProgress.fromJson);
    expect(value.repositoryId.value, 'fixture-repository');
    payload.remove('repository_id');
    expect(
      () => decode(jsonEncode(payload), DownloadProgress.fromJson),
      throwsA(isA<ValidationErrors>()),
    );
    payload['repository_id'] = '';
    expect(
      () => decode(jsonEncode(payload), DownloadProgress.fromJson),
      throwsA(isA<ValidationErrors>()),
    );
  });
}
