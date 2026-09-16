class AssertionError extends Error {
  constructor(message) {
    super(message || "Assertion failed");
    this.name = "AssertionError";
  }
}

function assert(value, message) {
  if (!value) {
    throw new AssertionError(message);
  }
}

assert.AssertionError = AssertionError;
assert.ok = assert;
assert.strict = assert;

assert.fail = function (message) {
  throw new AssertionError(message || "Failed");
};

assert.equal = function (actual, expected, message) {
  if (actual != expected) {
    throw new AssertionError(message || `${actual} == ${expected}`);
  }
};

assert.notEqual = function (actual, expected, message) {
  if (actual == expected) {
    throw new AssertionError(message || `${actual} != ${expected}`);
  }
};

assert.strictEqual = function (actual, expected, message) {
  if (actual !== expected) {
    throw new AssertionError(message || `${actual} === ${expected}`);
  }
};

assert.notStrictEqual = function (actual, expected, message) {
  if (actual === expected) {
    throw new AssertionError(message || `${actual} !== ${expected}`);
  }
};

assert.deepEqual = function (actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new AssertionError(message || "deepEqual");
  }
};

assert.deepStrictEqual = assert.deepEqual;

assert.throws = function (fn, message) {
  let threw = false;

  try {
    fn();
  } catch {
    threw = true;
  }

  if (!threw) {
    throw new AssertionError(message || "Missing expected exception");
  }
};

assert.doesNotThrow = function (fn, message) {
  try {
    fn();
  } catch (e) {
    throw new AssertionError(message || `Got unwanted exception: ${e.message}`);
  }
};

assert.ifError = function (value) {
  if (value) {
    throw new AssertionError(`ifError got unwanted exception: ${value}`);
  }
};

export const assertShim = assert;
