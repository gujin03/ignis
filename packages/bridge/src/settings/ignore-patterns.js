function appendMissing(values, entries) {
  return [...new Set([...values, ...entries])];
}

export { appendMissing };
