/**
 * The game's nine reviewable rules, worded as in docs/CONTENT_RULES.md
 * (policy v1). Identifiers are stable: they key filter scores, reviews and
 * test cases, so never rename an id. The questions sent to Jev belong to a
 * filter version (filter-versions.ts); v1 copies them from here.
 */
export type CategoryId =
  | "bullying_harassment"
  | "hate_speech"
  | "sexual_content"
  | "violence_threats"
  | "self_harm"
  | "profanity"
  | "personal_info"
  | "spam"
  | "impersonation";

export const POLICY_VERSION = "v1";

export interface ModerationCategory {
  id: CategoryId;
  /** Review rule name shown to players and reviewers. */
  label: string;
  /** Shown to the author when their message is blocked. */
  explanation: string;
  /** TypeSafe Noul question: probability that the message falls in this category. */
  question: {
    instructions: string;
    criteria: { true: string; false: string };
  };
}

export const CATEGORIES: ModerationCategory[] = [
  {
    id: "bullying_harassment",
    label: "Harassment",
    explanation:
      "This reads as insulting, mocking or targeting a player or a real person. Calling it a joke doesn't change that.",
    question: {
      instructions:
        "Does `message`, understood in the chat context, insult, mock, demean, intimidate or invite others to target a player or a real person?",
      criteria: {
        true: "A personal put-down, ridicule, targeted intimidation or an invitation to pile on someone, including a joke aimed at a player username.",
        false: "Disagreement with an idea, constructive criticism or a friendly remark without a personal attack.",
      },
    },
  },
  {
    id: "hate_speech",
    label: "Hate",
    explanation:
      "This attacks people for who they are, such as their race, religion, gender, sexuality or disability.",
    question: {
      instructions:
        "Does `message` attack, demean, dehumanize or call for exclusion of people because of their race, religion, gender, sexuality, disability or a similar identity characteristic?",
      criteria: {
        true: "An identity-based insult, hateful generalization, slur used as an attack or demand to exclude an identity group.",
        false: "A neutral identity mention, respectful discussion or opposition to discrimination without attacking that identity group.",
      },
    },
  },
  {
    id: "sexual_content",
    label: "Sexual content",
    explanation:
      "This reads as a sexual remark, innuendo or explicit talk, including double meanings about players.",
    question: {
      instructions:
        "Does `message`, interpreted with the player names and preceding chat, make a sexual remark, sexual double meaning or explicit sexual description, including one about a player?",
      criteria: {
        true: "Sexual comments or propositions, innuendo or explicit sexual talk, including disguised wording and contextual wordplay.",
        false: "A nonsexual interaction or a neutral health discussion without sexual remarks, innuendo or explicit sexual description.",
      },
    },
  },
  {
    id: "violence_threats",
    label: "Violence and threats",
    explanation: "This reads as a threat or as glorifying violence.",
    question: {
      instructions:
        "Does `message` contain a threat, violent intent, a violent depiction or glorification of violence, including hyperbole, fiction, games, song lyrics or a threat without a real target?",
      criteria: {
        true: "Threatening or violent language, a violent depiction or praise for violence, whether literal or clearly framed as a joke, fictional story, game or lyric.",
        false: "No threat, violent depiction or glorification; ordinary nonviolent competition or disagreement.",
      },
    },
  },
  {
    id: "self_harm",
    label: "Self-harm encouragement",
    explanation: "This reads as encouraging someone to hurt themselves.",
    question: {
      instructions:
        "Does `message` urge, pressure, praise or otherwise encourage someone to hurt themselves or die by suicide, rather than seek help, express distress or offer support?",
      criteria: {
        true: "Encouraging self-injury or suicide, approving it as something someone should do or pressuring someone toward it.",
        false: "A disclosure of distress, a request for help, recovery discussion or an offer of support without encouragement to self-harm.",
      },
    },
  },
  {
    id: "profanity",
    label: "Profanity",
    explanation: "This uses swearing, including disguised spellings.",
    question: {
      instructions:
        "Does `message` use profanity or a disguised form of a swear word, including substitutions, spacing or censorship marks intended to convey the swear word?",
      criteria: {
        true: "Swearing in ordinary spelling or an intentionally recognizable disguise, regardless of whether it targets someone.",
        false: "Clean language or an innocent word whose spelling merely resembles part of a swear word.",
      },
    },
  },
  {
    id: "personal_info",
    label: "Personal information",
    explanation:
      "This shares personal details, such as contact info, an account handle or who a player really is. That includes your own.",
    question: {
      instructions:
        "Does `message` reveal personal information about its author or anyone else: a phone number, email, address, full name of a private person, account handle or details that identify the real person behind a player username?",
      criteria: {
        true: "Personal details or contact information, including disguised disclosures and linking a player name to their real identity.",
        false: "A room username by itself, a general interest or a mention of a public figure's name without private details or identifying a player.",
      },
    },
  },
  {
    id: "spam",
    label: "Spam and scams",
    explanation: "Links aren't allowed, and neither are ads, repeated text or fake offers.",
    question: {
      instructions:
        "Does `message` contain any link or web address, including a disguised link, an advertisement, repeated spam text or a deceptive offer? For MVP, count every link even when its destination is clean, relevant or useful.",
      criteria: {
        true: "Any link, an ad or promotion, repetitive spam or a scam/fake offer. No clean-link exception applies in MVP.",
        false: "Ordinary conversation with no link, advertising, spam repetition or deceptive offer.",
      },
    },
  },
  {
    id: "impersonation",
    label: "Impersonation",
    explanation: "This reads as pretending to be another player or a real person.",
    question: {
      instructions:
        "Does `message` present its author as another player or a real person, or pass off a statement as coming from that person?",
      criteria: {
        true: "A false identity claim or a message presented as someone else's authentic statement.",
        false: "Mentioning someone, transparently quoting them or clearly labeled fictional roleplay without claiming to actually be that person.",
      },
    },
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, ModerationCategory>;
