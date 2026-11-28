import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/app.dart';

Future<void> settleHttp(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pump(const Duration(milliseconds: 100));
  }
}

String session(String method) =>
    '{"operator_id":"authenticated-user","session_id":"opaque","method":"$method","expires_at_ms":"100000"}';
http.Response configuration() => http.Response(
  '{"revision":"1","roles":[],"models":[],"device_preferences":[],"endpoints":[],"source_accounts":[],"discovered_devices":[],"execution_ready":false,"unmet_prerequisites":["lesson_handling"]}',
  200,
);
void main() {
  testWidgets(
    'OIDC return exchanges state/code with service and enters authenticated setup',
    (tester) async {
      var cleaned = false, exchanges = 0;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://service/')),
        MockClient((request) async {
          if (request.url.path.endsWith('/oidc/callback')) {
            expect(cleaned, isTrue);
            expect(jsonDecode(request.body), {
              'state': 'one-time-state',
              'code': 'one-time-code',
            });
            exchanges++;
            return http.Response(
              session('oidc'),
              200,
              headers: {'x-ironloom-csrf': 'proof'},
            );
          }
          if (request.url.path.endsWith('/configuration')) {
            return configuration();
          }
          if (request.url.path.endsWith('/projects')) {
            return http.Response('{"projects":[]}', 200);
          }
          if (request.url.path.endsWith('/sessions')) {
            return http.Response('[]', 200);
          }
          return http.Response('"unavailable"', 503);
        }),
      );
      await tester.pumpWidget(
        OperatorApp(
          client: client,
          returnUri: Uri.parse(
            'https://service/?state=one-time-state&code=one-time-code',
          ),
          clearReturn: () => cleaned = true,
        ),
      );
      await settleHttp(tester);
      expect(exchanges, 1);
      expect(find.widgetWithText(TextField, 'Username'), findsNothing);
      expect(find.text('Setup & team'), findsWidgets);
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
  testWidgets(
    'reload restores a validated cookie session without another login',
    (tester) async {
      var restores = 0;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://service/')),
        MockClient((request) async {
          if (request.url.path.endsWith('/auth/session')) {
            restores++;
            return http.Response(session('local'), 200);
          }
          if (request.url.path.endsWith('/configuration')) {
            return configuration();
          }
          if (request.url.path.endsWith('/projects')) {
            return http.Response('{"projects":[]}', 200);
          }
          if (request.url.path.endsWith('/sessions')) {
            return http.Response('[]', 200);
          }
          throw StateError('Unexpected auth mutation');
        }),
      );
      await tester.pumpWidget(OperatorApp(client: client));
      await settleHttp(tester);
      expect(restores, 1);
      expect(find.widgetWithText(TextField, 'Username'), findsNothing);
      expect(find.text('Setup & team'), findsWidgets);
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
  testWidgets(
    'ambiguous OIDC return never authenticates or falls back to another session',
    (tester) async {
      var requests = 0;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://service/')),
        MockClient((request) async {
          requests++;
          return http.Response(session('oidc'), 200);
        }),
      );
      await tester.pumpWidget(
        OperatorApp(
          client: client,
          returnUri: Uri.parse('https://service/?state=a&state=b&code=c'),
        ),
      );
      await settleHttp(tester);
      expect(requests, 0);
      expect(find.widgetWithText(TextField, 'Username'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
}
