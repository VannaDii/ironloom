import 'package:web/web.dart' as web;

Uri documentBase() => Uri.parse(web.document.baseURI);
Map<String, String> authenticationHeaders() {
  final values = web.document.cookie
      .split(';')
      .map((part) => part.trim())
      .where((part) => part.startsWith('ironloom_csrf='))
      .toList();
  if (values.length != 1) return const {};
  final value = values.single.substring('ironloom_csrf='.length);
  if (value.isEmpty ||
      value.length > 1024 ||
      value.contains(RegExp(r'[\r\n]'))) {
    return const {};
  }
  return {'x-ironloom-csrf': value};
}

void clearAuthenticationReturn(Uri original) {
  final query = {
    for (final entry in original.queryParametersAll.entries)
      if (!{
        'code',
        'state',
        'error',
        'error_description',
        'session_state',
      }.contains(entry.key))
        entry.key: entry.value,
  };
  final cleaned = original.replace(
    queryParameters: query.isEmpty ? null : query,
    query: query.isEmpty ? '' : null,
  );
  web.window.history.replaceState(null, '', cleaned.toString());
}
