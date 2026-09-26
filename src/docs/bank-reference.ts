/**
 * The bank format as documented to people and to AI agents.
 *
 * Written once here and rendered twice, by the Help screen and by `llms.txt`,
 * so the two cannot disagree. A test holds the field names and the required
 * flags to the validator in `domain/bank.ts`, so neither can drift from what
 * the app actually accepts.
 *
 * This describes the app as it is now. Update it in the same change as any
 * ticket that alters the format or how banks load.
 */

export type FieldDoc = {
  name: string;
  type: string;
  required: boolean;
  rules: string;
};

export const fieldReference: { bank: FieldDoc[]; question: FieldDoc[]; option: FieldDoc[] } = {
  bank: [
    {
      name: '$schema',
      type: 'string',
      required: false,
      rules: 'Up to 500 characters. Ignored by the app.',
    },
    { name: 'formatVersion', type: 'integer', required: true, rules: 'Must be 1.' },
    {
      name: 'id',
      type: 'string',
      required: true,
      rules:
        '3 to 128 characters: lowercase letters, digits, dots, dashes and underscores, starting with a letter or digit. Reverse-DNS style is recommended, e.g. se.school.mechanics.kinematics. Keep it the same across versions of the bank.',
    },
    {
      name: 'version',
      type: 'string',
      required: true,
      rules: 'Semver, e.g. 1.0.0. Bump it whenever the questions change.',
    },
    {
      name: 'title',
      type: 'string',
      required: true,
      rules: '1 to 200 characters. Shown wherever the bank appears.',
    },
    {
      name: 'description',
      type: 'string',
      required: false,
      rules: 'Up to 2000 characters, with maths and Markdown. Shown on the start screen.',
    },
    { name: 'author', type: 'string', required: false, rules: 'Up to 200 characters.' },
    {
      name: 'license',
      type: 'string',
      required: false,
      rules: 'Up to 100 characters. An SPDX identifier such as CC-BY-4.0 is recommended.',
    },
    {
      name: 'language',
      type: 'string',
      required: false,
      rules:
        'A BCP 47 tag such as en or sv; en when absent. Marks up the bank text so screen readers pronounce it in that language.',
    },
    {
      name: 'tags',
      type: 'string[]',
      required: false,
      rules: 'Up to 20 tags of up to 40 characters. Recorded, not used yet.',
    },
    {
      name: 'defaultQuestionCount',
      type: 'integer',
      required: false,
      rules:
        '1 to 500. The question count the start screen suggests; 10 when absent. Reduced to the number of questions when the bank has fewer.',
    },
    {
      name: 'questions',
      type: 'Question[]',
      required: true,
      rules: '1 to 500 questions, each with a unique id.',
    },
  ],
  question: [
    {
      name: 'id',
      type: 'string',
      required: true,
      rules:
        '1 to 128 characters, unique within the bank. Keep it stable: attempt records refer to questions by id.',
    },
    {
      name: 'type',
      type: 'string',
      required: false,
      rules: '"single-choice", the default and the only type there is.',
    },
    {
      name: 'prompt',
      type: 'string',
      required: true,
      rules: '1 to 4000 characters, with maths and Markdown.',
    },
    {
      name: 'options',
      type: 'Option[]',
      required: true,
      rules: '2 to 8 options, each with an id unique within the question.',
    },
    {
      name: 'answer',
      type: 'string',
      required: true,
      rules: 'The id of the correct option. Must match one of the options.',
    },
    {
      name: 'explanation',
      type: 'string',
      required: true,
      rules:
        '1 to 4000 characters, with maths and Markdown. Why the correct option is correct. Shown in the review after submission.',
    },
    {
      name: 'tags',
      type: 'string[]',
      required: false,
      rules:
        'Up to 20 tags of up to 40 characters, saying what the question is about. A quiz can be restricted to chosen tags, and history shows accuracy per tag.',
    },
    {
      name: 'difficulty',
      type: 'string',
      required: false,
      rules: 'easy, medium or hard. Recorded, not used yet.',
    },
  ],
  option: [
    {
      name: 'id',
      type: 'string',
      required: true,
      rules: '1 to 16 characters, unique within the question. a, b, c, d is conventional.',
    },
    {
      name: 'text',
      type: 'string',
      required: true,
      rules:
        '1 to 1000 characters, with maths and inline Markdown. Kept to one line: lists and tables do not render in an option.',
    },
    {
      name: 'why',
      type: 'string',
      required: false,
      rules:
        'Up to 2000 characters, with maths and Markdown. Why this option is wrong. Shown in the review only to a participant who chose it.',
    },
  ],
};

