import { Request } from 'express'
import { ObjectID } from 'mongodb'
import isEmpty from 'validator/lib/isEmpty'
import {
  GENERAL_ROOM_NAME,
  BANNED_CHARS_REGEXP_IN_ROOM_NAME,
  BANNED_UNICODE_REGEXP_IN_ROOM_NAME,
  USER_LIMIT,
  MAX_ROOM_NAME_LENGTH
} from '../config'
import { BadRequest } from '../lib/errors'
import { getRequestUserId } from '../lib/utils'
import * as db from '../lib/db'
import { popParam, createIconPath } from '../lib/utils'
import { enterRoom as enterRoomLogic, creatRoom } from '../logic/rooms'

export const createRoom = async (
  req: Request
): Promise<{ id: string; name: string }> => {
  const user = getRequestUserId(req)
  let name = decodeURIComponent((req.body.name || '').trim())
  if (isEmpty(name)) {
    throw new BadRequest({ reason: 'name is empty' })
  } else if (name.length > MAX_ROOM_NAME_LENGTH) {
    throw new BadRequest({ reason: `over ${MAX_ROOM_NAME_LENGTH}` })
  } else if (
    BANNED_CHARS_REGEXP_IN_ROOM_NAME.test(name) ||
    BANNED_UNICODE_REGEXP_IN_ROOM_NAME.test(name)
  ) {
    throw new BadRequest({ reason: 'banned chars' })
  }
  name = popParam(name)

  const found = await db.collections.rooms.findOne({ name: name })
  // @todo throw error if room is rocked
  if (found) {
    await enterRoomLogic(new ObjectID(user), new ObjectID(found._id))
    return { id: found._id.toHexString(), name: found.name }
  }

  const created = await creatRoom(new ObjectID(user), name)

  return { id: created._id.toHexString(), name }
}

export const enterRoom = async (req: Request) => {
  const user = getRequestUserId(req)
  const room = popParam(req.body.room)
  if (isEmpty(room)) {
    throw new BadRequest({ reason: 'room is empty' })
  }

  await enterRoomLogic(new ObjectID(user), new ObjectID(room))
}

export const exitRoom = async (req: Request) => {
  const user = getRequestUserId(req)
  const room = popParam(req.body.room)
  if (isEmpty(room)) {
    throw new BadRequest({ reason: 'room is empty' })
  }

  const roomId = new ObjectID(room)

  const general = await db.collections.rooms.findOne({
    name: GENERAL_ROOM_NAME
  })

  if (room === general._id.toHexString()) {
    throw new BadRequest({ reason: 'general room' })
  }

  await db.collections.enter.deleteMany({
    userId: new ObjectID(user),
    roomId
  })
}

type EnterUser = {
  userId: string
  account: string
  icon: string
  enterId: string
}

export const getUsers = async (
  req: Request
): Promise<{ count: number; users: EnterUser[] }> => {
  const room = popParam(req.params.roomid)
  if (isEmpty(room)) {
    throw new BadRequest({ reason: 'room is empty' })
  }

  const roomId = new ObjectID(room)

  const query: Object[] = [
    {
      $match: { roomId }
    },
    {
      $lookup: {
        from: db.COLLECTION_NAMES.USERS,
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    }
  ]

  const threshold = popParam(
    typeof req.query.threshold === 'string' ? req.query.threshold : null
  )
  if (threshold) {
    query.push({
      $match: { _id: { $lt: new ObjectID(threshold) } }
    })
  }

  const countQuery = db.collections.enter.countDocuments({ roomId })
  const enterQuery = db.collections.enter
    .aggregate<db.Message & { user: db.User[] }>(query)
    .sort({ _id: -1 })
    .limit(USER_LIMIT)

  const [count, cursor] = await Promise.all([countQuery, enterQuery])

  const users: EnterUser[] = []
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const user: EnterUser = {
      userId: doc.userId.toHexString(),
      account: 'removed',
      icon: null,
      enterId: doc._id.toHexString()
    }
    if (doc.user && doc.user[0]) {
      const [u] = doc.user
      user.account = u.account ? u.account : null
      user.icon = createIconPath(u?.account, u?.icon?.version)
    }
    users.push(user)
  }
  return { count, users }
}
