jest.mock('../logger')
jest.mock('../redis', () => {
  return {
    client: {
      xadd: jest.fn()
    }
  }
})
import { ObjectID } from 'mongodb'
import { getMockType } from '../../../jest/testUtil'
import { client } from '../redis'
import * as config from '../../config'
import { SendMessage } from '../../types'
import { addQueueToUsers, addUnreadQueue, addRepliedQueue } from './index'

const xadd = getMockType(client.xadd)

test('addQueueToUsers', async () => {
  xadd.mockClear()

  const users = ['5cc9d148139370d11b706624']

  const queue: SendMessage = {
    user: null,
    cmd: 'rooms',
    rooms: [],
    roomOrder: []
  }

  await addQueueToUsers(users, queue)

  expect(xadd.mock.calls.length).toBe(1)

  const [stream, , , , , queueStr] = xadd.mock.calls[0]
  expect(stream).toEqual(config.stream.MESSAGE)
  expect(queueStr).toEqual(JSON.stringify({ ...queue, user: users[0] }))
})

test('addUnreadQueue', async () => {
  xadd.mockClear()

  const roomId = new ObjectID()
  const userId = new ObjectID()

  await addUnreadQueue(roomId.toHexString(), userId.toHexString())

  expect(xadd.mock.calls.length).toBe(1)

  const [stream] = xadd.mock.calls[0]
  expect(stream).toEqual(config.stream.UNREAD)
})

test('addRepliedQueue', async () => {
  xadd.mockClear()

  const roomId = new ObjectID()
  const userId = new ObjectID()

  await addRepliedQueue(roomId.toHexString(), userId.toHexString())

  expect(xadd.mock.calls.length).toBe(1)

  const [stream] = xadd.mock.calls[0]
  expect(stream).toEqual(config.stream.REPLY)
})
