# Runtime HTTP API

Ironloom existing runtime HTTP port पर setup, health और readiness serve करता है।

## `GET /healthz`

HTTP server alive होने पर `200 ok` लौटाता है।

## `GET /readyz`

केवल तब `200 ok` लौटाता है जब required runtime configuration environment values या encrypted local setup से resolve हो जाती है। Setup incomplete होने पर `503 setup required` लौटाता है।

## `GET /`

Setup page लौटाता है।

## `GET /setup`

Setup page लौटाता है।

अगर `IRONLOOM_CONFIG_KEY` missing या invalid है, page key instructions दिखाता है और setup input fields नहीं दिखाता।

अगर `IRONLOOM_INSTALLER_TOKEN` missing है, page installer-token instructions दिखाता है।

जब setup prerequisites मौजूद हों, page config form render करता है। Environment-backed fields locked रहते हैं और secret values display नहीं होतीं।

## `POST /setup`

Submitted installer token के `IRONLOOM_INSTALLER_TOKEN` से match होने के बाद setup form values accept करता है।

Successful submissions encrypted setup configuration को `IRONLOOM_STATE_ROOT` के अंतर्गत लिखती हैं और `200 setup saved` लौटाती हैं।

Invalid installer tokens `403 setup rejected` लौटाते हैं।

## `POST /setup/openai/oauth/start`

Config page द्वारा उपयोग किए जाने वाले OpenAI OAuth setup instructions लौटाता है। Resulting OAuth session reference setup form से save किया जा सकता है या `IRONLOOM_OPENAI_OAUTH_SESSION` से bind किया जा सकता है।

## `POST /setup/discord/oauth/start`

Configured application ID के लिए Discord authorization page लौटाता है। Generated URL `bot` और `applications.commands` scopes उपयोग करता है, ताकि Discord server administrator Ironloom को target server में install कर सके।
