import { asyncFs } from '../asyncFs.js'
import { replaceConsoleLog } from '../utils/replaceConsoleLog.js';

/**
 * @param {string} desc 
 * @param {any} handler 
 */
export function describe(desc = '', handler) {
  console.info('\nDescribe', [desc]);
  handler();
}
/**
 * @param {string} desc 
 * @param {any} handler 
 */
export function it(desc = '', handler) {
  console.info('It', [desc]);
  handler();
}
/**
 * @param {any} subject 
 * @return {any}
 */
export function expect(subject = '') {
  const stringify = JSON.stringify;
  return new Proxy({}, {
    get(target, prop, receiver) {
      if (prop === 'toBe') {
        console.log([prop], `returning method...`);
        return (typeName) => {
          const result = typeof target === typeName;
          console.log(`Expect ${stringify(receiver)} type to be ${stringify(typeName)}: ${result ? 'Pass' : 'Fail'}`);
        };
      }
      if (prop === 'toJSON') {
        console.log('Received json request');
        return (...args) => console.log(args);
      }
      console.log([prop], `detected...`);
      if (prop === 'toEqual') {
        return (value) => {
          console.log([prop], `starting...`);
          const result = subject === value;
          console.log(`Expect`, [subject],` to be`, [value],`: ${result ? 'Pass' : 'Fail'}`);
        };
      }
      throw new Error(`Unimplemented ${stringify(prop)} for value ${stringify(receiver)} `);
    }
  });
}

async function init() {
  replaceConsoleLog('log');
  replaceConsoleLog('warn');
  console.log('Test starting');
  await new Promise(resolve => setTimeout(resolve, 200));
  // @ts-ignore
  await import('./test.spec.js');
}

init().catch(err => { console.log(err); process.exit(1); });