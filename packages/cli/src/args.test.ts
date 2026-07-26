import { expect, test } from 'vitest'
import { paramsArg } from './args.js'

test('parses inline operation parameters', async () => {
  await expect(paramsArg('{"limit":5}', undefined)).resolves.toEqual({
    limit: 5,
  })
})

test('rejects non-object operation parameters', async () => {
  await expect(paramsArg('[]', undefined)).rejects.toThrow('must be an object')
})
