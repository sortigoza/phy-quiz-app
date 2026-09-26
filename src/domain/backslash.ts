/**
 * The backslash detector. SPEC section 2.5.
 *
 * In a JSON string, and in a double-quoted YAML one, a LaTeX command written
 * with a single backslash does not fail: `"\times"` quietly becomes a tab
 * followed by `imes`. Every physics bank is full of such commands, so the
 * detector looks for the wreckage they leave, a control character inside a
 * string, and names the command that was probably meant.
 */

/** The escape letter each control character is written as, and what to call it. */
const escapes: Record<string, { letter: string; name: string }> = {
  '\0': { letter: '0', name: 'a null character' },
  '\x07': { letter: 'a', name: 'a bell character' },
  '\b': { letter: 'b', name: 'a backspace' },
  '\t': { letter: 't', name: 'a tab' },
  '\n': { letter: 'n', name: 'a line break' },
  '\v': { letter: 'v', name: 'a vertical tab' },
  '\f': { letter: 'f', name: 'a form feed' },
  '\r': { letter: 'r', name: 'a carriage return' },
  '\x1b': { letter: 'e', name: 'an escape character' },
};

/**
 * What follows a line break when it was really `\n` starting a LaTeX command.
 *
 * A line break on its own is legitimate Markdown, so it is only suspect when
 * the rest of a command follows it. The short remainders of `\nu` and `\ne`
 * must also be followed by something maths-like, so a line starting "e.g." or
 * "u is" is left alone.
 */
const newlineCommand =
  /^(?:(?:abla|eq|eg|ewline|exists|atural|earrow|warrow|leq|geq|mid|ot)(?![A-Za-z])|[ue](?=$|[\s_^${}()=,+\\-]))/;

// Every C0 control character, and DEL. A tab written literally is flagged too:
// JSON cannot hold one unescaped, and in YAML it is almost always this mistake.
// eslint-disable-next-line no-control-regex
const controlCharacter = /[\0-\x1f\x7f]/g;

/**
 * Why a string is probably a LaTeX command that lost its backslash, or
 * undefined if it looks fine. Reports the first such place in the string.
 */
export function strayControlCharacter(text: string): string | undefined {
  for (const match of text.matchAll(controlCharacter)) {
    const character = match[0];
    const rest = text.slice(match.index + 1);
    if (character === '\n' && !newlineCommand.test(rest)) continue;

    const escape = escapes[character];
    if (!escape) {
      const code = character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
      return `contains an invisible control character (U+${code}), which usually means a backslash was not escaped. ${ADVICE}`;
    }
    const command = `\\${escape.letter}${/^[A-Za-z]*/.exec(rest)?.[0] ?? ''}`;
    return `contains ${escape.name} where "${command}" was probably meant: this looks like an unescaped LaTeX command. ${adviceFor(command)}`;
  }
  return undefined;
}

const ADVICE =
  'In a JSON bank every backslash must be doubled; in a YAML bank, put the text in single quotes.';

/** The advice for one command, showing it written both ways. */
export function adviceFor(command: string): string {
  return `In a JSON bank every backslash must be doubled, as in "\\${command}"; in a YAML bank, put the text in single quotes, as in '${command}'.`;
}

/**
 * The first backslash in JSON text that JSON cannot read, such as the one in
 * `"\alpha"`, as the command it starts. Used to explain a parse error.
 */
export function unreadableEscape(text: string): string | undefined {
  // Pairs of backslashes are consumed first, so `\\alpha` is not mistaken for one.
  const match = /\\(?:[\\"/bfnrt]|u[0-9a-fA-F]{4}|([A-Za-z]+))/g;
  for (const found of text.matchAll(match)) {
    if (found[1] !== undefined) return `\\${found[1]}`;
  }
  return undefined;
}

/** A path into a document and the string found there. */
export type StringAt = { path: (string | number)[]; text: string };

/** Every string value in a parsed document, with its path. Keys are not visited. */
export function* stringsIn(
  value: unknown,
  path: (string | number)[] = [],
): Generator<StringAt> {
  if (typeof value === 'string') {
    yield { path, text: value };
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* stringsIn(item, [...path, index]);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) yield* stringsIn(item, [...path, key]);
  }
}
