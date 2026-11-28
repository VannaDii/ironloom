import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/pages/chat_page.dart';

Future<void> settleHttp(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets(
    'expired replay replaces history and controls; refresh clears a completed assignment',
    (tester) async {
      var snapshots = 0, feeds = 0;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://recovery.fixture/')),
        MockClient.streaming((request, body) async {
          if (request.url.path.endsWith('/events')) {
            feeds++;
            return http.StreamedResponse(
              Stream.fromIterable(
                feeds == 1
                    ? [utf8.encode('"cursor_'), utf8.encode('expired"')]
                    : <List<int>>[],
              ),
              feeds == 1 ? 409 : 200,
            );
          }
          if (request.url.path.endsWith('/snapshot')) {
            snapshots++;
            final data = <String, Object?>{
              'session': {
                'conversation_id': 'c',
                'project_id': 'p',
                'archived': false,
                'last_human_interaction_ms': '1',
                'active_turn_id': snapshots < 3 ? 't' : null,
              },
              'cursor': {'conversation_id': 'c', 'sequence': '$snapshots'},
              'revision': '$snapshots',
              'pending_questions': <Object?>[],
              'execution_state': snapshots < 3 ? 'running' : 'completed',
              'active_assignment_id': snapshots < 3 ? 'a' : null,
            };
            return http.StreamedResponse(
              Stream.value(utf8.encode(jsonEncode(data))),
              200,
            );
          }
          final cursor = decodeCursor(request.url.queryParameters['as_of']!);
          final data = {
            'direction': 'backward',
            'as_of': cursor.toJson(),
            'items': [
              {
                'conversation_id': 'c',
                'turn_id': 't',
                'item_id': 'i${cursor.sequence}',
                'message': {
                  'role': 'user',
                  'text': 'history ${cursor.sequence}',
                  'tool_calls': <Object?>[],
                },
              },
            ],
            'next_before': null,
          };
          return http.StreamedResponse(
            Stream.value(utf8.encode(jsonEncode(data))),
            200,
          );
        }),
      );
      final session = AuthenticatedSession(
        operatorId: OperatorId('recovery-user'),
        sessionId: ActorId('s'),
        method: LoginMethod.local,
        expiresAtMs: Counter('100'),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ChatPage(
            client: client,
            session: session,
            id: ConversationId('c'),
          ),
        ),
      );
      await settleHttp(tester);
      expect(find.text('history 1'), findsOneWidget);
      expect(find.byTooltip('Assignment controls'), findsOneWidget);
      await tester.tap(
        find.widgetWithText(SwitchListTile, 'Steer the active turn'),
      );
      await tester.pump();
      expect(find.widgetWithText(TextField, 'Steering input'), findsOneWidget);
      await tester.tap(find.text('Reconnect'));
      await settleHttp(tester);
      expect(find.text('history 1'), findsNothing);
      expect(find.text('history 2'), findsOneWidget);
      await tester.tap(find.byTooltip('Refresh state'));
      await settleHttp(tester);
      expect(find.text('completed'), findsOneWidget);
      expect(find.byTooltip('Assignment controls'), findsNothing);
      expect(find.widgetWithText(TextField, 'Message or idea'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
}
