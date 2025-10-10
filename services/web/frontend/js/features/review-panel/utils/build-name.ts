export const buildName = (user: {
  first_name?: string
  last_name?: string
  email?: string
  alias?: string
}) => {
  // If alias is set, use it instead of the real name
  if (user.alias) {
    return user.alias
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')

  if (name) {
    return name
  }

  if (user.email) {
    return user.email.split('@')[0]
  }

  return 'Unknown'
}
