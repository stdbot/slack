const { EventEmitter } = require('events')
const slack = require('@slack/client')
const makeRemoveFormatting = require('slack-remove-formatting')
const format = require('./format')

const indexBy = (prop, items) =>
  items.reduce((index, item) => (index[item[prop]] = item, index), {})

function Slack (config) {
  const emitter = new EventEmitter()
  const rtm = new slack.RtmClient(config.token)
  const web = new slack.WebClient(config.token)
  const onError = err => emitter.emit('error', err)
  const state = {}

  const onMessage = message =>
    !message.subtype && emitter.emit('message', format.message(state, message))

  rtm.on(slack.RTM_EVENTS.MESSAGE, onMessage)

  emitter.mention = user => `@${user.name}`
  emitter.address = (user, text) => `${emitter.mention(user)}: ${text}`

  emitter.mentions = message =>
    (message.raw.text.match(/<@[^>]+>/g) || [])
      .map(tag => tag.slice(2, -1))
      .map(id => state.users[id])

  emitter.isMentionned = (user, message) =>
    message.includes(`<@${user.id}>`) ||
      message.text.toLowerCase().split(/\s+/).includes(user.name.toLowerCase())

  emitter.send = (message, text) =>
    web.chat.postMessage(message.raw.channel, text, config.messageConfig)
      .then(res => (res.message.channel = res.channel, res.message))
      .then(message => format.message(state, message))

  emitter.edit = (message, text) =>
    web.chat.update(message.id, message.raw.channel, text)

  rtm.on(slack.CLIENT_EVENTS.RTM.AUTHENTICATED, newState => {
    state.self = { id: newState.self.id, name: newState.self.name }
    state.users = indexBy('id', newState.users.map(format.user))
    state.removeFormatting = makeRemoveFormatting(newState)

    emitter.emit('load', state)
  })

  rtm.start()

  return emitter
}

module.exports = Slack
