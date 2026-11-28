@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/pages/model_details.dart';

import 'authentication_test.dart' show settleHttp;

Map<String, dynamic> fixture(String name) {
  final corpus = jsonDecode(
    File('../../fixtures/contracts/decode.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  return (corpus['cases'] as List).cast<Map<String, dynamic>>().firstWhere(
        (entry) => entry['name'] == name,
      )['input']
      as Map<String, dynamic>;
}

void main() {
  testWidgets(
    'authorized assessment keeps unknown fit and qualification separate and invalidates changed assumptions',
    (tester) async {
      final inventory = fixture('verified-checkpoint-provenance');
      final model = ModelCard.fromJson(inventory['model']);
      final assessment = fixture('unknown-is-not-unsupported-or-qualified');
      Map<String, dynamic>? submitted;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://service/')),
        MockClient((request) async {
          expect(request.url.path, '/api/v1/models/assessments');
          submitted = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(jsonEncode([assessment]), 200);
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ModelAssessment(
                client: client,
                model: model,
                project: ProjectId('p'),
                configurationRevision: Counter('1'),
              ),
            ),
          ),
        ),
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Assessment context tokens'),
        '1024',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Assessment concurrency'),
        '1',
      );
      await tester.tap(find.text('Assess configured engines'));
      await settleHttp(tester);
      expect(submitted!['project_id'], 'p');
      expect(submitted!['context_tokens'], '1024');
      expect(submitted!['concurrency'], '1');
      expect(submitted!['repository_id'], model.repositoryId.value);
      expect(find.textContaining('Estimated memory: Unknown'), findsOneWidget);
      expect(
        find.textContaining('Backend qualification: unqualified'),
        findsOneWidget,
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Assessment context tokens'),
        '2048',
      );
      await tester.pump();
      expect(find.textContaining('Estimated memory:'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
  testWidgets(
    'complete transfer stays unverified and unavailable inventory preserves provenance',
    (tester) async {
      ActorId? recovered;
      final pending = fixture('complete-bytes-remain-unverified');
      final unavailable = {
        ...fixture('missing-storage-keeps-provenance'),
        'inventory_id': 'inventory-missing',
        'download_id': 'download-missing',
      };
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://service/')),
        MockClient((request) async {
          expect(request.url.path, '/api/v1/models/inventory');
          expect(request.url.queryParameters['project_id'], 'p');
          return http.Response(
            jsonEncode({
              'models': [pending, unavailable],
            }),
            200,
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ModelInventory(
                client: client,
                project: ProjectId('p'),
                onRecover: (id) async {
                  recovered = id;
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Refresh installed models'));
      await settleHttp(tester);
      expect(find.textContaining('Verification: pending'), findsOneWidget);
      expect(find.textContaining('Storage: Unavailable'), findsOneWidget);
      expect(find.textContaining('Verified manifest: None'), findsOneWidget);
      final recovery = find.text('Open download controls').last;
      await tester.ensureVisible(recovery);
      await tester.tap(recovery);
      await settleHttp(tester);
      expect(recovered?.value, 'download-missing');
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
}
