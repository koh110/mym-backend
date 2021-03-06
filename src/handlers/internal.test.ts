jest.mock('../lib/logger')
jest.mock('./internal/socket')

import { ObjectID } from 'mongodb'
import { getMockType, createRequest } from '../../jest/testUtil'
import { socket } from './internal'
import {
  ReceiveMessageCmd,
  sendMessage,
  modifyMessage,
  getMessagesFromRoom,
  enterRoom,
  readMessage,
  iine,
  sortRooms,
  getRooms,
  openRoom,
  closeRoom
} from './internal/socket'

test.each([
  [ReceiveMessageCmd.MESSAGE_SEND, sendMessage],
  [ReceiveMessageCmd.MESSAGE_MODIFY, modifyMessage],
  [ReceiveMessageCmd.MESSAGES_ROOM, getMessagesFromRoom],
  [ReceiveMessageCmd.MESSAGE_IINE, iine],
  [ReceiveMessageCmd.ROOMS_ENTER, enterRoom],
  [ReceiveMessageCmd.ROOMS_READ, readMessage],
  [ReceiveMessageCmd.ROOMS_SORT, sortRooms],
  [ReceiveMessageCmd.ROOMS_GET, getRooms],
  [ReceiveMessageCmd.ROOMS_OPEN, openRoom],
  [ReceiveMessageCmd.ROOMS_CLOSE, closeRoom]
])('socket %s', async (cmd, called: any) => {
  const userId = new ObjectID()
  const body = { cmd }
  const req = createRequest(userId, { body })

  const calledMock = getMockType(called)
  calledMock.mockClear()

  await socket(req)

  expect(calledMock.mock.calls.length).toStrictEqual(1)
})
