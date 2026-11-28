import 'dart:convert';
import 'dart:io';

import 'package:ironloom_client/ironloom_client.dart';
import 'package:test/test.dart';

final Map<String, WireModel Function(Object?)> decoders = {
  'stored_command': StoredCommand.fromJson,
  'session_query': SessionQuery.fromJson,
  'service_event': ServiceEvent.fromJson,
  'model_inventory_item': ModelInventoryItem.fromJson,
  'model_assessment_query': ModelAssessmentQuery.fromJson,
  'instruction_command': InstructionCommand.fromJson,
  'engine_assessment': EngineAssessment.fromJson,
  'download_progress': DownloadProgress.fromJson,
  'download_limits': DownloadLimits.fromJson,
  'budget_command': BudgetCommand.fromJson,
  'project_query': ProjectQuery.fromJson,
  'create_project': CreateProject.fromJson,
  'credential_command': CredentialCommand.fromJson,
  'native_connection_command': NativeConnectionCommand.fromJson,
  'download_command': DownloadCommand.fromJson,
  'create_conversation': CreateConversation.fromJson,
  'source_query': SourceQuery.fromJson,
  'source_page': SourcePage.fromJson,
  'engine_load_options': EngineLoadOptions.fromJson,
  'engine_requirements': EngineRequirements.fromJson,
  'engine_observation': EngineObservation.fromJson,
  'device_observation': DeviceResourceObservation.fromJson,
  'configuration_command': ConfigurationCommand.fromJson,
  'configuration_snapshot': ConfigurationSnapshot.fromJson,
  'lesson_mutation': LessonMutation.fromJson,
  'question_answer': QuestionAnswer.fromJson,
  'pending_question': PendingQuestion.fromJson,
  'inference_message': InferenceMessage.fromJson,
  'tool_definition': ToolDefinition.fromJson,
  'inference_request': InferenceRequest.fromJson,
  'conversation_snapshot': ConversationSnapshot.fromJson,
  'history_query': HistoryQuery.fromJson,
  'history_page': HistoryPage.fromJson,
  'native_enrollment': NativeEnrollment.fromJson,
  'role_configuration': RoleConfiguration.fromJson,
  'factory_setup': FactorySetup.fromJson,
  'instruction_copy': InstructionCopy.fromJson,
  'command': Command.fromJson,
  'usage': Usage.fromJson,
  'authority_check': AuthorityCheck.fromJson,
  'lesson': Lesson.fromJson,
  'login_request': LoginRequest.fromJson,
  'replay_cursor': ReplayCursor.fromJson,
  'relay_cursor': RelayCursor.fromJson,
  'model_selection': ModelSelection.fromJson,
  'residency': Residency.fromJson,
  'worker_event': WorkerEvent.fromJson,
  'worker_paths': WorkerPaths.fromJson,
  'factory_artifact': FactoryArtifact.fromJson,
};

