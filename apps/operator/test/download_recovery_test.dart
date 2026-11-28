import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/pages/models_page.dart';
import 'package:ironloom_operator/widgets.dart';

void main() {
  testWidgets(
    'saved transfer restores repository binding and retains its pinned revision',
    (tester) async {
      Map<String, Object?>? sent;
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://downloads.fixture/')),
        MockClient((request) async {
          if (request.method == 'POST') {
            sent = jsonDecode(request.body) as Map<String, Object?>;
          }
          return http.Response(
            jsonEncode({
              'repository_id': 'huggingface:publisher/model',
              'download_id': 'job',
              'source': {
                'publisher': 'publisher',
                'host': 'huggingface',
                'repository_url': 'https://huggingface.co/publisher/model',
                'revision': 'old-revision',
                'access': 'accessible',
              },
              'received_bytes': '0',
              'total_bytes': '4',
              'cancel_requested': sent != null,
              'terminated': sent != null,
            }),
            200,
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ModelsPage(client: client)),
        ),
      );
      final scrollable = find
          .descendant(
            of: find.byType(PageBody),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.widgetWithText(TextField, 'Persisted download ID'),
        300,
        scrollable: scrollable,
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Persisted download ID'),
        'job',
      );
      await tester.tap(
        find.widgetWithText(FilledButton, 'Read saved progress'),
      );
      for (var i = 0; i < 3; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump(const Duration(milliseconds: 100));
      }
      await tester.scrollUntilVisible(
        find.widgetWithText(FilledButton, 'Cancel download'),
        200,
        scrollable: scrollable,
      );
      await tester.ensureVisible(
        find.widgetWithText(FilledButton, 'Cancel download'),
      );
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Cancel download'));
      for (var i = 0; i < 3; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(sent?['repository_id'], 'huggingface:publisher/model');
      expect(sent?['revision'], 'old-revision');
      expect(sent?['operation'], 'cancel');
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
}
