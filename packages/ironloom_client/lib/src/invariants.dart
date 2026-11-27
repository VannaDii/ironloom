part of 'contracts.dart';

final _repositoryCharacters = RegExp(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$');
final _whitespace = RegExp(
  r'[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]',
);
bool _blank(String value) => value.runes.every(
  (rune) => _whitespace.hasMatch(String.fromCharCode(rune)),
);
void _validateIdentity(String type, String value) {
  if (_blank(value)) _fail(r'$', 'invalid_structure');
  if (type == 'BranchName' &&
      (value.contains('..') ||
          value.contains('//') ||
          value.contains(r'\') ||
          value.startsWith('/') ||
          value.endsWith('/') ||
          value.endsWith('.lock') ||
          _whitespace.hasMatch(value))) {
    _fail(r'$', 'invalid_structure');
  }
  if (type == 'RepositorySlug' &&
      _repositoryCharacters.firstMatch(value)?.end != value.length) {
    _fail(r'$', 'invalid_structure');
  }
}

// Keep ordering aligned with Rust Validate implementations: the first failure wins.
void _validateModel(WireModel model) {
  switch (model) {
    case FactorySetup v:
      if (!v.deliveryConfirmed) {
        _fail('delivery_confirmed', 'confirmation_required');
      }
    case StorageRoots v:
      _required('models', v.models);
      _required('projects', v.projects);
      if (v.models == v.projects ||
          (v.managedDatabase != null &&
              (v.managedDatabase == v.models ||
                  v.managedDatabase == v.projects))) {
        _fail('projects', 'roots_must_differ');
      }
      if (v.managedDatabase case final root?) {
        _required('managed_database', root);
      }
    case RoleConfiguration v:
      if (v.enabled && v.modelProfileId == null) {
        _fail('model_profile_id', 'explicit_model_required');
      }
      if (v.enabled && v.reasoningApplicable && v.reasoningEffort == null) {
        _fail('reasoning_effort', 'explicit_effort_required');
      }
      if (!v.reasoningApplicable && v.reasoningEffort != null) {
        _fail('reasoning_effort', 'unsupported_effort');
      }
    case DeviceIdentity v:
      if (v.parentId?.value == v.deviceId.value) {
        _fail('parent_id', 'self_parent');
      }
    case ModelSelection v:
      if (v.engine != null) {
        if (v.billing != BillingMode.localEstimate) {
          _fail('billing', 'local_billing_required');
        }
        if (v.devices.isEmpty) _fail('devices', 'local_placement_required');
        if (v.devices.any((d) => !d.reconciled)) {
          _fail('devices', 'identity_unresolved');
        }
        final unique = v.devices.map((d) => d.deviceId.value).toSet();
        if (unique.length != v.devices.length) {
          _fail('devices', 'duplicate_device');
        }
        if (v.devices.any(
          (d) => d.parentId != null && unique.contains(d.parentId!.value),
        )) {
          _fail('devices', 'overlapping_parent_placement');
        }
        if (v.revision == null || v.checkpointHash == null) {
          _fail('checkpoint_hash', 'local_provenance_required');
        }
      } else if (v.billing == BillingMode.localEstimate) {
        _fail('billing', 'remote_billing_required');
      } else if (v.devices.isNotEmpty) {
        _fail('devices', 'remote_placement_forbidden');
      }
    case InferenceRequest v:
      if (v.engineOptions != null && v.selection.engine == null) {
        _fail('engine_options', 'local_engine_required');
      }
      if (v.messages.isEmpty) _fail('messages', 'required');
      if (v.tools.map((t) => t.name.value).toSet().length != v.tools.length) {
        _fail('tools', 'duplicate_tool');
      }
      final seen = <String>{};
      final pending = <String>{};
      for (var index = 0; index < v.messages.length; index++) {
        final message = v.messages[index];
        if (pending.isNotEmpty && message.role != MessageRole.tool) {
          _fail('messages.$index', 'tool_results_required');
        }
        for (final call in message.toolCalls) {
          if (!seen.add(call.toolCallId.value)) {
            _fail('messages.$index.tool_calls', 'duplicate_tool_call');
          }
          pending.add(call.toolCallId.value);
        }
        if (message.toolResult case final result?) {
          if (!pending.remove(result.toolCallId.value)) {
            _fail(
              'messages.$index.tool_result.tool_call_id',
              'unmatched_tool_result',
            );
          }
        }
      }
      if (pending.isNotEmpty) _fail('messages', 'tool_results_required');
    case Residency v:
      if (v.selection.engine == null) {
        _fail('selection.engine', 'local_engine_required');
      }
      // Rust checks this after the local-engine invariant.
      _positive('reserved_bytes', v.reservedBytes);
    case ModelSource v:
      final Uri url;
      try {
        url = Uri.parse(v.repositoryUrl);
      } on FormatException {
        _fail('repository_url', 'invalid_url');
      }
      if (!url.hasScheme) _fail('repository_url', 'invalid_url');
      if (url.scheme != 'https' ||
          url.host.isEmpty ||
          url.userInfo.isNotEmpty) {
        _fail('repository_url', 'https_without_credentials_required');
      }
    case DownloadProgress v:
      if (v.totalBytes != null && v.receivedBytes > v.totalBytes!) {
        _fail('received_bytes', 'exceeds_total');
      }
    case Usage v:
      if (v.basis == UsageBasis.estimated && v.calculationBasis == null) {
        _fail('calculation_basis', 'estimate_basis_required');
      }
      if (v.costMicros != null &&
          (v.currency == null || v.calculationBasis == null)) {
        _fail('cost_micros', 'cost_basis_required');
      }
      if (v.basis == UsageBasis.unknown &&
          (v.inputTokens != null ||
              v.outputTokens != null ||
              v.cachedTokens != null ||
              v.costMicros != null)) {
        _fail('basis', 'unknown_cannot_report_totals');
      }
    case Resource v:
      if ({
            ResourceKind.project,
            ResourceKind.assignment,
            ResourceKind.conversation,
            ResourceKind.file,
          }.contains(v.kind) &&
          v.projectId == null) {
        _fail('project_id', 'project_scope_required');
      }
      if (v.kind == ResourceKind.project &&
          v.projectId != null &&
          v.projectId!.value != v.id.value) {
        _fail('project_id', 'project_identity_mismatch');
      }
    case AuthorityCheck v:
      if ((v.workerId != null) != (v.assignmentId != null)) {
        _fail('assignment_id', 'delegation_required');
      }
    case InstructionCopy v:
      if (v.acknowledgedRevision > v.revision) {
        _fail('acknowledged_revision', 'future_revision');
      }
    case PlanRevision v:
      _positive('revision', v.revision);
      _required('scope', v.scope);
      if (v.acceptanceCriteria.isEmpty) {
        _fail('acceptance_criteria', 'required');
      }
      for (final criterion in v.acceptanceCriteria) {
        _required('acceptance_criteria', criterion);
      }
    case RememberedAnswer v:
      if (v.scope == RecordScope.assignment && v.assignmentId == null) {
        _fail('assignment_id', 'scope_requires_assignment');
      }
    case WorkerEvent v:
      if ((v.kind == StreamKind.usage) != (v.usage != null)) {
        _fail('usage', 'usage_kind_mismatch');
      }
      if ({
            StreamKind.toolArgumentsDelta,
            StreamKind.toolReady,
          }.contains(v.kind) !=
          (v.toolCallId != null)) {
        _fail('tool_call_id', 'tool_identity_mismatch');
      }
      if ({
            StreamKind.stateChanged,
            StreamKind.terminationConfirmed,
          }.contains(v.kind) !=
          (v.state != null)) {
        _fail('state', 'state_required_only_for_transition');
      }
      if (v.kind == StreamKind.terminationConfirmed &&
          v.state != ExecutionState.terminated) {
        _fail('state', 'termination_required');
      }
    case PendingQuestion v:
      if (v.choices.isEmpty && !v.allowText) {
        _fail('choices', 'required');
      }
      if (v.choices.map((c) => c.value).toSet().length != v.choices.length) {
        _fail('choices', 'duplicate_choice');
      }
    case WorkerPaths v:
      for (final (field, path) in [
        for (final path in v.writePaths) ('write_paths', path),
        ('artifact_area', v.artifactArea),
      ]) {
        _required(field, path);
        final parts = path.split('/').where((p) => p.isNotEmpty).toList();
        if (path.startsWith('/') ||
            parts.isEmpty ||
            parts.first == '.' ||
            parts.contains('..')) {
          _fail(field, 'relative_normal_path_required');
        }
      }
    case ValidationContent v:
      if (!v.mutationsDrained) _fail('mutations_drained', 'active_edits');
    case SessionQuery v:
      if (v.limit.value > BigInt.from(100)) _fail('limit', 'page_too_large');
    case ModelProfileConfiguration v:
      if ((v.engine != null) != (v.billing == BillingMode.localEstimate)) {
        _fail('billing', 'engine_billing_mismatch');
      }
      if (v.engine == null && v.deviceBindings.isNotEmpty) {
        _fail('device_bindings', 'remote_placement_forbidden');
      }
      if (v.deviceBindings.map((d) => d.value).toSet().length !=
          v.deviceBindings.length) {
        _fail('device_bindings', 'duplicate_device');
      }
    case ToolDefinition v:
      if (v.inputSchema is! Map<String, Object?> ||
          (v.inputSchema! as Map<String, Object?>)['type'] != 'object') {
        _fail('input_schema', 'object_schema_required');
      }
    case ToolInvocation v:
      if (v.arguments is! Map<String, Object?>) {
        _fail('arguments', 'object_required');
      }
    case InferenceMessage v:
      if (v.text case final text?) _required('text', text);
      if (v.role == MessageRole.tool) {
        if (v.toolResult == null || v.text != null || v.toolCalls.isNotEmpty) {
          _fail('tool_result', 'tool_result_only_required');
        }
      } else {
        if (v.toolResult != null) _fail('tool_result', 'tool_role_required');
        if (v.toolCalls.isNotEmpty && v.role != MessageRole.assistant) {
          _fail('tool_calls', 'assistant_role_required');
        }
        if (v.text == null && v.toolCalls.isEmpty) {
          _fail('text', 'message_content_required');
        }
      }
    case SourceQuery v:
      _pageLimit(v.limit);
    case SourcePage v:
      if (v.models.length > 100) _fail('models', 'page_too_large');
      if (v.models
              .map(
                (m) => (
                  m.source.host.value,
                  m.repositoryId.value,
                  m.modelId.value,
                ),
              )
              .toSet()
              .length !=
          v.models.length) {
        _fail('models', 'duplicate_model');
      }
    case ContextCache v:
      if (v.capacityBytes case final bytes?) _positive('capacity_bytes', bytes);
    case EngineLoadOptions v:
      if (v.accelerators.map((a) => a.value).toSet().length !=
          v.accelerators.length) {
        _fail('accelerators', 'duplicate_accelerator');
      }
    case EngineLoadRequest v:
      if (v.selection.engine == null) {
        _fail('selection.engine', 'local_engine_required');
      }
    case DeviceResourceObservation v:
      if (v.totalBytes != null &&
          v.usedBytes != null &&
          v.usedBytes! > v.totalBytes!) {
        _fail('used_bytes', 'exceeds_capacity');
      }
      if (v.usedBytes != null &&
          v.externalUsedBytes != null &&
          v.externalUsedBytes! > v.usedBytes!) {
        _fail('external_used_bytes', 'exceeds_usage');
      }
    case EngineObservation v:
      if ((v.state == EngineState.failed) != (v.failure != null)) {
        _fail('failure', 'failure_state_mismatch');
      }
      if (v.state == EngineState.stopped &&
          (v.activeInferences == null || v.activeInferences!.isNotEmpty)) {
        _fail('active_inferences', 'stopped_requires_empty_confirmed_requests');
      }
      if (v.devices.map((d) => d.deviceId.value).toSet().length !=
          v.devices.length) {
        _fail('devices', 'duplicate_device');
      }
    case NativeEnrollment v:
      if (v.externalAccountId.value !=
              v.persistenceKey.externalAccountId.value ||
          v.relayTarget.websocketUrl != v.persistenceKey.websocketUrl) {
        _fail('persistence_key', 'enrollment_key_mismatch');
      }
    case RelayTarget v:
      final websocket = _relayUrl('websocket_url', v.websocketUrl, true);
      for (final (field, endpoint) in [
        ('enroll_url', v.enrollUrl),
        ('refresh_url', v.refreshUrl),
        ('pair_url', v.pairUrl),
        ('pair_status_url', v.pairStatusUrl),
      ]) {
        final http = _relayUrl(field, endpoint, false);
        if (websocket.host != http.host ||
            _relayPort(websocket) != _relayPort(http) ||
            (websocket.scheme == 'wss') != (http.scheme == 'https')) {
          _fail(field, 'relay_origin_mismatch');
        }
      }
    case NativePersistenceKey v:
      _relayUrl('websocket_url', v.websocketUrl, true);
    case QuestionAnswer v:
      if (v.choices.isEmpty && v.text == null) {
        _fail('choices', 'answer_required');
      }
      if (v.text case final text?) _required('text', text);
      if (v.choices.map((c) => c.value).toSet().length != v.choices.length) {
        _fail('choices', 'duplicate_choice');
      }
    case ConversationSnapshot v:
      if (v.session.conversationId.value != v.cursor.conversationId.value) {
        _fail('cursor.conversation_id', 'conversation_mismatch');
      }
      for (final question in v.pendingQuestions) {
        if (question.conversationId.value != v.session.conversationId.value ||
            question.resolvedBy != null) {
          _fail('pending_questions', 'pending_conversation_required');
        }
      }
      if (v.plan != null &&
          v.plan!.projectId.value != v.session.projectId.value) {
        _fail('plan.project_id', 'project_mismatch');
      }
      if (v.approval case final approval?) {
        final plan = v.plan;
        if (plan == null ||
            plan.planId.value != approval.planId.value ||
            plan.revision.compareTo(approval.revision) != 0 ||
            plan.contentHash.value != approval.contentHash.value) {
          _fail('approval', 'plan_revision_mismatch');
        }
      }
    case HistoryQuery v:
      _pageLimit(v.limit);
    case HistoryPage v:
      if (v.items.length > 100) _fail('items', 'page_too_large');
      final ids = <String>{};
      for (final item in v.items) {
        if (item.conversationId.value != v.asOf.conversationId.value) {
          _fail('items', 'conversation_mismatch');
        }
        if (!ids.add(item.itemId.value)) _fail('items', 'duplicate_item');
      }
      if (v.nextBefore != null &&
          (v.items.isEmpty ||
              v.items.first.itemId.value != v.nextBefore!.value)) {
        _fail('next_before', 'oldest_item_required');
      }
    case ConfigurationChange v:
      if (v.setup == null &&
          v.roles == null &&
          v.models == null &&
          v.devicePreferences == null) {
        _fail(r'$', 'configuration_change_required');
      }
    case ConfigurationCommand v:
      if (v.projectId != null && v.changes.setup != null) {
        _fail('changes.setup', 'installation_scope_required');
      }
    case ConfigurationSnapshot v:
      if (v.executionReady != v.unmetPrerequisites.isEmpty) {
        _fail('execution_ready', 'prerequisite_mismatch');
      }
      if (v.executionReady && v.setup == null) _fail('setup', 'setup_required');
      final models = v.models.map((m) => m.profileId.value).toSet();
      if (models.length != v.models.length) {
        _fail('models', 'duplicate_profile');
      }
      if (v.roles.any(
        (r) =>
            r.enabled &&
            (r.modelProfileId == null ||
                !models.contains(r.modelProfileId!.value)),
      )) {
        _fail('roles', 'unknown_model_profile');
      }
    case LessonMutation v:
      if ((v.operation == LessonOperation.edit) != (v.content != null)) {
        _fail('content', 'edit_content_required_only');
      }
      if ((v.operation == LessonOperation.setScope) != (v.scope != null)) {
        _fail('scope', 'scope_change_required_only');
      }
      if (v.content case final content?) _required('content', content);
    case LessonQuery v:
      _pageLimit(v.limit);
    case LessonPage v:
      if (v.lessons.length > 100) _fail('lessons', 'page_too_large');
      if (v.lessons.map((l) => l.lessonId.value).toSet().length !=
          v.lessons.length) {
        _fail('lessons', 'duplicate_lesson');
      }
    default:
      break;
  }
}

void _pageLimit(Counter limit) {
  if (limit.value > BigInt.from(100)) _fail('limit', 'page_too_large');
}

int _relayPort(Uri uri) => uri.hasPort
    ? uri.port
    : {'wss': 443, 'https': 443, 'ws': 80, 'http': 80}[uri.scheme]!;
Uri _relayUrl(String field, String value, bool websocket) {
  final Uri url;
  try {
    url = Uri.parse(value);
  } on FormatException {
    _fail(field, 'invalid_url');
  }
  if (!url.hasScheme || (url.hasAuthority && url.host.isEmpty)) {
    _fail(field, 'invalid_url');
  }
  final host = url.host;
  final loopback =
      host == 'localhost' ||
      host == '[::1]' ||
      host == '::1' ||
      (RegExp(r'^127\.[0-9]+\.[0-9]+\.[0-9]+$').hasMatch(host));
  if (host.isEmpty ||
      !(url.scheme == (websocket ? 'wss' : 'https') ||
          (loopback && url.scheme == (websocket ? 'ws' : 'http'))) ||
      url.userInfo.isNotEmpty ||
      url.hasQuery ||
      url.hasFragment) {
    _fail(field, 'secure_relay_required');
  }
  final normalized = url.replace(
    path: url.path.isEmpty ? '/' : url.normalizePath().path,
  );
  final defaultPort = url.scheme == 'wss' || url.scheme == 'https' ? 443 : 80;
  final canonical = normalized.hasPort && normalized.port == defaultPort
      ? normalized.replace(port: 0).toString().replaceFirst(':0/', '/')
      : normalized.toString();
  if (canonical != value) _fail(field, 'normalized_url_required');
  return url;
}

/// Client validation of a response against persisted modes/choices. The service
/// independently checks live authority, identities, revisions and atomic resolution.
extension PendingQuestionResponseValidation on PendingQuestion {
  void validateResponse(List<ActorId> choices, String? text) {
    if (resolvedBy != null) _fail('question_id', 'already_resolved');
    if (choices.isEmpty && text == null) _fail('choices', 'answer_required');
    if (!allowMultiple && choices.length > 1) {
      _fail('choices', 'multiple_choices_forbidden');
    }
    final values = choices.map((c) => c.value).toSet();
    if (values.length != choices.length) _fail('choices', 'duplicate_choice');
    final allowed = this.choices.map((c) => c.value).toSet();
    if (values.any((choice) => !allowed.contains(choice))) {
      _fail('choices', 'unknown_choice');
    }
    if (text != null) {
      if (!allowText) _fail('text', 'text_forbidden');
      _required('text', text);
    }
  }
}
