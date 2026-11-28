import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/pages/chat_page.dart';
import 'package:ironloom_operator/widgets.dart';

void main() {
  testWidgets(
    'conversation catalog accumulates beyond first hundred and opens older chat',
    (tester) async {
      var sessionPages = 0, projects = 0;
      String? opened;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://paging.fixture/')),
        MockClient((request) async {
          Object data;
          if (request.url.path.endsWith('/projects')) {
            projects++;
            data = {
              'projects': [
                {
                  'project_id': 'p',
                  'name': 'Project',
                  'owner_node': 'node',
                  'owner': 'o',
                  'storage': 'available',
                  'last_human_interaction_ms': '1',
                  'permissions': ['view'],
                },
              ],
            };
          } else if (request.url.path.endsWith('/sessions')) {
            sessionPages++;
            expect(
              request.url.queryParameters['after'],
              sessionPages == 1 ? null : 'c99',
            );
            data = [
              for (
                var i = sessionPages == 1 ? 0 : 100;
                i < (sessionPages == 1 ? 100 : 101);
                i++
              )
                {
                  'conversation_id': 'c$i',
                  'project_id': 'p',
                  'archived': false,
                  'last_human_interaction_ms': '1',
                },
            ];
          } else if (request.url.path.endsWith('/snapshot')) {
            opened = request.url.path.split('/').reversed.skip(1).first;
            data = {
              'session': {
                'conversation_id': 'c100',
                'project_id': 'p',
                'archived': false,
                'last_human_interaction_ms': '1',
              },
              'cursor': {'conversation_id': 'c100', 'sequence': '0'},
              'revision': '1',
              'pending_questions': [],
            };
          } else if (request.url.path.endsWith('/history')) {
            data = {
              'as_of': {'conversation_id': 'c100', 'sequence': '0'},
              'items': [],
            };
          } else {
            return http.Response('', 200);
          }
          return http.Response(jsonEncode(data), 200);
        }),
      );
      final session = AuthenticatedSession(
        operatorId: OperatorId('o'),
        sessionId: ActorId('s'),
        method: LoginMethod.local,
        expiresAtMs: Counter('100'),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DashboardPage(client: client, session: session),
          ),
        ),
      );
      Future<void> settle() async {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 30)),
        );
        await tester.pump();
      }

      await settle();
      final scrollable = find
          .descendant(
            of: find.byType(PageBody),
            matching: find.byType(Scrollable),
          )
          .first;
      final more = find.text('Load more projects and conversations');
      await tester.scrollUntilVisible(
        more,
        600,
        maxScrolls: 30,
        scrollable: scrollable,
      );
      await tester.pump();
      await tester.tap(more);
      await settle();
      expect(projects, 1);
      expect(sessionPages, 2);

      expect(find.text('c100'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('c100'),
        -300,
        maxScrolls: 30,
        scrollable: scrollable,
      );
      await tester.pump();
      await tester.tap(find.text('c100'));
      await tester.pump(const Duration(milliseconds: 500));
      await settle();
      expect(opened, 'c100');
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
}
