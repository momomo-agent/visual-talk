let counter = 0

export function nextId() {
  return `card-${counter++}`
}

export function resetId() {
  counter = 0
}
