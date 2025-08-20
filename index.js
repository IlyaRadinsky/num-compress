/**
 * Encoder/decoder for serializing lists of integers in the range [1, 300].
 * Uses pattern recognition and segment-based encoding for compression.
 */

/**
 * Configuration for the encoding algorithm.
 * @constant {Object}
 */
const CONFIG = Object.freeze({
  BASE: 80,                    // Segment size - 80 numbers per segment
  ALPHABET: Array.from({ length: 80 }, (_, i) => String.fromCharCode(33 + i)),  // ASCII 33-112
  SEGMENTS: 4,                 // 4 segments: 1-80, 81-160, 161-240, 241-300
  SEPARATOR: '~',              // Segment separator character
  PATTERNS: {                  // Pattern definitions for triple-number compression:
    '}': [0, 0],               //   (n, n, n)
    '|': [1, 2],               //   (n, n+1, n+2)
    '{': [2, 4],               //   (n, n+2, n+4)
    'z': [3, 6],               //   (n, n+3, n+6)
    'y': [1, 3],               //   (n, n+1, n+3)
  },
  MIN_VALUE: 1,                // Minimum valid input number
  MAX_VALUE: 300,              // Maximum valid input number
  ASCII_MIN: 33,               // Minimum ASCII value for encoding characters
  ASCII_MAX: 125,              // Maximum ASCII value for valid character checking
});

// Regular expression to trim trailing separators from the encoded string
const trimRegex = new RegExp(`${CONFIG.SEPARATOR}+$`);

/**
 * Detects if a specific pattern exists starting at the given array index.
 * @param {number[]} arr - Array of numbers to search for patterns
 * @param {number} index - Starting position to check for pattern
 * @param {number[]} pattern - Pattern definition as offset values
 * @returns {boolean} True if the pattern is detected, false otherwise
 */
function detectPattern(arr, index, pattern) {
  return index + 2 < arr.length &&
    arr[index + 1] === arr[index] + pattern[0] &&
    arr[index + 2] === arr[index] + pattern[1];
}

/**
 * Groups numbers by identifying pattern matches and separates them from non-matching numbers.
 * Searches for triple-number patterns that can be compressed into 2-character codes.
 * @param {number[]} arr - Input array of numbers to process
 * @returns {Object} Result object containing patterns and remaining numbers
 * @returns {Object} return.patterns - Dictionary of pattern codes with their starting numbers
 * @returns {number[]} return.rest - Array of numbers that don't match any pattern
 */
function groupTriads(arr) {
  const result = {
    patterns: {},
    rest: []
  };

  // Work with a copy to avoid modifying the original array
  let remaining = [...arr];
  let index = 0;

  while (index < remaining.length) {
    const current = remaining[index];
    let foundPattern = false;

    // Check all defined patterns for matches
    for (const [code, pattern] of Object.entries(CONFIG.PATTERNS)) {
      if (detectPattern(remaining, index, pattern)) {
        result.patterns[code] = [...(result.patterns[code] || []), current];
        remaining.splice(index, 3);
        foundPattern = true;
        break;
      }
    }

    // If no pattern found, move to next element
    if (!foundPattern) {
      index++;
    }
  }

  // Add remaining elements that didn't match any pattern
  result.rest = remaining;

  return result;
}

/**
 * Encodes a single number to its character representation using the defined alphabet.
 * @param {number} num - Number to encode (0 to MAX_VALUE)
 * @returns {string} Encoded character representation
 * @throws {RangeError} If the number is outside the valid range
 */
function encodeDigit(num) {
  if (!Number.isInteger(num) || num < 0 || num > CONFIG.MAX_VALUE) {
    throw new RangeError(`Number must be an integer between 0 and ${CONFIG.MAX_VALUE}`);
  }
  return CONFIG.ALPHABET[num];
}

/**
 * Decodes a character back to its numeric value using the defined alphabet.
 * @param {string} char - Character to decode
 * @returns {number} Decoded numeric value
 * @throws {Error} If the character is not found in the encoding alphabet
 */
function decodeChar(char) {
  const digit = CONFIG.ALPHABET.indexOf(char);
  if (digit === -1) throw new Error(`Invalid character ${char} in encoded string`);
  return digit;
}

/**
 * Encodes a pattern with its starting number into a 2-character code.
 * @param {string} code - Pattern identifier character
 * @param {number} n - Starting number of the pattern
 * @returns {string} 2-character encoded pattern representation
 */
function encodePattern(code, n) {
  return `${code}${encodeDigit(n)}`;
}

/**
 * Decodes a pattern from the serialized string at the given position.
 * @param {string} s - Serialized string containing encoded patterns
 * @param {number} pos - Position of the pattern code in the string
 * @returns {number[]|null} Array of three decoded numbers, or null if invalid pattern
 */
function decodePattern(s, pos) {
  const code = s[pos];
  const pattern = CONFIG.PATTERNS[code];

  if (pattern) {
    const char = s[pos + 1];
    const num = decodeChar(char);
    return [num, num + pattern[0], num + pattern[1]];
  }

  return null;
}

/**
 * Serializes an array of numbers into a compact encoded string.
 * Uses segment-based encoding and pattern recognition for compression.
 * @param {number[]} numbers - Array of integers in the range [1, 300]
 * @returns {string} Compressed string representation with segments separated by '~'
 * @throws {TypeError} If input is not an array
 * @throws {RangeError} If numbers are outside the valid range [1, 300]
 */
