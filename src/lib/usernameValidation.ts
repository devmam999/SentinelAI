export const USERNAME_MAX_LENGTH = 20

export function validateUsername(username: string): string | null {
  const trimmed = username.trim()

  if (!trimmed) {
    return 'Username is required.'
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`
  }

  if (/\s/.test(username)) {
    return 'Username cannot contain spaces.'
  }

  return null
}
