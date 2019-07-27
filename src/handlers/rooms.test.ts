jest.mock('../lib/logger')

import { ObjectID } from 'mongodb'
import { mongoSetup, createRequest } from '../../jest/testUtil'
import { GENERAL_ROOM_NAME, USER_LIMIT } from '../config'
import * as db from '../lib/db'
import { init } from '../logic/server'
import { BadRequest } from '../lib/errors'
import { exitRoom, getUsers } from './rooms'

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

test('exitRoom fail (general)', async () => {
  // create general
  await init()

  const userId = new ObjectID()

  const general = await db.collections.rooms.findOne({
    name: GENERAL_ROOM_NAME
  })

  await db.collections.enter.insertOne({
    userId: userId,
    roomId: general._id
  })

  const body = { room: general._id.toHexString() }
  const req = createRequest(userId, { body })

  try {
    await exitRoom(req)
  } catch (e) {
    expect(e instanceof BadRequest).toStrictEqual(true)
  }
})

test.each([[null, '']])('exitRoom BadRequest (%s)', async arg => {
  expect.assertions(1)

  const body = { room: arg }
  const req = createRequest(new ObjectID(), { body })

  try {
    await exitRoom(req)
  } catch (e) {
    expect(e instanceof BadRequest).toStrictEqual(true)
  }
})

test.only('getUsers', async () => {
  const userId = new ObjectID()
  const roomId = new ObjectID()

  const overNum = 4

  const users: db.User[] = []
  const insert: db.Enter[] = []
  for (let i = 0; i < USER_LIMIT + overNum; i++) {
    const userId = new ObjectID()
    const user: db.User = { _id: userId, account: `account-${i}` }
    const enter: db.Enter = { roomId, userId }
    insert.push(enter)
    // 削除済みユーザーのテストのため歯抜けにする
    if (i % 2 === 0) {
      users.push(user)
    }
  }
  await Promise.all([
    db.collections.enter.insertMany(insert),
    db.collections.users.insertMany(users)
  ])

  const userIds = users.map(u => u._id)
  const userMap = (await db.collections.users
    .find({ _id: { $in: userIds } })
    .toArray()).reduce((map, current) => {
    map.set(current._id.toHexString(), current)
    return map
  }, new Map<string, db.User>())

  const params = { roomid: roomId.toHexString() }
  let req = createRequest(userId, { params })

  let res = await getUsers(req)

  expect(res.count).toStrictEqual(USER_LIMIT + overNum)
  expect(res.users.length).toStrictEqual(USER_LIMIT)

  for (const user of res.users) {
    const dbUser = userMap.get(user.userId)
    if (dbUser) {
      expect(user.userId).toStrictEqual(dbUser._id.toHexString())
      expect(user.account).toStrictEqual(dbUser.account)
    } else {
      expect(user.account).toStrictEqual('removed')
    }
  }

  // threshold
  const query = { threshold: res.users[res.users.length - 1].enterId }
  req = createRequest(userId, { params, query })
  res = await getUsers(req)

  expect(res.count).toStrictEqual(USER_LIMIT + overNum)
  expect(res.users.length).toStrictEqual(overNum)
})
