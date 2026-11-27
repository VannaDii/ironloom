import 'dart:convert';

part 'models.g.dart';
part 'invariants.dart';

/// A model that has passed structural, nested and cross-field validation.
abstract interface class WireModel {
  void validate();
  Object? toJson();
}

/// A redacted validation error aligned with the Rust boundary.
final class FieldError implements WireModel {
  const FieldError(this.field, this.code);
  factory FieldError.fromJson(Object? json) {
    if (json is! Map<String, Object?>) _fail(r'$', 'invalid_structure');
    final r = _Reader(json, json.keys.toList());
    return FieldError(r.read('field', _string), r.read('code', _string));
  }
  @override
  void validate() {}
  final String field;
  final String code;
  @override
  Map<String, Object?> toJson() => {'field': field, 'code': code};
}

final class ValidationErrors implements Exception, WireModel {
  ValidationErrors(Iterable<FieldError> fields)
    : fields = List.unmodifiable(fields);
  factory ValidationErrors.fromJson(Object? json) {
    if (json is! Map<String, Object?>) _fail(r'$', 'invalid_structure');
    final r = _Reader(json, json.keys.toList());
    return ValidationErrors(
      r.read('fields', (v) => _list(v, FieldError.fromJson)),
    );
  }
  @override
  void validate() {}
  final List<FieldError> fields;
  @override
  Map<String, Object?> toJson() => {
    'fields': fields.map((e) => e.toJson()).toList(),
  };
  @override
  String toString() => 'ironloom-validation:${jsonEncode(toJson())}';
}

Never _fail(String field, String code) =>
    throw ValidationErrors([FieldError(field, code)]);
String _path(String prefix, String field) => prefix.isEmpty
    ? field
    : field == r'$'
    ? prefix
    : field.startsWith('[')
    ? '$prefix$field'
    : '$prefix.$field';
T _at<T>(String path, T Function() operation) {
  try {
    return operation();
  } on ValidationErrors catch (error) {
    throw ValidationErrors(
      error.fields.map((e) => FieldError(_path(path, e.field), e.code)),
    );
  }
}

/// Common JSON decode boundary; decoder constructors independently validate too.
T decode<T extends WireModel>(String json, T Function(Object?) decoder) {
  Object? value;
  try {
    value = jsonDecode(json);
  } on FormatException catch (error) {
    // Rust distinguishes a complete value followed by extra input from malformed JSON.
    final offset = error.offset;
    if (offset != null && offset > 0) {
      try {
        final prefix = json.substring(0, offset).trimRight();
        jsonDecode(prefix);
        if (prefix.endsWith('}') || prefix.endsWith(']')) {
          _fail(r'$', 'trailing_data');
        }
      } on FormatException {
        // The prefix was itself incomplete.
      }
    }
    _fail(r'$', 'invalid_structure');
  }
  final model = decoder(value);
  model.validate();
  return model;
}

/// Canonical unsigned 64-bit decimal, including values beyond JavaScript integers.
final class Counter implements WireModel, Comparable<Counter> {
  factory Counter(String decimal) => Counter.fromJson(decimal);
  Counter._(this.value);
  factory Counter.fromJson(Object? json) {
    if (json is! String) _fail(r'$', 'invalid_structure');
    final match = _decimalInput.firstMatch(json);
    final value = match?.end == json.length ? BigInt.tryParse(json) : null;
    if (value == null || value < BigInt.zero || value > _maximum) {
      _fail(r'$', 'invalid_counter');
    }
    if (value.toString() != json) _fail(r'$', 'noncanonical_counter');
    return Counter._(value);
  }
  static final _decimalInput = RegExp(r'^\+?[0-9]+$');
  static final _maximum = BigInt.parse('18446744073709551615');
  final BigInt value;
  @override
  int compareTo(Counter other) => value.compareTo(other.value);
  bool operator >(Counter other) => compareTo(other) > 0;
  bool get isZero => value == BigInt.zero;
  @override
  void validate() {}
  @override
  String toJson() => value.toString();
  @override
  String toString() => value.toString();
}

/// Authentication-only input. Debug output never reveals its contents.
final class SecretInput implements WireModel {
  factory SecretInput(String value) => SecretInput.fromJson(value);
  SecretInput._(this._value);
  factory SecretInput.fromJson(Object? json) {
    if (json is! String) _fail(r'$', 'invalid_structure');
    _required('secret', json);
    return SecretInput._(json);
  }
  final String _value;
  String expose() => _value;
  @override
  String toJson() => _value;
  @override
  void validate() {}
  @override
  String toString() => '[REDACTED]';
}