function serialize(numbers) {
  if (!Array.isArray(numbers)) throw new TypeError('Input must be an array');

  // Validate and sort numbers in ascending order
  const sortedNumbers = [...numbers].sort((a, b) => a - b);

  // Validate all numbers are within the allowed range
  if (sortedNumbers.some(n => n < CONFIG.MIN_VALUE || n > CONFIG.MAX_VALUE)) {
    throw new RangeError(`All numbers must be between ${CONFIG.MIN_VALUE} and ${CONFIG.MAX_VALUE}`);
  }

  // Distribute numbers into segments based on their value ranges
  const digitGroups = Array.from({ length: CONFIG.SEGMENTS }, () => []);

  for (let i = 0; i < sortedNumbers.length; i++) {
    const n = sortedNumbers[i];
    for (let j = 0; j < CONFIG.SEGMENTS; j++) {
      if (n < CONFIG.BASE * (j + 1)) {
        digitGroups[j].push(n - CONFIG.BASE * j);
        break;
      }
    }
  }

  // Process each segment to identify compressible patterns
  const processedDigitGroups = digitGroups.map(groupTriads);

  // Build the final encoded string from processed segments
  return processedDigitGroups.map(g => (g.rest.map(encodeDigit).join('') +
    Object.entries(g.patterns)
      .map(([code, nums]) => nums.map(n => encodePattern(code, n)).join(''))
      .join('')
  ))
    .join(CONFIG.SEPARATOR)
    .replace(trimRegex, '');
}

/**
 * Deserializes an encoded string back into the original array of numbers.
 * @param {string} serialized - Encoded string with segments separated by '~'
 * @returns {number[]} Array of decoded numbers
 * @throws {TypeError} If input is not a string
 * @throws {Error} If the string contains invalid characters or patterns
 */
function deserialize(serialized) {
  if (typeof serialized !== 'string') throw new TypeError('Serialized input must be a string');

  // Split the encoded string into segments
  const digitGroups = serialized.split(CONFIG.SEPARATOR);
  const numbers = [];

  // Process each segment to reconstruct the original numbers
  for (let j = 0; j < digitGroups.length; j++) {
    const groupStr = digitGroups[j];

    let i = 0;
    while (i < groupStr.length) {
      const char = groupStr[i];

      // Validate character is within acceptable ASCII range
      if (char.charCodeAt(0) < CONFIG.ASCII_MIN || char.charCodeAt(0) > CONFIG.ASCII_MAX) {
        throw new Error(`Invalid ASCII character ${char}`);
      }

      // Attempt to decode as a pattern first
      const decodedPattern = decodePattern(groupStr, i);

      if (decodedPattern) {
        // Add the three numbers from the pattern with segment base offset
        numbers.push(...decodedPattern.map(n => n + j * CONFIG.BASE));
        i += 2;
      } else {
        // Decode as a single number with segment base offset
        const num = decodeChar(char) + j * CONFIG.BASE;
        numbers.push(num);
        i += 1;
      }
    }
  }

  return numbers;
}

/**
 * Generates a naive serialization (comma-separated values) for comparison purposes.
 * @param {number[]} numbers - Array of numbers to serialize
 * @returns {string} Comma-separated string of sorted numbers
 */
function naiveSerialize(numbers) {
  return numbers.sort((a, b) => a - b).join(',');
}

/**
 * Test function to validate serialization/deserialization and calculate compression ratio.
 * @param {string} description - Description of the test case
 * @param {number[]} numbers - Array of numbers to test
 */
function testNumbers(description, numbers) {
  const naiveSerialized = naiveSerialize(numbers);
  const zipSerialized = serialize(numbers);
  const isEqual = naiveSerialize(deserialize(zipSerialized)) === naiveSerialized;

  console.log(` * ${description} *`);
  console.log('Initial string:', naiveSerialized);
  console.log('Compressed string:', zipSerialized);
  console.log('Compression ratio:', naiveSerialized.length / zipSerialized.length);
  console.log('Round-trip successful:', isEqual);
  console.log('\n');
}

/**
 * Generates random numbers within the valid range [1, 300].
 * @param {number} count - Number of random values to generate
 * @returns {number[]} Array of random numbers
 */
function generateRandomNumbers(count) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 300) + 1);
}

/**
 * Runs all test cases to validate the compression algorithm.
 */
function runTests() {
  console.log('=== Running Compression Algorithm Tests ===\n');
  // Test cases
  testNumbers(
    'Simple numbers',
    [1, 2, 3, 5, 7],
  );

  testNumbers(
    'Large blocks of duplicated numbers (200)',
    Array.from({ length: 200 }, (_, i) => 1),
  );

  testNumbers(
    'Short set with duplicates',
    [101, 23, 7, 102, 23, 103, 17, 104],
  );

  testNumbers(
    'Random 50 numbers',
    generateRandomNumbers(50),
  );

  testNumbers(
    'Random 100 numbers',
    generateRandomNumbers(100),
  );

  testNumbers(
    'Random 500 numbers',
    generateRandomNumbers(500),
  );

  testNumbers(
    'Random 1000 numbers',
    generateRandomNumbers(1000),
  );

  testNumbers(
    'Single-digit numbers (1–9)',
    Array.from({ length: 9 }, (_, i) => i + 1),
  );

  testNumbers(
    'Two-digit numbers (10–99)',
    Array.from({ length: 90 }, (_, i) => i + 10),
  );

  testNumbers(
    'Three-digit numbers (100–300)',
    Array.from({ length: 201 }, (_, i) => i + 100),
  );

  testNumbers(
    'Triple numbers (900 numbers, max 300 unique)',
    Array.from({ length: 900 }, (_, i) => (i % 300) + 1),
  );

  console.log('=== Tests Completed ===');
}

// Export the main functions for use in other modules
module.exports = {
  serialize,
  deserialize,
  naiveSerialize,
  CONFIG
};

// Run tests only if this module is executed directly (not required/imported)
if (require.main === module) {
  runTests();
}
