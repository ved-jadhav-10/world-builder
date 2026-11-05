/**
 * Story structures a plot board can start from. Each is a list of beats, the columns of the
 * board; the descriptions are short reminders of what a beat is for, written for this app. A
 * writer can rename, reorder, add and remove beats afterwards, so these are only a starting point.
 */

export const PLOT_TEMPLATE_KEYS = [
  'three_act',
  'save_the_cat',
  'heros_journey',
  'kishotenketsu',
  'blank',
] as const;
export type PlotTemplateKey = (typeof PLOT_TEMPLATE_KEYS)[number];

export interface PlotTemplate {
  name: string;
  summary: string;
  beats: { title: string; description: string }[];
}

export const PLOT_TEMPLATES: Record<PlotTemplateKey, PlotTemplate> = {
  three_act: {
    name: 'Three-act structure',
    summary: 'Setup, confrontation and resolution: the most common shape for a story.',
    beats: [
      { title: 'Setup', description: 'The world, the protagonist and what is normal for them.' },
      {
        title: 'Inciting incident',
        description: 'Something disturbs normal life and sets the story moving.',
      },
      {
        title: 'First plot point',
        description: 'The protagonist commits and there is no going back. End of act one.',
      },
      {
        title: 'Rising action',
        description: 'Obstacles grow, allies and enemies take shape, stakes climb.',
      },
      {
        title: 'Midpoint',
        description: 'A reversal or revelation that changes what the protagonist is really after.',
      },
      {
        title: 'Complications',
        description: 'The plan falls apart and pressure closes in from every side.',
      },
      {
        title: 'Second plot point',
        description: 'The lowest moment, and the insight that shows a way forward. End of act two.',
      },
      {
        title: 'Climax',
        description: 'The final confrontation where the central question is answered.',
      },
      { title: 'Resolution', description: 'The aftermath: what changed, and the new normal.' },
    ],
  },
  save_the_cat: {
    name: 'Save the Cat beats',
    summary: 'A fifteen-beat outline popular with screenwriters and genre novelists.',
    beats: [
      {
        title: 'Opening image',
        description: 'A snapshot of the hero’s world and flaw before the change.',
      },
      { title: 'Theme stated', description: 'Someone hints at what the story is really about.' },
      { title: 'Set-up', description: 'The hero’s life, the people in it and what is missing.' },
      { title: 'Catalyst', description: 'The event that knocks the hero’s life off course.' },
      { title: 'Debate', description: 'The hero hesitates: should they take the leap?' },
      {
        title: 'Break into two',
        description: 'The hero chooses to enter the new world of the story.',
      },
      {
        title: 'B story',
        description: 'A secondary thread, often a relationship that carries the theme.',
      },
      { title: 'Fun and games', description: 'The promise of the premise: the hook delivered.' },
      { title: 'Midpoint', description: 'A false victory or defeat that raises the stakes.' },
      {
        title: 'Bad guys close in',
        description: 'Opposition tightens and the team starts to fray.',
      },
      { title: 'All is lost', description: 'Something is lost for good; the old way is dead.' },
      {
        title: 'Dark night of the soul',
        description: 'The hero faces the loss before finding resolve.',
      },
      {
        title: 'Break into three',
        description: 'The answer arrives, joining the A and B stories.',
      },
      {
        title: 'Finale',
        description: 'The hero applies what they learned and faces the final test.',
      },
      {
        title: 'Final image',
        description: 'The mirror of the opening, showing how things have changed.',
      },
    ],
  },
  heros_journey: {
    name: 'Hero’s journey',
    summary: 'The twelve stages of a hero leaving home, being tested and returning changed.',
    beats: [
      { title: 'Ordinary world', description: 'The hero’s everyday life before the adventure.' },
      { title: 'Call to adventure', description: 'A problem or invitation arrives.' },
      { title: 'Refusal of the call', description: 'Fear or duty makes the hero hesitate.' },
      {
        title: 'Meeting the mentor',
        description: 'Guidance, a gift or courage from someone wiser.',
      },
      { title: 'Crossing the threshold', description: 'The hero enters the unfamiliar world.' },
      {
        title: 'Tests, allies, enemies',
        description: 'The hero learns the rules and who to trust.',
      },
      { title: 'Approach to the inmost cave', description: 'Preparation for the greatest danger.' },
      { title: 'Ordeal', description: 'A brush with death or the hero’s greatest fear.' },
      { title: 'Reward', description: 'The hero takes what they came for, and pays for it.' },
      {
        title: 'The road back',
        description: 'The return begins, with the consequences following.',
      },
      { title: 'Resurrection', description: 'A final test that proves the hero has changed.' },
      {
        title: 'Return with the elixir',
        description: 'The hero comes home with something that heals.',
      },
    ],
  },
  kishotenketsu: {
    name: 'Kishōtenketsu',
    summary:
      'A four-part structure from East Asian storytelling that turns on a twist, not a conflict.',
    beats: [
      {
        title: 'Ki (introduction)',
        description: 'Introduce the characters, setting and situation.',
      },
      {
        title: 'Shō (development)',
        description: 'Develop what was introduced, without major change.',
      },
      { title: 'Ten (twist)', description: 'An unexpected turn that recasts everything so far.' },
      {
        title: 'Ketsu (conclusion)',
        description: 'Bring the parts together in light of the twist.',
      },
    ],
  },
  blank: {
    name: 'Blank board',
    summary: 'One empty column to build your own structure.',
    beats: [{ title: 'Beat 1', description: '' }],
  },
};

/** The colour a board's first storyline starts with. */
export const DEFAULT_THREAD_COLOR = '#6366f1';
export const DEFAULT_THREAD_NAME = 'Main plot';
