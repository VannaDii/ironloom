import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/app.dart';
import 'package:ironloom_operator/widgets.dart';

IronloomClient api(Future<http.Response> Function(http.Request) handler) =>
    IronloomClient(
      ServerConnection(Uri.parse('https://service/factory/')),
      MockClient(handler),
    );
void main() {
  testWidgets(
    'login submits credentials only to the service and setup stays navigable',
    (tester) async {
      var authenticated = false;
      final client = api((request) async {
        if (request.url.path.endsWith('/auth/session')) {
          return http.Response('{"authentication":"unauthenticated"}', 401);
        }
        if (request.url.path.endsWith('/auth/local')) {
          final body = jsonDecode(request.body) as Map<String, Object?>;
          expect(body['username'], 'operator');
          expect(body['password'], 'fixture-password');
          authenticated = true;
          return http.Response(
            '{"operator_id":"operator","session_id":"opaque","method":"local","expires_at_ms":"100000"}',
            200,
          );
        }
        if (request.url.path.endsWith('/configuration')) {
          return http.Response(
            '{"revision":"1","roles":[],"models":[],"device_preferences":[],"discovered_devices":[],"execution_ready":false,"unmet_prerequisites":["lesson_handling","role_models"]}',
            200,
          );
        }
        if (request.url.path.endsWith('/projects')) {
          return http.Response('{"projects":[]}', 200);
        }
        if (request.url.path.endsWith('/sessions')) {
          return http.Response('[]', 200);
        }
        return http.Response('"unavailable"', 503);
      });
      await tester.pumpWidget(OperatorApp(client: client));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 40)),
      );
      await tester.pump();
      await tester.enterText(
        find.widgetWithText(TextField, 'Username'),
        'operator',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Password'),
        'fixture-password',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump(const Duration(milliseconds: 500));
      expect(authenticated, isTrue);

      await tester.scrollUntilVisible(
        find.text('Required lesson handling'),
        250,
        scrollable: find
            .descendant(
              of: find.byType(PageBody),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(find.text('Required lesson handling'), findsOneWidget);
      expect(find.text('Save lesson & delivery choices'), findsOneWidget);
      // Incomplete setup is a landing preference; other pages remain accessible.
      await tester.tap(find.text('Projects').first);
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('Most recent human interaction first'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
  testWidgets('setup choices are never implicitly confirmed', (tester) async {
    final client = api(
      (request) async => http.Response(
        request.url.path.endsWith('/sessions')
            ? '[]'
            : request.url.path.endsWith('/projects')
            ? '{"projects":[]}'
            : '{"revision":"1","roles":[],"models":[],"device_preferences":[],"discovered_devices":[],"execution_ready":false,"unmet_prerequisites":["lesson_handling"]}',
        200,
      ),
    );
    final session = AuthenticatedSession(
      operatorId: OperatorId('u'),
      sessionId: ActorId('s'),
      method: LoginMethod.local,
      expiresAtMs: Counter('1'),
    );
    await tester.pumpWidget(
      OperatorApp(client: client, initialSession: session),
    );
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump(const Duration(milliseconds: 500));
    await tester.scrollUntilVisible(
      find.text('Save lesson & delivery choices'),
      250,
      scrollable: find
          .descendant(
            of: find.byType(PageBody),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Save lesson & delivery choices'),
    );
    expect(button.onPressed, isNull);
    expect(
      tester
          .widget<CheckboxListTile>(
            find.widgetWithText(
              CheckboxListTile,
              'I explicitly confirm these delivery permissions',
            ),
          )
          .value,
      isFalse,
    );
    await tester.pumpWidget(const SizedBox());
    client.close();
  });
}
