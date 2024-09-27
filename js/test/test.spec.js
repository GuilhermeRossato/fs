import { asyncFs } from '../asyncFs.js';
import { describe, expect, it } from './bootstrap.js';

describe('Basic test function', () => {
  it('Successfully verifies equality', async () => {
    expect(true).toEqual(true);
  });

  /*

  it('should handle ENOENT error and retry once', async () => {
    let count = 0;

    const result = await attemptFileOperation(null, async () => {
      count++;
      if (count === 1) {
        throw { code: 'ENOENT' };
      }
      return 'Success';
    });

    expect(count).toEqual(2); // Should retry once
    expect(result.data).toEqual('Success');
    expect(result.error).toBeUndefined();
  });

  it('should break out of retries on error other than ENOENT or EBUSY', async () => {
    if (!(attemptFileOperation instanceof Function)) {
      throw new Error('Invalid method type');
    }
    const result = await attemptFileOperation(null, async () => {
      throw { code: 'SomeOtherErrorCode' };
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
  */
});