const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

Sentry.init({
  dsn: "https://d68415d7f493f89878eabc9702b198ba@o4511316597342208.ingest.us.sentry.io/4511390322851840",
  integrations: [
    nodeProfilingIntegration(),
  ],
  enableLogs: true,
  tracesSampleRate: 1.0,
  profileSessionSampleRate: 1.0,
  profileLifecycle: 'trace',
  sendDefaultPii: true,
});
