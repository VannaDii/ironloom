import 'dart:async';
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
    'receipt retains newly typed unsent text and navigation during send is safe',
    (tester) async {
      var receipt = Completer<http.Response>();
      Map<String, Object?>? submitted;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://composer.fixture/')),
        MockClient((request) async {
          if (request.url.path.endsWith('/snapshot')) {
            return http.Response(
              '{"session":{"conversation_id":"c","project_id":"p","archived":false,"last_human_interaction_ms":"1"},"cursor":{"conversation_id":"c","sequence":"0"},"revision":"1","pending_questions":[]}',
              200,
            );
          }
          if (request.url.path.endsWith('/history')) {
            return http.Response(
              '{"as_of":{"conversation_id":"c","sequence":"0"},"items":[]}',
              200,
            );
          }
          if (request.url.path.endsWith('/events')) {
            return http.Response('', 200);
          }
          submitted = jsonDecode(request.body) as Map<String, Object?>;
          return receipt.future;
        }),
      );
      final session = AuthenticatedSession(
        operatorId: OperatorId('composer-user'),
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
      final composer = find.widgetWithText(TextField, 'Message or idea');
      await tester.enterText(composer, 'submitted text');
      await tester.tap(find.byTooltip('Send message'));
      await settleHttp(tester);
      expect(submitted, isNotNull);
      await tester.enterText(composer, 'next unsent text');
      receipt.complete(
        http.Response(
          jsonEncode({
            'command_id': submitted!['command_id'],
            'disposition': 'accepted',
            'cursor': {'conversation_id': 'c', 'sequence': '1'},
          }),
          200,
        ),
      );
      await settleHttp(tester);
      expect(
        tester.widget<TextField>(composer).controller!.text,
        'next unsent text',
      );
      receipt = Completer<http.Response>();
      await tester.tap(find.byTooltip('Send message'));
      await settleHttp(tester);
      await tester.pumpWidget(const SizedBox());
      receipt.complete(
        http.Response(
          jsonEncode({
            'command_id': submitted!['command_id'],
            'disposition': 'accepted',
            'cursor': {'conversation_id': 'c', 'sequence': '2'},
          }),
          200,
        ),
      );
      await settleHttp(tester);
      expect(tester.takeException(), isNull);
      client.close();
    },
  );
}
