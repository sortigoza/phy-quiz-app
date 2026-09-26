/**
 * The backslash detector. SPEC section 2.5.
 *
 * In a JSON string, and in a double-quoted YAML one, a LaTeX command written
 * with a single backslash does not fail: `"\times"` quietly becomes a tab
 * followed by `imes`. Every physics bank is full of such commands, so the
 * detector looks for the wreckage they leave, a control character inside a
 * string, and names the command that was probably meant.
 */

/** The escape letter each character is written as, and what to call it. */
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
  // Escapes only YAML has, which leave no control character: `"\Lambda"`, `"\Pi"`.
  '\u0085': { letter: 'N', name: 'a next-line character' },
  '\u2028': { letter: 'L', name: 'a line separator' },
  '\u2029': { letter: 'P', name: 'a paragraph separator' },
};

/**
 * What follows a line break when it was really `\n` starting a LaTeX command.
 *
 * A line break on its own is legitimate Markdown, and a line may well start
 * "u = 3 m/s" or "mid-air", so a line break is only suspect when the rest of a
 * command follows it. The long remainders are distinctive enough on their own;
 * the short ones must be followed by something only LaTeX writes, as in
 * `\nu_0`, `$\nu$` or `\neq{}`.
 */
const newlineCommand =
  /^(?:(?:abla|ewline|exists|atural|earrow|warrow|leq|geq)(?![A-Za-z])|(?:u|e|eq|eg|ot|mid)(?=$|[_^${}(),\\]))/;

// Every C0 control character, DEL, and the separators YAML's own escapes
// produce. A tab written literally is flagged too: JSON cannot hold one
// unescaped, and in YAML it is almost always this mistake.
// eslint-disable-next-line no-control-regex
const suspectCharacter = /[\0-\x1f\x7f\u0085\u2028\u2029]/g;

/** The advice for one command, showing it written both ways. */
export function adviceFor(command: string): string {
  return `In a JSON bank every backslash must be doubled, as in "\\${command}"; in a YAML bank, put the text in single quotes, as in '${command}'.`;
}

/**
 * Why a string is probably a LaTeX command that lost its backslash, or
 * undefined if it looks fine. Reports the first such place in the string.
 */
export function strayControlCharacter(text: string): string | undefined {
  for (const match of text.matchAll(suspectCharacter)) {
    const character = match[0];
    const rest = text.slice(match.index + 1);
    if (character === '\n' && !newlineCommand.test(rest)) continue;
    // A Windows line ending is a line break like any other.
    if (character === '\r' && rest.startsWith('\n')) continue;

    const escape = escapes[character];
    const command = escape && `\\${escape.letter}${/^[A-Za-z]*/.exec(rest)?.[0] ?? ''}`;
    if (!escape || !command) {
      const code = character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
      return `contains an invisible control character (U+${code}), which usually means a LaTeX command lost its backslash. ${adviceFor('\\command')}`;
    }
    return `contains ${escape.name} where "${command}" was probably meant: this looks like an unescaped LaTeX command. ${adviceFor(command)}`;
  }
  return undefined;
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
export function* stringsIn(value: unknown, path: (string | number)[] = []): Generator<StringAt> {
  if (typeof value === 'string') {
    yield { path, text: value };
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* stringsIn(item, [...path, index]);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) yield* stringsIn(item, [...path, key]);
  }
}
