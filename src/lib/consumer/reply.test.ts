jest.mock('../logger')
jest.mock('../redis', () => {
  return {
    client: {
      xack: jest.fn()
    }
  }
})
jest.mock('./common', () => {
  return {
    initConsumerGroup: jest.fn(),
    consumeGroup: jest.fn(),
    createParser: jest.fn()
  }
})

import { ObjectID } from 'mongodb'
import * as config from '../../config'
import { mongoSetup, getMockType } from '../../../jest/testUtil'
import { ReplyQueue } from '../../types'
import * as db from '../db'
import { client } from '../redis'
import { initConsumerGroup, consumeGroup } from './common'
import { reply, initReplyConsumerGroup, consumeReply } from './reply'

let mongoServer = null

beforeAll(async () => {
  const mongo = await mongoSetup()
  mongoServer = mongo.mongoServer
  return await db.connect(mongo.uri)
})

afterAll(async () => {
  await db.close()
  await mongoServer.stop()
})

test('initReplyConsumerGroup', async () => {
  const init = getMockType(initConsumerGroup)

  await initReplyConsumerGroup()

  expect(init.mock.calls.length).toStrictEqual(1)
  expect(init.mock.calls[0][0]).toStrictEqual(config.stream.REPLY)
})

test('consumeReply', async () => {
  const consume = getMockType(consumeGroup)

  await consumeReply()

  expect(consume.mock.calls.length).toStrictEqual(1)
  expect(consume.mock.calls[0][2]).toStrictEqual(config.stream.REPLY)
})

test('reply', async () => {
  const xack = getMockType(client.xack)
  xack.mockClear()
  xack.mockResolvedValue('resolve')

  const userId = new ObjectID()
  await db.collections.users.insertOne({
    _id: userId,
    account: userId.toHexString(),
    roomOrder: []
  })

  const targetRoomId = new ObjectID()
  const enter = [
    targetRoomId,
    new ObjectID(),
    new ObjectID()
  ].map((roomId) => ({ userId, roomId, unreadCounter: 0, replied: 0 }))
  await db.collections.enter.insertMany(enter)

  const _replyQueue: ReplyQueue = {
    roomId: targetRoomId.toHexString(),
    userId: userId.toHexString()
  }
  const replyQueue = JSON.stringify(_replyQueue)
  await reply('queue-id', ['unread', replyQueue])

  let data = await db.collections.enter.find({ userId }).toArray()
  for (const d of data) {
    if (d.roomId.toHexString() === targetRoomId.toHexString()) {
      expect(d.replied).toStrictEqual(1)
    } else {
      expect(d.replied).toStrictEqual(0)
    }
  }
  expect(xack.mock.calls.length).toStrictEqual(1)
  expect(xack.mock.calls[0][2]).toStrictEqual('queue-id')

  // call twice
  await reply('queue-id', ['unread', replyQueue])

  data = await db.collections.enter.find({ userId }).toArray()
  for (const d of data) {
    if (d.roomId.toHexString() === targetRoomId.toHexString()) {
      expect(d.replied).toStrictEqual(2)
    } else {
      expect(d.replied).toStrictEqual(0)
    }
  }
})
