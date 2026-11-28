import 'package:flutter/material.dart';
import 'package:ironloom_client/ironloom_client.dart';
import 'package:url_launcher/url_launcher.dart';

import 'pages/chat_page.dart';
import 'pages/settings_page.dart';
import 'pages/lessons_page.dart';
import 'pages/access_page.dart';
import 'pages/models_page.dart';
import 'widgets.dart';
import 'platform/journal.dart';

class OperatorApp extends StatelessWidget {
  const OperatorApp({
    super.key,
    required this.client,
    this.initialSession,
    this.returnUri,
    this.clearReturn,
  });
  final IronloomClient client;
  final AuthenticatedSession? initialSession;
  final Uri? returnUri;
  final VoidCallback? clearReturn;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Ironloom',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff146d68)),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
      ),
    ),
    darkTheme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff6dd5c7),
        brightness: Brightness.dark,
      ),
    ),
    home: OperatorShell(
      client: client,
      initialSession: initialSession,
      returnUri: returnUri,
      clearReturn: clearReturn,
    ),
  );
}

class OperatorShell extends StatefulWidget {
  const OperatorShell({
    super.key,
    required this.client,
    this.initialSession,
    this.returnUri,
    this.clearReturn,
  });
  final IronloomClient client;
  final AuthenticatedSession? initialSession;
  final Uri? returnUri;
  final VoidCallback? clearReturn;
  @override
  State<OperatorShell> createState() => _OperatorShellState();
}

class _OperatorShellState extends State<OperatorShell> {
  AuthenticatedSession? session;
  ConfigurationSnapshot? settings;
  String? error;
  int page = 0;
  bool initialized = false;
  bool restoring = true;
  @override
  void initState() {
    super.initState();
    session = widget.initialSession;
    if (session != null) {
      restoring = false;
      load();
    } else {
      restore();
    }
  }

  Future<void> restore() async {
    try {
      final uri = widget.returnUri;
      AuthenticatedSession? value;
      if (uri != null &&
          ['code', 'state', 'error'].any(uri.queryParametersAll.containsKey)) {
        widget.clearReturn?.call();
        if (uri.queryParametersAll.containsKey('error') ||
            uri.queryParametersAll['code']?.length != 1 ||
            uri.queryParametersAll['state']?.length != 1) {
          throw ApiFailure(401, null);
        }
        value = await widget.client.oidcCallback(
          OidcCallback(
            state: SecretInput(uri.queryParameters['state']!),
            code: SecretInput(uri.queryParameters['code']!),
          ),
        );
      } else {
        value = await widget.client.session();
      }
      if (mounted && value != null) await signedIn(value);
    } on Object catch (e) {
      if (mounted) setState(() => error = displayError(e));
    } finally {
      if (mounted) setState(() => restoring = false);
    }
  }

  Future<void> load() async {
    try {
      final value = await widget.client.configuration();
      if (mounted) {
        setState(() {
          settings = value;
          error = null;
          if (!initialized) {
            page = value.setup == null ? 1 : 0;
            initialized = true;
          }
        });
      }
    } on Object catch (e) {
      if (mounted) setState(() => error = displayError(e));
    }
  }

  Future<void> signedIn(AuthenticatedSession value) async {
    setState(() => session = value);
    await load();
  }

