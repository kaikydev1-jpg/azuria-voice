// CI failure diagnostics: load the packaged main entry with every Electron API
// call written to stderr synchronously before it runs. A native startup trap
// prints no message and no JS stack, so the last logged call names the culprit.
// AZURIA_TRACE_SKIP=app.setName,... turns the listed calls into no-ops that
// return true (a skipped single-instance lock counts as held) to test a suspect; AZURIA_TRACE_MAIN=bare opens a blank window without the app code.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const EventEmitter = require('node:events');
const electron = require('electron');

const t0 = Date.now();
const log = (message) => {
  try {
    fs.writeSync(2, `[trace +${Date.now() - t0}ms] ${message}\n`);
  } catch {
    /* a closed stderr must not change the launch being traced */
  }
};
const skip = new Set((process.env.AZURIA_TRACE_SKIP || '').split(',').filter(Boolean));
const emitterKeys = new Set(Object.getOwnPropertyNames(EventEmitter.prototype));
const describe = (args) =>
  args
    .map((arg) => {
      if (typeof arg === 'function') return 'fn';
      try {
        return String(JSON.stringify(arg)).slice(0, 160);
      } catch {
        return typeof arg;
      }
    })
    .join(', ');

function wrap(label, target) {
  if (!target) return;
  const seen = new Set();
  for (
    let proto = target;
    proto && proto !== Object.prototype && proto !== EventEmitter.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (seen.has(key) || key === 'constructor' || emitterKeys.has(key)) continue;
      seen.add(key);
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      const name = `${label}.${key}`;
      try {
        if (desc.get || desc.set) {
          Object.defineProperty(target, key, {
            configurable: true,
            enumerable: desc.enumerable,
            get:
              desc.get &&
              function () {
                log(`${name} get`);
                return skip.has(name) ? '' : desc.get.call(this);
              },
            set:
              desc.set &&
              function (value) {
                log(`${name} set ${describe([value])}`);
                if (!skip.has(name)) desc.set.call(this, value);
              },
          });
        } else if (typeof desc.value === 'function') {
          const fn = desc.value;
          Object.defineProperty(target, key, {
            configurable: true,
            writable: true,
            value: function (...args) {
              log(`${name}(${describe(args)})${skip.has(name) ? ' skipped' : ''}`);
              if (skip.has(name)) return true;
              const result = fn.apply(this, args);
              log(`${name} returned`);
              return result;
            },
          });
        }
      } catch (error) {
        log(`cannot wrap ${name}: ${error}`);
      }
    }
  }
}

const imagePrototype = Object.getPrototypeOf(electron.nativeImage.createEmpty());
wrap('app', electron.app);
wrap('app.dock', electron.app.dock);
wrap('protocol', electron.protocol);
wrap('Menu', electron.Menu);
wrap('nativeImage', electron.nativeImage);
wrap('NativeImage', imagePrototype);
wrap('Tray', electron.Tray.prototype);
wrap('BrowserWindow', electron.BrowserWindow.prototype);
for (const event of ['will-finish-launching', 'ready', 'browser-window-created', 'web-contents-created', 'before-quit', 'quit'])
  electron.app.on(event, () => log(`event ${event}`));
process.on('exit', (code) => log(`process exit ${code}`));
log(`trace installed (skip: ${[...skip].join(',') || 'none'})`);

if (process.env.AZURIA_TRACE_MAIN === 'bare') {
  electron.app.whenReady().then(() => {
    new electron.BrowserWindow({ width: 400, height: 300 }).loadURL('about:blank');
    setTimeout(() => log('bare window still alive after 5s'), 5000);
  });
} else {
  const entry = path.resolve(__dirname, process.env.AZURIA_TRACE_MAIN || 'out/main/index.js');
  log(`importing ${entry}`);
  import(pathToFileURL(entry).href).then(
    () => log('main module evaluated'),
    (error) => log(`main module failed: ${error && error.stack}`),
  );
}
