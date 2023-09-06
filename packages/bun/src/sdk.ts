import type { ServerRuntimeClientOptions } from '@sentry/core';
import {
  getIntegrationsToSetup,
  initAndBind,
  Integrations as CoreIntegrations,
  SDK_VERSION,
  ServerRuntimeClient,
} from '@sentry/core';
import type { Options } from '@sentry/types';
import { createStackParser, GLOBAL_OBJ, nodeStackLineParser, stackParserFromStackParserOptions } from '@sentry/utils';

// import { setAsyncLocalStorageAsyncContextStrategy } from './asyncLocalStorageAsyncContextStrategy';

const nodeStackParser = createStackParser(nodeStackLineParser());

export const defaultIntegrations = [new CoreIntegrations.InboundFilters(), new CoreIntegrations.FunctionToString()];

export type EdgeOptions = Options;

/** Inits the Sentry NextJS SDK on the Edge Runtime. */
export function init(options: EdgeOptions = {}): void {
  // setAsyncLocalStorageAsyncContextStrategy();

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }

  if (options.dsn === undefined && Bun.env.SENTRY_DSN) {
    options.dsn = Bun.env.SENTRY_DSN;
  }

  if (options.tracesSampleRate === undefined && Bun.env.SENTRY_TRACES_SAMPLE_RATE) {
    const tracesSampleRate = parseFloat(Bun.env.SENTRY_TRACES_SAMPLE_RATE);
    if (isFinite(tracesSampleRate)) {
      options.tracesSampleRate = tracesSampleRate;
    }
  }

  if (options.release === undefined) {
    const detectedRelease = getSentryRelease();
    if (detectedRelease !== undefined) {
      options.release = detectedRelease;
    } else {
      // If release is not provided, then we should disable autoSessionTracking
      options.autoSessionTracking = false;
    }
  }

  options.environment = options.environment || Bun.env.SENTRY_ENVIRONMENT || Bun.env.NODE_ENV;

  if (options.autoSessionTracking === undefined && options.dsn !== undefined) {
    options.autoSessionTracking = true;
  }

  if (options.instrumenter === undefined) {
    options.instrumenter = 'sentry';
  }

  const clientOptions: ServerRuntimeClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || nodeStackParser),
    integrations: getIntegrationsToSetup(options),
    // @ts-expect-error TODO TRANSPORT
    transport: options.transport,
  };

  clientOptions._metadata = clientOptions._metadata || {};
  clientOptions._metadata.sdk = clientOptions._metadata.sdk || {
    name: 'sentry.javascript.nextjs',
    packages: [
      {
        name: 'npm:@sentry/nextjs',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  clientOptions.platform = 'edge';
  clientOptions.runtime = { name: 'edge' };
  clientOptions.serverName = Bun.env.SENTRY_NAME;

  initAndBind(ServerRuntimeClient, clientOptions);

  // TODO?: Sessiontracking
}

/**
 * Returns a release dynamically from environment variables.
 */
export function getSentryRelease(fallback?: string): string | undefined {
  // Always read first as Sentry takes this as precedence
  if (Bun.env.SENTRY_RELEASE) {
    return Bun.env.SENTRY_RELEASE;
  }

  // This supports the variable that sentry-webpack-plugin injects
  if (GLOBAL_OBJ.SENTRY_RELEASE && GLOBAL_OBJ.SENTRY_RELEASE.id) {
    return GLOBAL_OBJ.SENTRY_RELEASE.id;
  }

  return (
    // GitHub Actions - https://help.github.com/en/actions/configuring-and-managing-workflows/using-environment-variables#default-environment-variables
    Bun.env.GITHUB_SHA ||
    // Netlify - https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    Bun.env.COMMIT_REF ||
    // Vercel - https://vercel.com/docs/v2/build-step#system-environment-variables
    Bun.env.VERCEL_GIT_COMMIT_SHA ||
    Bun.env.VERCEL_GITHUB_COMMIT_SHA ||
    Bun.env.VERCEL_GITLAB_COMMIT_SHA ||
    Bun.env.VERCEL_BITBUCKET_COMMIT_SHA ||
    // Zeit (now known as Vercel)
    Bun.env.ZEIT_GITHUB_COMMIT_SHA ||
    Bun.env.ZEIT_GITLAB_COMMIT_SHA ||
    Bun.env.ZEIT_BITBUCKET_COMMIT_SHA ||
    fallback
  );
}