  @override
  Widget build(BuildContext context) {
    if (restoring) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(
            semanticsLabel: 'Restoring service session',
          ),
        ),
      );
    }
    if (session == null) {
      return LoginPage(
        client: widget.client,
        onSignedIn: signedIn,
        message: error,
      );
    }
    final destinations = [
      (Icons.space_dashboard_outlined, 'Projects'),
      (Icons.tune, 'Setup & team'),
      (Icons.inventory_2_outlined, 'Models & sources'),
      (Icons.key_outlined, 'Access'),
      (Icons.auto_stories_outlined, 'Lessons'),
    ];
    final body = switch (page) {
      0 => DashboardPage(client: widget.client, session: session!),
      1 => SettingsPage(
        client: widget.client,
        settings: settings,
        onChanged: (v) {
          setState(() => settings = v);
        },
        reload: load,
      ),
      2 => ModelsPage(
        client: widget.client,
        configurationRevision: settings?.revision,
      ),
      3 => AccessPage(client: widget.client),
      _ => LessonsPage(client: widget.client),
    };
    return LayoutBuilder(
      builder: (context, size) => Scaffold(
        appBar: AppBar(
          title: const Text('Ironloom'),
          actions: [
            Tooltip(
              message: session!.operatorId.value,
              child: const Icon(Icons.account_circle_outlined),
            ),
            TextButton(
              onPressed: () async {
                try {
                  await widget.client.logout();
                  clearJournal(
                    widget.client.connection.base.toString(),
                    session!.operatorId.value,
                  );
                  if (mounted) {
                    setState(() {
                      session = null;
                      settings = null;
                      initialized = false;
                    });
                  }
                } on Object catch (e) {
                  if (mounted) setState(() => error = displayError(e));
                }
              },
              child: const Text('Sign out'),
            ),
          ],
        ),
        body: Row(
          children: [
            if (size.maxWidth >= 800)
              NavigationRail(
                selectedIndex: page,
                onDestinationSelected: (v) => setState(() => page = v),
                labelType: NavigationRailLabelType.all,
                destinations: [
                  for (final d in destinations)
                    NavigationRailDestination(
                      icon: Icon(d.$1),
                      label: Text(d.$2),
                    ),
                ],
              ),
            Expanded(
              child: Column(
                children: [
                  if (error != null) Notice(error!, error: true),
                  if (settings != null && !settings!.executionReady)
                    MaterialBanner(
                      content: Text(
                        'Setup needs attention: ${settings!.unmetPrerequisites.map((p) => p.value.replaceAll('_', ' ')).join(', ')}',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => setState(() => page = 1),
                          child: const Text('Review setup'),
                        ),
                      ],
                    ),
                  Expanded(child: body),
                ],
              ),
            ),
          ],
        ),
        bottomNavigationBar: size.maxWidth < 800
            ? NavigationBar(
                selectedIndex: page,
                onDestinationSelected: (v) => setState(() => page = v),
                destinations: [
                  for (final d in destinations)
                    NavigationDestination(icon: Icon(d.$1), label: d.$2),
                ],
              )
            : null,
      ),
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    required this.client,
    required this.onSignedIn,
    this.message,
  });
  final IronloomClient client;
  final Future<void> Function(AuthenticatedSession) onSignedIn;
  final String? message;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final username = TextEditingController(),
      password = TextEditingController(),
      connection = TextEditingController(),
      redirect = TextEditingController(text: 'operator'),
      initialToken = TextEditingController();
  @override
  void dispose() {
    for (final c in [username, password, connection, redirect, initialToken]) {
      c.dispose();
    }
    super.dispose();
  }

  bool signingIn = false, creatingAccount = false;
  String? loginError;
  Future<void> login() async {
    if (signingIn) return;
    setState(() {
      signingIn = true;
      loginError = null;
    });
    try {
      final session = await widget.client.local(
        LoginRequest(
          username: ActorId(username.text),
          password: SecretInput(password.text),
        ),
      );
      if (!mounted) return;
      password.clear();
      await widget.onSignedIn(session);
    } on Object catch (e) {
      if (mounted) setState(() => loginError = displayError(e));
    } finally {
      if (mounted) setState(() => signingIn = false);
    }
  }

  Future<void> register() async {
    if (signingIn) return;
    setState(() {
      signingIn = true;
      loginError = null;
    });
    try {
      final value = await widget.client.register(
        LoginRequest(
          username: ActorId(username.text),
          password: SecretInput(password.text),
        ),
        setupToken: SecretInput(initialToken.text),
      );
      if (!mounted) return;
      password.clear();
      initialToken.clear();
      if (mounted) await widget.onSignedIn(value);
    } on Object catch (e) {
      if (mounted) setState(() => loginError = displayError(e));
    } finally {
      if (mounted) setState(() => signingIn = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(24),
          children: [
            Text('Ironloom', style: Theme.of(context).textTheme.displaySmall),
            const SizedBox(height: 8),
            const Text('Sign in to your software factory'),
            const SizedBox(height: 32),
            if (widget.message != null) Notice(widget.message!, error: true),
            TextField(
              controller: username,
              autofillHints: const [AutofillHints.username],
              decoration: const InputDecoration(labelText: 'Username'),
              onSubmitted: (_) => login(),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: password,
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              decoration: const InputDecoration(labelText: 'Password'),
              onSubmitted: (_) => login(),
            ),
            const SizedBox(height: 16),
            if (loginError != null) Notice(loginError!, error: true),
            AsyncAction(
              label: signingIn ? 'Signing in…' : 'Sign in',
              action: signingIn ? null : login,
            ),
            TextButton(
              onPressed: signingIn
                  ? null
                  : () => setState(() => creatingAccount = !creatingAccount),
              child: Text(
                creatingAccount
                    ? 'Use an existing local account'
                    : 'Create the first local account',
              ),
            ),
            if (creatingAccount) ...[
              const Notice(
                'Use the deployment setup token to create a normal account. Administrator bootstrap remains a separate explicit setup action.',
              ),
              TextField(
                controller: initialToken,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Initial setup token for account creation',
                ),
              ),
              AsyncAction(
                label: 'Create local account',
                action: signingIn ? null : register,
              ),
            ],
            const Divider(height: 40),
            TextField(
              controller: connection,
              decoration: const InputDecoration(
                labelText: 'Organization sign-in connection',
              ),
            ),
            const SizedBox(height: 12),
            AsyncAction(
              label: 'Continue with organization',
              icon: Icons.open_in_new,
              action: () async {
                final url = await widget.client.oidcStart(
                  OidcStart(
                    connection: ActorId(connection.text),
                    redirectId: ActorId(redirect.text),
                  ),
                );
                if (!await launchUrl(url, webOnlyWindowName: '_self')) {
                  throw StateError('Unable to open sign-in');
                }
              },
            ),
            const SizedBox(height: 12),
            const Text(
              'Signing in does not grant administrator or project access.',
            ),
          ],
        ),
      ),
    ),
  );
}
