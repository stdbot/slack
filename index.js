const { EventEmitter } = require('events')
const slack = require('@slack/client')
const makeRemoveFormatting = require('slack-remove-formatting')
const format = require('./format')

const indexBy = (prop, items) =>
  items.reduce((index, item) => (index[item[prop]] = item, index), {})

function Slack (config) {
  const emitter = new EventEmitter()
  const rtm = new slack.RTMClient(config.token)
  const web = new slack.WebClient(config.token)
  const onError = err => emitter.emit('error', err)
  const state = {}

  function onMessage (message) {
    if (message.subtype) return

    if (!config.direct && message.channel.startsWith('D')) return

    if (config.channels && message.channel.startsWith('C')) {
      const channel = state.channels[message.channel]

      if (!channel) return
      if (!config.channels.includes(channel.name)) return
    }

    emitter.emit('message', format.message(state, message))
  }

  rtm.on('message', onMessage)

  emitter.mention = user => `<@${user.id}>`
  emitter.address = (user, text) => `${emitter.mention(user)}: ${text}`

  emitter.mentions = message =>
    (message.raw.text.match(/<@[^>]+>/g) || [])
      .map(tag => tag.slice(2, -1))
      .map(id => state.users[id])

  emitter.isMentionned = (user, message) =>
    message.includes(`<@${user.id}>`) ||
      message.text.toLowerCase().split(/\s+/).includes(user.name.toLowerCase())

  emitter.send = (message, text) => {
    const body = { channel: message.raw.channel, text }

    if (config.threaded) body.thread_ts = message.raw.thread_ts || message.raw.ts
    if (config.threadedBroadcast) body.reply_broadcast = true
    if (config.asUser) body.as_user = config.asUser
    if (config.parse) body.parse = config.parse

    return web.chat.postMessage(body)
      .then(res => (res.message.channel = res.channel, res.message))
      .then(message => format.message(state, message))
      .catch(onError)
  }

  emitter.edit = (message, text) =>
    web.chat.update({
      channel: message.raw.channel,
      text,
      ts: message.id
    })
      .then(res => (res.message.channel = res.channel, res.message))
      .then(message => format.message(state, message))
      .catch(onError)

  emitter.react = (message, emoji) =>
    web.reactions.add({
      name: emoji,
      channel: message.raw.channel,
      timestamp: message.id
    })
      .catch(onError)

  rtm.on('authenticated', newState => {
    Promise.all([web.users.list(), web.channels.list()])
      .then(([users, channels]) => {
        state.self = { id: newState.self.id, name: newState.self.name }
        state.users = indexBy('id', users.members.map(format.user))
        state.channels = indexBy('id', channels.channels)
        state.removeFormatting = makeRemoveFormatting(users.members, channels.channels)

        emitter.emit('load', state)
      })
    .catch(onError)
  })

  rtm.start()

  return emitter
}

module.exports = Slack
