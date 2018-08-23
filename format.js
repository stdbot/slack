exports.user = user => ({
  raw: user,
  id: user.id,
  slug: user.name,
  name: user.real_name,
  email: user.profile.email,
  image: user.profile.image_512
})

exports.message = (state, message) => ({
  raw: message,
  id: message.ts,
  thread: message.thread_ts || message.ts,
  author: state.users[message.user] || state.users[message.bot_id],
  text: state.removeFormatting(message.text)
})