/** The rules that reject a bank outright, beyond the per-field limits above. */
export const rejectionRules: string[] = [
  'The file must be valid JSON, or valid YAML meaning the same thing.',
  'A control character inside any text, such as the tab that "\\times" becomes in JSON, is an error: it is almost always a LaTeX command whose backslash was not doubled.',
  'Unknown keys anywhere are errors, not warnings, so a misspelled field such as "explaination" fails loudly instead of silently dropping the explanations.',
  'Question ids must be unique within the bank.',
  'Option ids must be unique within their question.',
  "Every question's answer must be the id of one of its options.",
  'A bank that breaks any rule is rejected whole. Nothing is partially loaded.',
];

/** What a participant can do today, in order. */
export const quizSteps: string[] = [
  'Load a question bank on the library screen: from your device with "Upload a bank file", or from a link with "Load from URL". A GitHub file link works as it is, from a public repository. A link to a bank repository loads every bank it lists.',
  'Press Start on the bank, type your name, and choose how many questions to answer, and how: Standard, or Answer first.',
  'In Answer first, each question shows only its prompt at first. Write your own answer or reasoning, at least 10 characters, and press Reveal options; or press Skip when the question needs its options. What you wrote then stays, read-only, while you choose.',
  'Answer one question per screen. Previous and Next move freely; nothing tells you whether you are right until the end. Number keys 1 to 9 choose an option, except while you are typing.',
  'With each answer, say how sure you are: Sure, Unsure or Guess. Be honest: the review uses it to show which mistakes you were sure of, and how often you were right at each level.',
  'Every answer is saved in this browser as you give it. If the page is closed mid-quiz, open the app again and the library offers to resume the quiz where you left off, or to discard it. One quiz can be in progress at a time.',
  'Submit on the last question. Every answered question needs a confidence first. If any are blank, you are warned; blank questions score as wrong.',
  'Read the review. It opens with your confident errors, the answers you were sure of that were wrong, because those are the ones most worth correcting. Then every question with the correct option, the option you chose, the explanation, and a note on why your option was wrong when the author wrote one.',
  'After an Answer first quiz, the review shows what you wrote beside the explanation and asks whether your answer matched: Yes, Partly or No. You can answer that later too, from History.',
  'Copy as Markdown, at the end of the review, puts the whole review on the clipboard: every question with its tags, options and explanation, and what you answered. Paste it into your notes, or give it to an AI assistant to go through your mistakes with you; it does not need the bank.',
];

/**
 * Private banks, from the participant's side. How a teacher publishes one is
 * the teacher guide's job (ticket 13); this says they exist and how to open one.
 */
export const privateBanks: string[] = [
  'A teacher can publish a private bank: an encrypted file that nobody can read without its bank link. The file itself shows nothing, not even its title.',
  'To open one, open the bank link your teacher sent, or paste it into "Load from URL". The bank is added to your library, marked 🔒, and is taken like any other.',
  'This browser keeps the bank’s key, so later editions open without the link: load them by URL or upload as usual. On a new device, open the link again.',
  'If the file will not load from the link, download it and upload it. The key from the link is already kept, so it opens.',
  'A teacher can send one bank link for a whole course of private banks: it opens a private repository, and every bank it lists joins your library.',
  'A bank link opens the bank for anyone who has it. Do not post it publicly.',
];

/** Bank repositories: one file listing several banks, so one link loads a whole course. SPEC section 3.5. */
export const bankRepositories: string[] = [
  'A bank repository is a small JSON file that lists the URLs of several banks, so one link loads a whole course. Paste its link into "Load from URL", or upload it: the app tells a repository from a bank by what is inside.',
  'It has formatVersion 1, a title, an optional description and author, and banks: a list of 1 to 100 entries, each { "url": ... }. Unknown keys and a bank listed twice reject the repository whole.',
  'A url may be relative, such as "kinematics.json", and is read from beside the repository file. Relative entries need the repository loaded by URL; uploaded, only its full https:// entries load.',
  'Each bank loads as if its own link had been pasted, and one that fails does not stop the rest. The library then lists what happened to each, with a Replace button on any bank that changed without a version bump.',
  'A repository cannot list another repository, and a plaintext one should never list a bank link: the file is public, and the link would give its key away.',
  'A teacher can also publish a private repository: an encrypted course list that carries the keys of the private banks it lists, so one link opens the whole course. It is opened with its bank link, like a private bank, and later editions open without the link.',
  'An author marks a private bank in a repository with "bank": its bank id, and the author tool fills in the key when it encrypts the repository. Never write a key into a repository by hand: a plaintext repository holding keys is refused, because those keys are now public.',
];

const repository = {
  formatVersion: 1,
  title: 'Mechanics, autumn term',
  description: 'Every bank for the first-year mechanics course.',
  author: 'A. Teacher',
  banks: [
    { url: 'kinematics.json' },
    { url: 'https://raw.githubusercontent.com/a-teacher/banks/main/forces.json' },
  ],
};

/** A bank repository with one relative and one absolute entry. */
export const repositoryExample = JSON.stringify(repository, null, 2);

