/* eslint:disable: no-console */

// import * as fs from 'fs';
import inquirer from 'inquirer';
import { EventEmitter } from 'node:events';
import * as path from 'path';
import {chromium} from 'playwright';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const emitter = new EventEmitter();

// function getCode() {
//   const bundlePath = path.resolve(__dirname, '../../browser/build/bundles/bundle.replay.debug.min.js');
//   return fs.readFileSync(bundlePath, 'utf8');
//
// }

void (async () => {
  await start('https://sentry.sentry.io');

  async function start(defaultURL) {
    let dsn = process.env.SENTRY_REPLAY_DEV_DSN;

    if (!dsn) {
      ({ dsn } = await inquirer.prompt([
        {
          type: 'input',
          name: 'dsn',
          message: 'Enter the Sentry DSN to use: ',
        },
      ]));
    }

    let { url } = await inquirer.prompt([
      {
        type: 'input',
        name: 'url',
        message: `Enter the url you want to record, e.g [${defaultURL}]: `,
      },
    ]);

    if (url === '') {
      url = defaultURL;
    }

    console.log(`Going to open ${url}...`);
    await record(url, dsn);
    console.log('Ready to record, close browser when finished.');

    emitter.once('done', async () => {
      const { shouldRecordAnother } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldRecordAnother',
          message: 'Record another one?',
        },
      ]);

      if (shouldRecordAnother) {
        start(url);
      } else {
        process.exit();
      }
    });
  }

  async function record(url, dsn) {
    const browser = await chromium.launch({
      headless: false,
      devtools: true,
      defaultViewport: {
        width: 1600,
        height: 900,
      },
      args: [
        '--ignore-certificate-errors',
        '--no-sandbox',
      ],
    });

    browser.on('disconnected', data => {
      emitter.emit('done')
    });

    const page = await browser.newPage();

    await page.addInitScript({
      path: path.resolve(__dirname, '../../browser/build/bundles/bundle.replay.debug.min.js'),
    });
    await page.addInitScript({
      content: `
      (function() {
        if (window.__IS_RECORDING__) { return; }
        try {
          if (window.top !== window.self) { return; }
        } catch { return; }
        window.__IS_RECORDING__ = true;

console.log('SENTRY INIT ${dsn}')
        Sentry.init({
          dsn: '${dsn}',
          debug: false,
          environment: 'demo',
          replaysSessionSampleRate: 0.0,
          integrations: [
            new Sentry.Replay({
              blockAllMedia: false,
              maskAllText: false,
              useCompression: false,
            })
          ],
        });
console.log(Sentry.getCurrentHub())
      })()
      `
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 300000,
    });

    emitter.once('done', async () => {
      await browser.close();
      //   console.log('See the replay here: ${replayUrl}')
    });
  }

  process
    .on('uncaughtException', (error) => {
      console.error(error);
    })
    .on('unhandledRejection', (error) => {
      console.error(error);
    });
})();
