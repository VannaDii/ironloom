import 'package:ironloom_client/ironloom_client.dart';
import 'package:test/test.dart';

void main() {
  test('u64 counters remain exact on VM and browser', () {
    for (final value in ['0', '9007199254740993', '18446744073709551615']) {
      final cursor = decode(
        '{"conversation_id":"s","sequence":"$value"}',
        ReplayCursor.fromJson,
      );
      expect(cursor.sequence.toJson(), value);
      expect(cursor.toJson()['sequence'], value);
    }
    for (final value in [
      '18446744073709551616',
      '-1',
      '01',
      '+1',
      '1.0',
      ' 1',
      '0xff',
    ]) {
      expect(() => Counter(value), throwsA(isA<ValidationErrors>()));
    }
    expect(() => Counter.fromJson(1), throwsA(isA<ValidationErrors>()));
    expect(
      Counter('18446744073709551615') > Counter('9007199254740993'),
      isTrue,
    );
  });

  test('nested constructor checks survive web compilation', () {
    expect(
      () => RoleConfiguration(
        roleId: ActorId('planner'),
        enabled: true,
        reasoningApplicable: true,
        instructionsId: InstructionId('i'),
        deviceBindings: [],
      ),
      throwsA(
        isA<ValidationErrors>().having(
          (e) => e.fields.first.code,
          'code',
          'explicit_model_required',
        ),
      ),
    );
    expect(
      () => FactorySetup(
        lessonHandling: LessonHandling.projectOnly,
        deliveryConfirmed: false,
        publishBranch: true,
        merge: false,
        deploy: false,
      ),
      throwsA(isA<ValidationErrors>()),
    );
  });
  test('SSE cursor encoding preserves scope and full-range sequences', () {
    final cursor = ReplayCursor(
      conversationId: ConversationId('session:1'),
      sequence: Counter('9007199254740993'),
    );
    final header = encodeCursor(cursor);
    expect(
      header,
      'eyJjb252ZXJzYXRpb25faWQiOiJzZXNzaW9uOjEiLCJzZXF1ZW5jZSI6IjkwMDcxOTkyNTQ3NDA5OTMifQ',
    );
    expect(decodeCursor(header).toJson(), cursor.toJson());
    for (final invalid in ['not!a!cursor', '$header=', 'Zh', 'a' * 4097]) {
      expect(() => decodeCursor(invalid), throwsA(isA<ValidationErrors>()));
    }
  });

  test('structured service failures decode without inventing success', () {
    for (final json in [
      '"conflict"',
      '"cursor_expired"',
      '"resync_required"',
      '"unavailable"',
      '{"authentication":"forbidden"}',
      '{"validation":{"fields":[{"field":"revision","code":"future_revision"}]}}',
    ]) {
      final failure = decode(json, ServiceError.fromJson);
      expect(decode(json, ServiceError.fromJson).toJson(), failure.toJson());
    }
    expect(
      () => decode('"success"', ServiceError.fromJson),
      throwsA(isA<ValidationErrors>()),
    );
  });
  test('new message and configuration contracts validate in browser code', () {
    final message = InferenceMessage(
      role: MessageRole.assistant,
      toolCalls: [
        ToolInvocation(
          toolCallId: ToolCallId('call'),
          name: ActorId('read'),
          arguments: {'path': 'src'},
        ),
      ],
    );
    expect(message.toolCalls.single.arguments, {'path': 'src'});
    expect(
      () => InferenceMessage(
        role: MessageRole.tool,
        text: 'untyped result',
        toolCalls: [],
      ),
      throwsA(isA<ValidationErrors>()),
    );
    expect(() => ConfigurationChange(), throwsA(isA<ValidationErrors>()));
    final setup = ConfigurationChange(
      devicePreferences: [
        DevicePreference(deviceId: DeviceId('gpu'), enabled: true),
      ],
    );
    expect(setup.devicePreferences!.single.enabled, isTrue);
  });

  test(
    'native endpoints retain separate origins and secure loopback rules',
    () {
      final endpoints = RelayTarget(
        websocketUrl: 'ws://127.0.0.1:8000/server',
        enrollUrl: 'http://127.0.0.1:8000/enroll',
        refreshUrl: 'http://127.0.0.1:8000/refresh',
        pairUrl: 'http://127.0.0.1:8000/pair',
        pairStatusUrl: 'http://127.0.0.1:8000/pair/status',
      );
      expect(endpoints.websocketUrl, 'ws://127.0.0.1:8000/server');
      final invalid = endpoints.toJson()
        ..['refresh_url'] = 'http://127.0.0.1:8001/refresh';
      expect(
        () => RelayTarget.fromJson(invalid),
        throwsA(
          isA<ValidationErrors>().having(
            (e) => e.fields.first.code,
            'code',
            'relay_origin_mismatch',
          ),
        ),
      );
    },
  );
  test('empty conversation creation remains independent from user input', () {
    final request = CreateConversation(
      commandId: CommandId('create-1'),
      projectId: ProjectId('project-1'),
    );
    expect(
      decode(
        '{"command_id":"create-1","project_id":"project-1"}',
        CreateConversation.fromJson,
      ).toJson(),
      request.toJson(),
    );
    expect(
      () => CreateConversation.fromJson({
        ...request.toJson(),
        'text': 'hidden input',
      }),
      throwsA(isA<ValidationErrors>()),
    );
    expect(
      () => InputCommand(conversationId: ConversationId('c'), text: ''),
      throwsA(isA<ValidationErrors>()),
    );
  });
}
