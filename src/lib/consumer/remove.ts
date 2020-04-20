import { ObjectID } from 'mongodb'
import * as db from '../db'
import redis from '../redis'
import logger from '../logger'
import { initConsumerGroup, createParser, consumeGroup } from './common'

const REMOVE_STREAM = 'stream:remove:user:chat'
const REMOVE_GROUP = 'group:remove:user'

export const initRemoveConsumerGroup = async () => {
  await initConsumerGroup(REMOVE_STREAM, REMOVE_GROUP)
}

export const remove = async (ackid: string, messages: string[]) => {
  const user = messages[1]
  const userId = new ObjectID(user)
  const target = await db.collections.users.findOne({ _id: userId })
  if (!target) {
    return
  }
  const enter = await db.collections.enter.find({ userId: userId }).toArray()
  const ids = enter.map((e) => e.roomId)
  const remove: Pick<db.Removed, 'account' | 'originId' | 'enter'> = {
    account: target.account,
    originId: target._id,
    enter: ids
  }
  await db.collections.removed.updateMany(
    { originId: target._id },
    { $set: remove },
    { upsert: true }
  )
  await db.collections.users.deleteOne({ _id: target._id })
  await db.collections.enter.deleteMany({ userId: target._id })

  await redis.xack(REMOVE_STREAM, REMOVE_GROUP, ackid)
  logger.info('[remove:user]', user)
}

export const consumeRemove = async () => {
  const parser = createParser(remove)
  await consumeGroup(REMOVE_GROUP, 'consume-backend', REMOVE_STREAM, parser)
}
