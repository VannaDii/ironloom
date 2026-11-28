import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:ironloom_operator/pages/instructions.dart';

import 'authentication_test.dart' show settleHttp;

void main() {
  testWidgets(
    'instruction edit requires explicit active-copy choice and retains scope/revision',
    (tester) async {
      Map<String, dynamic>? saved;
      final template = InstructionTemplate(
        instructionId: InstructionId('custom'),
        projectId: ProjectId('project'),
        revision: Counter('7'),
        content: 'Original instructions',
      );
      final client = IronloomClient(
        ServerConnection(Uri.parse('https://service/prefix/')),
        MockClient((request) async {
          expect(request.url.path, '/prefix/api/v1/instructions');
          saved = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              ...template.toJson(),
              'revision': '8',
              'content': saved!['content'],
            }),
            200,
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => InstructionEditor(
                    client: client,
                    template: template,
                    project: template.projectId,
                  ),
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save instruction template'),
            )
            .onPressed,
        isNull,
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Role instructions'),
        'Updated explicit instructions',
      );
      await tester.tap(
        find.byType(DropdownButtonFormField<ActiveInstructionUpdate>),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Yes — update selected copies').last);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Selected active assignment IDs'),
        'assignment-one, assignment-two',
      );
      await tester.ensureVisible(find.text('Save instruction template'));
      await tester.tap(find.text('Save instruction template'));
      await settleHttp(tester);
      await tester.pumpAndSettle();
      expect(saved!['project_id'], 'project');
      expect(saved!['instruction_id'], 'custom');
      expect(saved!['expected_revision'], '7');
      expect(saved!['active_update'], 'update_selected_copies');
      expect(saved!['assignments'], ['assignment-one', 'assignment-two']);
      expect(find.byType(InstructionEditor), findsNothing);
      client.close();
    },
  );
}