/** How bank text is written: maths, Markdown, and what is refused. */
export const textFormatting: string[] = [
  'Write inline maths as $...$ and display maths as $$...$$, in LaTeX that KaTeX understands. A formula KaTeX cannot read is shown as its source, marked as an error.',
  'KaTeX has no siunitx. Write units as 9.81\\,\\mathrm{m/s^2} (with every backslash doubled inside JSON), not \\SI{9.81}{m/s^2}. mhchem (\\ce{...}) is available.',
  'A dollar sign followed by a space, or a closing one followed by a digit, is not maths, so "between $5 and $10" stays text. Write \\$ for a literal dollar sign anywhere else.',
  "Prompts, explanations, descriptions and an option's why may use Markdown emphasis, code, lists, links and tables. Options take emphasis, code and links on one line.",
  'Raw HTML is shown as text, never run. Images, headings and other Markdown are reduced to their text.',
];

/** Current limits, stated plainly so nobody is surprised by them. */
export const currentLimits: string[] = [
  'Loading by URL only works when the server allows cross-origin requests. GitHub (raw links and file links from public repositories) and GitHub Pages do; many university servers and Google Drive do not. If a link fails, download the file and upload it.',
  'Attempts are saved in this browser only. History reopens any attempt’s review while its bank is in the library; to hand results to a teacher, export them from History as a file.',
  'Scores are self-reported. Everything runs in the browser, so a determined participant can change their own record. Use the app for practice and classroom quizzes, not for grading.',
];

const minimal = {
  formatVersion: 1,
  id: 'example.minimal',
  version: '1.0.0',
  title: 'A minimal bank',
  questions: [
    {
      id: 'unit-of-force',
      prompt: 'What is the SI unit of force?',
      options: [
        { id: 'a', text: 'Newton' },
        { id: 'b', text: 'Joule', why: 'The joule is the unit of energy, force times distance.' },
      ],
      answer: 'a',
      explanation: 'One newton accelerates one kilogram at one metre per second squared.',
    },
  ],
};

/** The smallest useful bank: every required field and one optional note. */
export const minimalExample = JSON.stringify(minimal, null, 2);

const full = {
  formatVersion: 1,
  id: 'example.mechanics.free-fall',
  version: '1.0.0',
  title: 'Free fall',
  description: 'Objects released from rest near the Earth, ignoring air resistance.',
  author: 'A. Teacher',
  license: 'CC-BY-4.0',
  language: 'en',
  tags: ['mechanics', 'kinematics'],
  defaultQuestionCount: 2,
  questions: [
    {
      id: 'free-fall-speed',
      type: 'single-choice',
      prompt:
        'A ball is released from rest and falls freely for $1.00\\,\\mathrm{s}$. Taking $g = 9.81\\,\\mathrm{m/s^2}$, what is its speed?',
      options: [
        {
          id: 'a',
          text: '$4.91\\,\\mathrm{m/s}$',
          why: 'This is $\\tfrac{1}{2}gt$, the average speed over the fall, not the speed at the end of it.',
        },
        { id: 'b', text: '$9.81\\,\\mathrm{m/s}$' },
        {
          id: 'c',
          text: '$19.6\\,\\mathrm{m/s}$',
          why: 'This is $2gt$. Check which factor the equation $v = u + at$ actually carries.',
        },
        {
          id: 'd',
          text: '$4.91\\,\\mathrm{m}$',
          why: 'That is a distance, not a speed. Checking units catches this one.',
        },
      ],
      answer: 'b',
      explanation:
        'From rest, $v = gt = 9.81 \\times 1.00 = 9.81\\,\\mathrm{m/s}$. The distance fallen in that second is $\\tfrac{1}{2}gt^2 = 4.91\\,\\mathrm{m}$, which is why the other numbers look tempting.',
      tags: ['free-fall'],
      difficulty: 'easy',
    },
    {
      id: 'heavier-falls-faster',
      prompt:
        'Two steel balls, one of $1\\,\\mathrm{kg}$ and one of $2\\,\\mathrm{kg}$, are dropped together from the same height in a vacuum. Which lands first?',
      options: [
        {
          id: 'a',
          text: 'The $2\\,\\mathrm{kg}$ ball',
          why: 'The heavier ball feels twice the force, but has twice the mass to accelerate, so its acceleration is the same.',
        },
        {
          id: 'b',
          text: 'The $1\\,\\mathrm{kg}$ ball',
          why: 'Nothing in a vacuum favours the lighter ball: there is no air resistance to act on it differently.',
        },
        { id: 'c', text: 'They land together' },
      ],
      answer: 'c',
      explanation:
        'Both accelerate at $g$, because $a = F/m = mg/m = g$ whatever the mass. Same start, same acceleration, same landing time.',
      difficulty: 'easy',
    },
  ],
};

/** A complete bank using every field, with maths escaped the way JSON needs. */
export const fullExample = JSON.stringify(full, null, 2);
