import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/pages/lessons_page.dart';
import 'package:ironloom_operator/widgets.dart';

Future<void> settleHttp(WidgetTester tester) async {
  for (var i = 0; i < 3; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets(
    'lesson revision conflict is visible and is not treated as mutation success',
    (tester) async {
      var reads = 0;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://lessons.fixture/')),
        MockClient((request) async {
          if (request.method == 'GET') {
            reads++;
            return http.Response(
              '{"lessons":[{"lesson_id":"lesson","revision":"1","origin_project":"p","origin_assignment":"a","source":"opaque-reference","scope":"project","content":"Retain original lesson"}]}',
              200,
            );
          }
          final body = jsonDecode(request.body) as Map<String, Object?>;
          return http.Response(
            jsonEncode({
              'command_id': body['command_id'],
              'disposition': 'conflict',
              'cursor': {'conversation_id': 'c', 'sequence': '0'},
            }),
            200,
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: LessonsPage(client: client)),
        ),
      );
      await tester.enterText(find.widgetWithText(TextField, 'Project ID'), 'p');
      await tester.tap(find.widgetWithText(FilledButton, 'Review lessons'));
      await settleHttp(tester);
      final scrollable = find
          .descendant(
            of: find.byType(PageBody),
            matching: find.byType(Scrollable),
          )
          .first;
      final restrict = find.widgetWithText(
        FilledButton,
        'Restrict to assignment',
      );
      await tester.scrollUntilVisible(restrict, 200, scrollable: scrollable);
      await tester.ensureVisible(restrict);
      await tester.pump();
      await tester.tap(restrict);
      await settleHttp(tester);
      expect(reads, 1);
      expect(find.textContaining('no command was dispatched'), findsOneWidget);
      expect(find.text('Retain original lesson'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
}
