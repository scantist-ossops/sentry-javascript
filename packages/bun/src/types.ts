import type { BaseTransportOptions, ClientOptions, Options } from '@sentry/types';

/**
 * Configuration options for the Sentry Bun SDK
 * @see @sentry/types Options for more information.
 */
export type BunOptions = Options<BaseTransportOptions>;

/**
 * Configuration options for the Sentry Bun SDK Client class
 * @see NodeClient for more information.
 */
export type BunClientOptions = ClientOptions<BaseTransportOptions>;
