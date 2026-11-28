import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/pages/endpoint_editors.dart';

Future<void> select<T>(WidgetTester tester, String label, String choice) async {
  final field = find.widgetWithText(DropdownButtonFormField<T>, label);
  await tester.ensureVisible(field);
  await tester.tap(field);
  await tester.pumpAndSettle();
  await tester.tap(find.text(choice).last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'endpoint requires explicit protocol and billing and rejects secret-bearing destination',
    (tester) async {
      final saved = <ProviderEndpoint>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: EndpointEditor(
                onSave: (endpoint) async {
                  saved.add(endpoint);
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Add provider endpoint'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Provider ID'),
        'custom',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Provider API base'),
        'https://provider.fixture/v1',
      );
      await tester.ensureVisible(find.text('Save provider endpoint'));
      await tester.tap(find.text('Save provider endpoint'));
      await tester.pumpAndSettle();
      expect(saved, isEmpty);
      expect(
        find.textContaining('explicit protocol and billing required'),
        findsOneWidget,
      );
      await select<ProviderDialect>(
        tester,
        'Provider protocol',
        'chat_completions',
      );
      await select<BillingMode>(tester, 'Endpoint billing', 'api_key');
      await tester.ensureVisible(find.text('Save provider endpoint'));
      await tester.tap(find.text('Save provider endpoint'));
      await tester.pumpAndSettle();
      expect(saved.single.dialect, ProviderDialect.chatCompletions);
      expect(saved.single.billing, BillingMode.apiKey);
      expect(saved.single.streaming, isFalse);
      await tester.enterText(
        find.widgetWithText(TextField, 'Provider API base'),
        'https://secret@provider.fixture/v1',
      );
      await tester.ensureVisible(find.text('Save provider endpoint'));
      await tester.tap(find.text('Save provider endpoint'));
      await tester.pumpAndSettle();
      expect(saved, hasLength(1));
    },
  );
  testWidgets(
    'source binding requires explicit access and carries only credential reference',
    (tester) async {
      final saved = <SourceAccountBinding>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: SourceAccountEditor(
                onSave: (binding) async {
                  saved.add(binding);
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Add source account binding'));
      await tester.pumpAndSettle();
      await select<String>(tester, 'Source host', 'huggingface');
      await tester.ensureVisible(find.text('Save source account binding'));
      await tester.tap(find.text('Save source account binding'));
      await tester.pumpAndSettle();
      expect(saved, isEmpty);
      await select<String>(
        tester,
        'Source account access',
        'Use selected credential',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Source credential reference'),
        'source-credential',
      );
      await tester.ensureVisible(find.text('Save source account binding'));
      await tester.tap(find.text('Save source account binding'));
      await tester.pumpAndSettle();
      expect(saved.single.toJson(), {
        'host': 'huggingface',
        'access': {'type': 'credential', 'credential_id': 'source-credential'},
      });
      await select<String>(tester, 'Source account access', 'Anonymous access');
      await tester.ensureVisible(find.text('Save source account binding'));
      await tester.tap(find.text('Save source account binding'));
      await tester.pumpAndSettle();
      expect(saved.last.toJson(), {
        'host': 'huggingface',
        'access': {'type': 'anonymous'},
      });
    },
  );
}
