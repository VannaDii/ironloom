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
      if (v.messages.isEmpty) _fail('messages', 'required');
      for (final message in v.messages) {
        _required('messages', message);
      }
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
      if (v.costMicros != null &&
          (v.currency == null || v.calculationBasis == null)) {
        _fail('cost_micros', 'cost_basis_required');
      }
      if (v.basis == UsageBasis.unknown &&
          (v.inputTokens != null ||
              v.outputTokens != null ||
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
      if (v.choices.isEmpty) _fail('choices', 'required');
      if (v.choices.map((c) => c.value).toSet().length != v.choices.length) {
        _fail('choices', 'duplicate_choice');
      }
    case WorkerPaths v:
      for (final path in [...v.writePaths, v.artifactArea]) {
        _required('write_paths', path);
        // Match std::path::Path components on the native Linux/macOS target.
        // Interior '.' and repeated '/' normalize away; leading '.' does not.
        final parts = path.split('/').where((p) => p.isNotEmpty).toList();
        if (path.startsWith('/') ||
            parts.isEmpty ||
            parts.first == '.' ||
            parts.contains('..')) {
          _fail('write_paths', 'relative_normal_path_required');
        }
      }
    case ValidationContent v:
      if (!v.mutationsDrained) _fail('mutations_drained', 'active_edits');
    case SessionQuery v:
      if (v.limit.value > BigInt.from(100)) _fail('limit', 'page_too_large');
    default:
      break;
  }
}
