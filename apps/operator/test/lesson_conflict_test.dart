import 'dart:convert';
import 'dart:async';

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
    'late project A response cannot replace B lessons or mutation scope',
    (tester) async {
      final responses = <String, Completer<http.Response>>{};
      String? mutationProject;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://lessons.fixture/')),
        MockClient((request) async {
          if (request.method == 'GET') {
            final project = request.url.pathSegments[3];
            return (responses[project] = Completer<http.Response>()).future;
          }
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          mutationProject = body['project_id'] as String;
          return http.Response(
            jsonEncode({
              'command_id': body['command_id'],
              'disposition': 'accepted',
            }),
            200,
          );
        }),
      );
      http.Response page(String project) => http.Response(
        jsonEncode({
          'lessons': [
            {
              'lesson_id': 'lesson-$project',
              'revision': '1',
              'origin_project': project,
              'origin_assignment': 'a',
              'source': 'opaque',
              'scope': 'project',
              'content': 'Content $project',
            },
          ],
          'next_after': 'lesson-$project',
        }),
        200,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: LessonsPage(client: client)),
        ),
      );
      await tester.enterText(find.widgetWithText(TextField, 'Project ID'), 'A');
      await tester.tap(find.text('Review lessons'));
      await settleHttp(tester);
      await tester.enterText(find.widgetWithText(TextField, 'Project ID'), 'B');
      await tester.tap(find.text('Review lessons'));
      await settleHttp(tester);
      responses['B']!.complete(page('B'));
      await settleHttp(tester);
      responses['A']!.complete(page('A'));
      await settleHttp(tester);
      expect(find.text('Content A'), findsNothing);
      expect(find.text('Content B'), findsOneWidget);
      final restrict = find.widgetWithText(
        FilledButton,
        'Restrict to assignment',
      );
      await tester.ensureVisible(restrict);
      await tester.tap(restrict);
      await settleHttp(tester);
      expect(mutationProject, 'B');
      responses['B']!.complete(page('B'));
      await settleHttp(tester);
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
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