void main() {
  final corpus = jsonDecode(
    File('../../fixtures/contracts/decode.json').readAsStringSync(),
  ) as Map<String, Object?>;
  for (final entry in corpus['cases']! as List<Object?>) {
    final fixture = entry! as Map<String, Object?>;
    test('shared Rust/Dart: ${fixture['name']}', () {
      final decoder = decoders[fixture['contract']]!;
      final errors = fixture['expected_errors']! as List<Object?>;
      final input = jsonEncode(fixture['input']);
      if (errors.isEmpty) {
        final result = decode(input, decoder);
        // Roundtrip through the actual public decoder, not a schema-only check.
        expect(
          decode(jsonEncode(result.toJson()), decoder).toJson(),
          result.toJson(),
        );
      } else {
        expect(
          () => decode(input, decoder),
          throwsA(
            isA<ValidationErrors>().having(
              (e) => e.fields.map((f) => f.toJson()).toList(),
              'fields',
              errors,
            ),
          ),
        );
      }
    });
  }

  test(
    'constructor, fromJson and decode enforce the same cross-field invariant',
    () {
      final draft = {
        'instruction_id': 'i',
        'assignment_id': 'a',
        'revision': '1',
        'acknowledged_revision': '2',
        'content': 'instructions',
      };
      final failure = throwsA(
        isA<ValidationErrors>().having(
          (e) => e.fields.first.field,
          'field',
          'acknowledged_revision',
        ),
      );
      expect(
        () => InstructionCopy(
          instructionId: InstructionId('i'),
          assignmentId: AssignmentId('a'),
          revision: Counter('1'),
          acknowledgedRevision: Counter('2'),
          content: 'instructions',
        ),
        failure,
      );
      expect(() => InstructionCopy.fromJson(draft), failure);
      expect(
        () => decode(jsonEncode(draft), InstructionCopy.fromJson),
        failure,
      );
    },
  );

  test('nested records reject invalid identities with a field path', () {
    final draft = {
      'command_id': 'c',
      'project_id': 'p',
      'expected_revision': '1',
      'action': {
        'type': 'steer',
        'data': {
          'conversation_id': 'v',
          'expected_turn_id': ' ',
          'text': 'continue',
        },
      },
    };
    expect(
      () => decode(jsonEncode(draft), Command.fromJson),
      throwsA(
        isA<ValidationErrors>().having(
          (e) => e.fields.first.field,
          'field',
          'action.data.expected_turn_id',
        ),
      ),
    );
  });

  test(
    'records cannot be mutated through constructor inputs or JSON output',
    () {
      final payload = <String, Object?>{
        'items': <Object?>['original'],
      };
      final artifact = FactoryArtifact(
        artifactId: ArtifactId('a'),
        projectId: ProjectId('p'),
        assignmentId: AssignmentId('w'),
        correlationId: CorrelationId('c'),
        kind: ActorId('k'),
        contentHash: ActorId('h'),
        payload: payload,
      );
      (payload['items']! as List<Object?>).add('changed');
      expect((artifact.payload! as Map)['items'], ['original']);
      expect(
        () => (artifact.payload! as Map)['extra'] = 'bypass',
        throwsUnsupportedError,
      );
      final json = artifact.toJson();
      (json['payload']! as Map)['extra'] = 'editable transport copy';
      expect((artifact.payload! as Map).containsKey('extra'), isFalse);
    },
  );

  test('secrets stay out of debug strings and structural failures', () {
    final login = LoginRequest(
      username: ActorId('operator'),
      password: SecretInput('fixture-secret'),
    );
    expect(login.toString(), isNot(contains('fixture-secret')));
    expect(login.password.toString(), '[REDACTED]');
    expect(
      () => decode(
        '{"username":"operator","password":{"value":"fixture-secret"}}',
        LoginRequest.fromJson,
      ),
      throwsA(
        isA<ValidationErrors>().having(
          (e) => e.toString(),
          'redacted error',
          isNot(contains('fixture-secret')),
        ),
      ),
    );
  });

  test('trailing input is distinct from malformed input', () {
    expect(
      () => decode(
        '{"conversation_id":"v","sequence":"1"} {}',
        ReplayCursor.fromJson,
      ),
      throwsA(
        isA<ValidationErrors>().having(
          (e) => e.fields.first.code,
          'code',
          'trailing_data',
        ),
      ),
    );
    expect(
      () => decode('{"conversation_id":', ReplayCursor.fromJson),
      throwsA(
        isA<ValidationErrors>().having(
          (e) => e.fields.first.code,
          'code',
          'invalid_structure',
        ),
      ),
    );
  });

  test('nested malformed counters report the exact array field', () {
    expect(
      () => EngineCapabilities.fromJson({
        'engine': {
          'name': 'engine',
          'version': '1',
          'backend': 'cpu',
          'configuration_hash': 'h',
        },
        'architectures': <Object?>[' '],
        'formats': <Object?>[],
        'quantizations': <Object?>[],
        'streaming': true,
        'tools': false,
        'draft_models': 'unsupported',
        'context_cache': 'unsupported',
        'batching': 'unsupported',
        'multi_gpu': 'unsupported',
        'accelerators': <Object?>[],
      }),
      throwsA(
        isA<ValidationErrors>().having(
          (e) => e.fields.first.field,
          'field',
          'architectures.0',
        ),
      ),
    );
  });
  test('pending question modes validate against stored choices without granting authority', () {
    final question = PendingQuestion(
      questionId: QuestionId('q'),
      assignmentId: AssignmentId('a'),
      conversationId: ConversationId('c'),
      turnId: TurnId('t'),
      itemId: ItemId('i'),
      revision: Counter('1'),
      text: 'Choose',
      choices: [ActorId('yes'), ActorId('no')],
      allowMultiple: false,
      allowText: false,
    );
    question.validateResponse([ActorId('yes')], null);
    expect(
      () => question.validateResponse([ActorId('unknown')], null),
      throwsA(
        isA<ValidationErrors>().having(
          (e) => e.fields.first.code,
          'code',
          'unknown_choice',
        ),
      ),
    );
    expect(
      () => question.validateResponse([ActorId('yes'), ActorId('no')], null),
      throwsA(
        isA<ValidationErrors>().having(
          (e) => e.fields.first.code,
          'code',
          'multiple_choices_forbidden',
        ),
      ),
    );
    expect(
      () => question.validateResponse([], 'comment'),
      throwsA(
        isA<ValidationErrors>().having(
          (e) => e.fields.first.code,
          'code',
          'text_forbidden',
        ),
      ),
    );
  });
}
