import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/pages/settings_page.dart';

void main() {
  testWidgets(
    'project team edits keep the loaded project and revision out of installation settings',
    (tester) async {
      Map<String, dynamic>? submitted;
      final snapshot = <String, dynamic>{
        'project_id': 'project-A',
        'revision': '1',
        'roles': [],
        'models': [],
        'device_preferences': [],
        'discovered_devices': [],
        'execution_ready': false,
        'unmet_prerequisites': ['role_models'],
      };
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://configuration.fixture/')),
        MockClient((request) async {
          if (request.method == 'GET') {
            expect(request.url.queryParameters['project_id'], 'project-A');
            return http.Response(jsonEncode(snapshot), 200);
          }
          submitted = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              ...snapshot,
              'revision': '2',
              'roles': submitted!['changes']['roles'],
            }),
            200,
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ProjectConfiguration(client: client),
            ),
          ),
        ),
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Project configuration ID'),
        'project-A',
      );
      await tester.tap(find.text('Load project configuration'));
      for (var i = 0; i < 3; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
      }
      await tester.tap(find.text('Edit loaded project configuration'));
      await tester.pumpAndSettle();
      expect(find.text('Installation access'), findsNothing);
      await tester.ensureVisible(find.text('Add role'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add role'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'New role ID'),
        'project-reviewer',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Instruction template ID'),
        'project-instructions',
      );
      await tester.ensureVisible(find.byType(DropdownButtonFormField<bool>));
      await tester.tap(find.byType(DropdownButtonFormField<bool>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('No').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save role'));
      await tester.tap(find.text('Save role'));
      for (var i = 0; i < 3; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
      }
      expect(submitted!['project_id'], 'project-A');
      expect(submitted!['expected_revision'], '1');
      expect(submitted!['changes']['roles'][0]['role_id'], 'project-reviewer');
      await tester.pumpWidget(const SizedBox());
      client.close();
    },
  );
  testWidgets(
    'custom role needs explicit instructions and reasoning choice; enabling never picks a model',
    (tester) async {
      final saved = <RoleConfiguration>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: RoleEditor(
                models: const [],
                onSave: (role) async {
                  saved.add(role);
                },
              ),
            ),
          ),
        ),
      );
      await tester.ensureVisible(find.text('Add role'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add role'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'New role ID'),
        'release-reviewer',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Instruction template ID'),
        'release-instructions',
      );
      await tester.ensureVisible(find.text('Save role'));
      await tester.tap(find.text('Save role'));
      await tester.pumpAndSettle();
      expect(saved, isEmpty);
      expect(
        find.textContaining('reasoning applicable: explicit choice required'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.byType(DropdownButtonFormField<bool>));
      await tester.tap(find.byType(DropdownButtonFormField<bool>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('No').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save role'));
      await tester.tap(find.text('Save role'));
      await tester.pumpAndSettle();
      expect(saved.single.roleId.value, 'release-reviewer');
      expect(saved.single.instructionsId.value, 'release-instructions');
      expect(saved.single.enabled, isFalse);
      expect(saved.single.modelProfileId, isNull);
      await tester.ensureVisible(find.text('Enable role'));
      await tester.tap(find.text('Enable role'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save role'));
      await tester.tap(find.text('Save role'));
      await tester.pumpAndSettle();
      expect(saved.length, 1);
      expect(find.textContaining('model profile id'), findsOneWidget);
    },
  );
}
