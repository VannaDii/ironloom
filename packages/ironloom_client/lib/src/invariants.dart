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
    case EngineAssessment v:
      if (v.requirements.compatibility != v.fit.compatibility) {
        _fail('fit.compatibility', 'assessment_compatibility_mismatch');
      }
      if (v.devices.map((d) => d.deviceId.value).toSet().length !=
          v.devices.length) {
        _fail('devices', 'duplicate_device');
      }
      if (v.fit.estimatedBytes?.value != _completeDemand(v.requirements)) {
        _fail('fit.estimated_bytes', 'complete_demand_mismatch');
      }
      if (v.fit.fitsAfterIdleEviction != null &&
          (v.devices.isEmpty || v.fit.estimatedBytes == null)) {
        _fail('fit.fits_after_idle_eviction', 'device_and_demand_required');
      }
    case ModelInventoryQuery v:
      _pageLimit(v.limit);
    case ModelInventoryItem v:
      final verified = v.verification == ModelVerification.verified;
      if (verified && !v.transferComplete) {
        _fail('transfer_complete', 'verification_requires_completed_transfer');
      }
      if (verified != (v.verifiedManifestHash != null) ||
          verified != (v.verifiedAtMs != null)) {
        _fail('verified_manifest_hash', 'verification_manifest_required_only');
      }
      if (v.verifiedAtMs case final time?) _positive('verified_at_ms', time);
    case ModelInventoryPage v:
      if (v.models.length > 100) _fail('models', 'page_too_large');
      if (v.models.map((m) => m.inventoryId.value).toSet().length !=
          v.models.length) {
        _fail('models', 'duplicate_inventory_id');
      }
    case InstructionQuery v:
      _pageLimit(v.limit);
    case InstructionPage v:
      if (v.instructions.length > 100) _fail('instructions', 'page_too_large');
      if (v.instructions.map((i) => i.instructionId.value).toSet().length !=
          v.instructions.length) {
        _fail('instructions', 'duplicate_instruction');
      }
    case InstructionCommand v:
      final update =
          v.activeUpdate == ActiveInstructionUpdate.updateSelectedCopies;
      if (update == v.assignments.isEmpty) {
        _fail('assignments', 'active_update_selection_mismatch');
      }
      if (v.assignments.map((a) => a.value).toSet().length !=
          v.assignments.length) {
        _fail('assignments', 'duplicate_assignment');
      }
    case StoredCommand v:
      if (v.receipt is! Map<String, Object?>) {
        _fail('receipt', 'object_required');
      }
      if (v.conversationId != null && v.projectId == null) {
        _fail('project_id', 'conversation_requires_project');
      }
      if (v.firstEvent != null) {
        if (v.conversationId == null) {
          _fail('conversation_id', 'event_requires_conversation');
        }
        if (v.firstEvent is! Map<String, Object?>) {
          _fail('first_event', 'object_required');
        }
      }
    case ServiceEvent v:
      if ((v.event != null) == (v.snapshot != null)) {
        _fail('event', 'exactly_one_event_or_snapshot');
      }
      if (v.snapshot case final state?) {
        if (state.cursor.conversationId.value !=
                v.cursor.conversationId.value ||
            state.cursor.sequence.compareTo(v.cursor.sequence) != 0) {
          _fail('snapshot.cursor', 'watermark_mismatch');
        }
        if (state.session.projectId.value != v.projectId.value) {
          _fail('snapshot.session.project_id', 'project_mismatch');
        }
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
        for (final path in v.writeFiles) ('write_files', path),
        for (final path in v.writeDirectories) ('write_directories', path),
        ('artifact_area', v.artifactArea),
      ]) {
        _required(field, path);
        if (path.codeUnits.contains(0) ||
            path.contains('\\') ||
            path
                .split('/')
                .any(
                  (part) => ['', '.', '..', '.git', '.ironloom'].contains(part),
                )) {
          _fail(field, 'relative_normal_path_required');
        }
      }
      if (v.writeFiles.toSet().length != v.writeFiles.length) {
        _fail('write_files', 'duplicate_path');
      }
      for (var index = 0; index < v.writeDirectories.length; index++) {
        final path = v.writeDirectories[index];
        if (v.writeDirectories
            .take(index)
            .any(
              (other) =>
                  path == other ||
                  path.startsWith('$other/') ||
                  other.startsWith('$path/'),
            )) {
          _fail('write_directories', 'overlapping_paths');
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
      if (v.executionState != null &&
          !{
            ExecutionState.completed,
            ExecutionState.failed,
            ExecutionState.terminated,
          }.contains(v.executionState) &&
          v.activeAssignmentId == null) {
        _fail('active_assignment_id', 'execution_binding_required');
      }
      if (v.activeAssignmentId != null && v.executionState == null) {
        _fail('execution_state', 'assignment_state_required');
      }
      if ((v.activeAssignmentId != null) != (v.pauseRequested != null)) {
        _fail('pause_requested', 'assignment_control_state_required');
      }
      if (v.pauseRequested == true &&
          {
            ExecutionState.paused,
            ExecutionState.cancellationRequested,
            ExecutionState.terminated,
            ExecutionState.completed,
            ExecutionState.failed,
          }.contains(v.executionState)) {
        _fail('pause_requested', 'pending_pause_state_mismatch');
      }
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
      if (v.direction == HistoryDirection.forward && v.before != null) {
        _fail('before', 'backward_direction_required');
      }
      if (v.direction == HistoryDirection.backward && v.after != null) {
        _fail('after', 'forward_direction_required');
      }
      _pageLimit(v.limit);
    case HistoryPage v:
      if (v.direction == HistoryDirection.forward && v.nextBefore != null) {
        _fail('next_before', 'backward_direction_required');
      }
      if (v.direction == HistoryDirection.backward && v.nextAfter != null) {
        _fail('next_after', 'forward_direction_required');
      }
      if (v.turnId != null &&
          v.items.any((item) => item.turnId.value != v.turnId!.value)) {
        _fail('items', 'turn_mismatch');
      }
      if (v.items.length > 100) _fail('items', 'page_too_large');
      if (v.items.any(
        (item) => item.conversationId.value != v.asOf.conversationId.value,
      )) {
        _fail('items', 'conversation_mismatch');
      }
      if (v.items.map((i) => i.itemId.value).toSet().length != v.items.length) {
        _fail('items', 'duplicate_item');
      }
      if (v.nextAfter != null &&
          (v.items.isEmpty ||
              v.items.last.itemId.value != v.nextAfter!.value)) {
        _fail('next_after', 'newest_item_required');
      }
      if (v.nextBefore != null &&
          (v.items.isEmpty ||
              v.items.first.itemId.value != v.nextBefore!.value)) {
        _fail('next_before', 'oldest_item_required');
      }
    case ProviderEndpoint v:
      final uri = Uri.tryParse(v.base.trim());
      final host =
          uri?.host.toLowerCase().replaceAll('[', '').replaceAll(']', '') ?? '';
      final parts = host.split('.');
      final ipv4Loopback =
          parts.length == 4 &&
          parts.first == '127' &&
          parts.every((part) {
            final byte = int.tryParse(part);
            return byte != null && byte >= 0 && byte <= 255;
          });
      final loopback = host == 'localhost' || host == '::1' || ipv4Loopback;
      if (uri == null ||
          host.isEmpty ||
          !(uri.scheme == 'https' || (uri.scheme == 'http' && loopback)) ||
          uri.userInfo.isNotEmpty ||
          uri.hasQuery ||
          uri.hasFragment) {
        _fail('base', 'invalid_api_base');
      }
      if (v.billing == BillingMode.localEstimate ||
          (v.dialect == ProviderDialect.anthropic &&
              v.billing != BillingMode.apiKey)) {
        _fail('billing', 'unsupported_endpoint_billing');
      }
      final canonical = uri.hasPort && uri.port == 443
          ? uri.replace(port: 0).toString().replaceFirst(':0/', '/')
          : uri.toString();
      if (v.billing == BillingMode.account &&
          (v.dialect != ProviderDialect.responses ||
              canonical != 'https://chatgpt.com/backend-api/codex/' ||
              !v.streaming)) {
        _fail('billing', 'unsupported_account_endpoint');
      }
      if (v.reasoningEfforts.map((effort) => effort.value).toSet().length !=
          v.reasoningEfforts.length) {
        _fail('reasoning_efforts', 'duplicate_effort');
      }
    case ConfigurationChange v:
      if (v.setup == null &&
          v.roles == null &&
          v.models == null &&
          v.devicePreferences == null &&
          v.endpoints == null &&
          v.sourceAccounts == null) {
        _fail(r'$', 'configuration_change_required');
      }
      _configurationBindings(v.endpoints, v.sourceAccounts);
    case ConfigurationCommand v:
      if (v.projectId != null && v.changes.setup != null) {
        _fail('changes.setup', 'installation_scope_required');
      }
    case ConfigurationSnapshot v:
      if (v.roles.map((role) => role.roleId.value).toSet().length !=
          v.roles.length) {
        _fail('roles', 'duplicate_role');
      }
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
      _configurationBindings(v.endpoints, v.sourceAccounts);
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
    case ProjectQuery v:
      _pageLimit(v.limit);
    case ProjectPage v:
      if (v.projects.length > 100) {
        _fail('projects', 'page_too_large');
      }
    case CredentialCommand v:
      final create = v.operation == CredentialOperation.create;
      if (create != (v.credentialId == null) ||
          create != v.expectedRevision.isZero) {
        _fail('credential_id', 'credential_identity_mismatch');
      }
      if (create && v.label == null) {
        _fail('label', 'required');
      }
      final secret = {
        CredentialOperation.create,
        CredentialOperation.replace,
      }.contains(v.operation);
      if (secret != (v.secret != null)) {
        _fail('secret', 'secret_operation_mismatch');
      }
      final share = v.operation == CredentialOperation.share;
      if (share != (v.grantee != null) ||
          share == v.permissions.isEmpty ||
          (!share && v.revoke)) {
        _fail('grantee', 'share_operation_mismatch');
      }
      if (v.permissions.any(
        (p) => !{
          Permission.view,
          Permission.useCredential,
          Permission.replaceCredential,
          Permission.share,
          Permission.deleteCredential,
        }.contains(p),
      )) {
        _fail('permissions', 'credential_permissions_required');
      }
    case NativeConnectionCommand v:
      if ((v.operation == NativeConnectionOperation.import) !=
          (v.protectedRegistration != null)) {
        _fail('protected_registration', 'import_registration_required_only');
      }
      if ((v.operation == NativeConnectionOperation.setEnabled) !=
          (v.enabled != null)) {
        _fail('enabled', 'preference_required_only');
      }
    case NativeConnectionState v:
      if (v.status == NativeConnectionStatus.connected &&
          v.enrollment == null) {
        _fail('enrollment', 'connected_enrollment_required');
      }
      if (v.enrollment != null &&
          (v.enrollment!.nodeId.value != v.nodeId.value ||
              v.enrollment!.authenticationGeneration.compareTo(v.generation) !=
                  0)) {
        _fail('enrollment', 'connection_binding_mismatch');
      }
    case DownloadCommand v:
      if ((v.operation == DownloadOperation.start) != (v.downloadId == null)) {
        _fail('download_id', 'download_identity_mismatch');
      }
    default:
      break;
  }
}

void _pageLimit(Counter limit) {
  _positive('limit', limit);
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

BigInt? _completeDemand(EngineRequirements value) {
  var total = BigInt.zero;
  for (final component in [
    value.targetWeightBytes,
    value.draftWeightBytes,
    value.cacheBytes,
    value.runtimeOverheadBytes,
    value.acceleratorBytes,
  ]) {
    if (component == null) return null;
    total += component.value;
    if (total > BigInt.parse('18446744073709551615')) return null;
  }
  return total;
}

void _configurationBindings(
  List<ProviderEndpoint>? endpoints,
  List<SourceAccountBinding>? sources,
) {
  if (endpoints != null &&
      endpoints.map((endpoint) => endpoint.provider.value).toSet().length !=
          endpoints.length) {
    _fail('endpoints', 'duplicate_provider');
  }
  if (sources != null &&
      sources.map((source) => source.host.value).toSet().length !=
          sources.length) {
    _fail('source_accounts', 'duplicate_host');
  }
}
