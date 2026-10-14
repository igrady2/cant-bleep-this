export type CategoryId =
  | "bullying_harassment"
  | "hate_speech"
  | "sexual_content"
  | "violence_threats"
  | "self_harm"
  | "profanity"
  | "personal_info"
  | "academic_dishonesty"
  | "spam"
  | "terms_of_use";

export interface ModerationCategory {
  id: CategoryId;
  label: string;
  /** Shown to the author when their message is blocked. */
  explanation: string;
  /** TypeSafe Noul question: probability that the message falls in this category. */
  question: {
    instructions: string | Record<string, unknown>;
    criteria: { true: string; false: string };
  };
}

export const CATEGORIES: ModerationCategory[] = [
  {
    id: "bullying_harassment",
    label: "Bullying or harassment",
    explanation:
      "This reads as putting someone down, mocking, excluding, or intimidating another person. The forum rules prohibit bullying, harassing, or intimidating students, teachers, or staff.",
    question: {
      instructions:
        "Does `message` insult, mock, demean, exclude, intimidate, or pile on a specific person or group of classmates, teachers, or staff?",
      criteria: {
        true: "Name-calling, ridicule of someone's looks, ability, or identity, telling someone they are not wanted, encouraging others to gang up on someone, or repeated unwanted contact.",
        false: "Friendly teasing that is clearly mutual and kind, respectful disagreement, constructive feedback, or no target at all.",
      },
    },
  },
  {
    id: "hate_speech",
    label: "Hate speech",
    explanation:
      "This attacks or demeans people based on who they are (such as race, ethnicity, religion, disability, gender, sexual orientation, or national origin).",
    question: {
      instructions:
        "Does `message` attack, stereotype, or dehumanize people based on a protected characteristic such as race, ethnicity, nationality, religion, disability, sex, gender identity, or sexual orientation?",
      criteria: {
        true: "Slurs, hateful stereotypes, calls for exclusion, or statements that a group is inferior.",
        false: "Neutral or respectful mentions of identity, learning about cultures, or calling out prejudice.",
      },
    },
  },
  {
    id: "sexual_content",
    label: "Sexual content",
    explanation:
      "Sexual or sexually suggestive content isn't appropriate in a K–12 school forum.",
    question: {
      instructions:
        "Does `message` contain sexual, sexually suggestive, or explicit content, or a sexual advance, that would be inappropriate in a K–12 school forum?",
      criteria: {
        true: "Sexual descriptions, innuendo, explicit body references, requests for photos, or romantic or sexual advances toward anyone.",
        false: "Age-appropriate health or biology vocabulary used educationally, or no sexual content.",
      },
    },
  },
  {
    id: "violence_threats",
    label: "Violence or threats",
    explanation:
      "This threatens, glorifies, or encourages harm to people or property. If someone may be in danger, tell a trusted adult right away.",
    question: {
      instructions:
        "Does `message` threaten, encourage, or glorify physical harm to a person, an animal, or the school, or describe weapons with intent to hurt?",
      criteria: {
        true: "Threats (even 'jokes'), plans to fight or hurt someone, praise for violent acts, or bringing weapons to school.",
        false: "Discussing history, books, or news about violence in an educational way, or sports and games language with no real threat.",
      },
    },
  },
  {
    id: "self_harm",
    label: "Self-harm",
    explanation:
      "This mentions hurting yourself or not wanting to be here. You matter. Please talk to a teacher, counselor, or trusted adult now, or call or text 988 (Suicide & Crisis Lifeline, U.S.).",
    question: {
      instructions:
        "Does `message` express intent, desire, or plans to self-harm or die by suicide, or encourage someone else to hurt themselves?",
      criteria: {
        true: "Statements like wanting to disappear or die, describing self-injury, or telling someone to hurt or kill themselves.",
        false: "Everyday figures of speech with no real risk (for example 'this homework is killing me'), or asking how to support a friend.",
      },
    },
  },
  {
    id: "profanity",
    label: "Profanity",
    explanation:
      "This uses swear words or crude language, including disguised spellings. Keep it classroom-friendly.",
    question: {
      instructions:
        "Does `message` contain swear words, vulgar or crude language, or obscene gestures, including censored or creatively misspelled versions?",
      criteria: {
        true: "Cursing, vulgar slang, or masked spellings like f*ck or sh1t.",
        false: "Clean language, or mild words acceptable in a classroom such as 'darn' or 'shoot'.",
      },
    },
  },
  {
    id: "personal_info",
    label: "Personal information",
    explanation:
      "This shares private details (like a phone number, home address, email, password, or social media handle) about you or someone else. Student privacy matters, so keep these details off the forum.",
    question: {
      instructions:
        "Does `message` share or request private personal information about the author or someone else, such as a phone number, home address, personal email, password, birthday with year, social media handle, or location for meeting up?",
      criteria: {
        true: "A real phone number, street address, login credentials, private contact handles, or asking someone for theirs.",
        false: "First names, the school or class name, or general interests with no contact or location details.",
      },
    },
  },
  {
    id: "academic_dishonesty",
    label: "Academic dishonesty",
    explanation:
      "This asks for or offers ways to cheat, such as sharing answers, test questions, or doing someone else's work.",
    question: {
      instructions:
        "Does `message` ask for, offer, or encourage cheating, such as sharing test answers, copying homework, plagiarizing, or having someone else do graded work?",
      criteria: {
        true: "Requests or offers to send answers, leaked test content, essays to copy, or tips for getting away with cheating.",
        false: "Asking for help understanding a concept, forming a study group, or sharing study tips.",
      },
    },
  },
  {
    id: "spam",
    label: "Spam",
    explanation:
      "This looks like spam: repeated or meaningless text, chain messages, or unrelated links.",
    question: {
      instructions:
        "Is `message` spam, such as repeated characters or words, meaningless filler, chain messages, mass tagging, or unrelated links?",
      criteria: {
        true: "Keyboard mashing, the same word over and over, 'forward this to 10 people', or link dumps.",
        false: "A genuine message to the class, even if short or enthusiastic.",
      },
    },
  },
  {
    id: "terms_of_use",
    label: "Terms of Use violation",
    explanation:
      "This conflicts with the forum's Acceptable Use rules: no unlawful activity, defamation, impersonation, attempts to access accounts or systems without permission, collecting other users' information, or commercial use without permission.",
    question: {
      instructions: {
        acceptable_use_policy: [
          "Do not violate any applicable law or regulation.",
          "Do not post defamatory content (false statements of fact that damage someone's reputation).",
          "Do not attempt to gain unauthorized access to any part of the Service, other accounts, or related systems or networks.",
          "Do not use the Service for commercial purposes (selling, advertising, promoting businesses) without written permission.",
          "Do not impersonate any person or entity or misrepresent your affiliation.",
          "Do not collect or harvest personal information about other users without authorization.",
        ],
        question:
          "Does `message` violate any rule in `acceptable_use_policy`, the school forum's Terms of Use?",
      },
      criteria: {
        true: "Selling or advertising, pretending to be a teacher or another student, sharing or asking for someone's login, hacking attempts, spreading false rumors as fact, gathering classmates' info, or illegal activity.",
        false: "Ordinary, positive classroom participation consistent with these rules.",
      },
    },
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, ModerationCategory>;
