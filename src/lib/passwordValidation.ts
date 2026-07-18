export type PasswordRequirement = {
  id: string
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { id: 'length', label: 'At least 8 characters', test: (password) => password.length >= 8 },
  { id: 'symbol', label: 'At least one symbol', test: (password) => /[^A-Za-z0-9]/.test(password) },
  { id: 'upper', label: 'At least one uppercase letter', test: (password) => /[A-Z]/.test(password) },
  { id: 'lower', label: 'At least one lowercase letter', test: (password) => /[a-z]/.test(password) },
  { id: 'number', label: 'At least one number', test: (password) => /[0-9]/.test(password) },
]

export type PasswordStrength = 'bad' | 'okay' | 'good'

export function getPasswordRequirementStatus(password: string) {
  return PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    met: requirement.test(password),
  }))
}

export function getPasswordStrength(password: string): PasswordStrength {
  const metCount = PASSWORD_REQUIREMENTS.filter((requirement) => requirement.test(password)).length

  if (metCount >= 5) return 'good'
  if (metCount >= 3) return 'okay'
  return 'bad'
}

export function isPasswordValid(password: string) {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password))
}