Object? _json(Object? value) => switch (value) {
  WireModel model => model.toJson(),
  List<Object?> values => values.map(_json).toList(),
  Map<String, Object?> values => values.map((k, v) => MapEntry(k, _json(v))),
  _ => value,
};
Object? _freeze(Object? value) => switch (value) {
  null || String() || bool() => value,
  num number => number.isFinite ? number : _fail(r'$', 'invalid_structure'),
  List<Object?> values => List<Object?>.unmodifiable(values.map(_freeze)),
  Map<String, Object?> values => Map<String, Object?>.unmodifiable(
    values.map((k, v) => MapEntry(k, _freeze(v))),
  ),
  _ => _fail(r'$', 'invalid_structure'),
};
String _string(Object? value) =>
    value is String ? value : _fail(r'$', 'invalid_structure');
bool _boolean(Object? value) =>
    value is bool ? value : _fail(r'$', 'invalid_structure');
List<T> _list<T>(Object? value, T Function(Object?) decoder) {
  if (value is! List<Object?>) _fail(r'$', 'invalid_structure');
  return List.unmodifiable([
    for (var i = 0; i < value.length; i++) _at('$i', () => decoder(value[i])),
  ]);
}

final class _Reader {
  _Reader(Object? json, List<String> fields) {
    if (json is! Map<String, Object?>) _fail(r'$', 'invalid_structure');
    for (final key in json.keys) {
      if (!fields.contains(key)) _fail(key, 'invalid_structure');
    }
    data = json;
  }
  late final Map<String, Object?> data;
  T read<T>(String name, T Function(Object?) decoder) {
    if (!data.containsKey(name)) _fail(r'$', 'invalid_structure');
    return _at(name, () => decoder(data[name]));
  }

  T? optional<T>(String name, T Function(Object?) decoder) =>
      data[name] == null ? null : _at(name, () => decoder(data[name]));
}

void _positive(String field, Counter value) {
  if (value.isZero) _fail(field, 'must_be_positive');
}

void _required(String field, String value) {
  if (_blank(value)) _fail(field, 'required');
}

/// Public service failure; independent of local decode failures and transport errors.
final class ServiceError implements WireModel {
  factory ServiceError.fromJson(Object? json) {
    if (json is String &&
        const {
          'conflict',
          'cursor_expired',
          'resync_required',
          'unavailable',
        }.contains(json)) {
      return ServiceError._(json, null);
    }
    if (json is! Map<String, Object?> || json.length != 1) {
      _fail(r'$', 'invalid_structure');
    }
    return switch (json.keys.single) {
      'validation' => ServiceError._(
        'validation',
        _at('validation', () => ValidationErrors.fromJson(json['validation'])),
      ),
      'authentication' => ServiceError._(
        'authentication',
        _at(
          'authentication',
          () => AuthenticationError.fromJson(json['authentication']),
        ),
      ),
      _ => _fail(r'$', 'invalid_structure'),
    };
  }
  ServiceError._(this.kind, this.detail);
  final String kind;
  final WireModel? detail;
  @override
  void validate() => detail?.validate();
  @override
  Object toJson() => detail == null ? kind : {kind: detail!.toJson()};
}

/// Durable SSE replay cursor encoding; it never grants resource access.
String encodeCursor(ReplayCursor cursor) => base64Url
    .encode(utf8.encode(jsonEncode(cursor.toJson())))
    .replaceAll('=', '');

/// Decodes the service cursor, separately from the native relay cursor.
ReplayCursor decodeCursor(String header) {
  if (header.length > 4096) _fail('cursor', 'too_long');
  if (header.contains('=') || !RegExp(r'^[A-Za-z0-9_-]*$').hasMatch(header)) {
    _fail('cursor', 'invalid_encoding');
  }
  final List<int> bytes;
  try {
    bytes = base64Url.decode(base64Url.normalize(header));
    // Refuse noncanonical trailing bits, matching Rust URL_SAFE_NO_PAD.
    if (base64Url.encode(bytes).replaceAll('=', '') != header) {
      _fail('cursor', 'invalid_encoding');
    }
  } on FormatException {
    _fail('cursor', 'invalid_encoding');
  }
  final String json;
  try {
    json = utf8.decode(bytes);
  } on FormatException {
    _fail(r'$', 'invalid_structure');
  }
  return decode(json, ReplayCursor.fromJson);
}
