import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/pages/assignment_instructions.dart';

import 'authentication_test.dart' show settleHttp;

http.Response copies(String assignment, String acknowledged) => http.Response(
  jsonEncode([
    {
      'assignment_id': assignment,
      'instruction_id': 'instructions-$assignment',
      'revision': '2',
      'acknowledged_revision': acknowledged,
      'content': 'Private role instructions $assignment',
    },
  ]),
  200,
);
Widget panel(IronloomClient client, String assignment) => MaterialApp(
  home: Scaffold(
    body: SingleChildScrollView(
      child: AssignmentInstructions(
        client: client,
        assignment: AssignmentId(assignment),
      ),
    ),
  ),
);
void main() {
  testWidgets(
    'active copies show pending acknowledgment, refresh and clear on grant revocation',
    (tester) async {
      var reads = 0;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://service/')),
        MockClient((request) async {
          expect(request.url.path, '/api/v1/assignments/A/instructions');
          reads++;
          return reads <= 2
              ? copies('A', reads == 1 ? '1' : '2')
              : http.Response('"unavailable"', 403);
        }),
      );
      await tester.pumpWidget(panel(client, 'A'));
      await tester.tap(find.text('Read active instruction copies'));
      await settleHttp(tester);
      expect(find.textContaining('worker update pending'), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await settleHttp(tester);
      expect(find.textContaining('acknowledged by worker'), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await settleHttp(tester);
      expect(find.text('instructions-A'), findsNothing);
      expect(find.textContaining('permission'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
  testWidgets(
    'late old assignment response never replaces the new assignment copies',
    (tester) async {
      final pending = <String, Completer<http.Response>>{};
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://service/')),
        MockClient((request) {
          final assignment = request.url.pathSegments[3];
          return (pending[assignment] = Completer<http.Response>()).future;
        }),
      );
      await tester.pumpWidget(panel(client, 'A'));
      await tester.tap(find.text('Read active instruction copies'));
      await settleHttp(tester);
      await tester.pumpWidget(panel(client, 'B'));
      await tester.tap(find.text('Read active instruction copies'));
      await settleHttp(tester);
      pending['B']!.complete(copies('B', '2'));
      await settleHttp(tester);
      pending['A']!.complete(copies('A', '1'));
      await settleHttp(tester);
      expect(find.text('instructions-B'), findsOneWidget);
      expect(find.text('instructions-A'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
}
